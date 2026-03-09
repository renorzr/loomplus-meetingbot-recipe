#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const STATE_FILE = path.join(ROOT, "memory", "fireflies-state.json");
const API_URL = "https://api.fireflies.ai/graphql";
const API_KEY = process.env.FIREFLIES_API_KEY;

if (!API_KEY) {
  console.error("FIREFLIES_API_KEY is required");
  process.exit(1);
}

async function gql(query, variables = {}) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

async function listTranscripts() {
  const data = await gql(`{ transcripts { id title date duration meeting_link } }`);
  return data.transcripts || [];
}

async function getTranscript(id) {
  const data = await gql(
    `query($id: String!) {
      transcript(id: $id) {
        id title date duration meeting_link participants
        summary { overview action_items shorthand_bullet topics_discussed }
      }
    }`,
    { id },
  );
  return data.transcript;
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return { processedIds: [] };
  }
}

function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function formatMinutes(t) {
  const date = new Date(t.date).toISOString().slice(0, 16).replace("T", " ");
  const s = t.summary || {};
  return `# 会议纪要\n\n- 主题: ${t.title}\n- 时间: ${date} UTC\n- 时长: ${Math.round(t.duration || 0)} 分钟\n- 链接: ${t.meeting_link || ""}\n\n## 概要\n${s.overview || ""}\n\n## 议题\n${s.topics_discussed || ""}\n\n## 行动项\n${s.action_items || ""}\n\n## 要点\n${s.shorthand_bullet || ""}\n`;
}

const args = process.argv.slice(2);

if (args.includes("--list")) {
  const transcripts = await listTranscripts();
  for (const t of transcripts) {
    const date = new Date(t.date).toISOString().slice(0, 10);
    console.log(`${t.id} | ${date} | ${Math.round(t.duration || 0)}min | ${t.title}`);
  }
  process.exit(0);
}

if (args.includes("--id")) {
  const id = args[args.indexOf("--id") + 1];
  if (!id) {
    console.error("--id requires a value");
    process.exit(1);
  }
  const t = await getTranscript(id);
  if (!t) {
    console.error("Transcript not found");
    process.exit(1);
  }
  console.log(formatMinutes(t));
  process.exit(0);
}

const state = loadState();
const transcripts = await listTranscripts();
const processed = new Set(state.processedIds || []);
const incoming = transcripts.filter((t) => !processed.has(t.id));

if (incoming.length === 0) {
  console.log(JSON.stringify({ new: 0 }));
  process.exit(0);
}

const results = [];
for (const item of incoming) {
  const full = await getTranscript(item.id);
  results.push({ id: full.id, title: full.title, minutes: formatMinutes(full) });
  processed.add(full.id);
}

state.processedIds = [...processed];
saveState(state);
console.log(JSON.stringify({ new: results.length, results }));
