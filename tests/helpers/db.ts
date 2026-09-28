import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'

// In-memory Postgres with minimal Supabase stand-ins (roles, auth.uid/jwt,
// customers, is_owner) plus the committed LAZUZ migration, so constraints and
// triggers behave exactly as in production.

const LAZUZ_MIGRATION = readFileSync(
  path.resolve(process.cwd(), 'supabase/migrations/20260929120000_lazuz_court_occupancy.sql'),
  'utf8'
)

export async function createTestDb(): Promise<PGlite> {
  const db = new PGlite()
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
    create table public.customers (
      id uuid primary key default gen_random_uuid(),
      full_name text,
      phone text,
      email text,
      archived_at timestamptz
    );
    create function public.is_owner() returns boolean language sql stable security invoker set search_path = ''
      as $$ select false $$;
  `)
  await db.exec(LAZUZ_MIGRATION)
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
