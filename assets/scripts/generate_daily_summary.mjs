#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(import.meta.dirname, "..");
const LOG_DIR = path.join(ROOT, "chat-logs");
const MCP_CONFIG = path.join(ROOT, "config", "mcporter.json");
const KB_ID = process.env.LOOMPLUS_KB_ID || "cmm67kvcx000l5xzgquhz4g5v";

function defaultDate() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

const targetDate = process.argv[2] || defaultDate();
const logFile = path.join(LOG_DIR, `${targetDate}.log`);

if (!fs.existsSync(logFile)) {
  console.log(`No log for ${targetDate}`);
  process.exit(0);
}

const rawLog = fs.readFileSync(logFile, "utf8").trim();
if (!rawLog) {
  console.log(`Empty log for ${targetDate}`);
  process.exit(0);
}

const lines = rawLog.split("\n");
const participants = new Set();
for (const line of lines) {
  const match = line.match(/\[\d{2}:\d{2}:\d{2}\] (.+?) \(/);
  if (match) participants.add(match[1]);
}

const summary = `# 群聊纪要-${targetDate}\n\n## 基本信息\n- 日期: ${targetDate}\n- 消息数: ${lines.length}\n- 参与人: ${[...participants].join("、") || "无"}\n\n## 聊天记录\n\n${rawLog}\n`;

const payload = JSON.stringify({
  kbId: KB_ID,
  content: summary,
  source: `群聊纪要-${targetDate}`,
});

const { stdout, stderr } = await execFileAsync(
  "mcporter",
  ["call", "loomplus", "upsert_document", "--args", payload],
  { env: { ...process.env, MCPORTER_CONFIG: MCP_CONFIG } },
);

if (stderr?.trim()) {
  console.error(stderr.trim());
}
console.log(stdout.trim());
