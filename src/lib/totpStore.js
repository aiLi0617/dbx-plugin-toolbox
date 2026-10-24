/** URI labels never include query parameters (which contain the secret). */
export function totpLabels(input) {
  if (!/^otpauth:\/\//i.test(String(input).trim())) return { issuer: '', account: '' };
  try {
    const url = new URL(String(input).trim());
    if (url.hostname.toLowerCase() !== 'totp') return { issuer: '', account: '' };
    const label = decodeURIComponent(url.pathname.replace(/^\//, ''));
    const colon = label.indexOf(':');
    return {
      issuer: url.searchParams.get('issuer') || (colon >= 0 ? label.slice(0, colon) : ''),
      account: colon >= 0 ? label.slice(colon + 1) : label,
    };
  } catch { return { issuer: '', account: '' }; }
}
