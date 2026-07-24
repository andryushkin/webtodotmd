// Lucide-style SVG icons (24x24 viewBox, stroke-based)
// Only the icons used in to .md Side Panel

const PATHS: Record<string, string> = {
  crosshair:
    '<circle cx="12" cy="12" r="10"/>' +
    '<line x1="22" y1="12" x2="18" y2="12"/>' +
    '<line x1="6" y1="12" x2="2" y2="12"/>' +
    '<line x1="12" y1="6" x2="12" y2="2"/>' +
    '<line x1="12" y1="22" x2="12" y2="18"/>',

  copy:
    '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>' +
    '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',

  check: '<polyline points="20 6 9 17 4 12"/>',

  download:
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>' +
    '<polyline points="7 10 12 15 17 10"/>' +
    '<line x1="12" y1="15" x2="12" y2="3"/>',

  trash:
    '<polyline points="3 6 5 6 21 6"/>' +
    '<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',

  fileText:
    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>' +
    '<polyline points="14 2 14 8 20 8"/>' +
    '<line x1="16" y1="13" x2="8" y2="13"/>' +
    '<line x1="16" y1="17" x2="8" y2="17"/>' +
    '<polyline points="10 9 9 9 8 9"/>',

  eye:
    '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>' +
    '<circle cx="12" cy="12" r="3"/>',

  code:
    '<polyline points="16 18 22 12 16 6"/>' +
    '<polyline points="8 6 2 12 8 18"/>',

  plus:
    '<line x1="12" y1="5" x2="12" y2="19"/>' +
    '<line x1="5" y1="12" x2="19" y2="12"/>',

  refreshCw:
    '<polyline points="23 4 23 10 17 10"/>' +
    '<polyline points="1 20 1 14 7 14"/>' +
    '<path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',

  x:
    '<line x1="18" y1="6" x2="6" y2="18"/>' +
    '<line x1="6" y1="6" x2="18" y2="18"/>',

  highlighter:
    '<path d="m9 11-6 6v3h9l3-3"/>' +
    '<path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>',

  settings:
    '<line x1="4" x2="4" y1="21" y2="14"/>' +
    '<line x1="4" x2="4" y1="10" y2="3"/>' +
    '<line x1="12" x2="12" y1="21" y2="12"/>' +
    '<line x1="12" x2="12" y1="8" y2="3"/>' +
    '<line x1="20" x2="20" y1="21" y2="16"/>' +
    '<line x1="20" x2="20" y1="12" y2="3"/>' +
    '<line x1="2" x2="6" y1="14" y2="14"/>' +
    '<line x1="10" x2="14" y1="8" y2="8"/>' +
    '<line x1="18" x2="22" y1="16" y2="16"/>',

  eraser:
    '<path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/>' +
    '<path d="M22 21H7"/>' +
    '<path d="m5 11 9 9"/>',

  undo:
    '<path d="M9 14 4 9l5-5"/>' +
    '<path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11"/>',

  redo:
    '<path d="m15 14 5-5-5-5"/>' +
    '<path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5v0A5.5 5.5 0 0 0 9.5 20H13"/>',

  alertTriangle:
    '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>' +
    '<path d="M12 9v4"/>' +
    '<path d="M12 17h.01"/>',

  link:
    '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>' +
    '<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',

  chevronDown:
    '<polyline points="6 9 12 15 18 9"/>',

  send:
    '<path d="m22 2-7 20-4-9-9-4Z"/>' +
    '<path d="M22 2 11 13"/>',

  calendar:
    '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>' +
    '<line x1="16" y1="2" x2="16" y2="6"/>' +
    '<line x1="8" y1="2" x2="8" y2="6"/>' +
    '<line x1="3" y1="10" x2="21" y2="10"/>',
};

export function icon(name: string, size = 14): string {
  const paths = PATHS[name] ?? '';
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

export function setButtonContent(btn: HTMLButtonElement, iconName: string, label: string, size?: number): void {
  btn.innerHTML = icon(iconName, size) + `<span class="btn-label">${label}</span>`;
}
