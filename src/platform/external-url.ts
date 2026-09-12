const HTTPS_HOSTS = new Set(['github.com', 'tronscan.org']);

export function assertAllowedExternalUrl(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('EXTERNAL_URL_NOT_ALLOWED'); }
  if (url.username || url.password) throw new Error('EXTERNAL_URL_NOT_ALLOWED');
  if (url.protocol === 'mailto:' && url.pathname.toLowerCase() === 'ilya_encryptme@proton.me') return url.toString();
  if (url.protocol === 'https:' && HTTPS_HOSTS.has(url.hostname.toLowerCase())) return url.toString();
  throw new Error('EXTERNAL_URL_NOT_ALLOWED');
}
