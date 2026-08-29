export type Org = {
  id: string;
  slug: string;
  name: string;
  kind: "personal" | "team";
  created_at: string;
};

/** Every org, newest first. */
export async function listOrgs(db: D1Database): Promise<Org[]> {
  const { results } = await db
    .prepare("SELECT id, slug, name, kind, created_at FROM orgs ORDER BY created_at DESC")
    .all<Org>();
  return results;
}
