/**
 * Shop days ("2026-10-28", the shop's own calendar day, as the service sends them) in words.
 * Worked on the date alone, never through the browser's clock, so a day never shifts by a time zone.
 */
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const parts = (day) => day.split('-').map(Number);
const utc = (day) => { const [y, m, d] = parts(day); return new Date(Date.UTC(y, m - 1, d)); };

export function addDays(day, n) {
  const t = utc(day);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}
export const daysBetween = (from, to) => Math.round((utc(to) - utc(from)) / 86_400_000);

/** "Thu 30 Oct" (and the year when it is not this one). */
export function dayWords(day, today) {
  const t = utc(day);
  const sameYear = today ? day.slice(0, 4) === today.slice(0, 4) : true;
  return `${DAYS[t.getUTCDay()]} ${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]}${sameYear ? '' : ` ${t.getUTCFullYear()}`}`;
}

/** What a follow-up's due day means today: "Today", "Tomorrow", "Overdue since Sat 25 Oct", "Due Thu 30 Oct". */
export function dueWords(dueOn, today) {
  if (!today) return `Due ${dayWords(dueOn)}`;
  const n = daysBetween(today, dueOn);
  if (n < 0) return `Overdue since ${dayWords(dueOn, today)}`;
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  return `Due ${dayWords(dueOn, today)}`;
}

/** The day picker in the browser, "2026-10-28", in the person's own day (the shop's, for staff in the shop). */
export function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
