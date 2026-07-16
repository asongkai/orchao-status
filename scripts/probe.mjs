// Probe the 3 monitored endpoints and write the result to data/status.json.
// Called every 5 minutes by .github/workflows/probe.yml.
//
// Per-day rollup rule:
//   * if any probe that day was "outage",   the day is outage.
//   * else if any was "degraded",           the day is degraded.
//   * else if at least one was operational, the day is operational.
//   * else                                  the day is null (no data).

import fs from "node:fs";
import path from "node:path";

const DATA_FILE = "data/status.json";
const TIMEOUT_MS = 10_000;
const DEGRADED_MS = 3_000;      // >3s counts as degraded, not outage
const KEEP_DAYS = 90;

const SERVICES = [
  { key: "web",   url: "https://orchao.com/",           expect: 200 },
  { key: "api",   url: "https://api.orchao.com/health", expect: 200 },
];

async function probeOne(svc) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = Date.now();
  try {
    const res = await fetch(svc.url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": "orchao-status-probe/1.0" },
    });
    const ms = Date.now() - started;
    if (res.status !== svc.expect) return { state: "outage",    ms, code: res.status };
    if (ms > DEGRADED_MS)          return { state: "degraded",  ms, code: res.status };
    return { state: "operational", ms, code: res.status };
  } catch (err) {
    return { state: "outage", ms: Date.now() - started, code: 0, err: String(err.message ?? err) };
  } finally {
    clearTimeout(timer);
  }
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function rollup(prev, next) {
  // outage > degraded > operational — worst wins for the day.
  const order = { outage: 3, degraded: 2, operational: 1 };
  if (!prev) return next;
  return order[next] > order[prev] ? next : prev;
}

async function main() {
  const raw = fs.existsSync(DATA_FILE) ? fs.readFileSync(DATA_FILE, "utf-8") : "{}";
  const doc = raw ? JSON.parse(raw) : {};
  doc.services ??= {};

  const today = todayISO();
  const results = await Promise.all(SERVICES.map(probeOne));

  const nowIso = new Date().toISOString();
  doc.updatedAt = nowIso;

  for (let i = 0; i < SERVICES.length; i++) {
    const svc = SERVICES[i];
    const result = results[i];
    const bucket = doc.services[svc.key] ?? { current: null, history: [] };

    bucket.current = result.state;
    bucket.lastCheck = { at: nowIso, ms: result.ms, code: result.code };

    // Update today's history entry (worst-of-day rollup).
    const last = bucket.history[bucket.history.length - 1];
    if (last?.date === today) {
      last.state = rollup(last.state, result.state);
    } else {
      bucket.history.push({ date: today, state: result.state });
    }

    // Keep only the last KEEP_DAYS distinct calendar days.
    if (bucket.history.length > KEEP_DAYS) {
      bucket.history = bucket.history.slice(-KEEP_DAYS);
    }

    doc.services[svc.key] = bucket;
  }

  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(doc, null, 2) + "\n");

  // Human-friendly console log for the GitHub Actions run pane.
  for (let i = 0; i < SERVICES.length; i++) {
    const s = results[i];
    console.log(`${SERVICES[i].key.padEnd(10)} ${s.state.padEnd(12)} ${s.ms}ms code=${s.code}${s.err ? " err=" + s.err : ""}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
