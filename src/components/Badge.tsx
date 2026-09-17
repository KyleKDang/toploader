import type { ReactNode } from 'react';
import { cx } from '../lib/cx';
import { ShieldIcon } from './icons';

/*
 * Badge, and the Reputation pill built on it.
 *
 * --radius-full, --text-xs bold, 3px by 9px padding.
 *
 * A badge never appears without its word. "Verified" and "go" being the same
 * color is a help rather than a collision, but the color is never the signal
 * on its own - a Trader who cannot separate the two hues reads the shield and
 * the word instead.
 */

type BadgeProps = {
  /** Verified carries the ok pair; neutral is the muted, unverified look. */
  tone?: 'verified' | 'neutral';
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function Badge({
  tone = 'neutral',
  icon,
  children,
  className,
}: BadgeProps) {
  return (
    <span
      className={cx(
        'inline-flex w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded-full',
        'px-2.25 py-0.75 text-xs font-bold',
        tone === 'verified'
          ? 'bg-ok-bg text-ok-ink'
          : 'bg-surface-2 text-muted',
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

type ReputationPillProps = {
  /** Whether this Trader has passed the founder ID review. */
  verified: boolean;
  /** Completed Trades. The count is public on every Trader. */
  trades: number;
  className?: string;
};

/**
 * A Trader's Reputation at a glance, as it rides the third line of a list row:
 * their verification state and their completed Trade count, in words.
 */
export function ReputationPill({
  verified,
  trades,
  className,
}: ReputationPillProps) {
  const count = `${trades} ${trades === 1 ? 'Trade' : 'Trades'}`;

  return (
    <Badge
      tone={verified ? 'verified' : 'neutral'}
      icon={verified ? <ShieldIcon /> : undefined}
      className={className}
    >
      {verified ? 'Verified' : 'Not verified'} · {count}
    </Badge>
  );
}
