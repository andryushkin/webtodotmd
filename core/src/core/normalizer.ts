export function normalize(raw: string): string {
  return (
    raw
      .replace(/\u00A0/g, ' ') // &nbsp; → обычный пробел
      .replace(/[ \t]+$/gm, '') // trailing spaces per line
      .replace(/\n{3,}/g, '\n\n') // 3+ newlines → 2
      .replace(/^\n+/, '') // убрать leading newlines
      .trimEnd() + '\n' // единственный завершающий \n
  );
}
