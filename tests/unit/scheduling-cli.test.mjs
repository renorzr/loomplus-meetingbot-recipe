import { test } from "node:test";
import { expect } from "chai";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const SCRIPT = path.resolve(process.cwd(), "src/meetingbot-assets/scripts/scheduling.mjs");

async function runScheduling(args, env = {}) {
  try {
    const { stdout, stderr } = await execFileAsync("node", [SCRIPT, ...args], {
      env: { ...process.env, ...env },
    });
    return {
      code: 0,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
    };
  } catch (error) {
    return {
      code: error.code ?? 1,
      stdout: String(error.stdout || "").trim(),
      stderr: String(error.stderr || "").trim(),
    };
  }
}

test("scheduling CLI create/toggle/submit/status flow", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "scheduling-test-"));
  const stateFile = path.join(tmpDir, "state.json");
  const env = { SCHEDULING_STATE_FILE: stateFile };

  const createResp = await runScheduling(
    [
      "create",
      "--topic",
      "test-topic",
      "--organizer",
      '{"tgId":"u1","name":"owner"}',
      "--attendees",
      '[{"tgId":"u2","name":"peer"}]',
    ],
    env,
  );
  expect(createResp.code).to.equal(0);
  const created = JSON.parse(createResp.stdout);
  const sessionId = created.id;
  expect(sessionId).to.be.ok;

  const t1 = await runScheduling(["toggle", "--session", sessionId, "--user", "u1", "--slot", "10"], env);
  const t2 = await runScheduling(["toggle", "--session", sessionId, "--user", "u2", "--slot", "10"], env);
  expect(t1.code).to.equal(0);
  expect(t2.code).to.equal(0);

  const s1 = await runScheduling(["submit", "--session", sessionId, "--user", "u1"], env);
  const s2 = await runScheduling(["submit", "--session", sessionId, "--user", "u2"], env);
  expect(s1.code).to.equal(0);
  expect(s2.code).to.equal(0);

  const status = await runScheduling(["status", "--session", sessionId], env);
  expect(status.code).to.equal(0);
  const parsed = JSON.parse(status.stdout);
  expect(parsed.intersection.slots).to.deep.equal([10]);
  expect(parsed.intersection.submitted).to.equal(2);
  expect(parsed.intersection.total).to.equal(2);
  expect(parsed.intersection.allSubmitted).to.equal(true);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("scheduling CLI reports invalid JSON args", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "scheduling-test-"));
  const stateFile = path.join(tmpDir, "state.json");

  const bad = await runScheduling(
    [
      "create",
      "--topic",
      "test-topic",
      "--organizer",
      "not-json",
      "--attendees",
      "[]",
    ],
    { SCHEDULING_STATE_FILE: stateFile },
  );

  expect(bad.code).to.equal(1);
  expect(bad.stderr).to.match(/--organizer must be valid JSON/);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
