import { TZDate } from "@date-fns/tz";
import type { BackupSet, Retention, RetentionResult } from "./types";

/** One level of the GFS policy. */
type Level = keyof Retention;

/** Period identifier for a given level, used to bucket sets. */
interface PeriodKey {
  /** The level this key belongs to. */
  level: Level;
  /** A comparable, sortable identifier of the calendar period. */
  id: string;
  /** Sortable numeric representation used to order periods chronologically. */
  order: number;
}

/** The four levels, from the most granular to the least. */
const LEVELS: Level[] = ["daily", "weekly", "monthly", "yearly"];

/** Return the calendar period of a timestamp for a given level, in `tz`. */
function periodOf(timestamp: Date, level: Level, tz: string): PeriodKey {
  const local = new TZDate(timestamp.getTime(), tz);

  const year = local.getFullYear();
  const month = local.getMonth(); // 0-11
  const day = local.getDate();

  switch (level) {
    case "daily":
      return {
        level,
        id: `${year}-${pad(month + 1)}-${pad(day)}`,
        order: Date.UTC(year, month, day),
      };
    case "monthly":
      return {
        level,
        id: `${year}-${pad(month + 1)}`,
        order: Date.UTC(year, month, 1),
      };
    case "yearly":
      return {
        level,
        id: `${year}`,
        order: Date.UTC(year, 0, 1),
      };
    case "weekly": {
      // ISO week: weeks start on Monday. Compute the ISO week-year and
      // week number from the local calendar date.
      const { isoYear, isoWeek } = isoWeekOf(year, month, day);
      return {
        level,
        id: `${isoYear}-W${pad(isoWeek)}`,
        order: Date.UTC(isoYear, 0, 1) + isoWeek * 86_400_000,
      };
    }
  }
}

/** Zero-pad a number to two digits. */
function pad(value: number): string {
  return value < 10 ? `0${value}` : `${value}`;
}

/**
 * Compute the ISO-8601 week-year and week number for a calendar date.
 *
 * The ISO week is defined relative to Thursday of the same week: the week-year
 * is the year of that Thursday, and week 1 is the week containing the first
 * Thursday of the year.
 */
function isoWeekOf(
  year: number,
  month: number,
  day: number,
): { isoYear: number; isoWeek: number } {
  // Work in UTC on a date-only instant to avoid any DST interference.
  const date = new Date(Date.UTC(year, month, day));
  const dayOfWeek = date.getUTCDay() || 7; // Sunday -> 7, Monday -> 1

  // Move to the Thursday of the current ISO week.
  date.setUTCDate(date.getUTCDate() + 4 - dayOfWeek);

  const isoYear = date.getUTCFullYear();
  const yearStart = Date.UTC(isoYear, 0, 1);
  const isoWeek = Math.ceil(
    ((date.getTime() - yearStart) / 86_400_000 + 1) / 7,
  );

  return { isoYear, isoWeek };
}

/**
 * Apply the GFS retention policy to the sets of a single site.
 *
 * The sets are assumed to belong to the same site and to be sorted by
 * ascending timestamp.
 */
function applyRetentionToSite(
  sets: BackupSet[],
  retention: Retention,
  tz: string,
): RetentionResult {
  const keep = new Set<BackupSet>();

  for (const level of LEVELS) {
    const count = retention[level];
    if (count <= 0) {
      continue;
    }

    // Bucket the sets by period, keeping them sorted by ascending timestamp
    // (they already are). The first set of a period is its candidate.
    const candidatesByPeriod = new Map<
      string,
      { order: number; set: BackupSet }
    >();

    for (const set of sets) {
      const period = periodOf(set.timestamp, level, tz);
      const existing = candidatesByPeriod.get(period.id);
      if (!existing) {
        // First set encountered in this period: the earliest one wins.
        candidatesByPeriod.set(period.id, { order: period.order, set });
      }
    }

    // Keep the candidates of the N most recent non-empty periods.
    const periods = [...candidatesByPeriod.values()].sort(
      (a, b) => b.order - a.order,
    );

    for (const period of periods.slice(0, count)) {
      keep.add(period.set);
    }
  }

  // Safety guarantee: the most recent set of the site is never deleted.
  const mostRecent = sets[sets.length - 1];
  if (mostRecent) {
    keep.add(mostRecent);
  }

  const kept: BackupSet[] = [];
  const deleted: BackupSet[] = [];
  for (const set of sets) {
    if (keep.has(set)) {
      kept.push(set);
    } else {
      deleted.push(set);
    }
  }

  return { keep: kept, delete: deleted };
}

/**
 * Apply the GFS retention policy to a collection of backup sets.
 *
 * This is a pure function: it performs no I/O. Sets are segmented by site so
 * that retention never mixes backups from different sites, and the most recent
 * set of every site is always kept.
 *
 * @param sets Backup sets (any order; they are re-sorted internally).
 * @param retention How many periods to keep for each level.
 * @param tz IANA timezone used to compute calendar period boundaries.
 * @returns The sets to keep and the sets to delete, sorted by ascending
 *   timestamp within each group.
 */
export function selectSets(
  sets: BackupSet[],
  retention: Retention,
  tz: string,
): RetentionResult {
  const bySite = new Map<string, BackupSet[]>();
  for (const set of sets) {
    const bucket = bySite.get(set.key.site);
    if (bucket) {
      bucket.push(set);
    } else {
      bySite.set(set.key.site, [set]);
    }
  }

  const keep: BackupSet[] = [];
  const deleted: BackupSet[] = [];

  for (const siteSets of bySite.values()) {
    siteSets.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    const result = applyRetentionToSite(siteSets, retention, tz);
    keep.push(...result.keep);
    deleted.push(...result.delete);
  }

  keep.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  deleted.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  return { keep, delete: deleted };
}
