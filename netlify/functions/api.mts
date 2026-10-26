import type { Config, Context } from "@netlify/functions";
import { eq, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { tips } from "../../db/schema.js";
// CommonJS app logic shared with the local Node server
import api from "../../lib/api.js";
import store from "../../lib/store.js";

type Tip = typeof tips.$inferSelect;
const toJson = (t: Tip) => ({ ...t, createdAt: t.createdAt.toISOString() });

let seeded = false;
async function loadTips() {
  try { return await readTips(); }
  catch (e) {
    // Keep civic/places/chat working even if the database is unreachable
    console.error("[tips] database unavailable, serving seed tips:", (e as Error).message);
    return store.SEED_TIPS.map((t: any) => ({ ...t }));
  }
}
async function readTips() {
  if (!seeded) {
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(tips);
    if (n === 0) {
      await db.insert(tips)
        .values(store.SEED_TIPS.map((t: any) => ({ ...t, createdAt: new Date(t.createdAt) })))
        .onConflictDoNothing();
    }
    seeded = true;
  }
  return (await db.select().from(tips)).map(toJson);
}

api.setTipsBackend({
  load: loadTips,
  insert: async (t: any) => { await db.insert(tips).values({ ...t, createdAt: new Date(t.createdAt) }); },
  upvote: async (t: any) => { await db.update(tips).set({ votes: sql`${tips.votes} + 1` }).where(eq(tips.id, t.id)); },
});

const LIMIT = 20000;

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const body = async () => {
    if (req.method !== "POST") return {};
    const raw = await req.text();
    if (raw.length > LIMIT) throw Object.assign(new Error("Payload too large"), { status: 413 });
    try { return raw ? JSON.parse(raw) : {}; }
    catch { throw Object.assign(new Error("Invalid JSON"), { status: 400 }); }
  };
  try {
    const [status, out] = await api.handleApi({
      method: req.method, pathname: url.pathname, query: Object.fromEntries(url.searchParams), body, ip: context.ip || "x",
    });
    return Response.json(out, { status, headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    if (!e.status) console.error(e);
    return Response.json({ error: e.status ? e.message : "Something went wrong" }, { status: e.status || 500 });
  }
};

export const config: Config = { path: "/api/*" };
