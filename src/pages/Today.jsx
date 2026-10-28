import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Cake, Heart, Phone, CalendarCheck2, ShieldOff } from 'lucide-react';
import { usePermission } from '../hooks/usePermission';
import { useFollowUpDone, useToday } from '../hooks/useWork';
import { formatPhone } from '../utils/phone';
import { formatRupees } from '../utils/money';
import { dayWords } from '../utils/days';
import { formatDay } from '../utils/dates';
import FollowUpTag from '../components/FollowUpTag';
import LoadFailed from '../components/LoadFailed';

/**
 * Today (plan §6, screen 3; approved mockup 27 Oct): who to call, who to wish, who has not been back.
 * In the shop's own day. "Mine" by default -- what I promised -- and everyone's one tap away.
 */
export default function Today() {
  const { can } = usePermission();
  const [scope, setScope] = useState('mine');
  const today = useToday(scope);
  const done = useFollowUpDone();
  const d = today.data;

  if (!can('customer:view')) {
    return (
      <div className="crm-notice"><div className="crm-card">
        <ShieldOff size={28} style={{ color: 'var(--accent-warning)' }} />
        <h2>You cannot see customers</h2>
        <p>Your role does not include seeing customers. Ask whoever manages your team if you need this.</p>
      </div></div>
    );
  }

  const heading = d ? new Date(`${d.today}T12:00:00Z`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }) : '';

  return (
    <main className="crm-page td-page">
      <div className="crm-head">
        <div style={{ minWidth: 0 }}>
          <h1>Today</h1>
          <p>{heading ? `${heading}: who to call, who to wish, who has not been back.` : 'Who to call, who to wish, who has not been back.'}</p>
        </div>
        <div className="cp-chips" role="tablist" aria-label="Whose follow-ups">
          {[['mine', 'Mine'], ['everyone', 'Everyone\'s']].map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={scope === k} className={`cp-chip${scope === k ? ' on' : ''}`} onClick={() => setScope(k)}>{l}</button>
          ))}
        </div>
      </div>

      {today.isLoading ? (
        <div className="crm-card crm-row crm-muted" aria-busy="true"><Loader2 size={16} className="animate-spin" /> Loading today…</div>
      ) : today.isError ? (
        <div className="crm-card"><LoadFailed what="today" error={today.error} onRetry={() => today.refetch()} /></div>
      ) : (
        <>
          <nav className="td-jump" aria-label="On this page">
            <a href="#td-followups" className="td-jump-item" data-testid="tile-followups">
              <strong>{d.followUps.length}</strong>
              <span>follow-up{d.followUps.length === 1 ? '' : 's'} due{d.overdue ? <em>, {d.overdue} overdue</em> : null}</span>
            </a>
            <a href="#td-wishes" className="td-jump-item" data-testid="tile-wishes">
              <strong>{d.wishes.length}</strong>
              <span>birthday{d.wishes.length === 1 ? '' : 's'} and anniversar{d.wishes.length === 1 ? 'y' : 'ies'} this week</span>
            </a>
            <a href="#td-notseen" className="td-jump-item" data-testid="tile-notseen">
              <strong>{d.notSeenTotal}</strong>
              <span>regular{d.notSeenTotal === 1 ? '' : 's'} not seen in {d.rules.notSeenDays} days</span>
            </a>
          </nav>

          <section className="crm-card td-sec" id="td-followups" aria-labelledby="td-f">
            <div className="td-sec-head">
              <h2 id="td-f">Follow-ups due</h2>
              <span className="crm-muted">{d.upcoming ? `${d.upcoming} more later` : 'Overdue first, then today'}</span>
            </div>
            {d.followUps.length === 0 ? (
              <div className="td-empty" data-testid="followups-empty">
                <CalendarCheck2 size={22} />
                <p>{scope === 'mine' ? 'Nothing due for you today.' : 'Nothing due for anyone today.'} Add a follow-up from a customer's page when you promise to call them back.</p>
              </div>
            ) : (
              <div className="td-tags">
                {d.followUps.map(f => (
                  <FollowUpTag key={f.id} followUp={f} today={d.today} canAct={can('customer:update')} busy={done.isPending}
                    customer={f.customer} showWho={scope === 'everyone'}
                    onDone={() => done.mutate({ id: f.id, done: true })} />
                ))}
              </div>
            )}
          </section>

          <section className="crm-card td-sec" id="td-wishes" aria-labelledby="td-w">
            <div className="td-sec-head">
              <h2 id="td-w">Birthdays and anniversaries</h2>
              <span className="crm-muted">Today and the next {d.rules.wishDays - 1} days</span>
            </div>
            {d.wishes.length === 0 ? (
              <p className="td-empty-line">None this week.</p>
            ) : d.wishes.map(w => (
              <div key={`${w.customerId}:${w.what}`} className="td-row" data-testid="wish">
                <div className="td-person">
                  <Link to={`/customers/${w.customerId}`}>{w.name}</Link>
                  {w.phone && <a className="fu-phone" href={`tel:${w.phone}`}><Phone size={12} /> {formatPhone(w.phone)}</a>}
                </div>
                <div className="td-what">
                  {w.what === 'birthday' ? <Cake size={16} aria-hidden="true" /> : <Heart size={16} aria-hidden="true" />}
                  <span>{w.what === 'birthday' ? 'Birthday' : 'Anniversary'} {w.inDays === 0 ? <strong>today</strong> : w.inDays === 1 ? 'tomorrow' : `on ${dayWords(w.day, d.today)}`}</span>
                </div>
                <span className={`td-pill${w.whatsappOffers ? '' : ' no'}`}>
                  {w.stopped ? 'Replied STOP: wish in person' : w.whatsappOffers ? 'Agreed to WhatsApp' : 'No WhatsApp consent: wish in person'}
                </span>
              </div>
            ))}
          </section>

          <section className="crm-card td-sec" id="td-notseen" aria-labelledby="td-n">
            <div className="td-sec-head">
              <h2 id="td-n">Not seen lately</h2>
              <span className="crm-muted">Bought {d.rules.notSeenBills} or more times, nothing in {d.rules.notSeenDays} days</span>
            </div>
            {d.notSeen.length === 0 ? (
              <p className="td-empty-line">Every regular has been back in the last {d.rules.notSeenDays} days.</p>
            ) : d.notSeen.map(n => (
              <div key={n.customerId} className="td-row" data-testid="notseen">
                <div className="td-person">
                  <Link to={`/customers/${n.customerId}`}>{n.name}</Link>
                  {n.phone && <a className="fu-phone" href={`tel:${n.phone}`}><Phone size={12} /> {formatPhone(n.phone)}</a>}
                </div>
                <div className="td-what"><span>Last here {formatDay(n.lastVisit)}, {n.daysAway} days ago. {formatRupees(n.totalSpent)} over {n.bills} bills.</span></div>
                {can('customer:update') && <Link className="btn-secondary td-act" to={`/customers/${n.customerId}?followup=1`}>Add follow-up</Link>}
              </div>
            ))}
            {d.notSeenTotal > d.notSeen.length && <p className="crm-muted">Showing the {d.notSeen.length} who spent most of {d.notSeenTotal}.</p>}
          </section>
        </>
      )}
    </main>
  );
}
