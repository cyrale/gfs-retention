import { describe, expect, it } from "vitest";
import { parseBackupFilename } from "../src/parser";

const TZ = "UTC";

describe("parseBackupFilename", () => {
  it("parses a well-formed filename", () => {
    const parsed = parseBackupFilename(
      "backup_2026-11-07-2315_Site_Name_b0260c3c0dfe-db.gz",
      TZ,
    );

    expect(parsed).not.toBeNull();
    expect(parsed?.site).toBe("Site_Name");
    expect(parsed?.nonce).toBe("b0260c3c0dfe");
    expect(parsed?.rawTimestamp).toBe("2026-11-07-2315");
    expect(parsed?.component).toBe("db");
    expect(parsed?.extension).toBe("gz");
    // Compare instants via getTime(): TZDate overrides toISOString() to render
    // the offset instead of "Z".
    expect(parsed?.timestamp.getTime()).toBe(Date.UTC(2026, 10, 7, 23, 15));
  });

  it("parses an open-ended component name with a dash", () => {
    const parsed = parseBackupFilename(
      "backup_2026-11-07-2315_Site_Name_b0260c3c0dfe-mu-plugins.zip",
      TZ,
    );

    expect(parsed?.component).toBe("mu-plugins");
    expect(parsed?.extension).toBe("zip");
  });

  it("keeps the full site name even when it contains underscores", () => {
    const parsed = parseBackupFilename(
      "backup_2026-11-07-2315_My_WordPress_Site_ab12cd-db.gz",
      TZ,
    );

    expect(parsed?.site).toBe("My_WordPress_Site");
    expect(parsed?.nonce).toBe("ab12cd");
  });

  it("resolves the timestamp in the given timezone", () => {
    const parsed = parseBackupFilename(
      "backup_2026-11-07-2315_Site_Name_b0260c3c0dfe-db.gz",
      "Europe/Paris",
    );

    // 23:15 Paris (CET, +01:00) == 22:15 UTC.
    expect(parsed?.timestamp.getTime()).toBe(Date.UTC(2026, 10, 7, 22, 15));
  });

  it("rejects an impossible date", () => {
    expect(
      parseBackupFilename(
        "backup_2026-02-30-2315_Site_Name_b0260c3c0dfe-db.gz",
        TZ,
      ),
    ).toBeNull();
    expect(
      parseBackupFilename(
        "backup_2026-13-01-2315_Site_Name_b0260c3c0dfe-db.gz",
        TZ,
      ),
    ).toBeNull();
    expect(
      parseBackupFilename(
        "backup_2026-11-07-2560_Site_Name_b0260c3c0dfe-db.gz",
        TZ,
      ),
    ).toBeNull();
  });

  it("ignores objects that do not match the pattern", () => {
    const ignored = [
      "random-file.txt",
      "backup_2026-11-07_Site_Name_b0260c3c0dfe-db.gz",
      "backup_2026-11-07-2315_Site_Name_b0260c3c0dfe-db",
      "backup_2026-11-07-2315__b0260c3c0dfe-db.gz",
      "not-a-backup_2026-11-07-2315_Site_Name_b0260c3c0dfe-db.gz",
    ];

    for (const filename of ignored) {
      expect(parseBackupFilename(filename, TZ)).toBeNull();
    }
  });
});
