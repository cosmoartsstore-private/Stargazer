/** 出欠記録で扱う日付文字列が YYYY-MM-DD 形式かを判定する。 */
export function hasRecordDateFormat(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** Date をローカル日付の YYYY-MM-DD 形式へ変換する。 */
export function formatRecordDateValue(date: Date): string {
  return `${String(date.getFullYear()).padStart(4, '0')}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** YYYY-MM-DD 形式かつ実在するローカル日付だけを Date へ変換する。 */
export function parseRecordDate(value: string): Date | null {
  if (!hasRecordDateFormat(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1) return null;
  // new Date(year, ...) は 0〜99 年を 1900 年台として扱うため、年だけを明示設定する。
  const date = new Date(0);
  date.setHours(12, 0, 0, 0);
  date.setFullYear(year, month - 1, day);
  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) return null;
  return date;
}

/** 月境界を含む固定6週分の日付を、日曜始まりで返す。 */
export function buildCalendarDays(viewDate: Date): Date[] {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const first = new Date(viewDate);
  first.setHours(12, 0, 0, 0);
  first.setFullYear(year, month, 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

/** 数字入力を YYYY-MM-DD の各区切り位置まで整形する。 */
export function formatRecordDateInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}
