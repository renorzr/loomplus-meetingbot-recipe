#!/usr/bin/env node

import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(import.meta.dirname, "..", "..");
const DEFAULT_MCP_CONFIG = path.join(ROOT, "config", "mcporter.json");

function getEnv() {
  const env = { ...process.env };
  if (!env.MCPORTER_CONFIG) {
    env.MCPORTER_CONFIG = DEFAULT_MCP_CONFIG;
  }
  return env;
}

export async function callLoomPlus(tool, payload = {}) {
  const selector = `loomplus.${tool}`;
  const args = ["call", selector, "--args", JSON.stringify(payload)];
  const { stdout, stderr } = await execFileAsync("mcporter", args, { env: getEnv() });
  if (stderr?.trim()) {
    console.error(`[mcporter:${tool}]`, stderr.trim());
  }
  const text = stdout.trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Failed to parse mcporter response: ${text}`);
  }
}

export async function getEmailByPlatform(platform, platformId) {
  const resp = await callLoomPlus("get_user_email_by_platform_id", {
    platform,
    platformId,
  });
  if (!resp) return null;
  return resp.email || resp.result?.email || resp.data?.email || null;
}

export async function syncGoogleMeeting(meetingData) {
  return callLoomPlus("sync_google_meeting", meetingData);
}
