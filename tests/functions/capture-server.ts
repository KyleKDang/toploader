import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

/*
 * An outbound HTTP destination, faked at the network edge: a real server on
 * localhost that records every request it gets and answers 201 with an
 * empty JSON object, which both a push service and Resend accept as "sent".
 * A test names a path that should answer otherwise, to stand in for a
 * subscription the push service has forgotten or a Resend outage.
 *
 * The seam-2 notifier test runs two of these: one as Resend, one as the
 * push service every test subscription's endpoint points at.
 */

export interface CapturedRequest {
  method: string;
  path: string;
  headers: IncomingHttpHeaders;
  body: Buffer;
}

export interface CaptureServer {
  baseUrl: string;
  /** Every request since the last `reset`, in order. */
  requests: CapturedRequest[];
  /** Answers `path` with this status instead of 201. */
  answer(path: string, status: number): void;
  reset(): void;
  close(): Promise<void>;
}

export async function startCaptureServer(): Promise<CaptureServer> {
  const statuses = new Map<string, number>();
  const requests: CapturedRequest[] = [];

  const server: Server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const path = request.url ?? '/';
      requests.push({
        method: request.method ?? 'GET',
        path,
        headers: request.headers,
        body: Buffer.concat(chunks),
      });
      response
        .writeHead(statuses.get(path) ?? 201, {
          'Content-Type': 'application/json',
        })
        .end('{}');
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    requests,
    answer: (path, status) => void statuses.set(path, status),
    reset() {
      statuses.clear();
      requests.length = 0;
    },
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}
