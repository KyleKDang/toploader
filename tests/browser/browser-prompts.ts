import type { Page } from '@playwright/test';

/*
 * The two prompts the install step triggers belong to the browser, not the
 * app: the install dialog behind `beforeinstallprompt`, and the notification
 * permission prompt. A headless browser shows neither - it never offers an
 * install, and it answers a permission request on its own - so a tracer
 * fakes both at that edge and records when the app asks for them.
 *
 * The permission fake answers "denied", so the app goes no further than the
 * ask: subscribing is the push service's business, proven at seam 2.
 */

type Recorder = { __browserPrompts: string[] };

/** Fakes the permission prompt, before any of the app's code runs. */
export async function fakeBrowserPrompts(page: Page) {
  await page.addInitScript(() => {
    const prompts: string[] = [];
    (window as unknown as Recorder).__browserPrompts = prompts;
    Object.defineProperty(Notification, 'permission', {
      get: () => 'default',
    });
    Notification.requestPermission = () => {
      prompts.push('notifications');
      return Promise.resolve('denied');
    };
  });
}

/** The browser offering to install the app, as Chrome does once it can. */
export async function offerInstall(page: Page) {
  await page.evaluate(() => {
    const prompts = (window as unknown as Recorder).__browserPrompts;
    const event = new Event('beforeinstallprompt', { cancelable: true });
    Object.assign(event, {
      prompt: () => {
        prompts.push('install');
        return Promise.resolve({ outcome: 'accepted' });
      },
      userChoice: Promise.resolve({ outcome: 'accepted', platform: 'web' }),
    });
    window.dispatchEvent(event);
  });
}

/** Which prompts the app has asked the browser for, in order. */
export function browserPrompts(page: Page) {
  return page.evaluate(() => (window as unknown as Recorder).__browserPrompts);
}
