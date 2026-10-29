import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Loader2, ShieldOff, ArrowRight } from 'lucide-react';
import { api } from '../lib/api';
import { usePermission } from '../hooks/usePermission';
import { formatRupees } from '../utils/money';
import LoadFailed from '../components/LoadFailed';

/**
 * This week, for the owner and admins (the owner approved the mockup, 28 Oct): what the team's
 * follow-ups brought back, in sentences, with each person credited by name. Monday to Sunday in the
 * shop's own days; this week or last.
 *
 * "Came back": bought within 14 days of a follow-up marked done or a Done on To do today. Walk-ins:
 * taken at Inventory's counter (backend services/week).
 */
const dayWords = (day) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const initials = (name) => (name || '?').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
const plural = (n, one, many) => `${n.toLocaleString('en-IN')} ${n === 1 ? one : many}`;

function useWeek(which) {
  return useQuery({ queryKey: ['week', which], queryFn: async () => (await api.get('/week', { params: { which } })).data, placeholderData: keepPreviousData });
}

export default function Week() {
  const { can } = usePermission();
  const [which, setWhich] = useState('this');
  const week = useWeek(which);
  const d = week.data;
  const [all, setAll] = useState(false);

  if (!can('crm:team:view')) {
    return (
      <div className="crm-notice"><div className="crm-card">
        <ShieldOff size={28} style={{ color: 'var(--accent-warning)' }} />
        <h2>This is for the owner and admins</h2>
        <p>How the team did this week is for whoever manages the shop.</p>
      </div></div>
    );
  }

  return (
    <main className="crm-page wk-page">
      <div className="crm-head">
        <div style={{ minWidth: 0 }}>
          <h1>{which === 'this' ? 'This week' : 'Last week'}</h1>
          <p>{d ? `${dayWords(d.week.start)} to ${dayWords(d.week.end)}${d.shopName ? ` · ${d.shopName}` : ''}` : 'How the team did, and who came back.'}</p>
        </div>
        <div className="cp-chips" role="tablist" aria-label="Which week">
          {[['this', 'This week'], ['last', 'Last week']].map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={which === k} className={`cp-chip${which === k ? ' on' : ''}`} onClick={() => { setWhich(k); setAll(false); }}>{l}</button>
          ))}
        </div>
      </div>

      {week.isLoading ? (
        <div className="crm-card crm-row crm-muted" aria-busy="true"><Loader2 size={16} className="animate-spin" /> Adding up the week…</div>
      ) : week.isError ? (
        <div className="crm-card"><LoadFailed what="the week" error={week.error} onRetry={() => week.refetch()} /></div>
      ) : (
        <>
          <section className="wk-lead" data-testid="lead">
            {d.cameBack.customers > 0 ? (
              <p><em>{plural(d.cameBack.customers, 'customer', 'customers')}</em> came back and bought within two weeks of someone getting in touch — <em>{formatRupees(d.cameBack.money)}</em> in their bills.</p>
            ) : (
              <p>Nobody has come back after a follow-up {which === 'this' ? 'yet this week' : 'last week'}.</p>
            )}
            <small>
              {d.cameBack.contacted > 0 && d.cameBack.customers > 0 ? `That is ${d.cameBack.customers} of the ${d.cameBack.contacted} people your team got in touch with. ` : ''}
              {`The week before: ${plural(d.cameBack.lastWeek.customers, 'customer', 'customers')}, ${formatRupees(d.cameBack.lastWeek.money)}.`}
            </small>
          </section>

          <section className="wk-sec" aria-labelledby="wk-team">
            <div className="td-sec-head"><h2 id="wk-team">Credit where it's due</h2><span className="crm-muted">Most brought back first</span></div>
            {d.team.length === 0 ? (
              <div className="crm-card wk-empty" data-testid="team-empty">
                Nothing to credit yet. It fills in as staff mark promises and calls Done on <Link to="/today">To do today</Link>, and as walk-ins are taken at Inventory's counter.
              </div>
            ) : (
              <ul className="wk-team crm-card">
                {d.team.map(p => (
                  <li key={p.key} className="wk-person" data-testid="person">
                    <span className="wk-av" aria-hidden="true">{initials(p.name)}</span>
                    <p><strong>{p.name}</strong> {personWords(p)}</p>
                    <div className="wk-money">{p.cameBack > 0 ? formatRupees(p.money) : '—'}<small>{p.cameBack > 0 ? 'their bills' : 'none back yet'}</small></div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {d.people.length > 0 && (
            <section className="wk-sec" aria-labelledby="wk-back">
              <div className="td-sec-head"><h2 id="wk-back">Who came back</h2><span className="crm-muted">After a follow-up or a message</span></div>
              <ul className="wk-back crm-card">
                {(all ? d.people : d.people.slice(0, 5)).map(c => (
                  <li key={c.customerId} data-testid="came-back">
                    <div><Link to={`/customers/${c.customerId}`}><b>{c.name}</b></Link> <span>· {howWords(c)} · {c.daysLater === 0 ? 'back the same day' : `back ${plural(c.daysLater, 'day', 'days')} later`}</span></div>
                    <div className="wk-amt">{formatRupees(c.amount)}</div>
                  </li>
                ))}
                {d.people.length > 5 && (
                  <li><span>{all ? '' : `and ${d.people.length - 5} more`}</span><button type="button" className="si-link" onClick={() => setAll(v => !v)}>{all ? 'Show fewer' : 'Show all'}</button></li>
                )}
              </ul>
            </section>
          )}

          <div className="wk-two">
            <section className="crm-card wk-mini" data-testid="slipping">
              <h3>Slipping away</h3>
              <p>{d.slipping.count === 0 ? `Every regular has been in within ${d.slipping.days} days.` : `${plural(d.slipping.count, 'regular hasn\'t', 'regulars haven\'t')} been in for ${d.slipping.days} days or more — together they spent ${formatRupees(d.slipping.spent)} with you.${d.slipping.biggest.length ? ` The biggest: ${d.slipping.biggest.map(b => b.name).join(', ')}.` : ''}`}</p>
              {d.slipping.count > 0 && <Link to="/today">On To do today <ArrowRight size={13} /></Link>}
            </section>
            <section className="crm-card wk-mini" data-testid="fresh">
              <h3>New {which === 'this' ? 'this week' : 'last week'}</h3>
              <p>{d.fresh.count === 0 ? 'No first-time customers.' : `${plural(d.fresh.count, 'first-time customer', 'first-time customers')}${d.fresh.viaDoor ? `, ${d.fresh.viaDoor} of them through the door QR` : ''}. ${d.fresh.whatsappYes} agreed to WhatsApp offers.`}</p>
              {d.fresh.count > 0 && <Link to="/customers">All customers <ArrowRight size={13} /></Link>}
            </section>
            {d.feedback?.count > 0 && (
              <section className="crm-card wk-mini" data-testid="feedback">
                <h3>How the visits went</h3>
                <p>{`${plural(d.feedback.count, 'customer rated their visit', 'customers rated their visit')}: ${d.feedback.average.toLocaleString('en-IN')} out of 5 on average.`}
                  {d.feedback.low > 0 ? ` ${plural(d.feedback.low, 'gave', 'gave')} 3 or less: each is a follow-up for the owner.` : ''}
                  {d.feedback.toGoogle > 0 ? ` ${plural(d.feedback.toGoogle, 'went', 'went')} on to Google.` : ''}</p>
              </section>
            )}
          </div>
        </>
      )}
    </main>
  );
}

/** "looked after 22 walk-ins, kept 9 promises and got in touch with 6 regulars. 6 came back." */
function personWords(p) {
  const did = [
    p.walkIns && `looked after ${plural(p.walkIns, 'walk-in', 'walk-ins')}`,
    p.promises && `kept ${plural(p.promises, 'promise', 'promises')}`,
    p.gotInTouch && `got in touch with ${plural(p.gotInTouch, 'regular', 'regulars')}`,
    p.told && `told ${plural(p.told, 'person', 'people')} what they asked about`
  ].filter(Boolean);
  const parts = [];
  if (did.length) parts.push(`${did.length === 1 ? did[0] : `${did.slice(0, -1).join(', ')} and ${did[did.length - 1]}`}.`);
  if (p.cameBack) parts.push(`${p.cameBack} came back.`);
  if (p.lateCount) parts.push(`${plural(p.lateCount, 'promise is', 'promises are')} ${p.mostLate === 1 ? 'a day' : `${p.mostLate} days`} late.`);
  return parts.join(' ') || 'Nothing yet this week.';
}

const HOW = { whatsapp: 'on WhatsApp', call: 'on a call', in_person: 'in person' };
function howWords(c) {
  const by = c.byName || 'Someone';
  if (c.how === 'promise') return `${by} kept a promise${c.what ? `: “${c.what}”` : ''}`;
  if (c.what === 'stock') return `${by} told them what they asked about${HOW[c.how] ? ` ${HOW[c.how]}` : ''}`;
  return `${by} got in touch${HOW[c.how] ? ` ${HOW[c.how]}` : ''}`;
}
