/*
 * The shared component layer.
 *
 * Every screen imports its primitives from here and re-declares none of them.
 * A ticket that needs a primitive the design system names but this file does
 * not export builds it here once, and every later ticket imports it.
 */

export { AppShell } from './AppShell';
export { Badge, ReputationPill } from './Badge';
export { BottomTabBar } from './BottomTabBar';
export type { TabKey } from './BottomTabBar';
export { Button } from './Button';
export { Disclaimer } from './Disclaimer';
export { EmptyState } from './EmptyState';
export { ListRow } from './ListRow';
export { TextInput } from './TextInput';

export {
  MatchesIcon,
  PlusIcon,
  ProfileIcon,
  SearchIcon,
  ShieldIcon,
  TradesIcon,
} from './icons';
