# gfs-retention

CLI tool that applies a GFS (Grandfather-Father-Son) retention policy to UpdraftPlus backups stored in S3-compatible buckets.

It keeps the first backup set of each of the last N days, weeks, months and years, and deletes everything else. A Docker image runs the CLI on a schedule, with no setup required on the host.

## Features

- Retention by calendar day, ISO week (Monday start), month and year
- Operates on whole backup sets, never on isolated files
- Dry-run by default, deletions require an explicit flag
- Multiple buckets processed in a single run, one failure never blocks the others
- Standalone CLI, plus a self-contained Docker image with its own scheduler

## How it works

An UpdraftPlus backup is a set of files sharing the same timestamp, for example:

```
backup_2026-11-07-2315_Site_Name_b0260c3c0dfe-db.gz
backup_2026-11-07-2315_Site_Name_b0260c3c0dfe-plugins.zip
backup_2026-11-07-2315_Site_Name_b0260c3c0dfe-uploads.zip
```

The tool groups these files into sets, then applies the retention policy:

1. For each period (day, ISO week, month, year), the **first set** of the period is the candidate.
2. Each level keeps the candidates of its **N most recent non-empty periods**.
3. A set kept by several levels is stored once.
4. Any other set is deleted, as a whole.

Default retention is `14,8,12,3` (daily, weekly, monthly, yearly).

## Requirements

- Node.js 26 (LTS)
- An S3-compatible server (tested with Garage)
- An S3 user with list, get and delete permissions on the target buckets

## Installation

```bash
npm install
npm run build
```

## Usage

```bash
export S3_ENDPOINT=https://s3.example.com
export S3_ACCESS_KEY_ID=...
export S3_SECRET_ACCESS_KEY=...

# Dry-run (default): shows what would be deleted
node dist/cli.js --buckets site-a,site-b

# Apply deletions
node dist/cli.js --buckets site-a,site-b --apply

# Custom retention
node dist/cli.js --buckets site-a --keep 14,8,12,3 --apply
```

## Configuration

Precedence: CLI flags > environment variables > defaults.

| Setting                                 | Flag                               | Environment variable                   | Default            |
| --------------------------------------- | ---------------------------------- | -------------------------------------- | ------------------ |
| Buckets (comma-separated)               | `--buckets`                        | `S3_BUCKETS`                           | required           |
| Retention `daily,weekly,monthly,yearly` | `--keep`                           | `RETENTION`                            | `14,8,12,3`        |
| Apply deletions                         | `--apply`                          | `APPLY=true`                           | off (dry-run)      |
| S3 endpoint                             | `--endpoint`                       | `S3_ENDPOINT`                          | required           |
| S3 region                               | n/a                                | `S3_REGION`                            | `us-east-1`        |
| S3 access key                           | n/a                                | `S3_ACCESS_KEY_ID`                     | required           |
| S3 secret key                           | n/a                                | `S3_SECRET_ACCESS_KEY`                 | required           |
| Path-style addressing                   | `--no-force-path-style` to disable | `S3_FORCE_PATH_STYLE=false` to disable | enabled            |
| Timezone                                | n/a                                | `TZ`                                   | `UTC`              |
| Cron schedule (Docker only)             | n/a                                | `CRON_SCHEDULE`                        | `0 4 * * *`        |

Secrets are never accepted as CLI flags, to keep them out of shell history.

## Docker

The image runs the CLI on a schedule using [supercronic](https://github.com/aptible/supercronic). Nothing needs to be configured on the host.

```bash
docker run -d \
  -e S3_ENDPOINT=https://s3.example.com \
  -e S3_ACCESS_KEY_ID=... \
  -e S3_SECRET_ACCESS_KEY=... \
  -e S3_BUCKETS=site-a,site-b \
  -e RETENTION=14,8,12,3 \
  -e TZ=Europe/Paris \
  -e CRON_SCHEDULE="0 4 * * *" \
  -e APPLY=true \
  gfs-retention
```

`CRON_SCHEDULE` defaults to `0 4 * * *` (every day at 04:00) when not set.

Leave `APPLY` unset first and check the logs of the dry-run before enabling deletions.

## Safety

- Dry-run by default, deletions require `--apply` or `APPLY=true`.
- The most recent set of a bucket is never deleted.
- Files not matching the UpdraftPlus naming pattern are ignored.
- A bucket with objects but no recognizable backup set is skipped untouched and reported as an error.
- All buckets are processed even if some fail. The process exits with a non-zero code if at least one bucket failed, after printing a summary of all failures.
- All planned and executed deletions are logged to stdout.

## Development

```bash
npm test
```

See [AGENTS.md](./AGENTS.md) for the conventions used by AI coding agents on this repository.
