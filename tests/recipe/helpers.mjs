import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

export function hasBinary(bin) {
  const result = spawnSync(bin, ["--version"], { encoding: "utf8" });
  return !result.error;
}

export function runOrFail({ bin, args, cwd, env }) {
  const result = spawnSync(bin, args, {
    cwd,
    encoding: "utf8",
    env,
  });
  process.stdout.write(result.stdout || "");
  process.stderr.write(result.stderr || "");
  if (result.status !== 0) {
    const details = String(result.stderr || result.stdout || "").trim();
    throw new Error(`${bin} ${args.join(" ")} failed with status ${result.status || 1}${details ? `: ${details}` : ""}`);
  }
}

export function sanitizeOpenClawConfig() {
  const configPath = path.join(os.homedir(), ".openclaw", "openclaw.json");
  if (!fs.existsSync(configPath)) {
    return;
  }
  const parsed = JSON.parse(fs.readFileSync(configPath, "utf8"));
  if (parsed.commands && typeof parsed.commands === "object") {
    delete parsed.commands.ownerDisplay;
  }
  if (parsed.plugins?.installs && typeof parsed.plugins.installs === "object") {
    for (const key of Object.keys(parsed.plugins.installs)) {
      const install = parsed.plugins.installs[key];
      if (!install || typeof install !== "object") {
        continue;
      }
      delete install.resolvedName;
      delete install.resolvedVersion;
      delete install.resolvedSpec;
      delete install.integrity;
      delete install.shasum;
      delete install.resolvedAt;
    }
  }
  fs.writeFileSync(configPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
}

export function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function startGatewayProcess({ cwd, env }) {
  const child = spawn("openclaw", ["gateway", "run", "--allow-unconfigured", "--force"], {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (chunk) => {
    process.stdout.write(String(chunk));
  });
  child.stderr?.on("data", (chunk) => {
    process.stderr.write(String(chunk));
  });
  return child;
}

export async function stopGatewayProcess(child) {
  if (!child || child.exitCode !== null) {
    return;
  }
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (child.exitCode === null) {
        child.kill("SIGKILL");
      }
      resolve();
    }, 5000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

export async function waitForOutboundMessage(adminClient, { token, timeoutMs = 60000, predicate }) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const outbound = await adminClient.listOutbound(token);
    console.log('outbound=', JSON.stringify(outbound));
    const events = outbound.events || [];
    const matched = events.find((event) => {
      const payload = event.payload || {};
      if (event.method !== "sendMessage") {
        return false;
      }
      return predicate({ event, payload });
    });
    if (matched) {
      return matched;
    }
    await sleep(1000);
  }
  throw new Error(`Timed out waiting for telegram outbound message after ${timeoutMs}ms.`);
}
