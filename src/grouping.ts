import type { BackupSet, BackupSetKey, ParsedFile } from "./types";

/** Build the identity key of a set from one of its files. */
function keyOf(file: ParsedFile): BackupSetKey {
  return {
    site: file.site,
    nonce: file.nonce,
    rawTimestamp: file.rawTimestamp,
  };
}

/** Stable string representation of a set key, used to index sets in a Map. */
function keyToString(key: BackupSetKey): string {
  // The separator is a NUL character, which cannot appear in a filename.
  return `${key.site}\u0000${key.nonce}\u0000${key.rawTimestamp}`;
}

/**
 * Group parsed files into backup sets.
 *
 * A set is identified by `(site, nonce, rawTimestamp)`: all files sharing
 * these three values are kept or deleted together. Grouping by site as well
 * as timestamp/nonce guards against any collision between two distinct sites
 * living in the same bucket.
 *
 * @param files Parsed files (files that did not match the pattern must be
 *   filtered out upstream).
 * @returns The sets, sorted by ascending timestamp. Ties are broken by site
 *   then nonce for deterministic output.
 */
export function groupIntoSets(files: ParsedFile[]): BackupSet[] {
  const sets = new Map<string, BackupSet>();

  for (const file of files) {
    const key = keyOf(file);
    const id = keyToString(key);

    let set = sets.get(id);
    if (!set) {
      set = {
        key,
        timestamp: file.timestamp,
        rawTimestamp: file.rawTimestamp,
        files: [],
      };
      sets.set(id, set);
    }
    set.files.push(file);
  }

  return [...sets.values()].sort(compareSets);
}

/** Compare two sets by ascending timestamp, then site, then nonce. */
function compareSets(a: BackupSet, b: BackupSet): number {
  const byTime = a.timestamp.getTime() - b.timestamp.getTime();
  if (byTime !== 0) {
    return byTime;
  }
  const bySite = a.key.site.localeCompare(b.key.site);
  if (bySite !== 0) {
    return bySite;
  }
  return a.key.nonce.localeCompare(b.key.nonce);
}
