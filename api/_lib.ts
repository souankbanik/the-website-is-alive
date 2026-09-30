/**
 * Shared server helpers for the visitor API (Vercel Functions, Node runtime).
 *
 * Storage: Upstash Redis over its REST API (connect "Upstash for Redis" from the
 * Vercel Marketplace; it sets KV_REST_API_URL / KV_REST_API_TOKEN). With no
 * store configured - e.g. `npm run dev` - an in-memory map is used instead.
 */
declare const process: { env: Record<string, string | undefined> };

const HASH = 'alive:visitors';

const url = () => process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

async function redis<T = unknown>(...cmd: (string | number)[]): Promise<T> {
  const res = await fetch(url()!, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  const data = (await res.json()) as { result?: T; error?: string };
  if (!res.ok || data.error) throw new Error(data.error || `redis ${res.status}`);
  return data.result as T;
}

const mem: Map<string, string> = ((globalThis as any).__aliveMem ??= new Map());

export const store = {
  remote: () => !!(url() && token()),
  async get(id: string): Promise<string | null> {
    return store.remote() ? redis<string | null>('HGET', HASH, id) : mem.get(id) ?? null;
  },
  async set(id: string, value: string) {
    if (store.remote()) await redis('HSET', HASH, id, value);
    else mem.set(id, value);
  },
  async all(): Promise<string[]> {
    return store.remote() ? redis<string[]>('HVALS', HASH) : [...mem.values()];
  },
  async del(ids: string[]) {
    if (!ids.length) return;
    if (store.remote()) await redis('HDEL', HASH, ...ids);
    else ids.forEach((id) => mem.delete(id));
  },
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

/** constant-time string compare */
function same(a: string, b: string) {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** null when the request carries the admin password, otherwise the error response */
export function denyUnlessAdmin(req: Request): Response | null {
  const secret = process.env.ADMIN_PASSWORD;
  if (!secret) return json({ error: 'ADMIN_PASSWORD is not set on the server' }, 503);
  const got = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  return same(got, secret) ? null : json({ error: 'unauthorized' }, 401);
}

const dec = (v: string | null) => {
  if (!v) return '';
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
};

/** client IP and Vercel's IP geolocation headers */
export function network(req: Request) {
  const h = req.headers;
  const lat = parseFloat(h.get('x-vercel-ip-latitude') || '');
  const lon = parseFloat(h.get('x-vercel-ip-longitude') || '');
  return {
    ip: (h.get('x-forwarded-for') || '').split(',')[0].trim() || h.get('x-real-ip') || '',
    country: h.get('x-vercel-ip-country') || '',
    region: dec(h.get('x-vercel-ip-country-region')),
    city: dec(h.get('x-vercel-ip-city')),
    lat: Number.isFinite(lat) ? lat : null,
    lon: Number.isFinite(lon) ? lon : null,
    timezone: h.get('x-vercel-ip-timezone') || '',
    ua: (h.get('user-agent') || '').slice(0, 300),
    referrer: '',
  };
}
