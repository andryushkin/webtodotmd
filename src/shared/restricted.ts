const RESTRICTED_PATTERNS = [
  /^chrome:\/\//,
  /^chrome-extension:\/\//,
  /^file:\/\//,
  /^about:/,
  /^data:/,
];

export function isRestrictedUrl(url: string): boolean {
  return RESTRICTED_PATTERNS.some(pattern => pattern.test(url));
}
