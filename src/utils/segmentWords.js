import { formatRupees } from './money';

/**
 * Segment rules in the shop's words (backend: services/segments/rules.ts). One list drives both the
 * builder (what can be added, and how it is filled in) and the sentence every saved segment reads as:
 * "Customers who spent at least ₹20,000 and haven't been back in 60 days".
 */
const WHEN = { this_week: 'this week', this_month: 'this month', next_month: 'next month' };
export const WHEN_CHOICES = [['this_week', 'this week'], ['this_month', 'this month'], ['next_month', 'next month']];

const list = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}`);

/** The rules that can be added, in the order the menu offers them. */
export const RULES = [
  { key: 'spentAtLeast', label: 'Spent at least…', input: 'rupees', start: 10000, says: v => `spent at least ${formatRupees(v)}` },
  { key: 'spentAtMost', label: 'Spent at most…', input: 'rupees', start: 5000, says: v => `spent at most ${formatRupees(v)}` },
  { key: 'billsAtLeast', label: 'Bought at least … times', input: 'count', start: 3, says: v => `bought at least ${v} ${v === 1 ? 'time' : 'times'}` },
  { key: 'notSeenForDays', label: "Haven't been back in … days", input: 'days', start: 60, says: v => `haven't been back in ${v} days` },
  { key: 'seenWithinDays', label: 'Came in within the last … days', input: 'days', start: 30, says: v => `came in within the last ${v} days` },
  { key: 'neverBought', label: 'Have never bought', input: 'flag', start: true, says: () => 'have never bought' },
  { key: 'birthday', label: 'Birthday…', input: 'when', start: 'this_month', says: v => `have a birthday ${WHEN[v]}` },
  { key: 'anniversary', label: 'Anniversary…', input: 'when', start: 'this_month', says: v => `have an anniversary ${WHEN[v]}` },
  { key: 'boughtKinds', label: 'Bought a kind of garment…', input: 'kinds', start: [], says: v => `bought ${list(v)}` },
  { key: 'channel', label: 'Bought in the shop or online…', input: 'channel', start: 'in_store', says: v => (v === 'online' ? 'bought online' : 'bought in the shop') },
  { key: 'groups', label: 'In a group…', input: 'groups', start: [], says: v => `are in ${list(v)}` },
  { key: 'whatsapp', label: 'WhatsApp offers…', input: 'whatsapp', start: 'agreed', says: v => (v === 'agreed' ? 'agreed to WhatsApp offers' : 'have not agreed to WhatsApp offers') },
  { key: 'hasPoints', label: 'Have loyalty points', input: 'flag', start: true, says: () => 'have loyalty points' },
  { key: 'hasCredit', label: 'Have store credit', input: 'flag', start: true, says: () => 'have store credit' }
];
export const RULE = Object.fromEntries(RULES.map(r => [r.key, r]));

/** Is this rule filled in enough to send? (A kind or group rule with nothing chosen is not.) */
export const ready = (key, value) => (Array.isArray(value) ? value.length > 0 : value !== '' && value !== null && value !== undefined && !(typeof value === 'number' && Number.isNaN(value)));

/** The rules to send: only the filled-in ones. */
export function cleanRules(rules) {
  return Object.fromEntries(Object.entries(rules).filter(([k, v]) => RULE[k] && ready(k, v)));
}

/** "Customers who spent at least ₹20,000 and haven't been back in 60 days" */
export function sentence(rules, { lead = 'Customers who' } = {}) {
  const parts = RULES.filter(r => ready(r.key, rules?.[r.key])).map(r => r.says(rules[r.key]));
  if (parts.length === 0) return 'Every customer (add a rule to narrow it down)';
  return `${lead} ${parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`}`;
}

/** Ideas to start from when a shop has no segments yet: the questions shops ask most. */
export const STARTERS = [
  { name: 'Big spenders not seen lately', rules: { spentAtLeast: 20000, notSeenForDays: 60 }, why: 'Worth a call before they forget you.' },
  { name: 'Birthdays this month', rules: { birthday: 'this_month' }, why: 'A wish, or an offer for the occasion.' },
  { name: 'Regulars', rules: { billsAtLeast: 5 }, why: 'Your loyal ones: first to hear of new stock.' },
  { name: 'Can get WhatsApp offers', rules: { whatsapp: 'agreed' }, why: 'Who a message can actually reach.' }
];
