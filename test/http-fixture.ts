import type { OutgoingHttpHeaders, Server } from 'node:http';
import { Readable } from 'node:stream';

export interface RequestOptions {
  method?: string; host?: string; body?: unknown; cookie?: string;
  ip?: string; forwarded?: string;
}
export interface TestResponse { status: number; headers: Record<string, string>; body: string }
export const json = <T>(response: TestResponse): T => JSON.parse(response.body) as T;

// Drive the real HTTP request listener without binding a port or contacting integrations.
export function makeRequest(server: Server, defaults: RequestOptions = {}) {
  return (url: string, options: RequestOptions = {}): Promise<TestResponse> => new Promise((resolve, reject) => {
    const { method = 'GET', host = 'localhost', body, cookie = '', ip = '203.0.113.40', forwarded = '' } = { ...defaults, ...options };
    const timer = setTimeout(() => reject(new Error(`No response: ${method} ${url}`)), 3000);
    timer.unref();
    const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
    Object.assign(req, { url, method, headers: { host, cookie, 'x-osmo': '1', 'content-type': 'application/json', 'x-forwarded-for': forwarded }, socket: { remoteAddress: ip } });
    const headers: OutgoingHttpHeaders = {};
    const res = {
      status: 200, headersSent: false,
      getHeader(name: string) { return headers[name.toLowerCase()]; },
      setHeader(name: string, value: string | number | readonly string[]) { headers[name.toLowerCase()] = Array.isArray(value) ? [...value] : value as string | number; },
      writeHead(status: number, values: OutgoingHttpHeaders = {}) {
        this.status = status; this.headersSent = true;
        for (const [key, value] of Object.entries(values)) headers[key.toLowerCase()] = value;
      },
      end(data?: unknown) {
        clearTimeout(timer);
        resolve({ status: this.status, body: String(data ?? ''), headers: Object.fromEntries(Object.entries(headers).filter(([, value]) => value !== undefined).map(([key, value]) => [key, Array.isArray(value) ? value.join('\n') : String(value)])) });
      },
      destroy() { clearTimeout(timer); reject(new Error(`Response destroyed: ${url}`)); },
    };
    server.emit('request', req, res);
  });
}
