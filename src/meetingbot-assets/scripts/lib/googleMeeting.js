#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const CREDS_DIR = path.join(ROOT, "creds");
const CLIENT_PATH = path.join(CREDS_DIR, "oauth-client.json");
const TOKEN_PATH = path.join(CREDS_DIR, "google-tokens.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

export async function refreshAccessToken() {
  const client = readJson(CLIENT_PATH).installed;
  const tokens = readJson(TOKEN_PATH);

  const params = new URLSearchParams({
    client_id: client.client_id,
    client_secret: client.client_secret,
    refresh_token: tokens.refresh_token,
    grant_type: "refresh_token",
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  const data = await res.json();
  if (data.error) {
    throw new Error(`Token refresh failed: ${data.error} - ${data.error_description}`);
  }

  tokens.access_token = data.access_token;
  if (data.refresh_token) tokens.refresh_token = data.refresh_token;
  tokens.expires_in = data.expires_in;
  writeJson(TOKEN_PATH, tokens);

  return {
    accessToken: data.access_token,
    client,
    tokens,
  };
}

export async function createMeeting({
  subject,
  start,
  duration = 60,
  description = "",
  attendees = [],
  timeZone = "UTC",
}) {
  if (!subject) throw new Error("subject is required");
  if (!start) throw new Error("start is required (ISO string)");

  const { accessToken } = await refreshAccessToken();

  const startTime = new Date(start);
  if (Number.isNaN(startTime.getTime())) {
    throw new Error(`Invalid start datetime: ${start}`);
  }
  const endTime = new Date(startTime.getTime() + Number(duration) * 60000);

  const event = {
    summary: subject,
    description,
    start: { dateTime: startTime.toISOString(), timeZone },
    end: { dateTime: endTime.toISOString(), timeZone },
    attendees: attendees.map((email) => ({ email })),
    conferenceData: {
      createRequest: {
        requestId: `meet-${Date.now()}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    },
  };

  const res = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    },
  );

  const data = await res.json();
  if (data.error) {
    throw new Error(`Calendar API error: ${JSON.stringify(data.error)}`);
  }

  return {
    eventId: data.id,
    summary: data.summary,
    start: data.start,
    end: data.end,
    hangoutLink: data.hangoutLink,
    htmlLink: data.htmlLink,
    attendees: (data.attendees || []).map((a) => ({ email: a.email, responseStatus: a.responseStatus })),
    conferenceData: data.conferenceData,
  };
}
