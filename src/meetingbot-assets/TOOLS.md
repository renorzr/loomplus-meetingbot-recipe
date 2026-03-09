# TOOLS.md - MeetingBot

## LoomPlus MCP

- Config file: `config/mcporter.json`
- Runtime env example: `MCPORTER_CONFIG=config/mcporter.json`

## Fireflies (Optional)

- Config file: `config/fireflies.json`
- Keep API keys out of chat and git history.

## Local Workspace Paths

- Memory: `memory/`
- Scripts: `scripts/`
- Config: `config/`

## Included Scripts

- `scripts/log_group_message.sh`: append group messages into `chat-logs/YYYY-MM-DD.log`
- `scripts/generate_daily_summary.mjs`: summarize daily logs and upsert to LoomPlus KB
- `scripts/fireflies_minutes.mjs`: fetch Fireflies transcripts and generate minutes
- `scripts/scheduling.mjs`: local scheduling session state utility
- `scripts/scheduling-callback-server.mjs`: Telegram callback server for date selection
- `scripts/start-scheduling-server.sh`: launch scheduling callback server
- `scripts/lib/loomplus.js`: helper wrapper for `mcporter` LoomPlus calls
- `scripts/lib/googleMeeting.js`: Google Calendar token refresh and meeting creation helper
