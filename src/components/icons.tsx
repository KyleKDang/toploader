import type { SVGProps } from 'react';

/*
 * The icon set, traced from the chosen mockups.
 *
 * Every icon is a 24x24 line drawing that inherits `currentColor` and the
 * stroke weight set on `svg` in global.css, so an icon is always the color of
 * the text beside it and never needs its own token.
 *
 * Icons are sized by font-size at the call site (`text-...`), which is how the
 * design system states tab icon and badge icon sizes.
 */

type IconProps = Omit<SVGProps<SVGSVGElement>, 'viewBox' | 'children'>;

function Icon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      width="1em"
      height="1em"
      {...props}
    />
  );
}

export function MatchesIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 7h11m0 0-3-3m3 3-3 3M20 17H9m0 0 3 3m-3-3 3-3" />
    </Icon>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </Icon>
  );
}

export function TradesIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 10h18" />
    </Icon>
  );
}

export function ProfileIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6" />
    </Icon>
  );
}

export function ShieldIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3 4.5 6v5.5c0 4.6 3.2 8 7.5 9.5 4.3-1.5 7.5-4.9 7.5-9.5V6L12 3Z" />
      <path d="m9 12 2 2 4-4" />
    </Icon>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M15 5 8 12l7 7" />
    </Icon>
  );
}

export function MinusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 12h14" />
    </Icon>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </Icon>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m6 9 6 6 6-6" />
    </Icon>
  );
}

/** Taking a photo of the Copy, on the button that opens the camera. */
export function CameraIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 8.5h3.5L8 6h8l1.5 2.5H21v10H3z" />
      <circle cx="12" cy="13" r="3.5" />
    </Icon>
  );
}
