import { describe, expect, it } from "vitest";
import { groupIntoSets } from "../src/grouping";
import { parseBackupFilename } from "../src/parser";
import { selectSets } from "../src/retention";
import type { BackupSet, Retention } from "../src/types";

const TZ = "UTC";

/**
 * Build backup sets from raw timestamps.
 *
 * Each raw timestamp is a string like "2026-11-07-2315". Sets are built by
 * parsing synthetic filenames so that the grouping logic is exercised too.
 */
function setsFor(
  site: string,
  rawTimestamps: string[],
  tz: string = TZ,
): BackupSet[] {
  const files = rawTimestamps.map((raw) => {
    const filename = `backup_${raw}_${site}_nonce0001-db.gz`;
    const parsed = parseBackupFilename(filename, tz);
    if (!parsed) {
      throw new Error(`Test fixture does not parse: ${filename}`);
    }
    return parsed;
  });
  return groupIntoSets(files);
}

function raws(sets: BackupSet[]): string[] {
  return sets.map((s) => s.rawTimestamp).sort();
}

describe("selectSets", () => {
  it("keeps a single set in a bucket", () => {
    const sets = setsFor("Site", ["2026-11-07-2315"]);
    const result = selectSets(
      sets,
      { daily: 1, weekly: 0, monthly: 0, yearly: 0 },
      TZ,
    );

    expect(result.delete).toHaveLength(0);
    expect(result.keep).toHaveLength(1);
  });

  it("never deletes the most recent set", () => {
    const sets = setsFor("Site", [
      "2026-11-01-2315",
      "2026-11-02-2315",
      "2026-11-03-2315",
    ]);
    const result = selectSets(
      sets,
      { daily: 0, weekly: 0, monthly: 0, yearly: 0 },
      TZ,
    );

    expect(raws(result.keep)).toContain("2026-11-03-2315");
    expect(raws(result.delete)).not.toContain("2026-11-03-2315");
  });

  it("keeps the first set of each of the N most recent days", () => {
    const sets = setsFor("Site", [
      "2026-11-01-0100",
      "2026-11-01-2300", // same day, later: not the candidate
      "2026-11-02-2300",
      "2026-11-03-2300",
    ]);
    const result = selectSets(
      sets,
      { daily: 2, weekly: 0, monthly: 0, yearly: 0 },
      TZ,
    );

    // 2 most recent days: 2026-11-02 and 2026-11-03.
    expect(raws(result.keep)).toEqual(["2026-11-02-2300", "2026-11-03-2300"]);
    expect(raws(result.delete)).toEqual(["2026-11-01-0100", "2026-11-01-2300"]);
  });

  it("lets the first set of the day win among several sets the same day", () => {
    const sets = setsFor("Site", [
      "2026-11-05-0100",
      "2026-11-05-1200",
      "2026-11-05-2300",
    ]);
    const result = selectSets(
      sets,
      { daily: 1, weekly: 0, monthly: 0, yearly: 0 },
      TZ,
    );

    // The most recent set is protected, the candidate of the day is the first.
    expect(raws(result.keep)).toEqual(["2026-11-05-0100", "2026-11-05-2300"]);
    expect(raws(result.delete)).toEqual(["2026-11-05-1200"]);
  });

  it("does not reduce coverage across gaps in backups", () => {
    // Backups exist only on 3 days, far apart, no backup in between.
    const sets = setsFor("Site", [
      "2026-01-01-1200",
      "2026-06-15-1200",
      "2026-12-20-1200",
    ]);
    const result = selectSets(
      sets,
      { daily: 3, weekly: 0, monthly: 0, yearly: 0 },
      TZ,
    );

    // All 3 non-empty days are kept, gaps do not consume the quota.
    expect(result.delete).toHaveLength(0);
    expect(result.keep).toHaveLength(3);
  });

  it("keeps candidates of the N most recent months", () => {
    const sets = setsFor("Site", [
      "2026-09-15-1200",
      "2026-10-15-1200",
      "2026-11-15-1200",
    ]);
    const result = selectSets(
      sets,
      { daily: 0, weekly: 0, monthly: 2, yearly: 0 },
      TZ,
    );

    expect(raws(result.keep)).toEqual(["2026-10-15-1200", "2026-11-15-1200"]);
    expect(raws(result.delete)).toEqual(["2026-09-15-1200"]);
  });

  it("keeps candidates of the N most recent years", () => {
    const sets = setsFor("Site", [
      "2024-06-01-1200",
      "2025-06-01-1200",
      "2026-06-01-1200",
    ]);
    const result = selectSets(
      sets,
      { daily: 0, weekly: 0, monthly: 0, yearly: 2 },
      TZ,
    );

    expect(raws(result.keep)).toEqual(["2025-06-01-1200", "2026-06-01-1200"]);
    expect(raws(result.delete)).toEqual(["2024-06-01-1200"]);
  });

  it("handles an ISO week spanning a year boundary", () => {
    // 2026-12-31 is a Thursday, 2027-01-01 a Friday: both belong to the same
    // ISO week (2026-W53).
    const sets = setsFor("Site", ["2026-12-31-1200", "2027-01-01-1200"]);
    const result = selectSets(
      sets,
      { daily: 0, weekly: 1, monthly: 0, yearly: 0 },
      TZ,
    );

    // One single ISO week -> one candidate (the first of the week), plus the
    // protected most recent set.
    expect(raws(result.keep)).toEqual(["2026-12-31-1200", "2027-01-01-1200"]);
    expect(result.delete).toHaveLength(0);
  });

  it("separates days across a timezone boundary", () => {
    // 23:59 Paris and 00:01 Paris (next day): the two sets fall on different
    // calendar days in Paris, even though they are only 2 minutes apart.
    const tz = "Europe/Paris";
    const sets = setsFor("Site", ["2026-11-07-2359", "2026-11-08-0001"], tz);
    const result = selectSets(
      sets,
      { daily: 1, weekly: 0, monthly: 0, yearly: 0 },
      tz,
    );

    // The most recent day in Paris is 2026-11-08, its candidate is the 00:01
    // set, which is also the most recent set (protected). The 23:59 set of
    // the previous day is not a candidate of the kept day, so it is deleted.
    expect(raws(result.keep)).toEqual(["2026-11-08-0001"]);
    expect(raws(result.delete)).toEqual(["2026-11-07-2359"]);
  });

  it("treats the same instant as different days depending on the timezone", () => {
    // A set at 2026-11-07 23:30 Paris is 2026-11-07 22:30 UTC (same day in
    // both). A set at 2026-11-08 00:30 Paris is 2026-11-07 23:30 UTC: in
    // Paris it is on Nov 8, but in UTC it is still on Nov 7.
    const paris = setsFor("Site", ["2026-11-08-0030"], "Europe/Paris");
    const parisPeriod = selectSets(
      paris,
      { daily: 0, weekly: 0, monthly: 0, yearly: 0 },
      "Europe/Paris",
    );
    // Sanity: with no level enabled, only the protected most recent set stays.
    expect(parisPeriod.delete).toHaveLength(0);

    const utc = setsFor("Site", ["2026-11-07-2330", "2026-11-08-0030"], "UTC");
    const utcResult = selectSets(
      utc,
      { daily: 1, weekly: 0, monthly: 0, yearly: 0 },
      "UTC",
    );
    // In UTC the two sets are on Nov 7 and Nov 8: only the most recent day is
    // kept as a candidate, plus the protected most recent set.
    expect(raws(utcResult.keep)).toEqual(["2026-11-08-0030"]);
    expect(raws(utcResult.delete)).toEqual(["2026-11-07-2330"]);
  });

  it("handles a partial first period", () => {
    // The oldest backup starts mid-month: the partial month still counts as
    // one non-empty period.
    const sets = setsFor("Site", [
      "2026-11-20-1200", // first month, partial (starts on the 20th)
      "2026-12-01-1200",
      "2027-01-01-1200",
    ]);
    const result = selectSets(
      sets,
      { daily: 0, weekly: 0, monthly: 2, yearly: 0 },
      TZ,
    );

    // 2 most recent months: 2026-12 and 2027-01.
    expect(raws(result.keep)).toEqual(["2026-12-01-1200", "2027-01-01-1200"]);
    expect(raws(result.delete)).toEqual(["2026-11-20-1200"]);
  });

  it("handles a partial last period (current day)", () => {
    const sets = setsFor("Site", [
      "2026-11-01-1200",
      "2026-11-02-1200",
      "2026-11-03-1200",
    ]);
    const result = selectSets(
      sets,
      { daily: 2, weekly: 0, monthly: 0, yearly: 0 },
      TZ,
    );

    // The current day (2026-11-03) is partial but still counts.
    expect(raws(result.keep)).toEqual(["2026-11-02-1200", "2026-11-03-1200"]);
    expect(raws(result.delete)).toEqual(["2026-11-01-1200"]);
  });

  it("stores a set retained by several levels only once", () => {
    const sets = setsFor("Site", [
      "2026-11-01-1200",
      "2026-11-02-1200",
      "2026-11-03-1200",
    ]);
    const result = selectSets(
      sets,
      { daily: 3, weekly: 3, monthly: 3, yearly: 3 },
      TZ,
    );

    // Every set is a candidate at several levels; the union has no duplicate.
    const unique = new Set(result.keep.map((s) => s.rawTimestamp));
    expect(unique.size).toBe(result.keep.length);
    expect(result.delete).toHaveLength(0);
  });

  it("applies retention independently per site", () => {
    const sets = [
      ...setsFor("Site_A", [
        "2026-11-01-1200",
        "2026-11-02-1200",
        "2026-11-03-1200",
      ]),
      ...setsFor("Site_B", [
        "2026-11-01-1200",
        "2026-11-02-1200",
        "2026-11-03-1200",
      ]),
    ];
    const result = selectSets(
      sets,
      { daily: 1, weekly: 0, monthly: 0, yearly: 0 },
      TZ,
    );

    // Each site keeps its own most recent day and its protected most recent set.
    const keepA = result.keep.filter((s) => s.key.site === "Site_A");
    const keepB = result.keep.filter((s) => s.key.site === "Site_B");
    expect(raws(keepA)).toEqual(["2026-11-03-1200"]);
    expect(raws(keepB)).toEqual(["2026-11-03-1200"]);

    const deleteA = result.delete.filter((s) => s.key.site === "Site_A");
    const deleteB = result.delete.filter((s) => s.key.site === "Site_B");
    expect(raws(deleteA)).toEqual(["2026-11-01-1200", "2026-11-02-1200"]);
    expect(raws(deleteB)).toEqual(["2026-11-01-1200", "2026-11-02-1200"]);
  });

  it("protects the most recent set of each site independently", () => {
    const retention: Retention = { daily: 0, weekly: 0, monthly: 0, yearly: 0 };
    const sets = [
      ...setsFor("Site_A", ["2026-11-01-1200"]),
      ...setsFor("Site_B", ["2026-11-05-1200"]),
    ];
    const result = selectSets(sets, retention, TZ);

    // Both sites' single (and most recent) sets are protected.
    expect(result.delete).toHaveLength(0);
    expect(result.keep).toHaveLength(2);
  });
});
