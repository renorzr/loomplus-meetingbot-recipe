# AGENTS.md

Guidance for agentic coding assistants in this repository.

## Scope
- This repo is a LoomPlus/OpenClaw (ClawChef) recipe workspace.
- Main recipe file: `recipe/recipe.yaml`.
- Template assets live in `recipe/meetingbot-assets/` and are copied into runtime workspaces.
- Code here is mostly Node.js ESM scripts (`.mjs`, `.js`) and Bash helpers (`.sh`).

## Rules Files Status
- Cursor rules: not found (`.cursor/rules/` missing, `.cursorrules` missing).
- Copilot rules: not found (`.github/copilot-instructions.md` missing).
- If these files are added later, treat them as higher-priority constraints and update this doc.

## Files Agents Should Read First
1. `recipe/meetingbot-assets/SOUL.md`
2. `recipe/meetingbot-assets/IDENTITY.md`
3. `recipe/meetingbot-assets/TOOLS.md`
4. `recipe/meetingbot-assets/AGENTS.md`
5. `recipe/recipe.yaml`

## Build/Lint/Test Commands
Use the commands below as the default validation workflow.

### Test Runner Commands
```bash
npm test
npm run test:unit
npm run test:integration
npm run test:recipe
npm run check:syntax
```

### Tooling / Environment Checks
```bash
node --version
mcporter --version
openclaw --version
clawchef --version
```

### Node Syntax Checks (acts as lint baseline)
Single file check:
```bash
node --check recipe/meetingbot-assets/scripts/scheduling.mjs
```

Batch check key scripts:
```bash
node --check recipe/meetingbot-assets/scripts/fireflies_minutes.mjs
node --check recipe/meetingbot-assets/scripts/generate_daily_summary.mjs
node --check recipe/meetingbot-assets/scripts/scheduling.mjs
node --check recipe/meetingbot-assets/scripts/scheduling-callback-server.mjs
node --check recipe/meetingbot-assets/scripts/lib/loomplus.js
node --check recipe/meetingbot-assets/scripts/lib/googleMeeting.js
```

### Bash Syntax Checks
```bash
bash -n recipe/meetingbot-assets/scripts/log_group_message.sh
bash -n recipe/meetingbot-assets/scripts/start-scheduling-server.sh
```

### Runtime Smoke Checks
List scheduling state:
```bash
node recipe/meetingbot-assets/scripts/scheduling.mjs list
```

Create a temporary scheduling session:
```bash
node recipe/meetingbot-assets/scripts/scheduling.mjs create --topic "Test" --organizer '{"tgId":"1","name":"owner"}' --attendees '[]'
```

Safe summary script run (expected no-op when log missing):
```bash
node recipe/meetingbot-assets/scripts/generate_daily_summary.mjs 2099-01-01
```

### Running a Single Test (important)
- Single unit test file:
```bash
node --test tests/unit/scheduling-cli.test.mjs
```
- Single integration test file:
```bash
node --test tests/integration/scheduling-callback-server.test.mjs
```
- Single script syntax check:
```bash
node --check recipe/meetingbot-assets/scripts/lib/googleMeeting.js
```

## Project Structure
- `recipe/recipe.yaml`: recipe params, workspace mapping, agent/channel config.
- `recipe/meetingbot-assets/AGENTS.md`: behavior rules injected into created workspace.
- `recipe/meetingbot-assets/SOUL.md`: role definition and response style.
- `recipe/meetingbot-assets/TOOLS.md`: config locations and script inventory.
- `recipe/meetingbot-assets/scripts/*.mjs`: operational automation scripts.
- `recipe/meetingbot-assets/scripts/lib/*.js`: reusable integrations.
- `recipe/meetingbot-assets/scripts/*.sh`: shell wrappers/utilities.
- `tests/`: unit/integration tests and recipe smoke test.

## Code Style Guidelines
These conventions are inferred from existing code. Keep them unless the repo owner changes standards.

### Imports and Modules
- Use ESM (`import ... from ...`), not CommonJS.
- Prefer built-in module specifiers: `node:fs`, `node:path`, `node:http`.
- Keep imports at the top of the file.
- Order imports: Node built-ins first, local modules second.
- Use `path.resolve(import.meta.dirname, ...)` for script-relative paths.

### Formatting
- 2-space indentation.
- Double quotes for strings.
- Semicolons at statement end.
- Use trailing commas in multiline objects/arrays/calls.
- Keep functions short; use guard clauses for early exits.

### Types and Data Validation
- No TypeScript currently; validate inputs at runtime.
- Validate required args/env early (`subject`, `start`, tokens, IDs, etc.).
- Treat parsed JSON as untrusted input.
- Return explicit object shapes for script outputs.
- Prefer stable JSON output for machine consumers.

### Naming Conventions
- Files: kebab-case for scripts (example: `generate_daily_summary.mjs`).
- Functions/variables: `camelCase` (`loadState`, `refreshAccessToken`).
- Module constants: `UPPER_SNAKE_CASE` (`ROOT`, `STATE_FILE`, `API_URL`).
- Environment variables: `UPPER_SNAKE_CASE` (`SCHEDULER_BOT_TOKEN`).

### Error Handling and Logging
- Fail fast for missing required config.
- Throw `Error` with actionable context for API failures.
- For expected missing state files, fall back to safe defaults.
- Use `console.error` for errors, `console.log` for normal outputs.
- Do not print secrets/tokens/client secrets in logs.

### State and File IO
- Persist mutable runtime state under `memory/`.
- Ensure parent dirs exist before writing (`mkdirSync(..., { recursive: true })`).
- Write JSON with formatting (`JSON.stringify(data, null, 2)`).
- Preserve backward compatibility when evolving state schema.

### Bash Conventions
- Use `#!/usr/bin/env bash` + `set -euo pipefail`.
- Quote variables unless intentional splitting is needed.
- Validate positional args before use.
- Send human-readable failure messages to stderr.

## Security Guidelines
- Never commit secrets (tokens, OAuth secrets, API keys).
- Keep sensitive values in env vars or local config files.
- Treat `creds/` and token JSON files as sensitive.
- Redact secrets in outputs, logs, and agent responses.

## Change Management
- Keep edits minimal and aligned with current style.
- When changing mapped files, verify `recipe/recipe.yaml` `files:` entries still match paths.

## Model Provider Setup
- Recipe bootstrap is provider-agnostic; do not assume Anthropic only.
- Use `auth_choice` + matching key vars (for example `openai-api-key`, `anthropic-api-key`, `openrouter-api-key`).
- Prefer passing provider secrets with `--var` or `CLAWCHEF_VAR_*` at runtime.
- If you add a script, update `recipe/meetingbot-assets/TOOLS.md`.
- If you change workflow behavior, update `recipe/meetingbot-assets/AGENTS.md` and/or `SOUL.md`.

## Telegram Group Test Strategy
- Default to local mock tests; do not require real Telegram groups for CI.
- Use `TG_API_BASE_URL` to point callback server calls to a local fake Telegram API.
- Use `DISABLE_POLLING=1` in tests to avoid endless getUpdates loops.
- Use `SCHEDULING_STATE_FILE` to isolate session state in temp files per test.
- Keep real Telegram smoke tests optional and manual.

## Quick Reference Commands
```bash
# syntax check one Node script
node --check recipe/meetingbot-assets/scripts/scheduling-callback-server.mjs

# run scheduling utility
node recipe/meetingbot-assets/scripts/scheduling.mjs list

# check shell script syntax
bash -n recipe/meetingbot-assets/scripts/start-scheduling-server.sh

# run daily summary for a specific date
node recipe/meetingbot-assets/scripts/generate_daily_summary.mjs 2026-03-07
```
