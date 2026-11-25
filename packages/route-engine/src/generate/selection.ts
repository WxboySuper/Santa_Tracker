export function compareStableIds(left: string, right: string): number {
  const leftMatch = /^(\D*)(\d+)$/.exec(left);
  const rightMatch = /^(\D*)(\d+)$/.exec(right);
  if (leftMatch && rightMatch) {
    const prefixOrder = (leftMatch[1] ?? '').localeCompare(rightMatch[1] ?? '');
    if (prefixOrder !== 0) return prefixOrder;
    const numericOrder = Number(leftMatch[2]) - Number(rightMatch[2]);
    if (numericOrder !== 0) return numericOrder;
  }
  return left.localeCompare(right);
}
