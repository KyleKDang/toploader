import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

/*
 * TCGCSV, faked at the network edge: a real HTTP server on localhost serving
 * the recorded fixtures at the upstream's own paths. A test breaks or rewrites
 * a path to stand in for an outage or for the next day's prices.
 */

const FIXTURES = new URL('./fixtures/tcgcsv/', import.meta.url);

type Override = { status: number } | { body: unknown };

export interface FakeTcgcsv {
  baseUrl: string;
  /** Every path requested since the last `reset`, in order. */
  requests: string[];
  /** Answers `path` with this status or JSON body instead of its fixture. */
  override(path: string, override: Override): void;
  /** The recorded fixture at `path`, for a test to edit and serve back. */
  recorded<T>(path: string): Promise<T>;
  reset(): void;
  close(): Promise<void>;
}

async function readFixture(path: string): Promise<string> {
  return readFile(new URL(`.${path}.json`, FIXTURES), 'utf8');
}

export async function startFakeTcgcsv(): Promise<FakeTcgcsv> {
  const overrides = new Map<string, Override>();
  const requests: string[] = [];

  const server: Server = createServer((request, response) => {
    const path = request.url ?? '/';
    requests.push(path);
    const override = overrides.get(path);

    if (override && 'status' in override) {
      response.writeHead(override.status).end();
      return;
    }
    const body = override
      ? Promise.resolve(JSON.stringify(override.body))
      : readFixture(path);
    body.then(
      (json) =>
        response
          .writeHead(200, { 'Content-Type': 'application/json' })
          .end(json),
      () => response.writeHead(404).end(),
    );
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    requests,
    override: (path, override) => void overrides.set(path, override),
    recorded: async <T>(path: string) =>
      JSON.parse(await readFixture(path)) as T,
    reset() {
      overrides.clear();
      requests.length = 0;
    },
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}
