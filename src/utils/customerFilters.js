import { formatRupees } from './money';

/**
 * The filters on All customers, in the shop's words. They send the same rules as Saved lists
 * (backend: services/segments/rules.ts), so a filter saved as a list keeps meaning the same people.
 */
/** A shop's price bands as ranges with words: [["0-3000", "Under ₹3,000"], ...]. Each shop sets its own. */
export const rangeWord = (key) => {
  const [from, to] = String(key).split('-');
  if (Number(from) === 0 && to) return `Under ${formatRupees(Number(to))}`;
  return to ? `${formatRupees(Number(from))} to ${formatRupees(Number(to))}` : `${formatRupees(Number(from))} or more`;
};
export const rangesOf = (bands) => (bands ?? []).map((b, i) => `${i === 0 ? 0 : bands[i - 1]}-${b}`).concat(bands?.length ? [`${bands[bands.length - 1]}-`] : []);
/** Which of the shop's ranges a typical piece falls in. Only a range: what counts as dear is the shop's to say. */
export const budgetOf = (price, bands) => {
  if (price === null || price === undefined) return null;
  const key = rangesOf(bands).find(k => { const [from, to] = k.split('-'); return price >= Number(from) && (!to || price < Number(to)); });
  return key ? rangeWord(key) : null;
};
/** "N%" of a whole, in honest words: never "0%" when some, never "100%" when not all. */
export const shareWord = (part, whole) => {
  const share = whole ? Math.round((part / whole) * 100) : 0;
  return part > 0 && share === 0 ? 'Under 1%' : part < whole && share === 100 ? '99%' : `${share}%`;
};
const WAYS = { UPI: 'UPI', CASH: 'Cash', CARD: 'Card', PAYTM: 'Paytm', CREDIT: 'Credit', STORE_CREDIT: 'Store credit', BANK_TRANSFER: 'Bank transfer', CHEQUE: 'Cheque', WALLET: 'Wallet', OTHER: 'Other' };
export const payWord = (key) => WAYS[String(key ?? '').toUpperCase()] ?? String(key ?? '').replace(/_/g, ' ').toLowerCase().replace(/^./, c => c.toUpperCase());

const BILLS = [['1', '1 bill', { billsAtLeast: 1, billsAtMost: 1 }], ['2', '2 or more', { billsAtLeast: 2 }], ['2to4', '2 to 4', { billsAtLeast: 2, billsAtMost: 4 }], ['5', '5 or more', { billsAtLeast: 5 }]];
const VISIT = [['in30', 'In the last 30 days', { seenWithinDays: 30 }], ['in90', 'In the last 3 months', { seenWithinDays: 90 }], ['out90', 'Not back in 3 months', { notSeenForDays: 90 }], ['out180', 'Not back in 6 months', { notSeenForDays: 180 }]];

/** Choices where one tap sets one or two rules: which is on, and what they set. */
export const ONE_OF = {
  bills: { keys: ['billsAtLeast', 'billsAtMost'], options: BILLS },
  visit: { keys: ['seenWithinDays', 'notSeenForDays'], options: VISIT },
  earlier: { keys: ['earlier'], options: [['earlier', 'From earlier records', { earlier: 'earlier' }], ['new', 'New since joining', { earlier: 'new' }]] },
  channel: { keys: ['channel'], options: [['in_store', 'In the shop', { channel: 'in_store' }], ['online', 'Online', { channel: 'online' }]] },
  birthday: { keys: ['birthday'], options: [['this_week', 'Birthday this week', { birthday: 'this_week' }], ['this_month', 'Birthday this month', { birthday: 'this_month' }]] },
  anniversary: { keys: ['anniversary'], options: [['this_month', 'Anniversary this month', { anniversary: 'this_month' }]] },
  whatsapp: { keys: ['whatsapp'], options: [['agreed', 'Agreed to offers', { whatsapp: 'agreed' }], ['not_agreed', 'Not agreed', { whatsapp: 'not_agreed' }]] }
};
const sameRules = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const picked = (rules, keys) => Object.fromEntries(keys.filter(k => rules[k] !== undefined).map(k => [k, rules[k]]));
export const oneOfOn = (rules, name) => {
  const def = ONE_OF[name];
  return def.options.find(o => sameRules(Object.fromEntries(Object.keys(o[2]).sort().map(k => [k, o[2][k]])), Object.fromEntries(Object.keys(picked(rules, def.keys)).sort().map(k => [k, rules[k]]))))?.[0] ?? null;
};

/** Rules with nothing chosen left out, so the address and the count only carry what is on. */
export function tidy(rules) {
  return Object.fromEntries(Object.entries(rules ?? {}).filter(([, v]) => (Array.isArray(v) ? v.length > 0 : v !== '' && v !== null && v !== undefined && !(typeof v === 'number' && Number.isNaN(v)))));
}

/** What is on, as chips: each with the rules it takes away. */
export function chipsOf(rules) {
  const out = [];
  const add = (group, value, keys) => out.push({ id: keys.join('+'), group, value, keys });
  if (rules.budget) add('Budget', rules.budget.map(rangeWord).join(' or '), ['budget']);
  if (rules.spentAtLeast !== undefined) add('Spent from', formatRupees(rules.spentAtLeast), ['spentAtLeast']);
  if (rules.spentAtMost !== undefined) add('Spent to', formatRupees(rules.spentAtMost), ['spentAtMost']);
  if (rules.boughtOver !== undefined) add('Bought a piece of', `${formatRupees(rules.boughtOver)} or more`, ['boughtOver']);
  if (rules.boughtKinds) add('Buys', rules.boughtKinds.join(' or '), ['boughtKinds']);
  if (rules.fabrics) add('Fabric', rules.fabrics.join(' or '), ['fabrics']);
  if (rules.crafts) add('Craft', rules.crafts.join(' or '), ['crafts']);
  if (rules.colours) add('Colour', rules.colours.join(' or '), ['colours']);
  if (rules.sizes) add('Size', rules.sizes.join(' or '), ['sizes']);
  for (const [name, group] of [['bills', 'Bills'], ['visit', 'Last visit'], ['earlier', 'Past or new'], ['channel', 'Bought'], ['birthday', 'Birthday'], ['anniversary', 'Anniversary'], ['whatsapp', 'Offers']]) {
    const on = oneOfOn(rules, name);
    if (on) add(group, ONE_OF[name].options.find(o => o[0] === on)[1], ONE_OF[name].keys);
  }
  if (rules.returned) add('Returns', 'Has returned something', ['returned']);
  if (rules.pays) add('Usually pays by', rules.pays.map(payWord).join(' or '), ['pays']);
  if (rules.place) add('Place', rules.place, ['place']);
  if (rules.groups) add('Group', rules.groups.join(' or '), ['groups']);
  if (rules.hasPoints) add('Has', 'Points', ['hasPoints']);
  if (rules.hasCredit) add('Has', 'Store credit', ['hasCredit']);
  return out;
}

/** The address holds the filters, so Back and a shared link keep them. Anything unreadable is simply no filters. */
export function readRules(text) {
  if (!text) return {};
  try { const r = JSON.parse(text); return r && typeof r === 'object' && !Array.isArray(r) ? tidy(r) : {}; }
  catch { return {}; }
}
