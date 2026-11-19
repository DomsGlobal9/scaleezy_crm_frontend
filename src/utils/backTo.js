/**
 * Where "←" goes back to, in words (15 Nov): the page you came from, not always "All customers".
 * AppShell notes each page as you leave it; a page with a back link reads the last one.
 */
let previous = null;
let current = null;

export function notePage(path) {
  if (path === current) return;
  previous = current;
  current = path;
}

const PLACES = [
  [/^\/today/, 'To do today'],
  [/^\/sales\/visit/, 'The visit'],
  [/^\/sales/, 'Shop floor'],
  [/^\/week/, 'This week'],
  [/^\/counter/, 'At the door'],
  [/^\/duplicates/, 'Duplicates'],
  [/^\/reviews\/rated-low/, 'Rated low'],
  [/^\/reviews/, 'Reviews'],
  [/^\/groups\/.+/, 'The group'],
  [/^\/groups/, 'Groups'],
  [/^\/segments\/.+/, 'The list'],
  [/^\/segments/, 'Saved lists'],
  [/^\/campaigns/, 'Campaigns'],
  [/^\/settings/, 'Settings'],
  [/^\/festivals/, 'Festivals'],
  [/^\/customers\/?$/, 'All customers'],
  [/^\/customers\/.+/, 'The other customer']
];

/**
 * The page before `here`, with its search, or null. A page asks while it first draws, before AppShell has noted
 * it, so the page noted last is the one before it -- unless it is this page (drawn again).
 */
export function cameFrom(here) {
  const base = (p) => (p ?? '').split('?')[0];
  return current && base(current) !== base(here) ? current : previous && base(previous) !== base(here) ? previous : null;
}

/** The words for the page before `here`, or `fallback` when there was none (opened from a link). */
export function backWords(here, fallback = 'All customers') {
  const from = cameFrom(here);
  if (!from) return fallback;
  const path = from.split('?')[0];
  return PLACES.find(([re]) => re.test(path))?.[1] ?? fallback;
}
