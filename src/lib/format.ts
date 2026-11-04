// String formatting preserves cents even when simulated balances exceed Number precision.
export function formatMoney(value: string, signed = false): string {
  const negative = value.startsWith('-');
  const [whole, fraction = '00'] = value.replace(/^-/, '').split('.');
  const nonzero = /[1-9]/.test(value);
  return `${negative ? '−' : signed && nonzero ? '+' : ''}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction.padEnd(2, '0')}`;
}

export function compactAmount(value: number) {
  const absolute = Math.abs(value);
  if (absolute >= 1e12) return `${(value / 1e12).toPrecision(3)}万亿`;
  if (absolute >= 1e8) return `${Number((value / 1e8).toFixed(1))}亿`;
  if (absolute >= 1e4) return `${Number((value / 1e4).toFixed(1))}万`;
  return String(Number(value.toFixed(2)));
}
