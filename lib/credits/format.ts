/** Integer credit display — no decimals. */
export function formatCredits(amount: number): string {
  return new Intl.NumberFormat("en-US").format(amount);
}
