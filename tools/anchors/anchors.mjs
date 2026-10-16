#!/usr/bin/env node
/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * trust-anchors.json tooling: keygen, sign, verify, check (PUB-6), placeholder.
 *
 * Local secret files are for TEST keys only. Production root signing
 * goes through an `AnchorSigner` backed by the custodian's key custody;
 * that adapter is not part of this repository.
 *
 * Requires `pnpm build` (imports @crawcus/verifier from dist).
 */

import { generateKeyPairSync } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../..');
const lib = await import(pathToFileURL(join(repo, 'packages/verifier/dist/index.js')).href);

const USAGE = `usage: anchors.mjs <command> [options]

  keygen      --out <dir> [--name <prefix>] [--count <n>]
              TEST ed25519 key pairs: <prefix>-<i>.secret.hex (0600), .pub.spki (base64 SPKI), keyid printed.
  sign        --body <signed.json> --key <secret.hex> [--key ...] --out <file> [--append <existing.json>]
              Fill keyids from public_key, sign PAE(trust-anchors, JCS(signed)), write the document.
              --append adds signatures to an already signed document with the same body.
  verify      --file <file> (--pin <keyid> ... --threshold <n> | --trusted <file>) [--now <rfc3339>] [--test-mode]
              Bootstrap from a pin, or check an update against a trusted document.
  check       PUB-6: trust/trust-anchors.json == docs/.well-known/crawcus-trust-anchors.json,
              README root fingerprints match roles.root, expiry >= 60 days away (skipped for TEST issuers).
  placeholder Regenerate the deterministic TEST placeholder (trust/ + docs/.well-known/).`;

const [command, ...rest] = process.argv.slice(2);
const { values } = parseArgs({
  args: rest,
  options: {
    out: { type: 'string' }, name: { type: 'string' }, count: { type: 'string' },
    body: { type: 'string' }, key: { type: 'string', multiple: true }, append: { type: 'string' },
    file: { type: 'string' }, pin: { type: 'string', multiple: true }, threshold: { type: 'string' },
    trusted: { type: 'string' }, now: { type: 'string' }, 'test-mode': { type: 'boolean' },
  },
});

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const writeJson = (p, obj) => {
  mkdirSync(dirname(resolve(p)), { recursive: true });
  writeFileSync(p, `${JSON.stringify(obj, null, 2)}\n`);
};
function readSecret(p) {
  const s = readFileSync(p, 'utf8').trim();
  if (!/^[0-9a-f]{64}$/i.test(s)) throw new Error(`${p}: not a 32-byte hex secret`);
  return Uint8Array.from(Buffer.from(s, 'hex'));
}
function fillKeyids(signed) {
  return {
    ...signed,
    keys: signed.keys.map((k) => {
      const raw = lib.rawFromSpkiBase64(k.public_key);
      if (raw === null) throw new Error(`public_key is not ed25519 SPKI: ${k.public_key}`);
      return { ...k, keyid: lib.keyIdFor(raw) };
    }),
  };
}
function testSeed(tag, n) {
  const s = new Uint8Array(32);
  s.set([0x54, 0x45, 0x53, 0x54, tag], 0);
  s[31] = n;
  return s;
}

const PLACEHOLDER_PATHS = ['trust/trust-anchors.json', 'docs/.well-known/crawcus-trust-anchors.json'];

async function placeholder() {
  // TEST ONLY. Seeds are public; these keys must never be trusted anywhere.
  const roots = [1, 2, 3, 4].map((n) => lib.createLocalEd25519Signer(testSeed(0xa0, n)));
  const op = (n) => lib.createLocalEd25519Signer(testSeed(0xb0, n)).publicKey;
  const rootWin = { notBefore: '2026-10-01T00:00:00Z', notAfter: '2029-10-01T00:00:00Z' };
  const signed = {
    _type: lib.TRUST_ANCHORS_TYPE,
    spec_version: '1.0.0',
    issuer: 'TEST-ONLY.crawcus.invalid',
    version: 1,
    issued_at: '2026-10-16T00:00:00Z',
    expires: '2027-04-16T00:00:00Z',
    roles: { root: { keyids: roots.map((r) => lib.keyIdFor(r.publicKey)), threshold: 2 } },
    keys: [
      ...roots.map((r, i) => lib.anchorKeyFromPublicKey(r.publicKey, {
        purpose: 'root', ...rootWin, custody: i < 2 ? 'TEST-placeholder-online' : 'TEST-placeholder-offline',
      })),
      lib.anchorKeyFromPublicKey(op(1), { purpose: 'release', notBefore: '2026-10-16T00:00:00Z', notAfter: '2028-10-16T00:00:00Z', custody: 'TEST-placeholder' }),
      lib.anchorKeyFromPublicKey(op(2), { purpose: 'test-vectors', notBefore: '2026-10-16T00:00:00Z', notAfter: '2028-10-16T00:00:00Z', custody: 'TEST-placeholder' }),
    ],
  };
  const doc = await lib.signTrustAnchors(signed, [roots[0], roots[1]]);
  for (const p of PLACEHOLDER_PATHS) writeJson(join(repo, p), doc);
  console.log('TEST placeholder written. README fingerprints:');
  for (const id of signed.roles.root.keyids) console.log(`- \`${id}\``);
}

function check() {
  const [a, b] = PLACEHOLDER_PATHS.map((p) => readFileSync(join(repo, p), 'utf8'));
  const problems = [];
  if (a !== b) problems.push('docs/.well-known mirror differs from trust/trust-anchors.json');
  const doc = JSON.parse(a);
  const parsed = lib.parseTrustAnchors(doc);
  if (parsed.kind !== 'ok') problems.push(`trust/trust-anchors.json: ${parsed.detail}`);
  else {
    const self = lib.validRootSignatures(parsed.value, parsed.value.signed).length;
    if (self < parsed.value.signed.roles.root.threshold) problems.push('root threshold not met');
    const readme = readFileSync(join(repo, 'README.md'), 'utf8');
    const listed = new Set(readme.match(/sha256:[0-9a-f]{64}/g) ?? []);
    const roots = parsed.value.signed.roles.root.keyids;
    if (roots.length !== listed.size || roots.some((k) => !listed.has(k))) problems.push('README root fingerprints differ from roles.root.keyids');
    if (!readme.includes(`threshold ${String(parsed.value.signed.roles.root.threshold)}`)) problems.push('README threshold differs');
    const test = /TEST/i.test(parsed.value.signed.issuer);
    const days = (Date.parse(parsed.value.signed.expires) - Date.now()) / 86_400_000;
    if (!test && days < 60) problems.push(`expires in ${days.toFixed(0)} days (< 60)`);
  }
  if (problems.length) {
    for (const p of problems) console.error(`anchors check: ${p}`);
    process.exitCode = 1;
  } else console.log('anchors check: ok');
}

switch (command) {
  case 'keygen': {
    if (!values.out) throw new Error(USAGE);
    mkdirSync(values.out, { recursive: true });
    for (let i = 1; i <= Number(values.count ?? '1'); i++) {
      const { privateKey, publicKey } = generateKeyPairSync('ed25519');
      const sk = Buffer.from(privateKey.export({ format: 'jwk' }).d, 'base64url');
      const pk = Buffer.from(publicKey.export({ format: 'jwk' }).x, 'base64url');
      const base = join(values.out, `${values.name ?? 'test-key'}-${String(i)}`);
      writeFileSync(`${base}.secret.hex`, `${sk.toString('hex')}\n`, { mode: 0o600 });
      chmodSync(`${base}.secret.hex`, 0o600);
      writeFileSync(`${base}.pub.spki`, `${lib.spkiBase64FromRaw(pk)}\n`);
      console.log(`${lib.keyIdFor(pk)}  ${base}.pub.spki`);
    }
    break;
  }
  case 'sign': {
    if (!values.body || !values.out || !values.key?.length) throw new Error(USAGE);
    const signed = fillKeyids(readJson(values.body));
    const doc = await lib.signTrustAnchors(signed, values.key.map((p) => lib.createLocalEd25519Signer(readSecret(p))));
    if (values.append) {
      const prior = readJson(values.append);
      if (JSON.stringify(prior.signed) !== JSON.stringify(signed)) throw new Error('--append body differs');
      doc.signatures = [...prior.signatures, ...doc.signatures.filter((s) => !prior.signatures.some((p) => p.keyid === s.keyid))];
    }
    const parsed = lib.parseTrustAnchors(doc);
    if (parsed.kind !== 'ok') throw new Error(parsed.detail);
    writeJson(values.out, doc);
    console.log(`wrote ${values.out}: version ${String(signed.version)}, ${String(doc.signatures.length)} signature(s)`);
    break;
  }
  case 'verify': {
    if (!values.file) throw new Error(USAGE);
    const opts = { ...(values.now ? { now: values.now } : {}), testMode: values['test-mode'] === true };
    let r;
    if (values.trusted) {
      const t = lib.bootstrapTrustAnchors(readJson(values.trusted), readJson(values.trusted).signed.roles.root, { ...opts, allowExpired: true });
      r = t.kind === 'ok' ? lib.updateTrustAnchors(t.anchors, readJson(values.file), opts) : t;
    } else {
      if (!values.pin?.length) throw new Error(USAGE);
      r = lib.bootstrapTrustAnchors(readJson(values.file), { keyids: values.pin, threshold: Number(values.threshold ?? '2') }, opts);
    }
    console.log(JSON.stringify(r.kind === 'ok'
      ? { kind: 'ok', issuer: r.anchors.signed.issuer, version: r.anchors.signed.version, digest: r.anchors.digest }
      : r, null, 2));
    process.exitCode = r.kind === 'ok' ? 0 : 1;
    break;
  }
  case 'check': check(); break;
  case 'placeholder': await placeholder(); break;
  default:
    console.error(USAGE);
    process.exitCode = 2;
}
