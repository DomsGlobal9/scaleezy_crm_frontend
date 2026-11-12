import React from 'react';
import { formatDay } from '../utils/dates';

/**
 * When a customer came (the owner, 12 Nov): each visit's date, the days between, and how often they
 * usually come. A visit is a shop day with a bill; bills from earlier records have no dates in the old
 * records, so they show as "earlier" and never get a made-up day. Built on services/customers/visits.ts.
 */
const dayIso = (day) => `${day}T12:00:00`;
const ordinal = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`; };
export const daysWord = (n) => (n === 1 ? '1 day' : `${n} days`);
/** "4 months", "3 weeks": how long, for "not back in …". */
export function awayWord(days) {
  if (days >= 365) { const y = Math.floor(days / 365); return y === 1 ? 'a year' : `${y} years`; }
  if (days >= 60) return `${Math.floor(days / 30)} months`;
  if (days >= 14) return `${Math.floor(days / 7)} weeks`;
  return daysWord(days);
}
export const sinceWord = (d) => (d === 0 ? 'today' : d === 1 ? 'yesterday' : `${daysWord(d)} ago`);
export const isRepeat = (v) => !!v && v.total >= 2;

/** The short line under the dots: how often, and how long since. */
export function visitsNote(v) {
  if (!v) return '';
  const parts = [];
  if (v.everyDays) parts.push(`About every ${daysWord(v.everyDays)}`);
  else if (v.lastGap !== null) parts.push(`Came back after ${daysWord(v.lastGap)}`);
  else if (v.earlier > 0 && v.datedCount === 0) parts.push(`${v.earlier} ${v.earlier === 1 ? 'bill' : 'bills'} before CRM, no dates in the old records`);
  else if (v.earlier > 0) parts.push(`${v.earlier} before CRM, no dates`);
  if (v.daysSince !== null && !v.notBack) parts.push(`last ${sinceWord(v.daysSince)}`);
  return parts.join(' · ');
}

/** Dots for each visit with the days between: the last few in a list, more on a customer's page. */
export function VisitTrail({ v, show = 3, note = true }) {
  const dated = v.dated.slice(-show);
  const hidden = v.earlier + (v.datedCount - dated.length);
  return (
    <div className="vt" data-testid="visit-trail">
      <div className="vt-dots">
        {hidden > 0 && (
          <span className="vt-v" title={v.earlier ? 'Bills from before CRM have no dates in the old records' : undefined}>
            <i className="vt-dot old" aria-hidden="true" />
            <span>{hidden} earlier</span>
          </span>
        )}
        {dated.map((d, i) => (
          <React.Fragment key={d.day}>
            {(i > 0 || hidden > 0) && (
              <span className="vt-gap" aria-hidden="true"><i /><em>{i > 0 ? `${Math.round((Date.parse(dayIso(d.day)) - Date.parse(dayIso(dated[i - 1].day))) / 86_400_000)}d` : ''}</em></span>
            )}
            <span className="vt-v" title={d.bills > 1 ? `${d.bills} bills that day` : undefined}>
              <i className="vt-dot" aria-hidden="true" />
              <span>{formatDay(dayIso(d.day))}{d.bills > 1 ? ` ×${d.bills}` : ''}</span>
            </span>
          </React.Fragment>
        ))}
      </div>
      {note && <div className="vt-note">
        {visitsNote(v)}
        {v.notBack && <span className="vt-away" data-testid="visit-away">{visitsNote(v) ? ' · ' : ''}not back in {awayWord(v.daysSince)}</span>}
      </div>}
    </div>
  );
}

/** One line for the customer page, in words, so whoever serves her knows. */
export function visitStory(v, name) {
  const first = (name ?? '').trim().split(/\s+/)[0] || 'They';
  if (!v || v.total === 0) return null;
  if (v.total === 1) {
    return v.lastDay ? { text: `${first} has been here once, on ${formatDay(dayIso(v.lastDay))}.`, away: false }
      : { text: `${first} bought once before CRM (no date in the old records).`, away: false };
  }
  if (v.datedCount === 0) return { text: `${first} bought ${v.total} times before CRM. The old records have no dates.`, away: false };
  const usual = v.everyDays ? ` Usually about every ${daysWord(v.everyDays)}.` : '';
  const after = v.lastGap !== null ? `, ${daysWord(v.lastGap)} after the visit before` : '';
  if (v.daysSince === 0) return { text: `Today is ${first}'s ${ordinal(v.total)} visit${after}.${usual}`, away: false };
  const when = `Last on ${formatDay(dayIso(v.lastDay))} (${sinceWord(v.daysSince)})`;
  if (v.notBack) return { text: `${first} has been here ${v.total} times. ${when}.`, away: `Not back in ${awayWord(v.daysSince)}${v.everyDays ? `; usually about every ${daysWord(v.everyDays)}` : v.lastGap !== null ? `; last time came back after ${daysWord(v.lastGap)}` : ''}.` };
  return { text: `${first} has been here ${v.total} times. ${when}${after}.${usual}`, away: false };
}
