import * as Sentry from '@sentry/react';

/*
 * Error monitoring for the deployed build (ADR-0006). Only a build given a
 * DSN reports, which is the Render build; local dev and CI never send
 * anything to the production Sentry project. The Playwright tracer's build
 * gets a fake DSN on its own preview server, so its envelopes never leave
 * the machine.
 *
 * Errors only, no tracing or replays: the free Developer plan's 5,000
 * errors/month is the one quota that matters, and nothing here spends it on
 * anything else.
 */
const dsn = import.meta.env.VITE_SENTRY_DSN;

if (dsn) Sentry.init({ dsn });

/** Reports an error the app caught itself and so the browser never saw. */
export function reportError(error: unknown) {
  Sentry.captureException(error);
}

/** React's root error hooks, so errors React swallows still get reported. */
export const reactRootErrorHandlers = {
  onUncaughtError: Sentry.reactErrorHandler(),
  onCaughtError: Sentry.reactErrorHandler(),
  onRecoverableError: Sentry.reactErrorHandler(),
};
