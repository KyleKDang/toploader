import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { AppShell, Button, ShareIcon, TopBar } from '../components';
import {
  finishInstallStep,
  installWithAlerts,
  useInstallOffer,
} from '../lib/install';
import { canOfferPush } from '../lib/push';

/*
 * The install step, between setting up the profile and landing on Matches.
 * What it offers, and why it differs by platform, is src/lib/install.ts.
 *
 * Every version of it can be skipped, and leaving it by either button is
 * final on this browser: a browser remembers a no to the permission prompt,
 * and a step that kept coming back would be nagging.
 */

export function InstallScreen() {
  const offer = useInstallOffer();
  const navigate = useNavigate();
  const [asking, setAsking] = useState(false);

  function leave() {
    finishInstallStep();
    void navigate({ to: '/', replace: true });
  }

  // Nothing left to offer, as when the app was installed from the browser's
  // own menu while this screen was open.
  useEffect(() => {
    if (offer !== null) return;
    finishInstallStep();
    void navigate({ to: '/', replace: true });
  }, [offer, navigate]);

  function ask() {
    setAsking(true);
    // Asked or refused, the step is done either way.
    void installWithAlerts().finally(leave);
  }

  const skip = (
    <div className="flex">
      <Button onClick={leave} disabled={asking}>
        Skip for now
      </Button>
    </div>
  );

  if (offer === 'add-to-home-screen') {
    return (
      <AppShell header={<TopBar title="Install to get trade alerts" />}>
        <div className="flex flex-col gap-4 p-4">
          <p className="text-base leading-prose text-ink">
            On iPhone, Toploader can alert you to a new match or trade proposal
            only once it is on your home screen.
          </p>
          <ol className="flex list-decimal flex-col gap-2 pl-6 text-base leading-prose text-ink">
            <li>
              Tap the Share button{' '}
              <ShareIcon className="inline align-text-bottom" /> in your
              browser.
            </li>
            <li>
              Choose <strong>Add to Home Screen</strong>.
            </li>
            <li>Open Toploader from your home screen, and sign in there.</li>
          </ol>
          {skip}
        </div>
      </AppShell>
    );
  }

  const install = offer === 'install';
  const askLabel = !install
    ? 'Turn on alerts'
    : canOfferPush()
      ? 'Install and turn on alerts'
      : 'Install';
  return (
    <AppShell
      header={
        <TopBar
          title={install ? 'Install Toploader' : 'Turn on trade alerts'}
        />
      }
    >
      <div className="flex flex-col gap-4 p-4">
        <p className="text-base leading-prose text-ink">
          Get an alert when you have a new match or trade proposal, even with
          the app closed.
        </p>
        <div className="flex">
          <Button variant="primary" onClick={ask} disabled={asking}>
            {askLabel}
          </Button>
        </div>
        {skip}
      </div>
    </AppShell>
  );
}
