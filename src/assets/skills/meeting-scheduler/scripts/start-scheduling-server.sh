#!/bin/bash
# Start the scheduling callback server
# Fill in your actual bot tokens before use
export SCHEDULER_BOT_TOKEN="YOUR_SCHEDULER_BOT_TOKEN"
export LOOMPLUS_BOT_TOKEN="YOUR_LOOMPLUS_BOT_TOKEN"
exec node "$(dirname "$0")/scheduling-callback-server.mjs"
