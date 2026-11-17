# Repository Agent Guide

This file provides guidance to AI coding agents when working with code in this repository. `AGENTS.md` is the canonical file; `CLAUDE.md` is a symlink to it for tooling that expects that name.

## Project overview

See [README.md](./README.md) for project description, installation and usage.

## Domain context

This tool applies a **GFS (Grandfather-Father-Son) retention policy** to WordPress backups produced by the UpdraftPlus plugin and stored in S3-compatible buckets (Garage). Each WordPress site has its own bucket.

### UpdraftPlus backup sets

A single backup is a **set** of several files sharing the same timestamp and site identifier:

```
backup_2026-11-07-2315_Site_Name_b0260c3c0dfe-db.gz
backup_2026-11-07-2315_Site_Name_b0260c3c0dfe-plugins.zip
backup_2026-11-07-2315_Site_Name_b0260c3c0dfe-themes.zip
backup_2026-11-07-2315_Site_Name_b0260c3c0dfe-uploads.zip
backup_2026-11-07-2315_Site_Name_b0260c3c0dfe-uploads2.zip
backup_2026-11-07-2315_Site_Name_b0260c3c0dfe-mu-plugins.zip
backup_2026-11-07-2315_Site_Name_b0260c3c0dfe-others.zip
```

Naming pattern: `backup_<YYYY-MM-DD-HHmm>_<site-name>_<nonce>-<component>.<ext>`

- The **set identity** is `(timestamp, nonce)`. All files of a set are kept or deleted together, never partially.
- The date is parsed **from the filename**, never from S3 `LastModified`.
- The timestamp in the filename is in the WordPress site timezone; it is interpreted as local time in the timezone given by the `TZ` environment variable.
- Component names (`db`, `plugins`, `themes`, `uploads`, `uploads2`, ...) are open-ended: do not hardcode a closed list. Group by `(timestamp, nonce)` only.
- Objects that do not match the pattern are **ignored**, never deleted.

### Retention rules

Retention is expressed as four integers `daily,weekly,monthly,yearly` (default `14,8,12,3`).

- Calendar-based periods: day, ISO week (Monday start), month, year. All boundaries computed in the `TZ` timezone.
- For each period, the **first set** (earliest timestamp) in that period is the candidate.
- A level keeps the candidates of the **N most recent non-empty periods**. A gap in backups does not reduce coverage.
- A set retained by several levels is stored once.
- Any set not retained by at least one level is deleted.
- If several sets exist the same day, the first of the day wins.

### Safety guarantees (must never be broken)

- Dry-run is the default. Deletion only happens with `--apply` (or `APPLY=true`).
- The most recent set of a bucket is **never** deleted.
- A bucket with objects but no recognizable set is skipped untouched and reported as an error.
- All buckets are processed even if some fail. The process exits with a non-zero code if at least one bucket failed, after printing a summary of all failures.
- All planned and executed deletions are logged to stdout.

## Language conventions

- All code, comments, commit messages, variable/function names, and technical documentation (README, this file, etc.) must be written in **English**.
- Conversations with the AI assistant (chat, explanations) may happen in another language (French) — this does not apply to anything committed to the repository.

## Tech stack

- **Runtime**: Node.js 26 (LTS)
- **Language**: TypeScript (strict mode)
- **S3 client**: `@aws-sdk/client-s3` (v3), configured with an explicit custom endpoint
- **CLI parsing**: to be decided at scaffold time (prefer the built-in `node:util` `parseArgs`, no extra dependency)
- **Date handling**: to be decided at scaffold time (timezone-aware ISO week and month boundaries are required)
- **Tests**: Vitest
- **Container**: Docker, scheduling with supercronic (no host-side cron)
- **Hosting**: private GitHub repository

Keep dependencies minimal. Adding a dependency requires a clear justification.

## Architecture

The project is a **CLI first**; the Docker image is only a thin wrapper that runs the CLI on a schedule.

- The CLI must work standalone, without Docker.
- Pure logic (filename parsing, set grouping, retention selection) must be separated from I/O (S3 calls) so it can be unit tested without network access.

## Configuration

Precedence: CLI flags > environment variables > defaults.

- S3 credentials and endpoint are read from `S3_*` environment variables only. No credentials flags (shell history).
- All options must be settable by environment variable (for Docker) and by flag (for CLI), except secrets.
- Every boolean option that defaults to `true` must offer a way to be disabled by both flag and environment variable.

## Project structure

TBD at scaffold time. Expected layout:

```
src/
  cli.ts          # Entry point, argument parsing, exit code handling
  config.ts       # Configuration resolution (flags > env > defaults)
  s3.ts           # S3 client and I/O (list, delete)
  parser.ts       # UpdraftPlus filename parsing
  grouping.ts     # Group files into sets
  retention.ts    # GFS selection logic (pure)
  logger.ts       # stdout logging
tests/
docker/
  Dockerfile
  entrypoint.sh
  crontab
README.md
AGENTS.md
CLAUDE.md -> AGENTS.md
```

## Testing conventions

- Framework: Vitest.
- Keep the test suite small and focused. Do not add tests for trivial code.
- **Required**: unit tests on the pure logic (`parser`, `grouping`, `retention`). This tool deletes data, so selection logic must be covered, including edge cases: gaps in backups, several sets per day, ISO week across year boundary, timezone boundaries, partial first period, single set in a bucket.
- **Not required**: tests of S3 I/O, CLI wiring, Docker setup.
- Never propose new tests unprompted beyond the scope above.

## Git workflow

- Never run `git commit`, `git push`, or any command that rewrites git history (e.g. `git rebase`, `git reset --hard`) automatically.
- Always let the user review staged changes and commit them manually.
- You may run read-only git commands freely (`git status`, `git diff`, `git log`) to inspect the current state.
- If you believe a commit is ready, describe the proposed commit message and ask the user to confirm before running it.

## Security

- The tool performs destructive operations on backups. Dry-run must remain the default behaviour in every entry point (CLI and Docker).
- Never log secrets. Never accept secrets through CLI flags.
- The S3 user used by the tool should have the minimum permissions needed: list, get and delete on the target buckets, nothing else.
- Never delete objects that do not match the UpdraftPlus naming pattern.
- Run the Docker container as a non-root user.
