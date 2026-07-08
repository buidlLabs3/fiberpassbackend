export function utcTimeLabel(date = new Date()): string {
  return date.toUTCString().replace(/.*(\d{2}:\d{2}:\d{2}).*/, '$1 UTC');
}

export function roundMoney(value: number): number {
  return Number(value.toFixed(3));
}
