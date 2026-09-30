import { denyUnlessAdmin, json, store } from './_lib.js';

/** GET /api/visitors - every visitor record (admin only) */
export async function GET(req: Request) {
  const deny = denyUnlessAdmin(req);
  if (deny) return deny;
  const rows = await store.all();
  const records = rows.flatMap((r) => {
    try {
      return [JSON.parse(r)];
    } catch {
      return [];
    }
  });
  return json({ records, storage: store.remote() ? 'redis' : 'memory' });
}

/** DELETE /api/visitors  body: { ids: string[] } (admin only) */
export async function DELETE(req: Request) {
  const deny = denyUnlessAdmin(req);
  if (deny) return deny;
  const body = (await req.json().catch(() => null)) as { ids?: unknown } | null;
  const ids = Array.isArray(body?.ids) ? body.ids.filter((x): x is string => typeof x === 'string').slice(0, 1000) : [];
  await store.del(ids);
  return json({ ok: true, deleted: ids.length });
}
