export function extractFlankingWhitespace(content: string): {
  leading: string;
  trimmed: string;
  trailing: string;
} {
  const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(content);
  return {
    leading: match?.[1] ?? '',
    trimmed: match?.[2] ?? '',
    trailing: match?.[3] ?? '',
  };
}
