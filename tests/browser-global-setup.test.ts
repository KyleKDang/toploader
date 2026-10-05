import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { checkEdgeRuntime } from './browser/global-setup.ts';

/*
 * The browser suite's check that the local edge runtime serves every
 * function (#105, #113), with the runtime faked at the network edge: an HTTP
 * server answering each function's preflight the way the real runtime does
 * when it is healthy, predates a function, or cannot boot one.
 */

type Reply = { status: number; body: string };

const served: Reply = { status: 204, body: '' };
const notFound: Reply = { status: 404, body: 'Function not found' };
const bootError: Reply = {
  status: 503,
  body: JSON.stringify({
    code: 'BOOT_ERROR',
    message: 'Worker failed to boot (please check logs)',
  }),
};
// A function's own handler failing, which proves the worker booted.
const handlerError: Reply = {
  status: 500,
  body: JSON.stringify({ error: 'NOTIFIER_SECRET must be set' }),
};

let server: Server | undefined;

afterEach(async () => {
  const runtime = server;
  if (!runtime) return;
  server = undefined;
  await new Promise((resolve) => runtime.close(resolve));
});

/** A fake runtime's base URL, answering each function by name. */
async function fakeRuntime(replies: Record<string, Reply>) {
  const runtime = createServer((request, response) => {
    const name = request.url?.replace('/functions/v1/', '') ?? '';
    const reply = replies[name] ?? notFound;
    response.writeHead(reply.status).end(reply.body);
  });
  server = runtime;
  await new Promise<void>((resolve) => runtime.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(runtime.address() as AddressInfo).port}`;
}

describe('checking the local edge runtime before any tracer', () => {
  it('passes when every function boots, even one whose handler errors', async () => {
    const apiUrl = await fakeRuntime({
      delete_account: served,
      notify: handlerError,
    });

    await expect(
      checkEdgeRuntime(apiUrl, ['delete_account', 'notify']),
    ).resolves.toBeUndefined();
  });

  it('fails on a function the runtime cannot boot, naming it and the restart from the main checkout', async () => {
    const apiUrl = await fakeRuntime({
      delete_account: bootError,
      notify: handlerError,
    });

    const checked = checkEdgeRuntime(apiUrl, ['delete_account', 'notify']);

    await expect(checked).rejects.toThrow(/cannot boot delete_account\b/);
    await expect(checked).rejects.toThrow(/main checkout/);
    await expect(checked).rejects.toThrow(/npx supabase stop/);
  });

  it('still fails on a function the runtime does not know', async () => {
    const apiUrl = await fakeRuntime({ delete_account: served });

    await expect(
      checkEdgeRuntime(apiUrl, ['delete_account', 'notify']),
    ).rejects.toThrow(/does not serve notify\b/);
  });

  it('names both at once, a function it does not know and one it cannot boot', async () => {
    const apiUrl = await fakeRuntime({ delete_account: bootError });

    const checked = checkEdgeRuntime(apiUrl, ['delete_account', 'notify']);

    await expect(checked).rejects.toThrow(/does not serve notify\b/);
    await expect(checked).rejects.toThrow(/cannot boot delete_account\b/);
  });
});
