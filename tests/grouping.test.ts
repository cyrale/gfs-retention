import { describe, expect, it } from "vitest";
import { groupIntoSets } from "../src/grouping";
import { parseBackupFilename } from "../src/parser";
import type { ParsedFile } from "../src/types";

const TZ = "UTC";

function parse(...filenames: string[]): ParsedFile[] {
  return filenames.map((name) => {
    const parsed = parseBackupFilename(name, TZ);
    if (!parsed) {
      throw new Error(`Test fixture does not parse: ${name}`);
    }
    return parsed;
  });
}

describe("groupIntoSets", () => {
  it("groups files sharing timestamp and nonce into a single set", () => {
    const sets = groupIntoSets(
      parse(
        "backup_2026-11-07-2315_Site_Name_b0260c3c0dfe-db.gz",
        "backup_2026-11-07-2315_Site_Name_b0260c3c0dfe-plugins.zip",
        "backup_2026-11-07-2315_Site_Name_b0260c3c0dfe-uploads.zip",
      ),
    );

    expect(sets).toHaveLength(1);
    expect(sets[0]?.files).toHaveLength(3);
    expect(sets[0]?.rawTimestamp).toBe("2026-11-07-2315");
  });

  it("separates sets with different timestamps", () => {
    const sets = groupIntoSets(
      parse(
        "backup_2026-11-07-2315_Site_Name_b0260c3c0dfe-db.gz",
        "backup_2026-11-08-2315_Site_Name_b0260c3c0dfe-db.gz",
      ),
    );

    expect(sets).toHaveLength(2);
  });

  it("separates sets with the same timestamp but different nonces", () => {
    const sets = groupIntoSets(
      parse(
        "backup_2026-11-07-2315_Site_Name_aaaaaa-db.gz",
        "backup_2026-11-07-2315_Site_Name_bbbbbb-db.gz",
      ),
    );

    expect(sets).toHaveLength(2);
  });

  it("keeps sets from two sites independent even with the same timestamp and nonce", () => {
    const sets = groupIntoSets(
      parse(
        "backup_2026-11-07-2315_Site_A_b0260c3c0dfe-db.gz",
        "backup_2026-11-07-2315_Site_B_b0260c3c0dfe-db.gz",
      ),
    );

    expect(sets).toHaveLength(2);
    expect(sets.map((s) => s.key.site).sort()).toEqual(["Site_A", "Site_B"]);
  });

  it("returns sets sorted by ascending timestamp", () => {
    const sets = groupIntoSets(
      parse(
        "backup_2026-11-08-2315_Site_Name_b0260c3c0dfe-db.gz",
        "backup_2026-11-07-2315_Site_Name_b0260c3c0dfe-db.gz",
      ),
    );

    expect(sets.map((s) => s.rawTimestamp)).toEqual([
      "2026-11-07-2315",
      "2026-11-08-2315",
    ]);
  });
});
