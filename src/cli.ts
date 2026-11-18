import { Command } from "commander";
import type { S3Client } from "@aws-sdk/client-s3";
import { ConfigError, resolveConfig, type Config } from "./config";
import { groupIntoSets } from "./grouping";
import * as log from "./logger";
import { parseBackupFilename } from "./parser";
import { selectSets } from "./retention";
import { createS3Client, deleteObjectKeys, listObjectKeys } from "./s3";
import type { ParsedFile } from "./types";

/** Process a single bucket. Throws on failure. */
async function processBucket(
  client: S3Client,
  bucket: string,
  config: Config,
): Promise<void> {
  log.heading(`Bucket "${bucket}": listing objects...`);
  const keys = await listObjectKeys(client, bucket);

  if (keys.length === 0) {
    log.info(`Bucket "${bucket}": empty, nothing to do.`);
    return;
  }

  const parsed: ParsedFile[] = [];
  for (const key of keys) {
    const file = parseBackupFilename(key, config.timezone);
    if (file) {
      parsed.push(file);
    }
  }

  if (parsed.length === 0) {
    // Safety: never touch a bucket whose objects are not recognizable.
    throw new Error(
      `Bucket "${bucket}" has ${keys.length} object(s) but no recognizable backup set; skipping untouched.`,
    );
  }

  const sets = groupIntoSets(parsed);
  const { keep, delete: toDelete } = selectSets(
    sets,
    config.retention,
    config.timezone,
  );

  log.info(
    `Bucket "${bucket}": ${sets.length} set(s), ${keep.length} kept, ${toDelete.length} to delete.`,
  );

  if (toDelete.length === 0) {
    log.success(`Bucket "${bucket}": nothing to delete.`);
    return;
  }

  const keysToDelete = toDelete.flatMap((set) =>
    set.files.map((file) => file.filename),
  );

  if (!config.apply) {
    log.warn(
      `Bucket "${bucket}": dry-run, would delete ${keysToDelete.length} object(s):`,
    );
    for (const key of keysToDelete) {
      log.wouldDelete(key);
    }
    return;
  }

  log.warn(`Bucket "${bucket}": deleting ${keysToDelete.length} object(s):`);
  for (const key of keysToDelete) {
    log.deleted(key);
  }

  const failed = await deleteObjectKeys(client, bucket, keysToDelete);
  if (failed.length > 0) {
    throw new Error(
      `Bucket "${bucket}": failed to delete ${failed.length} object(s): ${failed.join(", ")}`,
    );
  }
}

/** Build the commander program. */
function buildProgram(): Command {
  const program = new Command();

  program
    .name("gfs-retention")
    .description(
      "Apply a GFS retention policy to UpdraftPlus backups in S3-compatible buckets.",
    )
    .option(
      "--buckets <list>",
      "comma-separated list of buckets (env: S3_BUCKETS)",
    )
    .option(
      "--keep <d,w,m,y>",
      "retention for daily,weekly,monthly,yearly (env: RETENTION)",
    )
    .option("--apply", "actually delete objects (env: APPLY)")
    .option("--endpoint <url>", "S3 endpoint URL (env: S3_ENDPOINT)")
    .option(
      "--no-force-path-style",
      "disable path-style addressing (env: S3_FORCE_PATH_STYLE=false)",
    )
    .showHelpAfterError();

  return program;
}

/** Entry point. */
export async function run(): Promise<void> {
  const program = buildProgram();
  program.parse();
  const options = program.opts();

  let config: Config;
  try {
    config = resolveConfig({
      buckets: options.buckets,
      keep: options.keep,
      apply: options.apply,
      endpoint: options.endpoint,
      forcePathStyle: options.forcePathStyle,
    });
  } catch (err) {
    if (err instanceof ConfigError) {
      log.error(err.message);
      process.exitCode = 1;
      return;
    }
    throw err;
  }

  if (!config.apply) {
    log.info("Dry-run mode (no deletion). Use --apply to delete.");
  }

  const client = createS3Client(config);
  const failures: string[] = [];

  for (const bucket of config.buckets) {
    try {
      await processBucket(client, bucket, config);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error(message);
      failures.push(bucket);
    }
  }

  if (failures.length > 0) {
    log.error(
      `Failed bucket(s): ${failures.join(", ")} (${failures.length}/${config.buckets.length}).`,
    );
    process.exitCode = 1;
  }
}
