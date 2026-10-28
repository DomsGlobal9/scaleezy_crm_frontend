import React from 'react';
import { Link } from 'react-router-dom';
import { usePermission } from '../hooks/usePermission';
import { formatRupees } from '../utils/money';

/**
 * Festival buying, at the foot of "What they wear" (the owner approved the mockup, 28 Oct): the
 * festivals this customer buys for, nearest first, each year as a dot. Knowledge for whoever serves
 * them; it puts nobody on a list to call (backend services/festivals).
 */
const dayMonth = (day) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const band = (u) => (u.from === u.to ? formatRupees(u.from) : `${formatRupees(u.from)} – ${formatRupees(u.to)}`);
const lower = (xs) => xs.map(x => x.toLowerCase()).join(', ');
/** "Saree" -> "sarees": kinds of garment as people say them. */
const kindsWords = (xs) => xs.map(x => (/s$/i.test(x) ? x : `${x}s`).toLowerCase()).join(', ');
const timesWords = (n, of) => (n === of ? (of === 1 ? 'last year' : `the last ${of} years`) : `${n} of the last ${of} years`);

function when(f) {
  if (f.justGone && (!f.next || f.next.inDays > f.justGone.daysAgo)) return `${dayMonth(f.justGone.date)} · ${f.justGone.daysAgo === 0 ? 'today' : 'just gone'}`;
  if (!f.next) return null;
  const d = f.next.inDays;
  return `${dayMonth(f.next.date)}${d === 0 ? ' · today' : d === 1 ? ' · tomorrow' : d <= 60 ? ` · in ${d} days` : ''}`;
}

function whatWords(f) {
  const bits = [];
  const allYears = f.years.length > 1 && f.years.every(y => y.bought);
  if (allYears) bits.push('Every year');
  if (f.thisTime) bits.push(`this year ${formatRupees(f.thisTime.amount)} on ${dayMonth(f.thisTime.on)}`);
  else if (f.usual) bits.push(f.timesBought > 1 ? `Usually ${band(f.usual)}` : formatRupees(f.usual.from));
  if (f.kinds.length) bits.push(kindsWords(f.kinds));
  if (f.colours.length) bits.push(lower(f.colours));
  return bits.join(' · ');
}

export default function FestivalBuying({ data }) {
  const { can } = usePermission();
  const mayManage = can('crm:festivals:manage');
  if (!data) return null;
  const { share, festivals, soon, notFor } = data;

  return (
    <div className="fb" data-testid="festivals">
      <div className="fb-head">
        <h3>Festival buying</h3>
        {festivals.length > 0 && share != null && <span data-testid="festival-share">{share}% of what they spend is in the three weeks before a festival</span>}
      </div>

      {festivals.length === 0 ? (
        <p className="crm-muted">Has not bought for a festival yet.</p>
      ) : (
        <>
          {soon && (
            <p className="fb-soon" data-testid="festival-soon">
              <b>{soon.name} is {soon.inDays === 0 ? 'today' : soon.inDays === 1 ? 'tomorrow' : `in ${soon.inDays} days`}</b>
              {` and they bought for it ${timesWords(soon.bought, soon.of)}`}
              {soon.about > 0 ? ` — about ${formatRupees(soon.about)}${soon.bought > 1 ? ' each time' : ''}` : ''}
              {soon.kinds.length ? `, ${kindsWords(soon.kinds)}` : ''}{soon.colours.length ? ` in ${lower(soon.colours)}` : ''}.
            </p>
          )}
          <ul className="fb-list">
            {festivals.map(f => (
              <li key={f.key} className="fb-row" data-testid="festival">
                <div className="fb-name">{f.name}{when(f) && <small>{when(f)}</small>}</div>
                <div className="fb-years" aria-label={`Bought for ${f.name} in ${f.years.filter(y => y.bought).map(y => y.year).join(', ') || 'none of these years'}`}>
                  {f.years.map(y => (
                    <span key={y.date} className={`fb-y${y.bought ? ' on' : ''}`} title={y.bought ? `${y.year}: ${formatRupees(y.amount)}` : `${y.year}: nothing`}>
                      <i aria-hidden="true" />’{String(y.year).slice(2)}
                    </span>
                  ))}
                </div>
                <div className="fb-what">{whatWords(f)}</div>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="fb-foot">
        {festivals.length > 0 && notFor.length > 0 && <span>Has not bought for {notFor.length === 1 ? notFor[0] : `${notFor.slice(0, -1).join(', ')} or ${notFor[notFor.length - 1]}`}.</span>}
        {mayManage && <Link to="/festivals" data-testid="festival-dates">The shop's festivals</Link>}
      </div>
    </div>
  );
}
