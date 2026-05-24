// Header templates capture a learned mapping from a particular CSV layout
// (identified by a header signature) to column roles and matching settings.
// They are shared across all import sessions of an event, so this repository
// targets the event-shared DB.
import { getSharedDb } from '../database';

export interface HeaderTemplate {
  id: number;
  signature: string;
  label: string | null;
  // JSON strings as stored in DB; callers parse/serialize on demand.
  column_mapping: string | null;
  matching_settings: string | null;
  created_at: string | null;
}

export interface NewHeaderTemplate {
  signature: string;
  label?: string | null;
  column_mapping?: string | null;
  matching_settings?: string | null;
}

interface TemplateRow {
  id: number;
  signature: string;
  label: string | null;
  column_mapping: string | null;
  matching_settings: string | null;
  created_at: string | null;
}

function rowToTemplate(row: TemplateRow): HeaderTemplate {
  return {
    id: row.id,
    signature: row.signature,
    label: row.label,
    column_mapping: row.column_mapping,
    matching_settings: row.matching_settings,
    created_at: row.created_at,
  };
}

export async function listHeaderTemplates(): Promise<HeaderTemplate[]> {
  const db = getSharedDb();
  const rows = await db.select<TemplateRow[]>(
    'SELECT id, signature, label, column_mapping, matching_settings, created_at FROM header_templates ORDER BY created_at DESC, id DESC',
  );
  return rows.map(rowToTemplate);
}

export async function findHeaderTemplateBySignature(
  sig: string,
): Promise<HeaderTemplate | null> {
  const db = getSharedDb();
  const rows = await db.select<TemplateRow[]>(
    'SELECT id, signature, label, column_mapping, matching_settings, created_at FROM header_templates WHERE signature = ? LIMIT 1',
    [sig],
  );
  return rows[0] ? rowToTemplate(rows[0]) : null;
}

export async function insertHeaderTemplate(t: NewHeaderTemplate): Promise<number> {
  const db = getSharedDb();
  const r = await db.execute(
    'INSERT INTO header_templates (signature, label, column_mapping, matching_settings) VALUES (?, ?, ?, ?)',
    [t.signature, t.label ?? null, t.column_mapping ?? null, t.matching_settings ?? null],
  );
  return r.lastInsertId as number;
}

export async function updateHeaderTemplate(
  id: number,
  patch: Partial<HeaderTemplate>,
): Promise<void> {
  const db = getSharedDb();
  const sets: string[] = [];
  const values: unknown[] = [];
  if ('signature' in patch) {
    sets.push('signature = ?');
    values.push(patch.signature ?? null);
  }
  if ('label' in patch) {
    sets.push('label = ?');
    values.push(patch.label ?? null);
  }
  if ('column_mapping' in patch) {
    sets.push('column_mapping = ?');
    values.push(patch.column_mapping ?? null);
  }
  if ('matching_settings' in patch) {
    sets.push('matching_settings = ?');
    values.push(patch.matching_settings ?? null);
  }
  if (sets.length === 0) return;
  values.push(id);
  await db.execute(
    `UPDATE header_templates SET ${sets.join(', ')} WHERE id = ?`,
    values,
  );
}

export async function deleteHeaderTemplate(id: number): Promise<void> {
  const db = getSharedDb();
  await db.execute('DELETE FROM header_templates WHERE id = ?', [id]);
}
