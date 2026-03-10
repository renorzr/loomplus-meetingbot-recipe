#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(import.meta.dirname, "..");
const DEFAULT_STATE_FILE = path.join(ROOT, "memory", "scheduling-sessions.json");
const STATE_FILE = process.env.SCHEDULING_STATE_FILE || DEFAULT_STATE_FILE;
const TOKEN = process.env.SCHEDULER_BOT_TOKEN;
const PORT = Number(process.env.PORT || 3456);
const TG_API_BASE_URL = process.env.TG_API_BASE_URL || "https://api.telegram.org";
const DISABLE_POLLING = /^(1|true|yes)$/i.test(process.env.DISABLE_POLLING || "");

export function loadState(stateFile = STATE_FILE) {
  try {
    return JSON.parse(fs.readFileSync(stateFile, "utf8"));
  } catch {
    return { sessions: {} };
  }
}

export function saveState(state, stateFile = STATE_FILE) {
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

export function createStateStore(stateFile = STATE_FILE) {
  return {
    loadState: () => loadState(stateFile),
    saveState: (state) => saveState(state, stateFile),
  };
}

export function generateId() {
  return Math.random().toString(36).slice(2, 8);
}

export function dateButtons(sessionId, days = 7) {
  const rows = [];
  let row = [];
  const now = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() + i);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    const value = `${yyyy}-${mm}-${dd}`;
    row.push({ text: value, callback_data: `sd:${sessionId}:${value}` });
    if (row.length === 2) {
      rows.push(row);
      row = [];
    }
  }
  if (row.length) rows.push(row);
  return rows;
}

export function createTelegramClient({ token = TOKEN, baseUrl = TG_API_BASE_URL, fetchImpl = fetch } = {}) {
  if (!token) {
    throw new Error("SCHEDULER_BOT_TOKEN is required");
  }
  async function tgApi(method, body) {
    const res = await fetchImpl(`${baseUrl}/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.json();
  }
  return { tgApi };
}

export async function handleUpdate(update, { loadState: load, saveState: save, tgApi }) {
  const cq = update.callback_query;
  if (!cq?.data?.startsWith("sd:")) return;
  const [, sid, date] = cq.data.split(":");
  const state = load();
  const session = state.sessions[sid];
  if (!session) return;
  session.selectedDate = date;
  save(state);
  await tgApi("answerCallbackQuery", { callback_query_id: cq.id, text: `已选 ${date}` });
  await tgApi("editMessageText", {
    chat_id: cq.message.chat.id,
    message_id: cq.message.message_id,
    text: `已选择日期: ${date}\n主题: ${session.topic}`,
  });
}

export function startPolling({
  token = TOKEN,
  baseUrl = TG_API_BASE_URL,
  fetchImpl = fetch,
  onUpdate,
}) {
  if (!token) {
    throw new Error("SCHEDULER_BOT_TOKEN is required");
  }
  let offset = 0;
  let stopped = false;

  async function pollLoop() {
    if (stopped) return;
    try {
      const updates = encodeURIComponent(JSON.stringify(["callback_query"]));
      const r = await fetchImpl(
        `${baseUrl}/bot${token}/getUpdates?offset=${offset}&timeout=25&allowed_updates=${updates}`,
        { signal: AbortSignal.timeout(30000) },
      );
      const data = await r.json();
      for (const item of data.result || []) {
        offset = item.update_id + 1;
        await onUpdate(item);
      }
    } catch {
      // no-op
    }
    setImmediate(pollLoop);
  }

  setImmediate(pollLoop);
  return () => {
    stopped = true;
  };
}

export function createServer({ loadState: load, saveState: save, tgApi, generateIdFn = generateId }) {
  return http.createServer((req, res) => {
    const reply = (code, body) => {
      res.writeHead(code, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };

    if (req.method === "GET" && req.url === "/health") {
      reply(200, { ok: true });
      return;
    }

    if (req.method === "POST" && req.url === "/create") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", async () => {
        try {
          const payload = JSON.parse(body || "{}");
          const id = generateIdFn();
          const session = {
            id,
            topic: payload.topic || "待定会议",
            organizer: payload.organizer,
            attendees: payload.attendees || [],
            groupChatId: payload.chatId || null,
            selectedDate: null,
            createdAt: new Date().toISOString(),
          };
          const state = load();
          state.sessions[id] = session;
          save(state);

          const chatId = payload.chatId || Number(payload.organizer?.tgId);
          const sent = await tgApi("sendMessage", {
            chat_id: chatId,
            text: `会议协调\n主题: ${session.topic}\n请先选择日期`,
            reply_markup: { inline_keyboard: dateButtons(id, Number(payload.days || 7)) },
          });

          reply(200, { ok: true, sessionId: id, messageSent: Boolean(sent.ok) });
        } catch (err) {
          reply(500, { ok: false, error: err instanceof Error ? err.message : String(err) });
        }
      });
      return;
    }

    if (req.method === "GET" && req.url?.startsWith("/status/")) {
      const id = req.url.split("/")[2];
      const state = load();
      reply(200, { ok: true, session: state.sessions[id] || null });
      return;
    }

    reply(404, { ok: false, error: "not found" });
  });
}

function isMainModule() {
  if (!process.argv[1]) return false;
  return import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isMainModule()) {
  if (!TOKEN) {
    console.error("SCHEDULER_BOT_TOKEN is required");
    process.exit(1);
  }
  const stateStore = createStateStore();
  const { tgApi } = createTelegramClient();
  const server = createServer({
    loadState: stateStore.loadState,
    saveState: stateStore.saveState,
    tgApi,
  });

  server.listen(PORT, "127.0.0.1", () => {
    console.log(`scheduling server listening on 127.0.0.1:${PORT}`);
    if (!DISABLE_POLLING) {
      startPolling({
        onUpdate: (update) =>
          handleUpdate(update, {
            loadState: stateStore.loadState,
            saveState: stateStore.saveState,
            tgApi,
          }),
      });
    }
  });
}
