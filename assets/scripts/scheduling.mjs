#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const DEFAULT_STATE_FILE = path.join(ROOT, "memory", "scheduling-sessions.json");
const STATE_FILE = process.env.SCHEDULING_STATE_FILE || DEFAULT_STATE_FILE;

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return { sessions: {} };
  }
}

function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function generateId() {
  return Math.random().toString(36).slice(2, 8);
}

function getArg(args, name) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1];
}

function parseJsonArg(args, name) {
  const raw = getArg(args, name);
  if (!raw) {
    throw new Error(`--${name} is required`);
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`--${name} must be valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function calcIntersection(session) {
  const all = [session.organizer.tgId, ...session.attendees.map((a) => a.tgId)];
  if (!session.submitted?.length) return [];
  let inter = null;
  for (const uid of session.submitted) {
    const cur = new Set(session.selections[uid] || []);
    inter = inter === null ? cur : new Set([...inter].filter((x) => cur.has(x)));
  }
  const slots = inter ? [...inter].sort((a, b) => a - b) : [];
  return {
    slots,
    submitted: session.submitted.length,
    total: all.length,
    allSubmitted: session.submitted.length === all.length,
  };
}

const args = process.argv.slice(2);
const cmd = args[0];
const state = loadState();

if (cmd === "create") {
  const id = generateId();
  const topic = getArg(args, "topic") || "未命名会议";
  let organizer;
  let attendees;
  try {
    organizer = parseJsonArg(args, "organizer");
    attendees = parseJsonArg(args, "attendees");
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
  state.sessions[id] = {
    id,
    topic,
    organizer,
    attendees,
    selections: {},
    submitted: [],
    createdAt: new Date().toISOString(),
  };
  saveState(state);
  console.log(JSON.stringify({ id, session: state.sessions[id] }));
  process.exit(0);
}

if (cmd === "toggle") {
  const sessionId = getArg(args, "session");
  const tgId = getArg(args, "user");
  const slot = Number(getArg(args, "slot"));
  const session = state.sessions[sessionId];
  if (!session) process.exit(1);
  const selections = new Set(session.selections[tgId] || []);
  if (selections.has(slot)) selections.delete(slot);
  else selections.add(slot);
  session.selections[tgId] = [...selections];
  saveState(state);
  console.log(JSON.stringify({ sessionId, user: tgId, selected: session.selections[tgId] }));
  process.exit(0);
}

if (cmd === "submit") {
  const sessionId = getArg(args, "session");
  const tgId = getArg(args, "user");
  const session = state.sessions[sessionId];
  if (!session) process.exit(1);
  if (!session.submitted.includes(tgId)) session.submitted.push(tgId);
  saveState(state);
  console.log(JSON.stringify({ sessionId, user: tgId, intersection: calcIntersection(session) }));
  process.exit(0);
}

if (cmd === "status") {
  const sessionId = getArg(args, "session");
  const session = state.sessions[sessionId];
  if (!session) process.exit(1);
  console.log(JSON.stringify({ session, intersection: calcIntersection(session) }));
  process.exit(0);
}

if (cmd === "list") {
  console.log(JSON.stringify(Object.values(state.sessions)));
  process.exit(0);
}

if (cmd === "cleanup") {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  for (const [id, session] of Object.entries(state.sessions)) {
    if (new Date(session.createdAt).getTime() < cutoff) {
      delete state.sessions[id];
    }
  }
  saveState(state);
  console.log(JSON.stringify({ ok: true }));
  process.exit(0);
}

process.exit(1);
