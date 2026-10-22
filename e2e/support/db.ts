import pg from "pg";

// Direct database access for test fixtures only.
export async function withDb<T>(run: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

export async function upsertUser(
  email: string,
  role: "admin" | "trainer" | "employee",
  firstName: string,
  lastName: string,
) {
  return withDb(async (client) => {
    const result = await client.query<{ id: string }>(
      `INSERT INTO users (id, email, first_name, last_name, role, active, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, true, now())
       ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role, active = true
       RETURNING id`,
      [email, firstName, lastName, role],
    );
    return result.rows[0].id;
  });
}

export async function createTraining(title: string) {
  return withDb(async (client) => {
    const slug = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`;
    const result = await client.query<{ id: string }>(
      `INSERT INTO trainings (id, title, slug, objectives, duration_hours, modality, price_excl_tax, active, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'Objectifs de test', 14, 'in_person', 950, true, now())
       RETURNING id`,
      [title, slug],
    );
    return result.rows[0].id;
  });
}
