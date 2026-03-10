#!/usr/bin/env node
/**
 * Scheduling Callback Server v2 — Group Chat Mode
 * 
 * - Polls @LoomPlusScheduler_bot for callback_query (instant response)
 * - Sends time selection buttons in GROUP CHAT
 * - Phase 1: Organizer selects slots → Phase 2: Attendees select from organizer's slots
 * - All interaction happens on messages in the group
 * 
 * Env: SCHEDULER_BOT_TOKEN, PORT (default 3456)
 */

import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, '..', 'memory', 'scheduling-sessions.json');
const SCHEDULER_TOKEN = process.env.SCHEDULER_BOT_TOKEN;
const PORT = parseInt(process.env.PORT || '3456');

if (!SCHEDULER_TOKEN) { console.error('SCHEDULER_BOT_TOKEN required'); process.exit(1); }

// --- Telegram API ---
async function tgApi(method, body) {
  const r = await fetch(`https://api.telegram.org/bot${SCHEDULER_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.json();
}

// --- State ---
function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch { return { sessions: {} }; }
}
function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function formatSlot(isoStr, duration = 60, utcOffset = 8) {
  const d = new Date(new Date(isoStr).getTime() + utcOffset * 3600000);
  const end = new Date(d.getTime() + duration * 60000);
  const wd = ['周日','周一','周二','周三','周四','周五','周六'][d.getUTCDay()];
  const M = d.getUTCMonth() + 1, D = d.getUTCDate();
  const hh = String(d.getUTCHours()).padStart(2,'0'), mm = String(d.getUTCMinutes()).padStart(2,'0');
  const ehh = String(end.getUTCHours()).padStart(2,'0'), emm = String(end.getUTCMinutes()).padStart(2,'0');
  return `${wd} ${M}/${D} ${hh}:${mm}-${ehh}:${emm}`;
}

function generateButtons(session, phase, userId) {
  // phase 1: organizer picks from all slots
  // phase 2: attendees pick from organizer's selected slots
  const available = phase === 1
    ? session.slots.map((_, i) => i)
    : [...(session.selections[session.organizer.tgId] || [])].sort((a,b) => a-b);
  
  const sel = new Set(session.selections[userId] || []);
  const rows = [];
  let row = [];
  for (const idx of available) {
    const label = formatSlot(session.slots[idx], session.duration);
    row.push({ text: sel.has(idx) ? `✅ ${label}` : label, callback_data: `st:${session.id}:${idx}` });
    if (row.length === 2) { rows.push(row); row = []; }
  }
  if (row.length) rows.push(row);
  rows.push([{ text: `📨 提交（已选 ${sel.size} 个）`, callback_data: `ss:${session.id}` }]);
  return rows;
}

function phase1Text(session) {
  const names = [session.organizer.name, ...session.attendees.map(a => a.name)].join('、');
  return `📅 会议时间协调\n主题：${session.topic}\n参会：${names}\n\n👤 ${session.organizer.name}，请先选择你的空闲时段：`;
}

function phase2Text(session) {
  const pending = session.attendees
    .filter(a => !(session.submitted || []).includes(a.tgId))
    .map(a => a.name);
  const done = [session.organizer, ...session.attendees]
    .filter(a => (session.submitted || []).includes(a.tgId))
    .map(a => `✅ ${a.name}`);
  return `📅 会议「${session.topic}」— 选择空闲时段\n\n${done.join('  ')}\n⏳ 等待：${pending.join('、')}\n\n请点击你可以参会的时段：`;
}

function doneText(session, intersection) {
  if (intersection.slots.length > 0) {
    return `📅 会议「${session.topic}」— 时间确定！\n\n✅ 共同可用时段：\n${intersection.labels.map(l => `• ${l}`).join('\n')}\n\n⏳ 正在创建会议...`;
  }
  return `📅 会议「${session.topic}」— 无共同时段\n\n❌ 所有人没有共同空闲时段，请重新协调。`;
}

function calcIntersection(session) {
  let inter = null;
  for (const uid of session.submitted || []) {
    const s = new Set(session.selections[uid] || []);
    inter = inter === null ? s : new Set([...inter].filter(x => s.has(x)));
  }
  const slots = inter ? [...inter].sort((a,b) => a-b) : [];
  return { slots, labels: slots.map(i => formatSlot(session.slots[i], session.duration)), times: slots.map(i => session.slots[i]) };
}

// --- Handle callback_query ---
async function handleCallbackQuery(cq) {
  const data = cq.data || '';
  const chatId = cq.message?.chat?.id;
  const messageId = cq.message?.message_id;
  const userId = String(cq.from.id);
  const userName = cq.from.first_name || 'Unknown';
  if (!data || !chatId || !messageId) return;

  const state = loadState();

  if (data.startsWith('st:')) {
    const [, sid, si] = data.split(':');
    const session = state.sessions[sid];
    if (!session) { await tgApi('answerCallbackQuery', { callback_query_id: cq.id, text: '❌ 会话已过期' }); return; }

    // Check permissions
    const allUserIds = [session.organizer.tgId, ...session.attendees.map(a => a.tgId)];
    if (!allUserIds.includes(userId)) {
      await tgApi('answerCallbackQuery', { callback_query_id: cq.id, text: '你不是本次会议的参会人' });
      return;
    }

    // Phase 1: only organizer can select
    if (session.status === 'waiting_organizer' && userId !== session.organizer.tgId) {
      await tgApi('answerCallbackQuery', { callback_query_id: cq.id, text: '请等待召集人先选择' });
      return;
    }

    // Phase 2: organizer already submitted
    if ((session.submitted || []).includes(userId)) {
      await tgApi('answerCallbackQuery', { callback_query_id: cq.id, text: '你已提交，无法修改' });
      return;
    }

    // Toggle
    if (!session.selections[userId]) session.selections[userId] = [];
    const sel = session.selections[userId];
    const idx = parseInt(si);
    const i = sel.indexOf(idx);
    if (i === -1) sel.push(idx); else sel.splice(i, 1);
    saveState(state);

    // Determine phase and update message
    const phase = session.status === 'waiting_organizer' ? 1 : 2;
    const text = phase === 1 ? phase1Text(session) : phase2Text(session);
    const buttons = generateButtons(session, phase, userId);

    await tgApi('editMessageText', {
      chat_id: chatId, message_id: messageId,
      text, reply_markup: { inline_keyboard: buttons },
    });
    await tgApi('answerCallbackQuery', { callback_query_id: cq.id, text: i === -1 ? '✅ 已选' : '❎ 已取消' });
    return;
  }

  if (data.startsWith('ss:')) {
    const sid = data.split(':')[1];
    const session = state.sessions[sid];
    if (!session) { await tgApi('answerCallbackQuery', { callback_query_id: cq.id, text: '❌ 会话已过期' }); return; }

    const allUserIds = [session.organizer.tgId, ...session.attendees.map(a => a.tgId)];
    if (!allUserIds.includes(userId)) {
      await tgApi('answerCallbackQuery', { callback_query_id: cq.id, text: '你不是本次会议的参会人' }); return;
    }
    if ((session.submitted || []).includes(userId)) {
      await tgApi('answerCallbackQuery', { callback_query_id: cq.id, text: '已提交过' }); return;
    }
    const userSel = session.selections[userId] || [];
    if (userSel.length === 0) {
      await tgApi('answerCallbackQuery', { callback_query_id: cq.id, text: '请至少选一个时段' }); return;
    }

    if (!session.submitted) session.submitted = [];
    session.submitted.push(userId);
    const isOrg = session.organizer.tgId === userId;
    if (isOrg && session.status === 'waiting_organizer') session.status = 'waiting_attendees';

    const allDone = allUserIds.every(u => session.submitted.includes(u));
    if (allDone) session.status = 'done';
    saveState(state);

    await tgApi('answerCallbackQuery', { callback_query_id: cq.id, text: '✅ 已提交' });

    if (allDone) {
      const inter = calcIntersection(session);
      await tgApi('editMessageText', {
        chat_id: chatId, message_id: messageId,
        text: doneText(session, inter),
      });
      console.log(`[DONE] Session ${sid}: ${inter.slots.length} common slots`);
      // Directly create meeting
      if (inter.slots.length > 0) {
        try { await createMeetingFromSchedule(session, inter, chatId); }
        catch (e) { console.error('[CREATE_MEETING_ERROR]', e); }
      }
    } else if (isOrg) {
      // Organizer submitted — update message for attendees (phase 2)
      // Send a NEW message for attendees to click
      const buttons = generateButtons(session, 2, session.attendees[0].tgId);
      const text = phase2Text(session);
      const sent = await tgApi('sendMessage', {
        chat_id: chatId,
        text, reply_markup: { inline_keyboard: buttons },
      });
      if (sent.ok) { session.messageIds.phase2 = sent.result.message_id; saveState(state); }

      // Update organizer's message
      const orgLabels = userSel.sort((a,b)=>a-b).map(i => formatSlot(session.slots[i], session.duration));
      await tgApi('editMessageText', {
        chat_id: chatId, message_id: messageId,
        text: `📅 会议「${session.topic}」\n✅ ${session.organizer.name} 已选择 ${userSel.length} 个时段：\n${orgLabels.map(l=>`• ${l}`).join('\n')}`,
      });
    } else {
      // Attendee submitted — update phase 2 message
      const remaining = session.attendees.filter(a => !session.submitted.includes(a.tgId));
      if (remaining.length > 0) {
        // Refresh the message with updated status
        const buttons = generateButtons(session, 2, remaining[0].tgId);
        await tgApi('editMessageText', {
          chat_id: chatId, message_id: messageId,
          text: phase2Text(session),
          reply_markup: { inline_keyboard: buttons },
        });
      }
    }
  }
}

// --- Auto-create meeting ---
import { execSync } from 'child_process';

const MCPORTER_ENV = { ...process.env, MCPORTER_CONFIG: path.join(__dirname, '..', 'config', 'mcporter.json') };
const LOOMPLUS_BOT_TOKEN = process.env.LOOMPLUS_BOT_TOKEN; // MeetingBot token for group notifications

function mcporter(tool, args) {
  const cmd = `mcporter call loomplus.${tool} --args '${JSON.stringify(args).replace(/'/g, "'\\''")}'`;
  const out = execSync(cmd, { env: MCPORTER_ENV, timeout: 30000 }).toString();
  return JSON.parse(out);
}

async function createMeetingFromSchedule(session, inter, chatId) {
  const bestSlot = inter.times[0]; // earliest common slot
  const start = new Date(bestSlot);
  const end = new Date(start.getTime() + session.duration * 60000);

  // Format times in Asia/Shanghai
  const fmt = d => {
    const local = new Date(d.getTime() + 8 * 3600000);
    return local.toISOString().replace('Z', '').slice(0, 19);
  };

  // Get attendee emails
  const tgIds = [session.organizer.tgId, ...session.attendees.map(a => a.tgId)];
  let emails;
  try {
    emails = mcporter('get_user_emails_by_ids', { platform: 'tg', ids: tgIds });
  } catch (e) {
    console.error('[EMAIL_LOOKUP_ERROR]', e.message);
    emails = {};
  }

  const attendeeEmails = [...Object.values(emails), 'fred@fireflies.ai'];

  // Create meeting
  const meeting = mcporter('create_google_meeting', {
    summary: session.topic,
    startTime: fmt(start),
    endTime: fmt(end),
    attendeeEmails,
    timeZone: 'Asia/Shanghai',
  });

  console.log(`[MEETING_CREATED] ${meeting.meetingLink}`);

  // Store to knowledge base
  try {
    const names = [session.organizer.name, ...session.attendees.map(a => a.name)].join(', ');
    mcporter('upsert_document', {
      kbId: 'cmm67kvcx000l5xzgquhz4g5v',
      content: `来源：会议记录\n内容：\n# 会议 - ${session.topic}\n- 日期：${fmt(start)} (Asia/Shanghai)\n- 参会人：${names}\n- 会议链接：${meeting.meetingLink}\n- 状态：已创建，已同步到 LoomPlus`,
      source: '会议记录',
    });
  } catch (e) { console.error('[KB_ERROR]', e.message); }

  // Notify in group via scheduler bot (or MeetingBot if token available)
  const label = inter.labels[0];
  const names = [session.organizer.name, ...session.attendees.map(a => a.name)].join('、');
  const notifyBot = LOOMPLUS_BOT_TOKEN || SCHEDULER_TOKEN;
  await fetch(`https://api.telegram.org/bot${notifyBot}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: `📅 会议已创建\n主题：${session.topic}\n时间：${label}（北京时间）\n参会：${names}\n🔗 加入会议：${meeting.meetingLink}\n✅ 已同步到 LoomPlus`,
      parse_mode: 'HTML',
    }),
  });
}

// --- Long polling ---
let pollOffset = 0;
async function poll() {
  try {
    const r = await fetch(
      `https://api.telegram.org/bot${SCHEDULER_TOKEN}/getUpdates?offset=${pollOffset}&timeout=30&allowed_updates=["callback_query"]`,
      { signal: AbortSignal.timeout(35000) }
    );
    const data = await r.json();
    if (data.ok && data.result) {
      for (const u of data.result) {
        pollOffset = u.update_id + 1;
        if (u.callback_query) {
          try { await handleCallbackQuery(u.callback_query); }
          catch (e) { console.error('Callback error:', e); }
        }
      }
    }
  } catch (e) {
    if (e.name !== 'TimeoutError') console.error('Poll error:', e.message);
  }
  setImmediate(poll);
}

// --- HTTP API ---
function generateSlots(days, startHour = 9, endHour = 18, intervalMin = 60, utcOffset = 8) {
  const slots = [];
  const now = new Date();
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

function generateId() { return Math.random().toString(36).substring(2, 8); }

const apiServer = http.createServer(async (req, res) => {
  const respond = (code, data) => { res.writeHead(code, {'Content-Type':'application/json'}); res.end(JSON.stringify(data)); };

  if (req.url === '/health') return respond(200, { ok: true, uptime: process.uptime() });

  // POST /create — create scheduling session and send buttons
  // Body: { topic, organizer:{tgId,name}, attendees:[{tgId,name}], chatId, days?, duration? }
  // chatId: group chat ID (buttons sent there) OR omit for DM to organizer
  if (req.method === 'POST' && req.url === '/create') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        const p = JSON.parse(body);
        const id = generateId();
        const slots = generateSlots(p.days || 3, 9, 18, p.duration || 60);
        const session = {
          id, topic: p.topic || '待定',
          organizer: p.organizer, attendees: p.attendees,
          groupChatId: p.chatId || null,
          slots, duration: p.duration || 60, timezone: 'Asia/Shanghai',
          selections: {}, submitted: [],
          status: 'waiting_organizer',
          createdAt: new Date().toISOString(), messageIds: {},
        };

        const state = loadState();
        state.sessions[id] = session;
        saveState(state);

        // Send phase 1 buttons (organizer selects)
        const targetChat = p.chatId || parseInt(p.organizer.tgId);
        const buttons = generateButtons(session, 1, p.organizer.tgId);
        const text = phase1Text(session);
        const sent = await tgApi('sendMessage', {
          chat_id: targetChat,
          text, reply_markup: { inline_keyboard: buttons },
        });

        if (sent.ok) {
          session.messageIds.phase1 = sent.result.message_id;
          saveState(state);
        }

        respond(200, { ok: true, sessionId: id, messageSent: sent.ok, error: sent.description });
      } catch (e) { respond(500, { error: e.message }); }
    });
    return;
  }

  // GET /status/:id
  if (req.method === 'GET' && req.url?.startsWith('/status/')) {
    const sid = req.url.split('/')[2];
    const state = loadState();
    const session = state.sessions[sid];
    if (!session) return respond(404, { error: 'not found' });
    return respond(200, { session, intersection: calcIntersection(session) });
  }

  respond(404, { error: 'not found' });
});

apiServer.listen(PORT, '127.0.0.1', () => {
  console.log(`[${new Date().toISOString()}] Scheduling server on http://127.0.0.1:${PORT}`);
  console.log(`[${new Date().toISOString()}] Polling @LoomPlusScheduler_bot...`);
  poll();
});
