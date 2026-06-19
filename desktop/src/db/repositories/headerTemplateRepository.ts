/**
 * CSV ヘッダー構成と列割り当てを紐づけるテンプレートの保存境界。
 * テンプレートは同一イベント内の取込セッションで共有するため、共有 DB を対象にする。
 */
import { getSharedDb } from '../database';

export interface HeaderTemplate {
  id: number;
  signature: string;
  label: string | null;
  /** DB へ保存した JSON 文字列。呼び出し側で必要な形式へ parse/serialize する。 */
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

type HeaderTemplatePatch = Partial<
  Pick<HeaderTemplate, 'signature' | 'label' | 'column_mapping' | 'matching_settings'>
>;

const TEMPLATE_COLUMNS = 'id, signature, label, column_mapping, matching_settings, created_at';

/** DB 行を repository の公開型へ整形する。 */
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

/** 共有 DB に保存されたヘッダーテンプレートを新しい順で取得する。 */
export async function listHeaderTemplates(): Promise<HeaderTemplate[]> {
  const db = getSharedDb();
  const rows = await db.select<TemplateRow[]>(
    `SELECT ${TEMPLATE_COLUMNS} FROM header_templates ORDER BY created_at DESC, id DESC`,
  );
  return rows.map(rowToTemplate);
}

/** ヘッダー signature が一致するテンプレートを 1 件取得する。 */
export async function findHeaderTemplateBySignature(
  sig: string,
): Promise<HeaderTemplate | null> {
  const db = getSharedDb();
  const rows = await db.select<TemplateRow[]>(
    `SELECT ${TEMPLATE_COLUMNS} FROM header_templates WHERE signature = ? LIMIT 1`,
    [sig],
  );
  return rows[0] ? rowToTemplate(rows[0]) : null;
}

/** 新しいヘッダーテンプレートを保存し、採番された ID を返す。 */
export async function insertHeaderTemplate(t: NewHeaderTemplate): Promise<number> {
  const db = getSharedDb();
  const r = await db.execute(
    'INSERT INTO header_templates (signature, label, column_mapping, matching_settings) VALUES (?, ?, ?, ?)',
    [t.signature, t.label ?? null, t.column_mapping ?? null, t.matching_settings ?? null],
  );
  return r.lastInsertId as number;
}

/** 指定された項目だけをヘッダーテンプレートへ反映する。 */
export async function updateHeaderTemplate(
  id: number,
  patch: HeaderTemplatePatch,
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

/** 指定 ID のヘッダーテンプレートを削除する。 */
export async function deleteHeaderTemplate(id: number): Promise<void> {
  const db = getSharedDb();
  await db.execute('DELETE FROM header_templates WHERE id = ?', [id]);
}
