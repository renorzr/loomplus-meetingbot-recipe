import { test } from "node:test";
import { expect } from "chai";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";

import {
  createStateStore,
  createTelegramClient,
  createServer,
  handleUpdate,
} from "../../src/meetingbot-assets/scripts/scheduling-callback-server.mjs";

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(address.port);
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

test("callback server supports local Telegram API mock", async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "callback-test-"));
  const stateFile = path.join(tmpDir, "state.json");
  const stateStore = createStateStore(stateFile);

  const apiCalls = [];
  const fakeTelegramApi = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      apiCalls.push({
        method: req.method,
        url: req.url,
        body: body ? JSON.parse(body) : null,
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, result: [] }));
    });
  });
  const fakeApiPort = await listen(fakeTelegramApi);
  const fakeApiBase = `http://127.0.0.1:${fakeApiPort}`;
  const { tgApi } = createTelegramClient({ token: "test-token", baseUrl: fakeApiBase });

  const app = createServer({
    loadState: stateStore.loadState,
    saveState: stateStore.saveState,
    tgApi,
  });
  const appPort = await listen(app);
  const appBase = `http://127.0.0.1:${appPort}`;

  t.after(async () => {
    await close(app);
    await close(fakeTelegramApi);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const createRes = await fetch(`${appBase}/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      topic: "群组测试",
      organizer: { tgId: "1001", name: "owner" },
      attendees: [
        { tgId: "1002", name: "user2" },
        { tgId: "1003", name: "user3" },
      ],
      chatId: -100123,
      days: 3,
    }),
  });

  expect(createRes.status).to.equal(200);
  const created = await createRes.json();
  expect(created.ok).to.equal(true);
  expect(created.sessionId).to.be.ok;
  expect(apiCalls.some((call) => call.url?.endsWith("/sendMessage"))).to.equal(true);

  await handleUpdate(
    {
      update_id: 1,
      callback_query: {
        id: "cq-1",
        data: `sd:${created.sessionId}:2026-03-10`,
        from: { id: 1002 },
        message: {
          chat: { id: -100123 },
          message_id: 55,
        },
      },
    },
    {
      loadState: stateStore.loadState,
      saveState: stateStore.saveState,
      tgApi,
    },
  );

  expect(apiCalls.some((call) => call.url?.endsWith("/answerCallbackQuery"))).to.equal(true);
  expect(apiCalls.some((call) => call.url?.endsWith("/editMessageText"))).to.equal(true);

  const statusRes = await fetch(`${appBase}/status/${created.sessionId}`);
  expect(statusRes.status).to.equal(200);
  const statusPayload = await statusRes.json();
  expect(statusPayload.ok).to.equal(true);
  expect(statusPayload.session.selectedDate).to.equal("2026-03-10");
});
