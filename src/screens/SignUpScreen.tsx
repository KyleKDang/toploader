import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
  AppShell,
  Button,
  Checkbox,
  Disclaimer,
  FormError,
  TextInput,
  TopBar,
} from '../components';
import { supabase } from '../lib/supabase';

/*
 * Sign up, and sign in: one screen, because with an emailed code there is no
 * difference - a first sign-in creates the account.
 *
 * The code is typed rather than a link clicked. On iOS a link in an email
 * opens in Safari, not in the app installed to the home screen, which keeps
 * its own storage, so a link would sign the Trader in where they are not.
 *
 * The 18-or-over attestation is required before a code is sent, because
 * sending one creates the account: attesting first makes an under-age
 * signup the signer's misrepresentation rather than our collection of their
 * email (#36). Every route to a session passes through this box, which is
 * what lets setting up the profile record the attestation.
 */

export function SignUpScreen() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [attestsAdult, setAttestsAdult] = useState(false);
  const [code, setCode] = useState('');
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null);

  const sendCode = useMutation({
    mutationFn: async (to: string) => {
      const { error } = await supabase.auth.signInWithOtp({ email: to });
      if (error) throw error;
      return to;
    },
    onSuccess: (to) => {
      setCode('');
      setCodeSentTo(to);
    },
  });

  const verifyCode = useMutation({
    mutationFn: async ({ to, token }: { to: string; token: string }) => {
      const { error } = await supabase.auth.verifyOtp({
        email: to,
        token,
        type: 'email',
      });
      if (error) throw error;
    },
    onSuccess: () => navigate({ to: '/' }),
  });

  function onSubmitEmail(event: FormEvent) {
    event.preventDefault();
    sendCode.mutate(email.trim());
  }

  function onSubmitCode(event: FormEvent) {
    event.preventDefault();
    if (codeSentTo) verifyCode.mutate({ to: codeSentTo, token: code.trim() });
  }

  return (
    <AppShell header={<TopBar title="Toploader" />}>
      <div className="flex min-h-full flex-col">
        <div className="flex grow flex-col gap-5 p-4">
          <p className="text-base leading-prose text-ink">
            In-person trading for Pokemon TCG collectors, in your City.
          </p>

          {codeSentTo === null ? (
            <form className="flex flex-col gap-4" onSubmit={onSubmitEmail}>
              <TextInput
                label="Email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              <p className="text-sm leading-prose text-muted">
                New or returning, we email you a 6-digit code. There is no
                password.
              </p>
              <Checkbox
                label="I am 18 or over"
                required
                checked={attestsAdult}
                onChange={(event) => setAttestsAdult(event.target.checked)}
              />
              <FormError error={sendCode.error} />
              <div className="flex">
                <Button
                  type="submit"
                  variant="primary"
                  disabled={sendCode.isPending}
                >
                  Email me a code
                </Button>
              </div>
            </form>
          ) : (
            <form className="flex flex-col gap-4" onSubmit={onSubmitCode}>
              <p className="text-base leading-prose text-ink">
                We sent a code to <strong>{codeSentTo}</strong>. It expires in
                an hour.
              </p>
              <TextInput
                label="6-digit code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
              <FormError error={verifyCode.error} />
              <div className="flex flex-col gap-2.5">
                <Button
                  type="submit"
                  variant="primary"
                  disabled={verifyCode.isPending}
                >
                  Continue
                </Button>
                <Button
                  onClick={() => {
                    verifyCode.reset();
                    setCodeSentTo(null);
                  }}
                >
                  Use a different email
                </Button>
              </div>
            </form>
          )}
        </div>

        <Disclaimer className="pb-4" />
      </div>
    </AppShell>
  );
}
