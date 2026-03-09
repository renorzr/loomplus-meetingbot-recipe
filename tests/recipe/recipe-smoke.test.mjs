import dotenv from "dotenv";
dotenv.config();

import { test } from "node:test";
import { expect } from "chai";
import fs from "node:fs";
import path from "node:path";

import { createTelegramApiMockAdminClient } from "telegram-api-mock-server";
import {
  hasBinary,
  runOrFail,
  sanitizeOpenClawConfig,
  sleep,
  startGatewayProcess,
  stopGatewayProcess,
  waitForOutboundMessage,
} from "./helpers.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const RECIPE_FILE = path.join(ROOT, "src", "recipe.yaml");
const TELEGRAM_BOT_TOKEN = process.env.CLAWCHEF_VAR_TELEGRAM_BOT_TOKEN_LOOMPLUS;
const TELEGRAM_CA_CERT = process.env.TELEGRAM_MOCK_CA_CERT || "/etc/telegram-mock/test-ca.crt";

async function enableMockOrFail(adminClient) {
  try {
    await adminClient.enableMock();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to enable telegram-api-mock-server mock mode. Ensure mock server is running and admin endpoint is reachable. ${detail}`,
    );
  }
}

test("recipe smoke responds via telegram mock", { timeout: 180000 }, async (t) => {
  if (!hasBinary("clawchef")) {
    t.skip("clawchef not found in PATH");
    return;
  }
  if (!hasBinary("openclaw")) {
    t.skip("openclaw not found in PATH");
    return;
  }
  if (!fs.existsSync(TELEGRAM_CA_CERT)) {
    throw new Error(`Missing Telegram mock CA cert: ${TELEGRAM_CA_CERT}`);
  }

  process.env.NODE_EXTRA_CA_CERTS = TELEGRAM_CA_CERT;
  delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;

  sanitizeOpenClawConfig();
  const adminClient = createTelegramApiMockAdminClient();

  let gatewayProcess = null;
  await enableMockOrFail(adminClient);
  t.after(async () => {
    await stopGatewayProcess(gatewayProcess);
    await adminClient.disableMock();
  });

  runOrFail({ bin: "clawchef", args: ["validate", RECIPE_FILE], cwd: ROOT, env: process.env });
  runOrFail({ bin: "clawchef", args: [
    "cook",
    RECIPE_FILE,
    "-s",
  ], cwd: ROOT, env: process.env });
  runOrFail({
    bin: "openclaw",
    args: ["config", "set", "agents.defaults.typingMode", "never"],
    cwd: ROOT,
    env: process.env,
  });

  gatewayProcess = startGatewayProcess({ cwd: ROOT, env: process.env });
  await sleep(5000);

  const chatId = 123456;
  const userId = 1001;
  await adminClient.reset({ token: TELEGRAM_BOT_TOKEN, updates: true, outbound: true });
  await adminClient.injectUpdate({
    token: TELEGRAM_BOT_TOKEN,
    update: {
      message: {
        message_id: 1,
        date: Math.floor(Date.now() / 1000),
        chat: { id: chatId, type: "private" },
        from: { id: userId, is_bot: false, first_name: "smoke" },
        text: "hello",
      },
    },
  });

  const pairingReply = await waitForOutboundMessage(adminClient, {
    token: TELEGRAM_BOT_TOKEN,
    predicate: ({ payload }) => {
      return (
        Number(payload.chat_id) === chatId &&
        typeof payload.text === "string" &&
        payload.text.includes("Your Telegram user id:") &&
        payload.text.includes("Pairing code:")
      );
    },
  });

  const pairingText = String(pairingReply.payload?.text || "");
  const pairingCodeMatch = pairingText.match(/Pairing code:\s*([A-Z0-9]+)/i);
  expect(pairingCodeMatch?.[1]).to.be.a("string").and.not.empty;
  const pairingCode = pairingCodeMatch[1].toUpperCase();

  runOrFail({
    bin: "openclaw",
    args: ["pairing", "approve", "telegram", pairingCode],
    cwd: ROOT,
    env: process.env,
  });


  await adminClient.injectUpdate({
    token: TELEGRAM_BOT_TOKEN,
    update: {
      message: {
        message_id: 2,
        date: Math.floor(Date.now() / 1000),
        chat: { id: chatId, type: "private" },
        from: { id: userId, is_bot: false, first_name: "smoke" },
        text: "what is your name?",
      },
    },
  });

  const nameReply = await waitForOutboundMessage(adminClient, {
    token: TELEGRAM_BOT_TOKEN,
    predicate: ({ payload }) => {
      return (
        Number(payload.chat_id) === chatId &&
        typeof payload.text === "string" &&
        payload.text.toLowerCase().includes("meetingbot")
      );
    },
  });
  expect(nameReply).to.exist;
});
