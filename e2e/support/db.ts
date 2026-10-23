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

/** Published session open to collaborators, one slot `daysFromNow` days ahead. */
export async function createPublishedSession(
  trainingId: string,
  options: { capacity: number; daysFromNow: number; reference: string },
) {
  return withDb(async (client) => {
    const session = await client.query<{ id: string }>(
      `INSERT INTO sessions (id, training_id, reference, status, location, capacity_max, open_to_internal, open_to_external, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'published', 'Salle E2E', $3, true, true, now()) RETURNING id`,
      [trainingId, options.reference, options.capacity],
    );
    await client.query(
      `INSERT INTO session_slots (id, session_id, starts_at, ends_at)
       VALUES (gen_random_uuid(), $1, date_trunc('day', now()) + make_interval(days => $2) + interval '8 hours',
               date_trunc('day', now()) + make_interval(days => $2) + interval '11 hours 30 minutes')`,
      [session.rows[0].id, options.daysFromNow],
    );
    return session.rows[0].id;
  });
}

export async function emailsFor(email: string): Promise<{ type: string; subject: string }[]> {
  return withDb(async (client) => {
    const result = await client.query<{ type: string; subject: string }>(
      `SELECT type, subject FROM documents WHERE recipient_email = $1 ORDER BY created_at`,
      [email],
    );
    return result.rows;
  });
}

/** Session whose single slot ended a few seconds ago (signable today, closable now). */
export async function createJustEndedSession(trainingId: string, reference: string) {
  return withDb(async (client) => {
    const session = await client.query<{ id: string }>(
      `INSERT INTO sessions (id, training_id, reference, status, location, capacity_max, open_to_internal, open_to_external, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'published', 'Salle E2E', 10, true, true, now()) RETURNING id`,
      [trainingId, reference],
    );
    await client.query(
      `INSERT INTO session_slots (id, session_id, starts_at, ends_at) VALUES (gen_random_uuid(), $1, now() - interval '90 seconds', now() - interval '20 seconds')`,
      [session.rows[0].id],
    );
    return session.rows[0].id;
  });
}

export async function addTrainer(sessionId: string, email: string, lastName: string) {
  return withDb(async (client) => {
    const trainer = await client.query<{ id: string }>(
      `INSERT INTO trainers (id, type, first_name, last_name, email, specialties, updated_at) VALUES (gen_random_uuid(), 'external', 'Theo', $2, $1, '{}', now()) RETURNING id`,
      [email, lastName],
    );
    await client.query(`INSERT INTO session_trainers (session_id, trainer_id) VALUES ($1, $2)`, [
      sessionId,
      trainer.rows[0].id,
    ]);
  });
}

export async function addExternalEnrollment(
  sessionId: string,
  person: { firstName: string; lastName: string; email: string },
) {
  return withDb(async (client) => {
    const company = await client.query<{ id: string }>(
      `INSERT INTO companies (id, name, updated_at) VALUES (gen_random_uuid(), $1, now()) RETURNING id`,
      [`Société ${person.lastName}`],
    );
    const participant = await client.query<{ id: string }>(
      `INSERT INTO participants (id, type, company_id, first_name, last_name, email, updated_at) VALUES (gen_random_uuid(), 'external', $1, $2, $3, $4, now()) RETURNING id`,
      [company.rows[0].id, person.firstName, person.lastName, person.email],
    );
    await client.query(
      `INSERT INTO enrollments (id, session_id, participant_id, status, source, participant_type, funding_type, agreement_waiver_reason, agreement_waived_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'confirmed', 'back_office', 'external', 'company', 'Fixture e2e', now(), now())`,
      [sessionId, participant.rows[0].id],
    );
  });
}

/** Completed session (yesterday) where the given user's participant was present. */
export async function createCompletedSessionFor(trainingId: string, userEmail: string, reference: string) {
  return withDb(async (client) => {
    const user = await client.query<{ id: string; first_name: string; last_name: string }>(
      `SELECT id, first_name, last_name FROM users WHERE email = $1`,
      [userEmail],
    );
    const participant = await client.query<{ id: string }>(
      `INSERT INTO participants (id, type, user_id, first_name, last_name, email, updated_at) VALUES (gen_random_uuid(), 'internal', $1, $2, $3, $4, now())
       ON CONFLICT (email) DO UPDATE SET user_id = EXCLUDED.user_id RETURNING id`,
      [user.rows[0].id, user.rows[0].first_name, user.rows[0].last_name, userEmail],
    );
    const session = await client.query<{ id: string }>(
      `INSERT INTO sessions (id, training_id, reference, status, location, capacity_max, open_to_internal, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'completed', 'Salle', 10, true, now()) RETURNING id`,
      [trainingId, reference],
    );
    const slot = await client.query<{ id: string }>(
      `INSERT INTO session_slots (id, session_id, starts_at, ends_at) VALUES (gen_random_uuid(), $1, now() - interval '1 day 4 hours', now() - interval '1 day') RETURNING id`,
      [session.rows[0].id],
    );
    const enrollment = await client.query<{ id: string }>(
      `INSERT INTO enrollments (id, session_id, participant_id, status, source, participant_type, updated_at) VALUES (gen_random_uuid(), $1, $2, 'present', 'front', 'internal', now()) RETURNING id`,
      [session.rows[0].id, participant.rows[0].id],
    );
    await client.query(
      `INSERT INTO attendances (id, enrollment_id, slot_id, present, signed_at) VALUES (gen_random_uuid(), $1, $2, true, now() - interval '1 day 3 hours')`,
      [enrollment.rows[0].id, slot.rows[0].id],
    );
    return { sessionId: session.rows[0].id, enrollmentId: enrollment.rows[0].id };
  });
}

export async function linkInternalTrainer(sessionId: string, userEmail: string) {
  return withDb(async (client) => {
    const user = await client.query<{ id: string; first_name: string; last_name: string }>(
      `SELECT id, first_name, last_name FROM users WHERE email = $1`,
      [userEmail],
    );
    const trainer = await client.query<{ id: string }>(
      `INSERT INTO trainers (id, type, user_id, first_name, last_name, email, specialties, updated_at) VALUES (gen_random_uuid(), 'internal', $1, $2, $3, $4, '{}', now()) RETURNING id`,
      [user.rows[0].id, user.rows[0].first_name, user.rows[0].last_name, userEmail],
    );
    await client.query(`INSERT INTO session_trainers (session_id, trainer_id) VALUES ($1, $2)`, [
      sessionId,
      trainer.rows[0].id,
    ]);
  });
}

/** Organization identifiers required on documents sent to externals (SIRET, NDA). */
export async function ensureOrganizationIdentifiers() {
  return withDb(async (client) => {
    await client.query(
      `INSERT INTO organization_settings (id, name, siret, activity_declaration_number, updated_at)
       VALUES (1, 'Organisme E2E', '73282932000074', '11755555575', now())
       ON CONFLICT (id) DO UPDATE SET
         siret = COALESCE(organization_settings.siret, EXCLUDED.siret),
         activity_declaration_number = COALESCE(organization_settings.activity_declaration_number, EXCLUDED.activity_declaration_number)`,
    );
  });
}
