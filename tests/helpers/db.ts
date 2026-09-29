import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'

// In-memory Postgres with minimal Supabase stand-ins (roles, auth schema) and
// the committed migrations: the customers hardening migration (on a stand-in
// of the original customers table) and the LAZUZ migrations — so constraints
// and triggers behave exactly as in production.

const migration = (name: string) => readFileSync(path.resolve(process.cwd(), 'supabase/migrations', name), 'utf8')
const MIGRATIONS = [
  '20260928120000_customers_hardening.sql',
  '20260929120000_lazuz_court_occupancy.sql',
  '20260930120000_lazuz_auto_created_customers.sql',
].map(migration)

export async function createTestDb(): Promise<PGlite> {
  const db = new PGlite()
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
    -- The customers table as originally created in the dashboard (pre-hardening).
    create table public.customers (
      id uuid primary key default gen_random_uuid(),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      full_name text,
      phone text,
      email text,
      instagram_username text,
      source text,
      status text default 'new',
      player_level text,
      interests text[],
      tags text[],
      notes text,
      last_conversation_summary text,
      whatsapp_opt_in boolean default false,
      marketing_opt_in boolean default false
    );
  `)
  for (const sql of MIGRATIONS) await db.exec(sql)
  return db
}

export async function rows<T>(db: PGlite, sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows
}

export async function one<T>(db: PGlite, sql: string, params: unknown[] = []): Promise<T> {
  const [row] = await rows<T>(db, sql, params)
  return row
}

export async function count(db: PGlite, sql: string, params: unknown[] = []): Promise<number> {
  return (await one<{ n: number }>(db, sql, params)).n
}
