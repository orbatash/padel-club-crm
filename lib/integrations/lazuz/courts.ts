import 'server-only'

import { IntegrationError } from '@/lib/integrations/core/errors'
import { getLazuzClient, type LazuzClient } from './client'
import { getLazuzConfig } from './config'

// GET /club-management/courts/{club_id}?hierarchical=true — read-only.
// Confirmed for club 213: `results` of top-level courts (parentId null) with
// id, title, type_title. Nested sub-resources (parentId set) are ignored.

export type LazuzCourt = {
  externalId: string
  name: string
  sportType: string | null
  raw: { id: unknown; title: unknown; type_title: unknown; parentId: unknown }
}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => Boolean(v) && typeof v === 'object' && !Array.isArray(v)

export function parseCourts(body: unknown): LazuzCourt[] {
  const list = isObj(body) ? body.results : undefined
  if (!Array.isArray(list)) {
    throw new IntegrationError('invalid_response', 'LAZUZ courts response has no `results` array', {
      provider: 'lazuz',
      operation: 'listCourts',
      hint: `top-level: ${isObj(body) ? Object.keys(body).join(',') : typeof body}`,
    })
  }
  const courts: LazuzCourt[] = []
  for (const item of list) {
    if (!isObj(item) || (item.parentId !== null && item.parentId !== undefined)) continue
    const id = typeof item.id === 'number' || (typeof item.id === 'string' && item.id.trim()) ? String(item.id) : null
    const name = typeof item.title === 'string' && item.title.trim() ? item.title.trim().slice(0, 80) : null
    if (!id || !name) continue
    courts.push({
      externalId: id,
      name,
      sportType: typeof item.type_title === 'string' && item.type_title.trim() ? item.type_title.trim() : null,
      // Keep only the confirmed, non-personal fields.
      raw: { id: item.id, title: item.title, type_title: item.type_title, parentId: item.parentId ?? null },
    })
  }
  return courts
}

export async function listCourts(deps: { client?: LazuzClient; clubId?: string } = {}): Promise<LazuzCourt[]> {
  const clubId = deps.clubId ?? getLazuzConfig().clubId
  if (!clubId) {
    throw new IntegrationError('not_configured', 'LAZUZ_CLUB_ID is not set', { provider: 'lazuz', operation: 'listCourts' })
  }
  const body = await (deps.client ?? getLazuzClient()).request({
    operation: 'listCourts',
    method: 'GET',
    path: `/club-management/courts/${encodeURIComponent(clubId)}`,
    query: { hierarchical: 'true' },
  })
  return parseCourts(body)
}
