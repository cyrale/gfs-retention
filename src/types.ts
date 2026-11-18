/**
 * Shared types for the GFS retention logic.
 *
 * These types are intentionally free of any I/O concern (no S3, no filesystem)
 * so that the pure logic (parsing, grouping, retention) can be unit tested
 * without network access.
 */

/** A file successfully parsed from an UpdraftPlus backup filename. */
export interface ParsedFile {
  /** Full object key / filename, kept for logging and deletion. */
  filename: string;
  /** Site identifier, e.g. "Site_Name". May contain spaces and underscores. */
  site: string;
  /** Backup nonce, e.g. "b0260c3c0dfe". */
  nonce: string;
  /** Raw timestamp as found in the filename, e.g. "2026-11-07-2315". */
  rawTimestamp: string;
  /**
   * Timestamp resolved in the configured timezone, as a UTC instant.
   * Only used for comparisons; the raw string is the source of truth.
   */
  timestamp: Date;
  /** Component name, open-ended, e.g. "db", "uploads2", "mu-plugins". */
  component: string;
  /** File extension without the dot, e.g. "gz", "zip". */
  extension: string;
}

/** Identity of a backup set: all files sharing the same site, timestamp and nonce. */
export interface BackupSetKey {
  site: string;
  nonce: string;
  rawTimestamp: string;
}

/** A backup set: all files that must be kept or deleted together. */
export interface BackupSet {
  key: BackupSetKey;
  /** Timestamp resolved in the configured timezone, as a UTC instant. */
  timestamp: Date;
  /** Raw timestamp as found in the filename. */
  rawTimestamp: string;
  /** Files belonging to this set. Never empty. */
  files: ParsedFile[];
}

/** Retention policy: how many periods to keep for each level. */
export interface Retention {
  daily: number;
  weekly: number;
  monthly: number;
  yearly: number;
}

/** Result of the retention selection. */
export interface RetentionResult {
  /** Sets to keep, one entry per retained set. */
  keep: BackupSet[];
  /** Sets to delete, one entry per set not retained by any level. */
  delete: BackupSet[];
}
