#!/usr/bin/env node
/**
 * Fireflies Meeting Minutes Generator
 * 
 * Usage:
 *   node fireflies_minutes.mjs                  # Check for new transcripts and generate minutes
 *   node fireflies_minutes.mjs --id <id>        # Generate minutes for a specific transcript
 *   node fireflies_minutes.mjs --list           # List recent transcripts
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, '..', 'memory', 'fireflies-state.json');
const API_URL = 'https://api.fireflies.ai/graphql';
const API_KEY = process.env.FIREFLIES_API_KEY;

if (!API_KEY) {
  console.error('FIREFLIES_API_KEY not set');
  process.exit(1);
}

async function gql(query, variables = {}) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

async function listTranscripts() {
  const data = await gql(`{
    transcripts {
      id title date dateString duration participants meeting_link
      summary { overview action_items shorthand_bullet }
    }
  }`);
  return data.transcripts || [];
}

async function getTranscript(id) {
  const data = await gql(`query($id: String!) {
    transcript(id: $id) {
      id title date dateString duration participants meeting_link
      speakers { id name }
      sentences { index speaker_name text start_time end_time }
      summary { overview action_items shorthand_bullet outline keywords topics_discussed }
      meeting_attendees { displayName email }
    }
  }`, { id });
  return data.transcript;
}

function formatMinutes(t) {
  const date = new Date(t.date).toISOString().slice(0, 16).replace('T', ' ');
  const dur = Math.round(t.duration);
  const attendees = (t.meeting_attendees || [])
    .map(a => a.displayName || a.email)
    .filter(Boolean)
    .join('、') || (t.participants || []).join('、');

  const s = t.summary || {};
  
  let md = `# 📅 会议纪要\n\n`;
  md += `**主题：** ${t.title}\n`;
  md += `**时间：** ${date} UTC（约 ${dur} 分钟）\n`;
  md += `**参会：** ${attendees}\n`;
  if (t.meeting_link) md += `**会议链接：** ${t.meeting_link}\n`;
  md += `\n---\n\n`;

  if (s.overview) {
    md += `## 概要\n${s.overview}\n\n`;
  }

  if (s.topics_discussed) {
    md += `## 讨论议题\n${s.topics_discussed}\n\n`;
  }

  if (s.shorthand_bullet) {
    md += `## 要点\n${s.shorthand_bullet}\n\n`;
  }

  if (s.outline) {
    md += `## 详细纲要\n${s.outline}\n\n`;
  }

  if (s.action_items) {
    md += `## 行动项\n${s.action_items}\n\n`;
  }

  if (s.keywords) {
    md += `## 关键词\n${s.keywords}\n\n`;
  }

  md += `---\n*由 MeetingBot 自动生成*\n`;
  return md;
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch { return { processedIds: [] }; }
}

function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// CLI
const args = process.argv.slice(2);

if (args.includes('--list')) {
  const transcripts = await listTranscripts();
  for (const t of transcripts) {
    const date = new Date(t.date).toISOString().slice(0, 10);
    console.log(`${t.id} | ${date} | ${Math.round(t.duration)}min | ${t.title}`);
  }
} else if (args.includes('--id')) {
  const id = args[args.indexOf('--id') + 1];
  const t = await getTranscript(id);
  if (!t) { console.error('Transcript not found'); process.exit(1); }
  console.log(formatMinutes(t));
} else {
  // Check for new transcripts
  const state = loadState();
  const transcripts = await listTranscripts();
  const newOnes = transcripts.filter(t => !state.processedIds.includes(t.id));
  
  if (newOnes.length === 0) {
    console.log(JSON.stringify({ new: 0 }));
  } else {
    const results = [];
    for (const brief of newOnes) {
      const t = await getTranscript(brief.id);
      results.push({ id: t.id, title: t.title, minutes: formatMinutes(t) });
      state.processedIds.push(t.id);
    }
    saveState(state);
    console.log(JSON.stringify({ new: results.length, results }));
  }
}
