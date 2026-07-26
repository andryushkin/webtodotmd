import type { Rule, MarkItDownOptions } from '../types.js';
import { extractFlankingWhitespace } from '../utils/flanking.js';

function wrap(content: string, before: string, after: string): string {
  const { leading, trimmed, trailing } = extractFlankingWhitespace(content);
  if (!trimmed) return content;
  return `${leading}${before}${trimmed}${after}${trailing}`;
}

function resolveUrl(url: string, baseUrl?: string): string {
  if (!baseUrl || url.startsWith('http') || url.startsWith('//') || url.startsWith('data:')) {
    return url;
  }
  try {
    return new URL(url, baseUrl).href;
  } catch {
    return url;
  }
}

function isPlaceholder(src: string): boolean {
  return (
    src.startsWith('data:image/') ||
    /placeholder|spacer|1x1|blank|loading/i.test(src) ||
    (src.length < 50 && src.startsWith('data:'))
  );
}

function parseSrcset(srcset: string): string {
  const candidates = srcset
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  let bestUrl = '';
  let bestValue = -1;
  for (const candidate of candidates) {
    const parts = candidate.split(/\s+/);
    const url = parts[0] ?? '';
    const descriptor = parts[1] ?? '';
    const value = descriptor ? parseFloat(descriptor) : 1;
    if (value > bestValue) {
      bestValue = value;
      bestUrl = url;
    }
  }
  return bestUrl;
}

function extractImageUrl(img: Element): string {
  // 1. data-src варианты (lazy-load)
  const lazySrc =
    img.getAttribute('data-src') ||
    img.getAttribute('data-original') ||
    img.getAttribute('data-lazy-src') ||
    img.getAttribute('data-full-src') ||
    img.getAttribute('data-hi-res-src');
  if (lazySrc) return lazySrc;

  // 2. srcset — выбрать максимальное разрешение
  const srcset = img.getAttribute('data-srcset') || img.getAttribute('srcset');
  if (srcset) {
    const best = parseSrcset(srcset);
    if (best) return best;
  }

  // 3. src — проверить что не placeholder
  const src = img.getAttribute('src') || '';
  if (src && !isPlaceholder(src)) return src;

  // 4. noscript fallback — src из соседнего <noscript> (сохранён санитайзером в data-noscript-src)
  const noscriptSrc = img.getAttribute('data-noscript-src');
  if (noscriptSrc) return noscriptSrc;

  return src;
}

export const INLINE_RULES: Rule[] = [
  {
    name: 'bold',
    filter: ['strong', 'b'],
    replacement: (_el, childContent) => wrap(childContent, '**', '**'),
  },
  {
    name: 'italic',
    filter: ['em', 'i'],
    replacement: (_el, childContent) => wrap(childContent, '_', '_'),
  },
  {
    name: 'strikethrough',
    filter: ['del', 's'],
    replacement: (_el, childContent) => wrap(childContent, '~~', '~~'),
  },
  {
    name: 'subscript',
    filter: 'sub',
    replacement: (_el, childContent) => `<sub>${childContent}</sub>`,
  },
  {
    name: 'superscript',
    filter: 'sup',
    replacement: (_el, childContent) => `<sup>${childContent}</sup>`,
  },
  {
    name: 'inline-code',
    filter: (el) =>
      el.tagName.toLowerCase() === 'code' && el.parentElement?.tagName.toLowerCase() !== 'pre',
    replacement: (_el, childContent) => {
      const { leading, trimmed, trailing } = extractFlankingWhitespace(childContent);
      if (!trimmed) return childContent;
      // Если внутри есть бэктики — использовать двойные + пробелы §6.6
      const hasBacktick = trimmed.includes('`');
      const delim = hasBacktick ? '``' : '`';
      const inner = hasBacktick ? ` ${trimmed} ` : trimmed;
      return `${leading}${delim}${inner}${delim}${trailing}`;
    },
  },
  {
    name: 'link',
    filter: (el) => el.tagName.toLowerCase() === 'a' && el.hasAttribute('href'),
    replacement: (el, childContent, options: MarkItDownOptions) => {
      const href = resolveUrl(el.getAttribute('href') ?? '', options.baseUrl);
      const { leading, trimmed, trailing } = extractFlankingWhitespace(childContent);
      if (!trimmed) return childContent;
      return `${leading}[${trimmed}](${href})${trailing}`;
    },
  },
  {
    name: 'source',
    filter: 'source',
    replacement: () => '',
  },
  {
    name: 'picture',
    filter: 'picture',
    replacement: (_el, childContent) => childContent.trim(),
  },
  {
    name: 'image',
    filter: 'img',
    replacement: (el, _childContent, options: MarkItDownOptions) => {
      const src = resolveUrl(extractImageUrl(el), options.baseUrl);
      const alt = (el.getAttribute('alt') ?? '').replace(/[\n\r]+/g, ' ').trim();
      if (!src) return alt || '';
      const title = el.getAttribute('title');
      const urlPart = title ? `${src} '${title}'` : src;
      return `![${alt}](${urlPart})`;
    },
  },
];
