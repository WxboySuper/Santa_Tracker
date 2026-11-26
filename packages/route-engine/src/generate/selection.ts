const STABLE_ID_COLLATOR = new Intl.Collator('en-US', {
  usage: 'sort',
  sensitivity: 'variant',
  numeric: false,
  ignorePunctuation: false,
});

export function compareStableIds(left: string, right: string): number {
  return STABLE_ID_COLLATOR.compare(left, right);
}
