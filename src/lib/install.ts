import { useSyncExternalStore } from 'react';
import { canOfferPush, enablePush } from './push';

/*
 * The install step, Onboarding's step 2: the one moment the app asks to be
 * installed and to send alerts, on a tap, and never again once the Trader has
 * answered or skipped it (the spec's Primary user flows; ADR-0002).
 *
 * What it offers depends on where the app is running:
 *
 * - iOS, in the browser: Add to Home Screen instructions. iOS has no install
 *   prompt, and push works there only for an app on the home screen.
 * - Anywhere the browser offers to install (Chrome's `beforeinstallprompt`):
 *   its install prompt, with the push permission asked on the same tap.
 * - Otherwise, where push works and the browser has not been asked yet -
 *   including the app already installed on an iPhone - the permission alone.
 *
 * Done is remembered per browser, not per Trader, because what it offers is
 * the browser's: whether this browser installed the app and allows alerts.
 * An app on an iPhone's home screen keeps storage of its own, so it has not
 * seen the step, and gets it again - which is where an iPhone can finally be
 * asked for alerts.
 */

const STEP_DONE_KEY = 'toploader:install-step-done';

/** Chrome's event, which TypeScript's DOM types do not name. */
type InstallPromptEvent = Event & {
  prompt(): Promise<unknown>;
};

let installPrompt: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();

/**
 * Holds on to the browser's offer to install, for the install step to use.
 * Called once, as the app starts: the browser can make the offer before any
 * screen has rendered.
 */
export function listenForInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Keeps the browser's own install banner away: the install step is where
    // the offer is made, on the Trader's tap.
    event.preventDefault();
    installPrompt = event as InstallPromptEvent;
    changed();
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    changed();
  });
}

export type InstallOffer = 'add-to-home-screen' | 'install' | 'alerts';

/** What the install step would offer on this browser now, if anything. */
export function installOffer(): InstallOffer | null {
  if (isIos() && !isInstalled()) return 'add-to-home-screen';
  if (installPrompt) return 'install';
  if (canOfferPush()) return 'alerts';
  return null;
}

/** The offer, kept current as the browser's install prompt comes and goes. */
export function useInstallOffer(): InstallOffer | null {
  return useSyncExternalStore(subscribe, installOffer);
}

/** Whether the Trader should be taken through the install step. */
export function installStepDue(): boolean {
  return (
    localStorage.getItem(STEP_DONE_KEY) === null && installOffer() !== null
  );
}

/** Records the step as done on this browser, answered or skipped. */
export function finishInstallStep(): void {
  localStorage.setItem(STEP_DONE_KEY, '1');
}

/**
 * On the Trader's tap: the browser's install prompt where it has one, and
 * the push permission. Both are asked before anything is awaited, because a
 * browser grants a prompt only while the tap is fresh, and waiting on the
 * Trader's answer to the first would spend it.
 */
export async function installWithAlerts(): Promise<void> {
  const installing = installPrompt?.prompt();
  const alerts = enablePush();
  await Promise.all([installing, alerts]);
}

function isIos(): boolean {
  // iPadOS asks for desktop sites, so an iPad says it is a Mac, with touch.
  return (
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
  );
}

/** Running from the home screen, rather than in a browser tab. */
function isInstalled(): boolean {
  return (
    matchMedia('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true
  );
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function changed() {
  for (const listener of listeners) listener();
}
