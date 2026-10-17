/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 *
 * crawcus verify — browser UI. All verification happens in this tab;
 * bundle bytes are never sent anywhere.
 */
import './polyfill.js';
import './ui/styles.css';
import { verify } from './core/verify.js';
import type { ChainLinkV1, VerifyResultV1 } from './core/schema.js';
import {
  loadWellKnownTrustAnchors,
  normalisePublicKey,
  base64ToBytes,
  WELL_KNOWN_TRUST_ANCHORS_URL,
  type TrustAnchor,
} from './core/trust.js';
import goodRaw from './samples/good.dsse.json?raw';
import tamperedRaw from './samples/tampered.dsse.json?raw';
import untrustedRaw from './samples/untrusted.dsse.json?raw';
import cosignRaw from './samples/cosign.dsse.json?raw';
import demoAnchor from './samples/demo-anchor.json';

import { applyTheme, loadTheme, saveTheme, DISCLAIMER, type Theme } from './ui/theme.js';
let theme: Theme = loadTheme();
applyTheme(theme);

// ---------- tiny DOM helper (textContent only; never innerHTML with data) ----------
type Child = Node | string | null | undefined | false;
function h<K extends keyof HTMLElementTagNameMap>(
  tag: K, attrs: Record<string, string | ((e: Event) => void)> = {}, ...kids: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (typeof v === 'function') el.addEventListener(k.replace(/^on/, ''), v);
    else el.setAttribute(k, v);
  }
  for (const c of kids) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}
const svg = (path: string, size = 28): SVGSVGElement => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', String(size)); s.setAttribute('height', String(size));
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', path); p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'currentColor');
  p.setAttribute('stroke-width', '2.4'); p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round');
  s.append(p); return s;
};
const ICON = { pass: 'M5 12.5l4.5 4.5L19 7.5', fail: 'M6 6l12 12M18 6L6 18', 'historical-unverifiable': 'M12 7v6M12 17h.01' };
const short = (x: string, n = 10): string => (x.length > n * 2 + 1 ? `${x.slice(0, n)}…${x.slice(-n)}` : x);

let toastTimer = 0;
function toast(msg: string): void {
  const t = document.querySelector('.toast') ?? document.body.appendChild(h('div', { class: 'toast' }));
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toastTimer); toastTimer = window.setTimeout(() => t.classList.remove('on'), 1400);
}
function copyBtn(value: string, label = 'copy'): HTMLButtonElement {
  return h('button', { class: 'sm ghost', title: 'Copy to clipboard', onclick: (e: Event) => {
    e.preventDefault(); e.stopPropagation();
    void navigator.clipboard.writeText(value).then(() => toast('copied'), () => toast('clipboard unavailable'));
  } }, label);
}
function jsonView(value: unknown): HTMLElement {
  const text = JSON.stringify(value, null, 2) ?? 'undefined';
  const pre = h('pre', { class: 'json' });
  const re = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
  let last = 0; let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    pre.append(text.slice(last, m.index));
    if (m[1]) { pre.append(h('span', { class: m[2] ? 'j-k' : 'j-s' }, m[1])); if (m[2]) pre.append(m[2]); }
    else if (m[3]) pre.append(h('span', { class: 'j-b' }, m[3]));
    else pre.append(h('span', { class: 'j-n' }, m[0]));
    last = re.lastIndex;
  }
  pre.append(text.slice(last));
  return h('div', { class: 'prewrap' }, pre, copyBtn(text));
}
const expander = (label: string, value: unknown, open = false): HTMLDetailsElement => {
  const d = h('details', open ? { open: '' } : {}, h('summary', {}, label));
  let built = false;
  const build = (): void => { if (!built) { built = true; d.append(jsonView(value)); } };
  if (open) build(); d.addEventListener('toggle', build);
  return d;
};

// ---------- trust anchors (localStorage only) ----------
const LS = 'crawcus-verify.anchors.v2';
const SAMPLE_ANCHOR: TrustAnchor = { label: demoAnchor.label, publicKeyHex: demoAnchor.publicKeyHex, source: 'sample' };
function loadAnchors(): TrustAnchor[] {
  try { const v = JSON.parse(localStorage.getItem(LS) ?? 'null') as TrustAnchor[] | null; if (Array.isArray(v)) return v; } catch { /* ignore */ }
  return [SAMPLE_ANCHOR];
}
let anchors = loadAnchors();
const saveAnchors = (): void => localStorage.setItem(LS, JSON.stringify(anchors));

// ---------- state ----------
let lastBytes: Uint8Array | null = null;
let lastName = '';
const app = document.getElementById('app') as HTMLElement;
const resultHost = h('div');
const anchorList = h('ul', { class: 'anchors' });
const anchorMsg = h('div', { class: 'note' });

function run(bytes: Uint8Array, name: string): void {
  lastBytes = bytes; lastName = name;
  const result = verify(bytes, { anchors });
  renderResult(result, bytes);
  resultHost.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

// ---------- input panel ----------
function inputPanel(): HTMLElement {
  const file = h('input', { type: 'file', accept: '.json,.jsonl,application/json', style: 'display:none' });
  const ta = h('textarea', { placeholder: '…or paste a .dsse.json envelope (or plain bundle JSON / JSONL) here', spellcheck: 'false' });
  const drop = h('div', { class: 'drop', tabindex: '0', role: 'button', onclick: () => file.click() },
    h('div', { class: 'big' }, 'Drop a .dsse.json receipt bundle'),
    h('div', { class: 'sub' }, 'or click to choose a file — read locally, never uploaded'));
  file.addEventListener('change', () => { const f = file.files?.[0]; if (f) void f.arrayBuffer().then((b) => run(new Uint8Array(b), f.name)); });
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault(); drop.classList.remove('over');
    const f = e.dataTransfer?.files[0]; if (f) void f.arrayBuffer().then((b) => run(new Uint8Array(b), f.name));
  });
  return h('div', { class: 'panel' }, drop, file, ta,
    h('div', { class: 'row' },
      h('button', { class: 'primary', onclick: () => { if (ta.value.trim()) run(enc(ta.value.trim()), 'pasted input'); } }, 'Verify pasted'),
      h('span', { class: 'note', style: 'margin:0' }, 'Foundry: ', h('code', {}, 'foundry audit export --engagement <id> --verify'))));
}
function samplesPanel(): HTMLElement {
  const s = (dot: string, title: string, sub: string, raw: string, file: string): HTMLElement =>
    h('button', { class: 'sample', onclick: () => run(enc(raw), file) }, h('b', {}, h('span', { class: `dot ${dot}` }), title, h('span', { class: 'demo' }, 'DEMO')), h('small', {}, sub));
  return h('div', { class: 'panel' },
    h('div', { class: 'card k', style: 'border:0;padding:0;margin-bottom:10px;background:none' }, 'Try a sample', h('span', { class: 'demo' }, 'DEMO / TEST DATA')),
    h('div', { class: 'samples' },
      s('ok', 'Good bundle', '8 rows, signed by the DEMO/TEST key', goodRaw, 'good.dsse.json'),
      s('bad', 'Tampered', 'row #3 edited after signing', tamperedRaw, 'tampered.dsse.json'),
      s('warn', 'Untrusted signer', 'valid signature, unpinned key', untrustedRaw, 'untrusted.dsse.json'),
      s('acc', 'Cross-vendor', 'cosign-emitted DSSE (TCK fixture)', cosignRaw, 'cosign.dsse.json')),
    downloadSamples());
}
// Byte-identical copies of src/samples/{good,tampered}.dsse.json served from public/samples/.
const SAMPLE_DOWNLOADS: ReadonlyArray<readonly [string, string]> = [
  ['ok', 'crawcus-sample-good.dsse.json'],
  ['bad', 'crawcus-sample-tampered.dsse.json'],
];
function downloadSamples(): HTMLElement {
  return h('div', { class: 'dl' },
    h('div', { class: 'dl-row' },
      h('span', { class: 'dl-k' }, 'Download sample files'),
      ...SAMPLE_DOWNLOADS.map(([dot, name]) => h('a', { href: `/samples/${name}`, download: name, type: 'application/json' }, h('span', { class: `dot ${dot}` }), name)),
      h('span', { class: 'demo' }, 'DEMO / TEST DATA')),
    h('div', { class: 'note' }, 'Download one, then drop it into the box above to check it yourself. Good shows PASS; tampered shows FAIL.'));
}
function renderAnchors(): void {
  anchorList.replaceChildren(...anchors.map((a, i) => h('li', {},
    h('div', { style: 'min-width:0;display:flex;flex-direction:column' }, h('span', {}, a.label, ' ', a.source === 'sample' ? h('span', { class: 'demo' }, 'DEMO / TEST KEY') : h('span', { class: 'pill mute' }, a.source)), h('code', {}, a.publicKeyHex)),
    h('button', { class: 'sm ghost', onclick: () => { anchors.splice(i, 1); saveAnchors(); renderAnchors(); rerun(); } }, 'remove'))));
  if (anchors.length === 0) anchorList.append(h('li', {}, h('span', { class: 'note', style: 'margin:0' }, 'No anchors pinned — signer identity will show as unknown.')));
}
const rerun = (): void => { if (lastBytes) renderResult(verify(lastBytes, { anchors }), lastBytes); };
function trustPanel(): HTMLElement {
  const key = h('input', { type: 'text', placeholder: 'ed25519 public key — hex, base64, or PEM', spellcheck: 'false' });
  const label = h('input', { type: 'text', placeholder: 'label', style: 'max-width:130px' });
  const add = (): void => {
    const hex = normalisePublicKey(key.value);
    if (!hex) { anchorMsg.textContent = 'Not a 32-byte ed25519 public key.'; anchorMsg.className = 'note err'; return; }
    if (!anchors.some((a) => a.publicKeyHex === hex)) anchors.push({ label: label.value.trim() || 'pinned key', publicKeyHex: hex, source: 'pinned' });
    key.value = ''; label.value = ''; anchorMsg.textContent = 'Pinned (stored only in this browser).'; anchorMsg.className = 'note';
    saveAnchors(); renderAnchors(); rerun();
  };
  renderAnchors();
  return h('div', { class: 'panel', style: 'margin-top:16px' },
    h('div', { class: 'card k', style: 'border:0;padding:0;background:none' }, 'Trusted signers', h('span', { class: 'pill mute' }, 'ed25519')),
    anchorList,
    h('div', { class: 'row' }, key, label, h('button', { onclick: add }, 'Pin')),
    h('div', { class: 'row' },
      h('button', { class: 'ghost sm', onclick: () => {
        anchorMsg.textContent = 'Loading…'; anchorMsg.className = 'note';
        loadWellKnownTrustAnchors().then((list) => {
          for (const a of list) if (!anchors.some((x) => x.publicKeyHex === a.publicKeyHex)) anchors.push(a);
          saveAnchors(); renderAnchors(); rerun(); anchorMsg.textContent = `Loaded ${String(list.length)} anchor(s) (document signatures not yet verified — preview).`;
        }, (e: unknown) => { anchorMsg.textContent = `Not available yet: ${e instanceof Error ? e.message : String(e)}`; anchorMsg.className = 'note err'; });
      } }, 'Load crawcus.org anchors (preview)'),
      h('button', { class: 'ghost sm', onclick: () => { anchors = [SAMPLE_ANCHOR]; saveAnchors(); renderAnchors(); rerun(); } }, 'reset')),
    h('div', { class: 'notice' }, h('b', {}, 'NOTE'), 'The official crawcus trust-anchor list is not published yet. The pre-pinned key is a DEMO/TEST key that only signs the sample receipts — it identifies no real signer.'),
    h('div', { class: 'note' }, 'Planned source: ', h('code', {}, WELL_KNOWN_TRUST_ANCHORS_URL)),
    anchorMsg);
}

// ---------- result rendering ----------
function decodeEnvelope(bytes: Uint8Array): { envelope: unknown; bundle: Record<string, unknown> | null } {
  try {
    const env = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
    if (typeof env['payload'] === 'string') {
      const b = JSON.parse(new TextDecoder().decode(base64ToBytes(env['payload']))) as Record<string, unknown>;
      return { envelope: env, bundle: b };
    }
    return { envelope: null, bundle: Array.isArray(env['events']) ? env : null };
  } catch { return { envelope: null, bundle: null }; }
}
const WORD = { pass: 'PASS', fail: 'FAIL', 'historical-unverifiable': 'HISTORICAL · UNVERIFIABLE' };

function card(k: string, v: Child, sub?: Child, copy?: string, big = false): HTMLElement {
  return h('div', { class: 'card' }, h('div', { class: 'k' }, k, copy ? copyBtn(copy) : null), h('div', { class: big ? 'v big' : 'v' }, v), sub ? h('div', { class: 's' }, sub) : null);
}
function fmtTs(s: string): string { return s ? s.replace('T', ' ').replace(/\.\d+Z$|Z$/, 'Z') : '—'; }
function span(a: string, b: string): string {
  const ms = Date.parse(b) - Date.parse(a); if (!Number.isFinite(ms) || ms < 0) return '';
  const m = Math.round(ms / 60000); return m < 60 ? `${String(m)} min span` : `${(m / 60).toFixed(1)} h span`;
}

function renderResult(r: VerifyResultV1, bytes: Uint8Array): void {
  const { envelope, bundle } = decodeEnvelope(bytes);
  const events = bundle && Array.isArray(bundle['events']) ? (bundle['events'] as unknown[]) : [];
  const report = { ...r, source: { fileName: lastName } };
  const download = (): void => {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `crawcus-verify-report-${r.input.sha256.slice(0, 12)}.json` });
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const failed = r.checks.filter((c) => c.verdict === 'fail').length;
  const passed = r.checks.filter((c) => c.verdict === 'pass').length;

  const verdict = h('section', { class: `verdict ${r.verdict}`, id: 'verdict' },
    h('div', { class: 'actions' }, h('button', { class: 'sm', onclick: download }, '↓ export report'), copyBtn(JSON.stringify(report, null, 2), 'copy JSON')),
    h('div', { class: 'head' }, h('div', { class: 'icon' }, svg(ICON[r.verdict], 32)),
      h('div', {}, h('div', { class: 'word' }, WORD[r.verdict]), h('div', { class: 'reason' }, r.reason))),
    h('div', { class: 'meta' },
      h('span', {}, h('b', {}, 'file'), lastName),
      h('span', {}, h('b', {}, 'input sha256'), short(r.input.sha256, 8)),
      h('span', {}, h('b', {}, 'checks'), `${String(passed)} pass · ${String(failed)} fail`),
      h('span', {}, h('b', {}, 'verified'), fmtTs(r.verifiedAt)),
      h('span', {}, h('b', {}, 'schema'), r.schema)));
  const disclaimer = h('p', { class: 'disclaimer', role: 'note' }, DISCLAIMER, ' ', h('a', { href: './terms' }, 'Terms'));

  const trustPill = r.signer
    ? h('span', { class: `pill ${r.signer.trust === 'trusted' ? 'ok' : r.signer.trust === 'untrusted' ? 'bad' : 'warn'}` },
        r.signer.trust === 'trusted' ? `trusted · ${r.signer.anchorLabel ?? ''}` : r.signer.trust === 'untrusted' ? 'not trusted' : 'no anchors pinned')
    : h('span', { class: 'pill bad' }, 'unsigned');
  const b = r.bundle;
  const cards = h('div', { class: 'cards' },
    card('Signer key id', r.signer ? short(r.signer.keyId, 14) : '—', trustPill, r.signer?.keyId),
    card('Fingerprint', r.signer?.fingerprint ? short(r.signer.fingerprint, 16) : '—', 'sha256 of raw public key', r.signer?.fingerprint || undefined),
    card('Algorithm', r.signer ? 'ed25519' : '—', r.envelope ? `DSSEv1 · ${String(r.envelope.signatureCount)} signature(s)` : 'no envelope'),
    card('Payload type', r.envelope?.payloadType ?? '—', r.envelope ? `${r.envelope.payloadByteLength.toLocaleString()} bytes` : undefined, r.envelope?.payloadType),
    card('Bundle self-hash', b?.selfHash ? short(b.selfHash, 14) : '—', b?.selfHash ? 'chainProof.bundleSelfHash (RFC 8785 + SHA-256)' : 'not present in bundle', b?.selfHash || undefined),
    card('Rows', b ? String(b.rowCount) : '—', b ? `${String(b.contractCount)} contract result(s)` : undefined, undefined, true),
    card('Time range', b?.timeRange.earliest ? h('span', {}, fmtTs(b.timeRange.earliest), h('br'), '→ ', fmtTs(b.timeRange.latest)) : '—', b ? span(b.timeRange.earliest, b.timeRange.latest) : undefined),
    card('Regulations referenced', b && b.regulations.length ? h('div', {}, ...b.regulations.map((x) => h('span', { class: 'pill' }, x))) : '—'),
    card('Payload sha256', r.envelope ? short(r.envelope.payloadSha256, 14) : '—', 'decoded DSSE payload bytes', r.envelope?.payloadSha256));

  const checks = h('div', { class: 'checks' }, ...r.checks.map((c) => h('div', { class: `check ${c.verdict}` },
    h('div', {}, h('span', { class: `pill ${c.verdict === 'pass' ? 'ok' : c.verdict === 'fail' ? 'bad' : c.verdict === 'skipped' ? 'mute' : 'warn'}` }, c.verdict)),
    h('div', { style: 'min-width:0' },
      h('div', {}, h('span', { class: 'lbl' }, c.label), ' ', h('span', { class: 'id' }, c.id), c.source === 'app' ? h('span', { class: 'pill mute', style: 'margin-left:6px' }, 'app') : null),
      h('div', { class: 'det' }, c.detail), c.violationKind ? h('div', { class: 'det', style: 'color:var(--bad)' }, `violation: ${c.violationKind}`) : null))));

  const brokenCount = r.chain.links.filter((l) => l.status === 'broken').length;
  const timeline = h('div', { class: 'tl' }, ...r.chain.links.map((l) => linkRow(l, events[l.index])));

  resultHost.replaceChildren(verdict, disclaimer,
    h('h2', {}, 'Summary'), cards,
    h('h2', {}, `Checks performed · ${String(r.checks.length)}`), checks,
    h('h2', {}, `Hash-chain timeline · ${String(r.chain.links.length)} rows`),
    h('div', { class: 'legend' },
      h('span', {}, h('span', { class: 'dot ok' }), 'hash recomputed & linked'),
      h('span', {}, h('span', { class: 'dot bad' }), `broken link${brokenCount ? ` (${String(brokenCount)})` : ''}`),
      h('span', {}, h('span', { class: 'dot', style: 'background:var(--mute)' }), 'downstream of a break')),
    r.chain.links.length ? timeline : h('div', { class: 'empty' }, 'No rows to display.'),
    h('h2', {}, 'Raw'),
    h('div', { class: 'panel' },
      envelope ? expander('DSSE envelope', envelope) : null,
      bundle ? expander('Decoded payload (bundle)', bundle) : null,
      expander(`Result · ${r.schema}`, report)));
}

function linkRow(l: ChainLinkV1, raw: unknown): HTMLElement {
  const hv = (v: string | null, good: boolean): HTMLElement => h('span', { class: `hv ${good ? 'good' : 'bad'}`, title: v ?? 'null' }, v ?? 'null (genesis)');
  return h('div', { class: `tlrow ${l.status}`, id: `row-${String(l.index)}` },
    h('div', { class: 'rail' }, h('div', { class: 'node' }, String(l.index))),
    h('div', { class: 'ev' },
      h('div', { class: 'top' }, h('span', { class: 'kind' }, l.kind || 'row'), h('span', { class: 'eid' }, l.id), h('span', { class: 'ts' }, fmtTs(l.timestamp)),
        l.status === 'broken' ? h('span', { class: 'pill bad' }, 'BROKEN LINK') : l.status === 'after-break' ? h('span', { class: 'pill mute' }, 'after break') : h('span', { class: 'pill ok' }, 'ok')),
      h('div', { class: 'links' },
        h('span', { class: 'lk' }, 'content_hash'), hv(l.contentHash, l.contentHashOk), copyBtn(l.contentHash),
        h('span', { class: 'lk' }, '→ prev_hash'), hv(l.prevHash, l.prevLinkOk), copyBtn(l.prevHash ?? 'null')),
      l.status === 'broken' ? h('div', { class: 'broke' },
        !l.contentHashOk ? h('div', {}, `recorded   ${l.contentHash}`) : null,
        !l.contentHashOk ? h('div', {}, `recomputed ${l.recomputedHash || '(row not hashable)'}`) : null,
        !l.contentHashOk ? h('div', { style: 'color:var(--dim)' }, 'This row\u2019s contents were changed after its hash was recorded.') : null,
        !l.prevLinkOk ? h('div', {}, `prev_hash points to ${l.prevHash ?? 'null'}, expected ${l.expectedPrevHash ?? 'null'}`) : null) : null,
      expander('raw row JSON', raw)));
}

function themeSwitch(): HTMLElement {
  const wrap = h('div', { class: 'theme', role: 'group', 'aria-label': 'Color theme' });
  const opts: [Theme, string][] = [['light', 'Light'], ['dark', 'Dark'], ['system', 'System']];
  const paint = (): void => wrap.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset['t'] === theme)));
  for (const [t, label] of opts) {
    const b = h('button', { 'data-t': t, onclick: () => {
      theme = t; saveTheme(t);
      applyTheme(t); paint();
    } }, label);
    wrap.append(b);
  }
  paint();
  return wrap;
}

// ---------- shell ----------
app.append(h('div', { class: 'wrap' },
  h('header', { class: 'top' },
    h('div', { class: 'brand' }, h('div', { class: 'mark' }, svg(ICON.pass, 16)), h('b', {}, 'crawcus'), h('span', {}, 'verify')),
    h('div', { class: 'hdr-r' }, h('span', { class: 'badge' }, h('i'), 'Everything runs in your browser; nothing is uploaded.'), themeSwitch())),
  h('div', { class: 'grid2' }, inputPanel(), h('div', {}, samplesPanel(), trustPanel())),
  resultHost,
  h('footer', {},
    h('p', { class: 'disclaimer foot' }, DISCLAIMER),
    h('span', {}, 'crawcus verify · DSSE + RFC 8785 + SHA-256 hash chain · ed25519'),
    h('span', { class: 'flinks' }, h('a', { href: './terms' }, 'Terms & Privacy'), h('a', { href: 'https://crawcus.org', rel: 'noopener' }, 'crawcus.org')))));
resultHost.append(h('div', { class: 'empty' }, 'Drop a bundle or pick a sample to see a full verification report.'));

// Deep link for demos/screenshots: #sample=good|tampered|untrusted|cosign
const m = /sample=(\w+)/.exec(location.hash);
const pick: Record<string, string> = { good: goodRaw, tampered: tamperedRaw, untrusted: untrustedRaw, cosign: cosignRaw };
if (m?.[1] && pick[m[1]]) run(enc(pick[m[1]]), `${m[1]}.dsse.json`);
