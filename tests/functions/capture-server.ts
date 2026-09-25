import { readFileSync } from 'node:fs';
import {
  createServer as createHttpServer,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import type { AddressInfo } from 'node:net';

/*
 * An outbound HTTP destination, faked at the network edge: a real server on
 * localhost that records every request it gets and answers 201 with an
 * empty JSON object, which both a push service and Resend accept as "sent".
 * A test names a path that should answer otherwise, to stand in for a
 * subscription the push service has forgotten or a Resend outage.
 *
 * The seam-2 notifier test runs two of these: one as Resend, one as the
 * push service every test subscription's endpoint points at. The push
 * service speaks TLS, because a push endpoint is only ever https and the
 * database refuses any other, with the self-signed certificate under
 * fixtures/tls; the test tells its own process to accept it.
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

const TLS_FIXTURES = new URL('./fixtures/tls/', import.meta.url);

export async function startCaptureServer({
  tls = false,
}: { tls?: boolean } = {}): Promise<CaptureServer> {
  const statuses = new Map<string, number>();
  const requests: CapturedRequest[] = [];

  const capture = (request: IncomingMessage, response: ServerResponse) => {
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
  };

  const server: Server = tls
    ? createHttpsServer(
        {
          key: readFileSync(new URL('key.pem', TLS_FIXTURES)),
          cert: readFileSync(new URL('cert.pem', TLS_FIXTURES)),
        },
        capture,
      )
    : createHttpServer(capture);

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `${tls ? 'https' : 'http'}://127.0.0.1:${port}`,
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
