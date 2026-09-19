/*
 * How prices and the days they are from read on screen.
 */

const DOLLARS = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

/** A Market Price held in cents, as "$1,240.50". */
export function formatPrice(cents: number): string {
  return DOLLARS.format(cents / 100);
}

const DAY = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

/**
 * A calendar day the database holds as "2026-09-19", as "Sep 19, 2026". Read
 * as UTC and shown as UTC, so no Trader's time zone moves it a day.
 */
export function formatDay(day: string): string {
  return DAY.format(new Date(`${day}T00:00:00Z`));
}
