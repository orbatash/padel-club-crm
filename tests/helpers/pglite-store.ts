import type { PGlite } from '@electric-sql/pglite'
import type { SyncStore } from '@/lib/integrations/lazuz/sync/types'

// SyncStore on PGlite, mirroring lib/integrations/lazuz/sync/supabase-store.ts:
// rows come back as to_jsonb(), which matches PostgREST's JSON (dates/times as
// strings, numeric as number), and finishRun rejects when no row was updated.

export type StoreHooks = {
  /** Called before every finishRun attempt. */
  onFinish?: () => void
  /** Return true to make this finishRun attempt fail. */
  failFinish?: () => boolean
}

export function createPgliteSyncStore(db: PGlite, hooks: StoreHooks = {}): SyncStore {
  const json = async <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
    (await db.query<{ j: T }>(sql, params)).rows.map((r) => r.j)

  const upsert = async <T>(
    table: string,
    items: object[],
    conflict: string,
    returning: string[] | null,
    doNothing = false
  ): Promise<T[]> => {
    if (!items.length) return []
    const cols = Object.keys(items[0])
    const conflictCols = conflict.split(',')
    const set = cols
      .filter((c) => !conflictCols.includes(c))
      .map((c) => `${c} = excluded.${c}`)
      .join(', ')
    const sql = `insert into public.${table} (${cols.join(', ')})
      select ${cols.join(', ')} from jsonb_populate_recordset(null::public.${table}, $1::jsonb)
      on conflict (${conflict}) ${doNothing ? 'do nothing' : `do update set ${set}`}
      ${returning ? `returning jsonb_build_object(${returning.map((c) => `'${c}', ${c}`).join(', ')}) as j` : ''}`
    if (returning) return json<T>(sql, [JSON.stringify(items)])
    await db.query(sql, [JSON.stringify(items)])
    return []
  }

  return {
    loadCourts: () =>
      json(`select jsonb_build_object('id', id, 'external_id', external_id, 'name', name, 'sport_type', sport_type) j
            from courts where provider = 'lazuz'`),
    upsertCourts: (items) => upsert(`courts`, items, 'provider,external_id', ['id', 'external_id']),
    loadReservationsByExternalIds: (ids) =>
      json(`select to_jsonb(r) - 'created_at' - 'updated_at' - 'first_seen_at' - 'last_seen_at' j
            from court_reservations r where provider = 'lazuz' and external_id = any($1::text[])`, [ids]),
    loadPresentOverlapping: (w) =>
      json(`select jsonb_build_object('id', id, 'external_id', external_id) j from court_reservations
            where provider = 'lazuz' and sync_state = 'present' and start_date <= $2::date and end_date >= $1::date`,
        [w.start, w.end]),
    upsertReservations: (items) => upsert('court_reservations', items, 'provider,external_id', ['id', 'external_id']),
    markMissing: async (ids) =>
      (await json(`update court_reservations set sync_state = 'missing'
                   where id = any($1::uuid[]) and sync_state = 'present' returning to_jsonb(id) j`, [ids])).length,
    loadIdentities: (ids) =>
      json(`select jsonb_build_object('external_id', external_id, 'customer_id', customer_id) j
            from customer_external_identities where provider = 'lazuz' and external_id = any($1::text[])`, [ids]),
    loadActiveCustomersByPhones: (phones) =>
      json(`select jsonb_build_object('id', id, 'phone', phone) j from customers
            where phone = any($1::text[]) and archived_at is null`, [phones]),
    insertIdentities: async (items) => {
      await upsert('customer_external_identities', items, 'provider,external_id', null, true)
    },
    loadOccupancies: (w) =>
      json(`select jsonb_build_object('id', id, 'reservation_id', reservation_id, 'starts_at', starts_at, 'ends_at', ends_at) j
            from court_occupancies where local_date between $1::date and $2::date`, [w.start, w.end]),
    upsertOccupancies: async (items) => {
      await upsert('court_occupancies', items, 'reservation_id,starts_at', null)
    },
    deleteOccupancies: async (ids) =>
      (await json(`delete from court_occupancies where id = any($1::uuid[]) returning to_jsonb(id) j`, [ids])).length,
    hasRecentRunningRun: async (operation, sinceIso) =>
      (await json(`select to_jsonb(id) j from integration_sync_runs
                   where provider = 'lazuz' and operation = $1 and status = 'running' and started_at >= $2::timestamptz limit 1`,
        [operation, sinceIso])).length > 0,
    startRun: async (operation, w) => {
      const [run] = await json<{ id: string; started_at: string }>(
        `insert into integration_sync_runs (provider, operation, window_start, window_end)
         values ('lazuz', $1, $2, $3) returning jsonb_build_object('id', id, 'started_at', started_at) j`,
        [operation, w.start, w.end]
      )
      return { id: run.id, startedAt: run.started_at }
    },
    finishRun: async (id, f) => {
      hooks.onFinish?.()
      if (hooks.failFinish?.()) throw new Error('simulated finalize failure')
      const updated = await json(
        `update integration_sync_runs set status = $2, fetched_count = $3, created_count = $4, updated_count = $5,
           skipped_count = $6, missing_count = $7, error = $8::jsonb, finished_at = $9::timestamptz
         where id = $1 returning to_jsonb(id) j`,
        [id, f.status, f.fetched_count, f.created_count, f.updated_count, f.skipped_count, f.missing_count,
          f.error === null ? null : JSON.stringify(f.error), f.finished_at]
      )
      if (updated.length !== 1) throw new Error('no row updated')
    },
  }
}
