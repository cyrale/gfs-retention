import type { Retention } from "./types";

/** Fully resolved configuration for a run. */
export interface Config {
  /** Buckets to process, in the order given. */
  buckets: string[];
  /** Retention policy for all buckets. */
  retention: Retention;
  /** Whether deletions must actually be performed. */
  apply: boolean;
  /** S3 endpoint URL. */
  endpoint: string;
  /** S3 region. */
  region: string;
  /** S3 access key id. */
  accessKeyId: string;
  /** S3 secret access key. */
  secretAccessKey: string;
  /** Whether to use path-style addressing. */
  forcePathStyle: boolean;
  /** IANA timezone used for calendar period boundaries. */
  timezone: string;
}

/** Raw options coming from the CLI, all optional. */
export interface CliOptions {
  buckets?: string;
  keep?: string;
  apply?: boolean;
  endpoint?: string;
  forcePathStyle?: boolean;
}

/** Error thrown when the configuration is invalid or incomplete. */
export class ConfigError extends Error {}

const DEFAULT_RETENTION = "14,8,12,3";
const DEFAULT_REGION = "us-east-1";
const DEFAULT_TIMEZONE = "UTC";

/** Parse a comma-separated list, trimming blanks and dropping empties. */
function parseList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/** Parse the retention string "daily,weekly,monthly,yearly". */
function parseRetention(value: string): Retention {
  const parts = parseList(value);
  if (parts.length !== 4) {
    throw new ConfigError(
      `Invalid retention "${value}": expected four integers (daily,weekly,monthly,yearly).`,
    );
  }

  const numbers = parts.map((part) => Number(part));
  if (numbers.some((n) => !Number.isInteger(n) || n < 0)) {
    throw new ConfigError(
      `Invalid retention "${value}": every value must be a non-negative integer.`,
    );
  }

  const [daily, weekly, monthly, yearly] = numbers as [
    number,
    number,
    number,
    number,
  ];
  return { daily, weekly, monthly, yearly };
}

/** Parse a boolean from an environment string, treating "false"/"0" as false. */
function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") {
    return fallback;
  }
  return !/^(false|0|no)$/i.test(value.trim());
}

/** Resolve a string option using flag first, then env, then default. */
function resolve(
  flag: string | undefined,
  env: string | undefined,
  fallback: string,
): string {
  return flag ?? env ?? fallback;
}

/**
 * Resolve the effective configuration from CLI flags and environment
 * variables.
 *
 * Precedence: CLI flags > environment variables > defaults. S3 credentials and
 * endpoint are read from the environment only; secrets are never accepted as
 * flags.
 *
 * @throws {ConfigError} when a required setting is missing or a value is
 *   malformed.
 */
export function resolveConfig(
  options: CliOptions,
  env: NodeJS.ProcessEnv = process.env,
): Config {
  const bucketsRaw = resolve(options.buckets, env.S3_BUCKETS, "");
  const buckets = parseList(bucketsRaw);
  if (buckets.length === 0) {
    throw new ConfigError(
      "No buckets given. Use --buckets or the S3_BUCKETS environment variable.",
    );
  }

  const endpoint = resolve(options.endpoint, env.S3_ENDPOINT, "");
  if (endpoint.length === 0) {
    throw new ConfigError(
      "No S3 endpoint given. Use --endpoint or the S3_ENDPOINT environment variable.",
    );
  }

  const accessKeyId = env.S3_ACCESS_KEY_ID ?? "";
  if (accessKeyId.length === 0) {
    throw new ConfigError("Missing S3_ACCESS_KEY_ID environment variable.");
  }

  const secretAccessKey = env.S3_SECRET_ACCESS_KEY ?? "";
  if (secretAccessKey.length === 0) {
    throw new ConfigError("Missing S3_SECRET_ACCESS_KEY environment variable.");
  }

  const retention = parseRetention(
    resolve(options.keep, env.RETENTION, DEFAULT_RETENTION),
  );

  // Apply defaults to false; the flag enables it, the env variable may too.
  const apply = options.apply ?? parseBoolean(env.APPLY, false);

  // Path-style defaults to true and can be disabled by both flag and env.
  const forcePathStyle =
    options.forcePathStyle ?? parseBoolean(env.S3_FORCE_PATH_STYLE, true);

  const region = resolve(undefined, env.S3_REGION, DEFAULT_REGION);
  const timezone = resolve(undefined, env.TZ, DEFAULT_TIMEZONE);

  return {
    buckets,
    retention,
    apply,
    endpoint,
    region,
    accessKeyId,
    secretAccessKey,
    forcePathStyle,
    timezone,
  };
}
