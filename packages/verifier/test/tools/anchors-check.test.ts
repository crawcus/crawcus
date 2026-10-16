/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `tools/anchors/anchors.mjs check` against a scratch copy of the repo
 * data. Requires `pnpm build` (the tool imports the verifier dist).
 */

import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repo = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const tool = join(repo, 'tools/anchors/anchors.mjs');

function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), 'anchors-check-'));
  for (const p of ['trust/trust-anchors.json', 'trust/pinned-root.json', 'docs/.well-known/crawcus-trust-anchors.json', 'README.md']) {
    mkdirSync(dirname(join(dir, p)), { recursive: true });
    cpSync(join(repo, p), join(dir, p));
  }
  return dir;
}

function check(dir: string): { code: number; out: string } {
  try {
    const out = execFileSync('node', [tool, 'check'], {
      env: { ...process.env, ANCHORS_REPO_ROOT: dir, ANCHORS_BASE_REF: 'no-such-ref' },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, out };
  } catch (e) {
    const err = e as { status: number; stderr: string; stdout: string };
    return { code: err.status, out: `${err.stdout}${err.stderr}` };
  }
}

describe('anchors check: trust/history', () => {
  it('passes on the committed data', () => {
    expect(check(scratch())).toMatchObject({ code: 0 });
  });

  it('fails on a history file that is not JSON', () => {
    const dir = scratch();
    mkdirSync(join(dir, 'trust/history'));
    writeFileSync(join(dir, 'trust/history/1.json'), '{ not json');
    const r = check(dir);
    expect(r.code).toBe(1);
    expect(r.out).toContain('trust/history/1.json is not valid JSON');
  });

  it('fails on a history file that is JSON but not a trust-anchor document', () => {
    const dir = scratch();
    mkdirSync(join(dir, 'trust/history'));
    writeFileSync(join(dir, 'trust/history/1.json'), '{"signed":{},"signatures":[]}');
    const r = check(dir);
    expect(r.code).toBe(1);
    expect(r.out).toContain('trust/history/1.json is not a valid trust-anchor document');
  });

  it('fails on a history file whose name does not match its version', () => {
    const dir = scratch();
    mkdirSync(join(dir, 'trust/history'));
    writeFileSync(join(dir, 'trust/history/7.json'), readFileSync(join(repo, 'trust/trust-anchors.json')));
    const r = check(dir);
    expect(r.code).toBe(1);
    expect(r.out).toContain('contains version 1');
  });
});
