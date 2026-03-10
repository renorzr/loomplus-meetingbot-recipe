#!/usr/bin/env node
/**
 * Meeting Scheduling - Time Coordination State Manager
 * 
 * Usage:
 *   node scheduling.mjs create --topic "主题" --organizer '{"tgId":"123","name":"Reno"}' --attendees '[{"tgId":"456","name":"A"}]' --days 3 --duration 60
 *   node scheduling.mjs toggle --session <id> --user <tgId> --slot <index>
 *   node scheduling.mjs submit --session <id> --user <tgId>
 *   node scheduling.mjs status --session <id>
 *   node scheduling.mjs buttons --session <id> --user <tgId>
 *   node scheduling.mjs intersect --session <id>
 *   node scheduling.mjs list
 *   node scheduling.mjs cleanup  # remove sessions older than 7 days
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, '..', 'memory', 'scheduling-sessions.json');

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch { return { sessions: {} }; }
}

function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function generateId() {
  return Math.random().toString(36).substring(2, 8);
}

function generateSlots(days, startHour = 9, endHour = 18, intervalMin = 60, utcOffset = 8) {
  const slots = [];
  const now = new Date();
  // Start from tomorrow in target timezone
  const nowLocal = new Date(now.getTime() + utcOffset * 3600000);
  const start = new Date(nowLocal);
  start.setUTCDate(start.getUTCDate() + 1);
  start.setUTCHours(0, 0, 0, 0);

  for (let d = 0; d < days; d++) {
    const day = new Date(start);
    day.setUTCDate(day.getUTCDate() + d);
    for (let h = startHour; h < endHour; h++) {
      for (let m = 0; m < 60; m += intervalMin) {
        if (h + (intervalMin / 60) > endHour) continue;
        const slot = new Date(day);
        slot.setUTCHours(h - utcOffset, m, 0, 0);
        slots.push(slot.toISOString());
      }
    }
  }
  return slots;
}

function formatSlot(isoStr, duration = 60, utcOffset = 8) {
  const d = new Date(new Date(isoStr).getTime() + utcOffset * 3600000);
  const end = new Date(d.getTime() + duration * 60000);
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const weekday = weekdays[d.getUTCDay()];
  const month = d.getUTCMonth() + 1;
  const date = d.getUTCDate();
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ehh = String(end.getUTCHours()).padStart(2, '0');
  const emm = String(end.getUTCMinutes()).padStart(2, '0');
  return `${weekday} ${month}/${date} ${hh}:${mm}-${ehh}:${emm}`;
}

function generateButtons(session, tgId) {
  const isOrganizer = session.organizer.tgId === tgId;
  const availableSlots = isOrganizer
    ? session.slots.map((_, i) => i)
    : (session.selections[session.organizer.tgId] || []);

  const userSelections = new Set(session.selections[tgId] || []);
  const rows = [];
  let currentRow = [];

  for (const idx of availableSlots) {
    const label = formatSlot(session.slots[idx], session.duration);
    const selected = userSelections.has(idx);
    const text = selected ? `✅ ${label}` : label;
    currentRow.push({
      text,
      callback_data: `st:${session.id}:${idx}`
    });
    if (currentRow.length === 2) {
      rows.push([...currentRow]);
      currentRow = [];
    }
  }
  if (currentRow.length > 0) rows.push(currentRow);

  // Submit button
  rows.push([{
    text: `✅ 提交（已选 ${userSelections.size} 个时段）`,
    callback_data: `ss:${session.id}`
  }]);

  return rows;
}

function calculateIntersection(session) {
  const allUsers = [session.organizer.tgId, ...session.attendees.map(a => a.tgId)];
  const submittedUsers = session.submitted || [];

  // Only consider submitted users
  if (submittedUsers.length === 0) return { slots: [], allSubmitted: false, submittedCount: 0, totalCount: allUsers.length };

  let intersection = null;
  for (const uid of submittedUsers) {
    const sel = new Set(session.selections[uid] || []);
    if (intersection === null) {
      intersection = sel;
    } else {
      intersection = new Set([...intersection].filter(x => sel.has(x)));
    }
  }

  const slots = intersection ? [...intersection].sort((a, b) => a - b) : [];
  return {
    slots,
    allSubmitted: submittedUsers.length === allUsers.length,
    submittedCount: submittedUsers.length,
    totalCount: allUsers.length,
    pendingUsers: allUsers.filter(u => !submittedUsers.includes(u))
  };
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1];
}

const state = loadState();

switch (cmd) {
  case 'create': {
    const id = generateId();
    const topic = getArg('topic') || '未命名会议';
    const organizer = JSON.parse(getArg('organizer'));
    const attendees = JSON.parse(getArg('attendees'));
    const days = parseInt(getArg('days') || '3');
    const duration = parseInt(getArg('duration') || '60');
    const tz = getArg('tz') || 'Asia/Shanghai';

    // Generate slots in the target timezone
    const slots = generateSlots(days, 9, 18, duration);

    const session = {
      id,
      topic,
      organizer,
      attendees,
      slots,
      duration,
      timezone: tz,
      selections: {},
      submitted: [],
      status: 'waiting_organizer',
      createdAt: new Date().toISOString(),
      messageIds: {}
    };

    state.sessions[id] = session;
    saveState(state);

    const buttons = generateButtons(session, organizer.tgId);
    console.log(JSON.stringify({ id, session, buttons }));
    break;
  }

  case 'toggle': {
    const sessionId = getArg('session');
    const tgId = getArg('user');
    const slotIdx = parseInt(getArg('slot'));
    const session = state.sessions[sessionId];
    if (!session) { console.error('Session not found'); process.exit(1); }

    if (!session.selections[tgId]) session.selections[tgId] = [];
    const sel = session.selections[tgId];
    const idx = sel.indexOf(slotIdx);
    if (idx === -1) {
      sel.push(slotIdx);
    } else {
      sel.splice(idx, 1);
    }

    saveState(state);
    const buttons = generateButtons(session, tgId);
    console.log(JSON.stringify({ toggled: slotIdx, selected: sel, buttons }));
    break;
  }

  case 'submit': {
    const sessionId = getArg('session');
    const tgId = getArg('user');
    const session = state.sessions[sessionId];
    if (!session) { console.error('Session not found'); process.exit(1); }

    if (!session.submitted.includes(tgId)) {
      session.submitted.push(tgId);
    }

    const isOrganizer = session.organizer.tgId === tgId;
    if (isOrganizer && session.status === 'waiting_organizer') {
      session.status = 'waiting_attendees';
    }

    const result = calculateIntersection(session);
    if (result.allSubmitted) {
      session.status = 'done';
    }

    saveState(state);
    console.log(JSON.stringify({
      submitted: tgId,
      isOrganizer,
      sessionStatus: session.status,
      intersection: result
    }));
    break;
  }

  case 'status': {
    const sessionId = getArg('session');
    const session = state.sessions[sessionId];
    if (!session) { console.error('Session not found'); process.exit(1); }
    const result = calculateIntersection(session);
    console.log(JSON.stringify({ session, intersection: result }));
    break;
  }

  case 'buttons': {
    const sessionId = getArg('session');
    const tgId = getArg('user');
    const session = state.sessions[sessionId];
    if (!session) { console.error('Session not found'); process.exit(1); }
    const buttons = generateButtons(session, tgId);
    console.log(JSON.stringify({ buttons }));
    break;
  }

  case 'intersect': {
    const sessionId = getArg('session');
    const session = state.sessions[sessionId];
    if (!session) { console.error('Session not found'); process.exit(1); }
    const result = calculateIntersection(session);
    const slotLabels = result.slots.map(i => formatSlot(session.slots[i], session.duration));
    console.log(JSON.stringify({ ...result, slotLabels }));
    break;
  }

  case 'list': {
    const sessions = Object.values(state.sessions).map(s => ({
      id: s.id,
      topic: s.topic,
      status: s.status,
      organizer: s.organizer.name,
      attendeeCount: s.attendees.length,
      createdAt: s.createdAt
    }));
    console.log(JSON.stringify(sessions));
    break;
  }

  case 'cleanup': {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    let removed = 0;
    for (const [id, s] of Object.entries(state.sessions)) {
      if (new Date(s.createdAt).getTime() < cutoff) {
        delete state.sessions[id];
        removed++;
      }
    }
    saveState(state);
    console.log(JSON.stringify({ removed }));
    break;
  }

  default:
    console.error('Unknown command:', cmd);
    process.exit(1);
}
