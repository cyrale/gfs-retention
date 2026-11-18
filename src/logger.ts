import { styleText } from "node:util";

/** Text format accepted by `util.styleText` (single style or array of styles). */
type StyleFormat = Parameters<typeof styleText>[0];

/**
 * Minimal stdout logger with optional ANSI colors.
 *
 * Color rules, applied globally:
 * - colors are enabled when stdout is a TTY and `NO_COLOR` is not set;
 * - `FORCE_COLOR` forces colors even when stdout is not a TTY (e.g. a pipe);
 * - `NO_COLOR` always wins when set to a non-empty value.
 *
 * In non-interactive contexts (cron, Docker logs, redirection) colors are off
 * by default, keeping logs clean. Secrets must never be passed to these
 * helpers.
 */

function resolveColorEnabled(): boolean {
  if (process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== "") {
    return false;
  }
  if (process.env.FORCE_COLOR !== undefined && process.env.FORCE_COLOR !== "") {
    return true;
  }
  return process.stdout.isTTY === true;
}

const COLOR_ENABLED = resolveColorEnabled();

/** Apply a color to a fragment when colors are enabled. */
function color(text: string, format: StyleFormat): string {
  if (!COLOR_ENABLED) {
    return text;
  }
  return styleText(format, text);
}

/** Whether ANSI colors are currently enabled. */
export function isColorEnabled(): boolean {
  return COLOR_ENABLED;
}

function line(message: string): void {
  process.stdout.write(`${message}\n`);
}

/** Log an informational message. */
export function info(message: string): void {
  line(message);
}

/** Log a highlighted heading, e.g. a bucket being processed. */
export function heading(message: string): void {
  line(color(message, ["bold", "cyan"]));
}

/** Log a success confirmation. */
export function success(message: string): void {
  line(color(message, "green"));
}

/** Log a warning message. */
export function warn(message: string): void {
  line(`${color("WARN:", "yellow")} ${message}`);
}

/** Log an error message. */
export function error(message: string): void {
  line(`${color("ERROR:", "red")} ${message}`);
}

/** Log a single planned deletion (dry-run). */
export function wouldDelete(key: string): void {
  line(`${color("would delete", "yellow")} ${color(key, "dim")}`);
}

/** Log a single executed deletion. */
export function deleted(key: string): void {
  line(`${color("delete", "red")} ${color(key, "dim")}`);
}
