#!/usr/bin/env node
// Sends a "new update shipped" Web Push to every subscribed user, by POSTing to the backend's
// POST /api/broadcast/release endpoint (guarded by the BROADCAST_API_KEY shared secret).
//
// Invoked automatically by .githooks/post-commit when a commit message contains a
//   Notify-Users: <text>
// line (optionally a `Notify-Title: <text>` line too). Can also be run by hand:
//
//   node scripts/notify-release.mjs --body "Big new feature is live 🎉"
//   node scripts/notify-release.mjs --from-head        # read the trailer from the last commit
//
// Config is read from scripts/notify-release.env (gitignored) or the environment:
//   BROADCAST_URL       e.g. https://iames-students-club.onrender.com/api/broadcast/release
//   BROADCAST_API_KEY   must match the backend's BROADCAST_API_KEY
//
// Never exits non-zero in a way that would break a commit -- the hook ignores the exit code, but
// this still prints a clear reason when it can't send.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));

function loadEnvFile() {
  try {
    const raw = readFileSync(join(HERE, 'notify-release.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const [, k, v] = m;
      if (process.env[k] === undefined) {
        process.env[k] = v.replace(/^["']|["']$/g, '');
      }
    }
  } catch {
    /* no file -> rely on the environment */
  }
}

function parseArgs(argv) {
  const out = { fromHead: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--from-head') out.fromHead = true;
    else if (a === '--body') out.body = argv[++i];
    else if (a === '--title') out.title = argv[++i];
    else if (a === '--url') out.url = argv[++i];
  }
  return out;
}

// Pull `Notify-Users:` / `Notify-Title:` out of the most recent commit message.
function trailerFromHead() {
  let msg = '';
  try {
    msg = execSync('git log -1 --pretty=%B', { cwd: HERE, encoding: 'utf8' });
  } catch {
    return {};
  }
  const grab = (label) => {
    const line = msg.split('\n').find((l) => new RegExp(`^\\s*${label}\\s*:`, 'i').test(l));
    return line ? line.slice(line.indexOf(':') + 1).trim() : undefined;
  };
  return { body: grab('Notify-Users'), title: grab('Notify-Title') };
}

async function main() {
  loadEnvFile();
  const args = parseArgs(process.argv.slice(2));

  let { body, title, url } = args;
  if (args.fromHead || (!body && !title)) {
    const t = trailerFromHead();
    body ??= t.body;
    title ??= t.title;
  }

  if (!body) {
    console.log('[notify-release] no "Notify-Users:" text -- nothing to send.');
    return;
  }

  const endpoint = process.env.BROADCAST_URL;
  const key = process.env.BROADCAST_API_KEY;
  if (!endpoint || !key) {
    console.warn('[notify-release] BROADCAST_URL / BROADCAST_API_KEY not set (see scripts/notify-release.env.example) -- skipped.');
    return;
  }

  const payload = { body };
  if (title) payload.title = title;
  if (url) payload.url = url;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-broadcast-key': key },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    if (!res.ok) {
      console.warn(`[notify-release] server responded ${res.status}: ${text}`);
      process.exitCode = 1;
      return;
    }
    console.log(`[notify-release] sent: ${text}`);
  } catch (err) {
    console.warn(`[notify-release] request failed: ${err?.message ?? err}`);
    process.exitCode = 1;
  }
}

main();
