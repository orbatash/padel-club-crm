'use server'

import { redirect } from 'next/navigation'
import {
  createCustomer,
  findDuplicates,
  getCustomer,
  setCustomerArchived,
  updateCustomer,
} from '@/lib/customers/data'
import type { DuplicateMatch } from '@/lib/customers/types'
import {
  readCustomerForm,
  validateCustomer,
  type CustomerFormValues,
  type FieldErrors,
} from '@/lib/customers/validation'

// Every data-layer call re-checks the Owner session (requireOwner), so these
// actions are safe to invoke directly.

export type SaveCustomerState = {
  /** Increments on every server response so the form can re-mount with echoed values. */
  seq: number
  status: 'idle' | 'invalid' | 'duplicates' | 'conflict' | 'not_found'
  values?: CustomerFormValues
  errors?: FieldErrors
  matches?: DuplicateMatch[]
  /** The phone|email combination the Owner confirmed "create anyway" for. */
  duplicateKey?: string
}

export async function saveCustomer(prev: SaveCustomerState, formData: FormData): Promise<SaveCustomerState> {
  const seq = prev.seq + 1
  const values = readCustomerForm(formData)
  const result = validateCustomer(values)

  if (!result.ok) return { seq, status: 'invalid', values, errors: result.errors }

  const input = result.data
  const id = formData.get('id')
  const editingId = typeof id === 'string' && id ? id : null

  let existing = null
  if (editingId) {
    existing = await getCustomer(editingId)
    if (!existing) return { seq, status: 'not_found', values }
  }

  // Duplicate check: on create, always; on edit, only for a phone/email that changed.
  const checkPhone = input.phone && input.phone !== existing?.phone ? input.phone : null
  const checkEmail = input.email && input.email !== existing?.email ? input.email : null
  const duplicateKey = `${checkPhone ?? ''}|${checkEmail ?? ''}`
  const confirmed = formData.get('confirmDuplicateKey') === duplicateKey

  if (!confirmed && (checkPhone || checkEmail)) {
    const matches = await findDuplicates({ phone: checkPhone, email: checkEmail }, editingId ?? undefined)
    if (matches.length) return { seq, status: 'duplicates', values, matches, duplicateKey }
  }

  if (!editingId) {
    const newId = await createCustomer(input)
    redirect(`/customers/${newId}`)
  }

  const expectedUpdatedAt = formData.get('expectedUpdatedAt')
  const update = await updateCustomer(
    editingId,
    input,
    typeof expectedUpdatedAt === 'string' ? expectedUpdatedAt : ''
  )
  if (!update.ok) return { seq, status: update.reason, values }

  redirect(`/customers/${editingId}`)
}

export async function archiveCustomer(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  await setCustomerArchived(id, true)
  redirect(`/customers/${id}`)
}

export async function restoreCustomer(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  await setCustomerArchived(id, false)
  redirect(`/customers/${id}`)
}
