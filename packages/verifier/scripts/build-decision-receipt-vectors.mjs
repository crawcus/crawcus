/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

// Builds the decision-receipt vectors of draft-gruszka-audit-decision-receipts-05
// Appendix A (A.3: V1-good … V3-bad; A.5: F1 … F15) from the definitions in
// A.1, A.2 and A.5, and refuses to write anything unless every rebuilt input,
// payload and signature equals the value the draft publishes. Ed25519 is
// deterministic, so a signature that differs means the payload differs.
//
//   node packages/verifier/scripts/build-decision-receipt-vectors.mjs [--check]
//
// --check rebuilds and compares with the files on disk without writing.
// Output: packages/tck/vectors/decision-receipt/<case>/.

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ed25519 } from '@noble/curves/ed25519';
import canonicalize from 'canonicalize';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../../tck/vectors/decision-receipt');
const CHECK = process.argv.includes('--check');

const enc = (s) => new TextEncoder().encode(s);
const sha = (b) => createHash('sha256').update(b).digest('hex');
const jcs = (v) => {
  const s = canonicalize(v);
  if (s === undefined) throw new Error('no RFC 8785 serialization');
  return s;
};
const b64 = (b) => Buffer.from(b).toString('base64');
const clone = (v) => JSON.parse(JSON.stringify(v));

const problems = [];
const agree = (what, got, want) => {
  if (got !== want) problems.push(`${what}: built ${got}, draft ${want}`);
};

// ---- A.1 keys ----------------------------------------------------------------
const KEYS = {
  'gate-1': {
    label: 'draft-gruszka-audit-decision-receipts test key gate-1',
    seed: '100fa92fa6464c141f791a96327f555c1c0cfbf3095af986537e50c3c4335f8c',
    pub: 'TWfs75IN1In3CNI8TnyIOUHgtwilOPGcRFQLJ670CJc=',
    keyid: 'SHA256:NjZMAelLq9XON3pxV5tR5hZjX99NkQyw4gGJSRc2gP8',
  },
  'observer-1': {
    label: 'draft-gruszka-audit-decision-receipts test key observer-1',
    seed: 'f03ad5b668ad225ea15fd9fd272fc8df84be59f467da86b0f2ad0a5ad26f4ddd',
    pub: '4hDsi5TCL+A+9SB7k2l4EkY7XePUheE+zE9mBazt2Fs=',
    keyid: 'SHA256:q/d0VZCREBObUFi8PWKWXEF4lVNeYPuGn0GuOqd1ij0',
  },
};
for (const [name, k] of Object.entries(KEYS)) {
  agree(`${name} seed`, sha(enc(k.label)), k.seed);
  k.secret = Buffer.from(k.seed, 'hex');
  k.public = ed25519.getPublicKey(k.secret);
  agree(`${name} public key`, b64(k.public), k.pub);
  // keyid is the OpenSSH fingerprint: SHA-256 over the ssh-ed25519 wire key, unpadded base64.
  const wire = Buffer.concat([Buffer.from([0, 0, 0, 11]), Buffer.from('ssh-ed25519'), Buffer.from([0, 0, 0, 32]), k.public]);
  agree(`${name} keyid`, 'SHA256:' + b64(createHash('sha256').update(wire).digest()).replace(/=+$/, ''), k.keyid);
}

// ---- A.1 inputs ----------------------------------------------------------------
const input = (name, bytes, size, hex) => {
  agree(`${name} size`, bytes.length, size);
  agree(`${name} sha256`, sha(bytes), hex);
  return bytes;
};
const a1 = input('a1', enc('git push origin refs/heads/topic:refs/heads/topic\n'), 50, 'dec54f771352454097310ae4bd6608c0070ebebb3955c6be013c1b3a8e310bd0');
const a1x = input('a1x', enc('git push --force origin refs/heads/topic:refs/heads/main\n'), 57, 'b683418806875ff79c6fa190c50edab0b96577ad8062de5ba7b41dc1d9c363fb');
const a2 = input('a2', enc('gh pr merge 7 --repo acme/widgets --merge\n'), 42, '5a7549948a1441addb710f5ada59e06dbce25cc5a59accf14f140379f47adb5b');
const pol = input('pol', enc('example gate rules, revision 1\n'), 31, '43789b41915ae0febcd13263d293101af5ab041eb7c234e1cbe625d6312815f6');
const approval = (validUntil) => ({
  actionDigest: { sha256: sha(a1) },
  approvalId: 'appr-001',
  approvedAt: '2026-10-15T09:00:00Z',
  approver: 'user-123',
  session: 'sess-1',
  validUntil,
});
const ap = input('ap', enc(jcs(approval('2026-10-15T09:15:00Z'))), 231, '88e5b6d69b3e4bc250a42aeffea0414d406e5f04ba4f991ee432a78231da1170');
const a3 = input('a3', enc(jcs({ body: 'All required checks passed for 4f1c2a9.', pull: 7, repo: 'acme/widgets' })), 81, '9165c850b7e03cd59578efa1769be74c5386cff5ce96df6b59e25d38ad6f88b4');
const e3 = input('e3', enc(jcs({ author: 'agent-42-bot', body: 'All required checks passed for 4f1c2a9.', id: 9001, pull: 7 })), 93, 'd3d824cf55168298c0f651244853ec9d9620ea09087abe899243ceb8f9df3a6d');
// B is the evaluation receipt of [SER] P1; only its digest enters a predicate.
const B_SHA = '8cd849a6dcce08aee334511d7b2f31c54e478885dda1795d3c8f972dd0d4811c';

// ---- A.5 consumption-state inputs ---------------------------------------------
const identity = { actionDigest: { sha256: sha(a1) }, approvalId: 'appr-001', session: 'sess-1' };
const ap2 = input('ap2', enc(jcs(approval('2026-10-15T09:30:00Z'))), 231, '37ec7f3fa06f086626268a6c818ba5b5af7fd16ba292735ce964a83c42c0357c');
const c1 = input('c1', enc(jcs([identity])), 139, 'f13fce72c54f1872232c0339fa98b33ffe5142f72481cd31e378bc6a680b6f6a');
const c2 = input('c2', enc(jcs({ current: [], rotated: [identity] })), 164, '3e9cea5ebe4860d1f5743526dcdf1f5200c11e8abd7ce67326abfa16f30c6c7f');

// ---- A.2 predicates, as the draft's assignment lists -------------------------
// path: dotted names, "name[i]" selects element i; missing objects are created;
// assigning element i of an array of length i appends it.
function assign(obj, path, value) {
  const parts = path.split('.').flatMap((p) => {
    const m = /^([^[]+)\[(\d+)\]$/.exec(p);
    return m ? [m[1], Number(m[2])] : [p];
  });
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (cur[k] === undefined) cur[k] = {};
    cur = cur[k];
  }
  cur[parts.at(-1)] = clone(value);
}
const derive = (base, lines) => {
  const out = clone(base);
  for (const [p, v] of lines) {
    if (p === 'remove') delete out[v];
    else assign(out, p, v);
  }
  return out;
};

const V1_GOOD = derive({}, [
  ['agent.id', 'agent-42'],
  ['decidedAt', '2026-10-15T09:00:05Z'],
  ['decision.reasonCodes', ['user_approval']],
  ['decision.verdict', 'ALLOW'],
  ['decisionChangeConditions', []],
  ['decisionChangeConditions[0].conditionType', 'ruleChange'],
  ['decisionChangeConditions[0].description', 'a changed gate, mode or rule of the gate'],
  ['decisionId', 'dec-0001'],
  ['decisionMaker.id', 'gate-1'],
  ['decisionType', 'preActionAuthorization'],
  ['evidenceRefs', []],
  ['inputSnapshot', []],
  ['inputSnapshot[0].digest.sha256', sha(a1)],
  ['inputSnapshot[0].mediaType', 'text/plain'],
  ['inputSnapshot[0].name', 'approved bytes'],
  ['inputSnapshot[1].digest.sha256', sha(ap)],
  ['inputSnapshot[1].mediaType', 'application/json'],
  ['inputSnapshot[1].name', 'approval record'],
  ['notChecked', []],
  ['notChecked[0].field', 'content'],
  ['notChecked[0].impact', 'an approved text can be wrong'],
  ['notChecked[0].reason', 'the gate does not judge whether the text is true'],
  ['policyBoundary.bundleRevision', '1'],
  ['policyBoundary.decisionPath', 'outbound-gate/allow-write'],
  ['policyBoundary.policyDigest.sha256', sha(pol)],
  ['policyBoundary.policyEngine', 'proofbundle-pilot/github-write'],
  ['policyBoundary.policyId', 'outbound-gate-rules'],
  ['principal.id', 'user-123'],
  ['privacy.rawInputsIncluded', false],
  ['proposedAction.actionType', 'git.push'],
  ['proposedAction.method', 'write'],
  ['proposedAction.parametersDigest.sha256', sha(a1)],
  ['proposedAction.target.name', 'https://git.example/acme/widgets refs/heads/topic'],
  ['proposedAction.target.uri', 'https://git.example/acme/widgets'],
  ['schemaVersion', '0.1.0'],
  ['traceContext.parentId', 'int-002'],
  ['traceContext.traceId', 'trace-abc'],
  ['validity.audience', ['observer-1']],
  ['validity.expiresAt', '2026-10-15T09:05:05Z'],
  ['validity.nonce', 'dec-0001'],
]);
const PULL7 = 'https://git.example/acme/widgets/pull/7';
const V2_GOOD = derive(V1_GOOD, [
  ['actionOutcome.outcomeRef', null],
  ['actionOutcome.performedAt', null],
  ['actionOutcome.status', 'blocked'],
  ['decidedAt', '2026-10-15T09:05:00Z'],
  ['decision.reasonCodes', ['required_check_failed']],
  ['decision.verdict', 'DENY'],
  ['decisionId', 'dec-0002'],
  ['inputSnapshot', []],
  ['inputSnapshot[0].digest.sha256', sha(a2)],
  ['inputSnapshot[0].mediaType', 'text/plain'],
  ['inputSnapshot[0].name', 'proposed bytes'],
  ['policyBoundary.decisionPath', 'outbound-gate/deny-write'],
  ['proposedAction.actionType', 'github.merge'],
  ['proposedAction.parametersDigest.sha256', sha(a2)],
  ['proposedAction.target.name', PULL7],
  ['proposedAction.target.uri', PULL7],
  ['traceContext.parentId', 'int-003'],
  ['validity.expiresAt', '2026-10-15T09:10:00Z'],
  ['validity.nonce', 'dec-0002'],
]);
const V3_DECISION = derive(V1_GOOD, [
  ['decidedAt', '2026-10-15T09:10:00Z'],
  ['decision.reasonCodes', ['evidence_verified']],
  ['decisionId', 'dec-0003'],
  ['evidenceRefs', []],
  ['evidenceRefs[0].digest.sha256', B_SHA],
  ['evidenceRefs[0].relation', 'evaluationResult'],
  ['inputSnapshot', []],
  ['inputSnapshot[0].digest.sha256', sha(a3)],
  ['inputSnapshot[0].mediaType', 'application/json'],
  ['inputSnapshot[0].name', 'approved bytes'],
  ['proposedAction.actionType', 'github.conversationComment'],
  ['proposedAction.parametersDigest.sha256', sha(a3)],
  ['proposedAction.target.name', PULL7],
  ['proposedAction.target.uri', PULL7],
  ['traceContext.parentId', 'int-004'],
  ['validity.expiresAt', '2026-10-15T09:15:00Z'],
  ['validity.nonce', 'dec-0003'],
]);

// ---- Statements, payloads, signatures ---------------------------------------
const DECISION_TYPE = 'https://b7n0de.com/proofbundle/predicates/decision-receipt/v0.1';
const OUTCOME_TYPE = 'https://b7n0de.com/proofbundle/predicates/action-outcome/v0.1';
const STATEMENT_V1 = 'https://in-toto.io/Statement/v1';
const PAYLOAD_TYPE = 'application/vnd.in-toto+json';

const statement = (D, { outcome = false, _type = STATEMENT_V1, predicateType } = {}) => ({
  _type,
  predicateType: predicateType ?? (outcome ? OUTCOME_TYPE : DECISION_TYPE),
  predicate: D,
  subject: [{ name: outcome ? `outcome:${D.outcomeId}` : `decision:${D.decisionId}`, digest: { sha256: sha(enc(jcs(D))) } }],
});
const pae = (type, body) => {
  const t = enc(type);
  const head = enc(`DSSEv1 ${t.length} ${type} ${body.length} `);
  const out = new Uint8Array(head.length + body.length);
  out.set(head);
  out.set(body, head.length);
  return out;
};
const sign = (payload, signer) => b64(ed25519.sign(pae(PAYLOAD_TYPE, payload), KEYS[signer].secret));
const envelope = (payload, signer, sig) =>
  enc(jcs({ payload: b64(payload), payloadType: PAYLOAD_TYPE, signatures: [{ keyid: KEYS[signer].keyid, sig }] }));

// Python json.dumps(s, sort_keys=True): ", " and ": " separators, ASCII only here.
const pyDumps = (v) => {
  if (Array.isArray(v)) return `[${v.map(pyDumps).join(', ')}]`;
  if (v !== null && typeof v === 'object') {
    const ks = Object.keys(v).sort();
    return `{${ks.map((k) => `${JSON.stringify(k)}: ${pyDumps(v[k])}`).join(', ')}}`;
  }
  return JSON.stringify(v);
};

const payloads = {};
const sigs = {};
const build = (name, signer, payload, sig = sign(payload, signer)) => {
  payloads[name] = payload;
  sigs[name] = sig;
};
build('V1-good', 'gate-1', enc(jcs(statement(V1_GOOD))));
build('V1-bad', 'gate-1', enc(new TextDecoder().decode(payloads['V1-good']).replaceAll(sha(a1), sha(a1x))), sigs['V1-good']);
build('V2-good', 'gate-1', enc(jcs(statement(V2_GOOD))));
build('V2-bad', 'gate-1', enc(pyDumps(statement(V2_GOOD))));
build('V3-decision', 'gate-1', enc(jcs(statement(V3_DECISION))));
const V3_GOOD = derive({}, [
  ['decisionRef.sha256', sha(payloads['V3-decision'])],
  ['effectDigest.sha256', sha(e3)],
  ['executor.id', 'forge:agent-42-bot'],
  ['outcomeId', 'out-0001'],
  ['performedAt', '2026-10-15T09:10:02Z'],
  ['requestedActionDigest.sha256', sha(a3)],
  ['schemaVersion', '0.1.0'],
  ['status', 'executed'],
]);
const V3_BAD = derive(V3_GOOD, [
  ['decisionRef.sha256', sha(payloads['V1-good'])],
  ['outcomeId', 'out-0002'],
]);
build('V3-good', 'observer-1', enc(jcs(statement(V3_GOOD, { outcome: true }))));
build('V3-bad', 'observer-1', enc(jcs(statement(V3_BAD, { outcome: true }))));

const dec = (name, base, lines, opts) => build(name, 'gate-1', enc(jcs(statement(derive(base, lines), opts))));
const out = (name, lines) => build(name, 'observer-1', enc(jcs(statement(derive(V3_GOOD, lines), { outcome: true }))));
dec('F1', V1_GOOD, [['agent', null]]);
dec('F2', V2_GOOD, [['policyBoundary.validFrom', '2026-10-15T09:00:00+00:00']]);
dec('F3', V2_GOOD, [['decisionMaker.id', 'gate-2']]);
out('F6', [['executor.id', 'forge:another-actor']]);
out('F7', [['status', 'refused'], ['remove', 'effectDigest']]);
out('F8', [['performedAt', '2026-10-15T09:09:59Z']]);
dec('F9', V1_GOOD, [['validity.expiresAt', '2026-10-15T10:00:00Z']]);
dec('F10', V1_GOOD, [
  ['decidedAt', '2026-10-15T09:20:00Z'],
  ['decisionId', 'dec-0004'],
  ['inputSnapshot[1].digest.sha256', sha(ap2)],
  ['validity.expiresAt', '2026-10-15T09:25:00Z'],
  ['validity.nonce', 'dec-0004'],
]);
dec('F11', V2_GOOD, [], { _type: 'https://in-toto.io/Statement/v0.1' });
dec('F12', V2_GOOD, [], { predicateType: 'https://b7n0de.com/proofbundle/predicates/decision-receipt/v0.2' });
dec('F14', V1_GOOD, [['decision.reasonCodes', ['policy_match']]]);

// ---- what the draft publishes (A.3, A.5) ------------------------------------
const DRAFT = {
  'V1-good': [1829, 'b9dfd26537542632013d0df166141a788551b4987dfa33b060d5b5ebba78dfb1', 'GkvzPjklV5ZbtomNRXbS4+O4MIOSw8xGmA0diAEYKEm0s4Q9qLkL1j7+e5RZnT9l56tfB2utDoNycACsSvSoDw=='],
  'V1-bad': [1829, '69eb87fb33a29153182b0e0c89a444023cc00c82fe7c8db1c7e0893363b2c926', 'GkvzPjklV5ZbtomNRXbS4+O4MIOSw8xGmA0diAEYKEm0s4Q9qLkL1j7+e5RZnT9l56tfB2utDoNycACsSvSoDw=='],
  'V2-good': [1765, 'ed149a1c7383842eebf8304001da9de97d130b0b15080d1315ab8fbf1274ed44', '66CUa1kz6aOm6gbdctRg4l97fW8x185nxpsB5rkCFj+aHZVjRjc5hDnQu6v4J/bHzaufyHhPCPdM6XUAWiylAQ=='],
  'V2-bad': [1866, '646d4b2229a55c54848361030bf6d57816597a96bd7d1fb00d7da0f03b009bd2', '2yjE3MxaVXdureYhh50+d3XdDAsJDhW3nacud4WCbzBMR/NLHyxeqIvbsDKQTabl+X+5O4CSXu17rA7lFYN0Cw=='],
  'V3-decision': [1827, '0014b1c419798125c3984e85a4b322ee619a3227978840cac5f9d282b189521f', 'DDLIUtX6uk5A3AqcvYP9f9zYeHJAWNTrdBZwpXmEQq4yu0bivvsiNEjx4u2Kw2U6Mr11lcWoRZnSo1w5MX2PCA=='],
  'V3-good': [694, 'f0ff90cf25e2db1e989fa79869d4b3b46899112e8c2269d9a18a64b751aa7274', 'MCUgSY+fGUO2cm5DnxBVKEC/BBSyeS359aj2rYowwkHTj+CskAgraX5TirUBic2i2KyUUaxBYMMdVafhu3tcAQ=='],
  'V3-bad': [694, '48be708cf3f959556323474f4a5c9193b417d2bfea5c88bb852daf00b64827b4', 'uEgT4TFv7jEgmH7pwJcPBEEZM+n2wGjic6U6yYWOU3DhTa0tMuimQ8q4Ha1lgw4zWNR9YBag4GmVt9SdsfzwCQ=='],
  F1: [1816, 'c20b86e4fa3753555a3e84dc87e2efe574f5094544612c6fc91ccf4f68707063', 'TeDLj3n16X9LrDWZGsPSM1YTwCx37OuCrXj/rYp4ayMXX4EMk9ymbLAjBUZliV3KqqA4E0MEPXA6EYArYoThAQ=='],
  F2: [1805, 'f9015e5fbcce4da86a56e5facfc812f629b62e6c29afa5f7172d037e6b880978', 'bPEAg3NIdR7cKMu7egfmj1xWPs4r27HumGAG6z95uKVk+iQwNWltjZBCDc5PJiBDVv3hb+ufBliTWf08CluRAA=='],
  F3: [1765, '506905bbeeb5205b82aa707a6e3a9ec4f27f6f7213b8dc864d5083063c2f460a', 'qGm1ojfaW3hFVuUV5q+H+t1zYQRVA9NPIWnTup1w22XddNAtygYVZ3qA7Wcame3kZsd14kmp+o+4Az0/FDNOAg=='],
  F6: [695, '400e251d35ce2d833d22eb8699b2300a565801056bc2cccd461842957107bd69', 'gNh8vj8l4Ke040Yos21Vhd6uThtQYLsPVkRBJ4sXu+/Cn4LaMY2xoO4RzoI/AMU4LY8GAlwelUVCab+FLjGuBw=='],
  F7: [600, 'b277133a0cd9e0ceea68313a8896280a89fd24c1743b1e056dcec5d10e10c6ad', 'EhhyqWKqst02TtQfDvlLWyVgQrQao7fPywh0elGXrH0kuZXQxMACzjGGbX+69BoygBO3/T7SHHLtmPAB5X3bBQ=='],
  F8: [694, 'bbe81b4cf255b9444de8ead2773fc9a859f4c2b9f8288822209fac0653fb9888', 'B+PLo64p+ESIWVfdIk7FR6RuANsst7kgsep1K6+g92eULuty4HseuWJL2laTX+tkc0aM1ztineO5Q3rA9XTtAg=='],
  F9: [1829, '8271acb7293138eea0a48e52ee0dfd99c063b1139f353c8b26c9cdbe56975151', 'hIPtCWefKjWx+MlTv7nUxCuq9v+JjapYccXx9rawMxw8JcxybehAGp8d8MozhTzAjZ5BZgmzvKBkEXECTfQPCA=='],
  F10: [1829, 'c299b48e0a0596f8c8eb252beef0138c7d1133f113cdc03150abb6cb41bcdcce', 'qCHm6JNGoxXAdFPXKud8ojxef8wh+m9BrGHbYD/1miqG1YGcYAZ/XRFO8+el6D8RirkB313aOUqZo6YwBAUYAw=='],
  F11: [1767, '9a162c5545a176d058b8daf099fafb66ec8b1a29c5ebdad865c64dbb245a3359', 'IjCZkGp11qcrYT4Lpn/n756TXHm5ZumTaAMJwkeM7ufG7w100g1kBraCtZivUmlndJhG2fn1DPBH7ki6wUa4Dg=='],
  F12: [1765, 'fc575c9130a083168047f727da512cf88c5308fc9193d090d7bf883750c5dc39', 'clHORGiu7nnI4nD5EkwD8dwcnq+RzeYmFwZ0POtkT+DSd1rgTbX9wSMqz3KjlJwYCCHPaYKVFxBfnyuVSRQUDw=='],
  F14: [1828, '45f47469a275828b32daca01f7437e47f3342b7d95ff5f75841cae6dfd96130b', 'JCf476iurjKm5ACyNoThqSbABxG5XaGiKG5cl/bS7z5DZIIvDxkU9bW+M26+YRxA4akMAFPMkH0JZY0iPNBeCg=='],
};
for (const [name, [size, hex, sig]] of Object.entries(DRAFT)) {
  agree(`${name} payload size`, payloads[name].length, size);
  agree(`${name} payload sha256`, sha(payloads[name]), hex);
  agree(`${name} signature`, sigs[name], sig);
}
const signerOf = (name) => (['V3-good', 'V3-bad', 'F6', 'F7', 'F8'].includes(name) ? 'observer-1' : 'gate-1');
const envelopes = Object.fromEntries(Object.keys(payloads).map((n) => [n, envelope(payloads[n], signerOf(n), sigs[n])]));
// Appendix A.4 publishes the V2-good envelope bytes' size and digest.
agree('V2-good envelope size', envelopes['V2-good'].length, 2590);
agree('V2-good envelope sha256', sha(envelopes['V2-good']), '0e60fbbf36ddc6691cdf0fb2b1faea70d23d02d0da7653f449ec60f2f820e71e');

// F15: the receipt of [SER] (draft-gruszka-signed-evaluation-receipts-04) vector P1, A.2.1.
const F15_HEX = readFileSync(join(HERE, 'ser-p1-receipt.hex'), 'utf8').replace(/\s+/g, '');
const f15 = input('F15 receipt', Buffer.from(F15_HEX, 'hex'), 871, '02036d1f57509858330383755ec16c532bdc58b0f2d949464488d57abc9f95e7');

if (problems.length > 0) {
  console.error(`refusing to write: ${problems.length} value(s) disagree with the draft`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}

// ---- cases -------------------------------------------------------------------
const T = (hm) => `2026-10-15T${hm}Z`;
const decisionCheck = (time, nonce, extra) => ({
  procedure: 'decision',
  decisionKey: 'gate-1',
  decisionMakerId: 'gate-1',
  time: T(time),
  expectedAudience: 'observer-1',
  expectedNonce: nonce,
  ...extra,
});
const outcomeCheck = (extra) => ({
  procedure: 'outcome',
  decision: { receipt: 'decision.json', ...decisionCheck('09:11:00', 'dec-0003', { actionBytes: 'a3.json' }) },
  outcomeKey: 'observer-1',
  expectedExecutorId: 'forge:agent-42-bot',
  permittedExecutorIds: ['forge:agent-42-bot'],
  effectBytes: 'e3.json',
  ...extra,
});
const case1 = (time, nonce, approvalFile = 'ap.json') => decisionCheck(time, nonce, { actionBytes: 'a1.txt', case: { kind: 'approval', approval: approvalFile } });
const case2 = (actionFile = 'a2.txt') => decisionCheck('09:06:00', 'dec-0002', { actionBytes: actionFile, case: { kind: 'declined' } });

const CASES = [
  ['V1-good', 'A.3', 'V1-good', case1('09:01:00', 'dec-0001'), 'pass', 'pass, exit 0', { 'a1.txt': a1, 'ap.json': ap }],
  ['V1-bad', 'A.3', 'V1-bad', case1('09:01:00', 'dec-0001'), '3.2 step 3', 'fail at step 3, exit 1', { 'a1.txt': a1, 'ap.json': ap }],
  ['V2-good', 'A.3', 'V2-good', case2(), 'pass', 'pass, exit 0', { 'a2.txt': a2 }],
  ['V2-bad', 'A.3', 'V2-bad', case2(), '3.2 step 4', 'fail at step 4, exit 2', { 'a2.txt': a2 }],
  [
    'V3-decision', 'A.3', 'V3-decision',
    decisionCheck('09:11:00', 'dec-0003', {
      actionBytes: 'a3.json',
      case: { kind: 'executed', outcome: 'outcome.json', outcomeKey: 'observer-1', expectedExecutorId: 'forge:agent-42-bot', permittedExecutorIds: ['forge:agent-42-bot'], effectBytes: 'e3.json' },
    }),
    'pass', 'pass, exit 0', { 'a3.json': a3, 'e3.json': e3, 'outcome.json': envelopes['V3-good'] },
  ],
  ['V3-good', 'A.3', 'V3-good', outcomeCheck(), 'pass', 'pass, exit 0', { 'a3.json': a3, 'e3.json': e3, 'decision.json': envelopes['V3-decision'] }],
  ['V3-bad', 'A.3', 'V3-bad', outcomeCheck(), '3.4 step 4', 'fail at binding, exit 2', { 'a3.json': a3, 'e3.json': e3, 'decision.json': envelopes['V3-decision'] }],
  ['F1', 'A.5', 'F1', case1('09:01:00', 'dec-0001'), '3.2 step 7', 'fails at step 7 of 3.2, exit 2', { 'a1.txt': a1, 'ap.json': ap }],
  ['F2', 'A.5', 'F2', case2(), '3.2 step 7', 'fails at step 7 of 3.2, exit 2', { 'a2.txt': a2 }],
  ['F3', 'A.5', 'F3', case2(), '3.2 step 8', 'fails at step 8 of 3.2, exit 0', { 'a2.txt': a2 }],
  ['F4', 'A.5', 'V1-good', case1('09:05:05', 'dec-0001'), '3.2 step 9', 'fails at step 9 of 3.2, exit 2', { 'a1.txt': a1, 'ap.json': ap }],
  ['F5', 'A.5', 'V2-good', case2('a1.txt'), '3.2 step 10', 'fails at step 10 of 3.2, exit 0', { 'a1.txt': a1 }],
  ['F6', 'A.5', 'F6', outcomeCheck(), '3.4 step 5', 'fails at step 5 of 3.4, exit 0', { 'a3.json': a3, 'e3.json': e3, 'decision.json': envelopes['V3-decision'] }],
  ['F7', 'A.5', 'F7', outcomeCheck(), '3.4 step 6', 'fails at step 6 of 3.4, exit 0', { 'a3.json': a3, 'e3.json': e3, 'decision.json': envelopes['V3-decision'] }],
  ['F8', 'A.5', 'F8', outcomeCheck(), '3.4 step 7', 'fails at step 7 of 3.4, exit 0', { 'a3.json': a3, 'e3.json': e3, 'decision.json': envelopes['V3-decision'] }],
  ['F9', 'A.5', 'F9', case1('09:16:00', 'dec-0001'), '3.3 case 1', 'fails at Case 1 of 3.3, exit 0', { 'a1.txt': a1, 'ap.json': ap }],
  [
    'F10', 'A.5', 'F10', { ...case1('09:21:00', 'dec-0004', 'ap2.json'), consumption: 'c1.json' },
    '4 item 2', 'fails at Section 4 item 2, exit 0', { 'a1.txt': a1, 'ap2.json': ap2, 'c1.json': c1 },
  ],
  ['F11', 'A.5', 'F11', case2(), '3.2 step 6', 'fails at step 6 of 3.2, exit 2', { 'a2.txt': a2 }],
  ['F12', 'A.5', 'F12', case2(), '3.2 step 6', 'fails at step 6 of 3.2, exit 2', { 'a2.txt': a2 }],
  [
    'F13', 'A.5', 'V1-good', { ...case1('09:01:00', 'dec-0001'), consumption: 'c2.json' },
    '4 item 4', 'fails at Section 4 item 4, exit 0', { 'a1.txt': a1, 'ap.json': ap, 'c2.json': c2 },
  ],
  ['F14', 'A.5', 'F14', case1('09:01:00', 'dec-0001'), '3.3 case 1', 'fails at Case 1 of 3.3, exit 0', { 'a1.txt': a1, 'ap.json': ap }],
  ['F15', 'A.5', null, case2(), '3.2 step 1', 'fails at step 1 of 3.2, exit 1', { 'a2.txt': a2 }],
];

const KEYS_OUT = Object.fromEntries(Object.entries(KEYS).map(([n, k]) => [n, { publicKey: k.pub, keyid: k.keyid }]));
const files = new Map(); // relative path -> bytes
const put = (p, b) => files.set(p, typeof b === 'string' ? enc(b) : b);
const pretty = (v) => `${JSON.stringify(v, null, 2)}\n`;

put('keys.json', pretty(KEYS_OUT));
for (const [name, source, vector, check, expected, draftResult, inputs] of CASES) {
  const outcome = check.procedure === 'outcome';
  const receiptFile = outcome ? 'outcome_receipt.json' : 'decision_receipt.json';
  const dir = name;
  const caseFiles = {};
  if (vector === null) {
    caseFiles[receiptFile] = f15;
  } else {
    caseFiles[receiptFile] = envelopes[vector];
    caseFiles[outcome ? 'outcome_receipt.jcs' : 'decision_receipt.jcs'] = payloads[vector];
  }
  Object.assign(caseFiles, inputs);
  const draft = vector === null
    ? { receiptSize: 871, receiptSha256: sha(f15), source: '[SER] draft-gruszka-signed-evaluation-receipts-04, A.2.1 vector P1' }
    : { payloadSize: DRAFT[vector][0], payloadSha256: DRAFT[vector][1], signature: DRAFT[vector][2], signer: signerOf(vector) };
  const caseJson = {
    name,
    source: `draft-gruszka-audit-decision-receipts-05 Appendix ${source}`,
    ...(vector !== null && vector !== name ? { reusesEnvelopeOf: vector } : {}),
    receipt: receiptFile,
    check,
    expected,
    draftResult,
    draft,
  };
  caseFiles['case.json'] = enc(pretty(caseJson));
  const manifest = Object.fromEntries(Object.keys(caseFiles).sort().map((f) => [f, sha(caseFiles[f])]));
  for (const [f, b] of Object.entries(caseFiles)) put(`${dir}/${f}`, b);
  put(`${dir}/MANIFEST.json`, pretty(manifest));
}

if (CHECK) {
  const drift = [];
  for (const [p, b] of files) {
    const f = join(OUT, p);
    if (!existsSync(f) || sha(readFileSync(f)) !== sha(b)) drift.push(p);
  }
  if (drift.length > 0) {
    console.error(`vectors on disk differ from a rebuild: ${drift.join(', ')}`);
    process.exit(1);
  }
  console.log(`decision-receipt vectors: ${CASES.length} cases match a rebuild from the draft`);
} else {
  if (existsSync(OUT)) for (const d of readdirSync(OUT)) if (d !== 'README.md' && d !== 'REPORT.md') rmSync(join(OUT, d), { recursive: true });
  for (const [p, b] of files) {
    mkdirSync(dirname(join(OUT, p)), { recursive: true });
    writeFileSync(join(OUT, p), b);
  }
  console.log(`decision-receipt vectors: ${Object.keys(DRAFT).length} payloads and signatures, the inputs and both keys agree with the draft; wrote ${CASES.length} cases to ${OUT}`);
}
