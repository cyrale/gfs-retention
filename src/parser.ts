import { TZDate } from "@date-fns/tz";
import type { ParsedFile } from "./types";

/**
 * UpdraftPlus backup filename pattern:
 *
 *   backup_<YYYY-MM-DD-HHmm>_<site-name>_<nonce>-<component>.<ext>
 *
 * - The date is captured as a fixed-shape group so it can be validated.
 * - The site name may contain spaces and underscores.
 * - The nonce is the segment right before the "-<component>" part.
 * - The component name and the extension are open-ended.
 *
 * The regex is intentionally greedy on the site name so that the LAST
 * underscore before the nonce is used as the separator. The nonce is
 * assumed to be a token without underscore or dash.
 */
const BACKUP_PATTERN =
  /^backup_(\d{4}-\d{2}-\d{2}-\d{4})_(.+)_([^_-]+)-([^.]+)\.(.+)$/;

/** Parse the fixed-shape timestamp group "YYYY-MM-DD-HHmm". */
function parseTimestamp(raw: string, tz: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})$/.exec(raw);
  if (!match) {
    return null;
  }

  const [, year, month, day, hour, minute] = match as unknown as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];

  const yearNum = Number(year);
  const monthNum = Number(month);
  const dayNum = Number(day);
  const hourNum = Number(hour);
  const minuteNum = Number(minute);

  // Reject values that cannot be a real date before delegating to TZDate,
  // which would otherwise silently roll over (e.g. month 13 -> next year).
  if (
    monthNum < 1 ||
    monthNum > 12 ||
    dayNum < 1 ||
    dayNum > 31 ||
    hourNum > 23 ||
    minuteNum > 59
  ) {
    return null;
  }

  const resolved = new TZDate(
    yearNum,
    monthNum - 1,
    dayNum,
    hourNum,
    minuteNum,
    0,
    0,
    tz,
  );

  // TZDate rolls over invalid day/month combinations (e.g. February 30th);
  // verify the round trip to reject impossible dates.
  if (
    resolved.getFullYear() !== yearNum ||
    resolved.getMonth() !== monthNum - 1 ||
    resolved.getDate() !== dayNum ||
    resolved.getHours() !== hourNum ||
    resolved.getMinutes() !== minuteNum
  ) {
    return null;
  }

  return resolved;
}

/**
 * Parse an UpdraftPlus backup filename.
 *
 * @param filename The object key / filename (a leading path is not expected).
 * @param tz IANA timezone used to resolve the filename timestamp.
 * @returns The parsed file, or `null` if the filename does not match the pattern.
 */
export function parseBackupFilename(
  filename: string,
  tz: string,
): ParsedFile | null {
  const match = BACKUP_PATTERN.exec(filename);
  if (!match) {
    return null;
  }

  const [, rawTimestamp, site, nonce, component, extension] =
    match as unknown as [string, string, string, string, string, string];

  if (!site || !nonce || !component || !extension) {
    return null;
  }

  const timestamp = parseTimestamp(rawTimestamp, tz);
  if (!timestamp) {
    return null;
  }

  return {
    filename,
    site,
    nonce,
    rawTimestamp,
    timestamp,
    component,
    extension,
  };
}
