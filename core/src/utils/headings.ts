/**
 * Вычисляет смещение заголовков так, чтобы минимальный уровень в DOM стал h1.
 * Используется в selectionToMarkdown (Phase 8).
 *
 * Пример: фрагмент содержит h2, h3, h4 → offset = -1
 *   h2 + (-1) = 1 → #
 *   h3 + (-1) = 2 → ##
 */
export function computeHeadingOffset(root: Element | Document): number {
  const headings = Array.from((root as Element).querySelectorAll?.('h1,h2,h3,h4,h5,h6') ?? []);
  let minLevel = 7;
  for (const el of headings) {
    const level = Number(el.tagName[1]);
    if (level < minLevel) minLevel = level;
  }
  return minLevel === 7 ? 0 : 1 - minLevel; // сдвинуть минимум до 1
}
