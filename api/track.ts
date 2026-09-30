import { json, network, store } from './_lib.js';

/**
 * POST /api/track - the experience reports its visitor record here.
 * The server adds IP, location and user agent; the client cannot set them.
 */
export async function POST(req: Request) {
  const text = await req.text();
  if (text.length > 64_000) return json({ error: 'too large' }, 413);
  let rec: any;
  try {
    rec = JSON.parse(text);
  } catch {
    return json({ error: 'bad json' }, 400);
  }
  if (!rec || typeof rec.id !== 'string' || !/^[0-9a-f]{16}$/.test(rec.id) || typeof rec.startedAt !== 'number') {
    return json({ error: 'bad record' }, 400);
  }
  rec.username = String(rec.username ?? '').trim().slice(0, 32);
  delete rec.demo;

  const net = { ...network(req), referrer: String(rec.referrer ?? '').slice(0, 300) };
  const prev = await store.get(rec.id).then((v) => (v ? JSON.parse(v) : null)).catch(() => null);
  // keep the IP/location from the first report; note if it changes mid-session
  rec.net = prev?.net ?? net;
  if (prev?.net && net.ip && prev.net.ip !== net.ip) rec.net.lastIp = net.ip;
  rec.receivedAt = Date.now();

  await store.set(rec.id, JSON.stringify(rec));
  return json({ ok: true });
}
