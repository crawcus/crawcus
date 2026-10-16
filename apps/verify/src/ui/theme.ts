export type Theme = 'light' | 'dark' | 'system';
const THEME_KEY = 'crawcus-verify.theme';
export function applyTheme(t: Theme): void {
  if (t === 'system') delete document.documentElement.dataset['theme'];
  else document.documentElement.dataset['theme'] = t;
}
export function loadTheme(): Theme {
  const v = localStorage.getItem(THEME_KEY);
  return v === 'light' || v === 'dark' ? v : 'system';
}
export function saveTheme(t: Theme): void {
  if (t === 'system') localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, t);
}
export const DISCLAIMER =
  'crawcus verify checks cryptographic integrity and signatures only. A pass does not certify that the contents are true, lawful, or complete, and is not legal, regulatory, or compliance advice. Demo keys identify no real signer.';
