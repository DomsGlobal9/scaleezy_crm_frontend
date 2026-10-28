import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Loader2, IndianRupee, Undo2, Star, Wallet, DoorOpen, Eye, MessageCircle, NotebookPen,
  CircleCheck, CircleAlert, CircleSlash, ExternalLink, UserX, ShieldOff, CalendarClock, ShieldCheck, ChevronRight,
  Phone, Mail, MapPin, Cake, Heart, Receipt
} from 'lucide-react';
import { useCounterCard } from '../hooks/useCounter';
import { useCustomer, useTimeline } from '../hooks/useCustomer';
import { usePermission } from '../hooks/usePermission';
import { formatPhone } from '../utils/phone';
import { formatRupees } from '../utils/money';
import { formatDay, since } from '../utils/dates';
import { INVENTORY_URL } from '../lib/config';
import LoadFailed from '../components/LoadFailed';
import FollowUpsAndNotes from '../components/FollowUpsAndNotes';
import ConsentRecord from '../components/ConsentRecord';
import WhatTheyWear, { readStore } from '../components/WhatTheyWear';
import FestivalBuying from '../components/FestivalBuying';

/**
 * One customer: who they are and their numbers in one header; below, what they wear, their
 * festivals and the timeline as tabs, with follow-ups and notes beside them (a tab of their own on
 * a phone). The owner approved the shorter page, 28 Oct: it was too long. The first screen staff
 * open before talking to a customer (plan M2 and M3).
 */

const FILTERS = [
  { key: 'all', label: 'Everything' },
  { key: 'bills', label: 'Bills' },
  { key: 'returns', label: 'Returns' },
  { key: 'points', label: 'Points & credit' },
  { key: 'visits', label: 'Visits' },
  { key: 'messages', label: 'Messages' },
  { key: 'notes', label: 'Notes & follow-ups' }
];

const KIND = {
  bill: { icon: IndianRupee, tone: 'bill' },
  return: { icon: Undo2, tone: 'ret' },
  points: { icon: Star, tone: 'pts' },
  credit: { icon: Wallet, tone: 'pts' },
  visit: { icon: DoorOpen, tone: '' },
  online: { icon: Eye, tone: '' },
  message: { icon: MessageCircle, tone: 'msg' },
  consent: { icon: ShieldCheck, tone: 'consent' },
  note: { icon: NotebookPen, tone: '' },
  followup: { icon: CalendarClock, tone: 'fu' }
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "08-14" -> "14 Aug": a day without a year, as Inventory stores birthdays. */
function dayOfYear(mmdd) {
  const m = /^(\d{2})-(\d{2})$/.exec(mmdd || '');
  if (!m || !MONTHS[Number(m[1]) - 1]) return null;
  return `${Number(m[2])} ${MONTHS[Number(m[1]) - 1]}`;
}

const timeOf = (iso) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
const dayKey = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
function dayHeading(iso) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  const label = formatDay(iso);
  if (dayKey(d) === dayKey(today)) return `Today, ${label}`;
  if (dayKey(d) === dayKey(yesterday)) return `Yesterday, ${label}`;
  return label;
}

function amountText(e) {
  if (e.amount === null || e.amount === undefined) return null;
  if (e.unit === 'points') return `${e.amount > 0 ? '+' : e.amount < 0 ? '−' : ''}${Math.abs(e.amount).toLocaleString('en-IN')}`;
  const r = formatRupees(Math.abs(e.amount));
  if (e.kind === 'credit') return `${e.amount >= 0 ? '+' : '−'}${r}`;
  return e.amount < 0 ? `−${r}` : r;
}

const TABS = [
  { key: 'wear', label: 'What they wear' },
  { key: 'festivals', label: 'Festivals' },
  { key: 'timeline', label: 'Timeline' },
  { key: 'work', label: 'Follow-ups', phoneOnly: true }
];

export default function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = usePermission();
  const customer = useCustomer(id);
  const [params, setParams] = useSearchParams();
  // An old link to someone since merged into another customer: open the one they are now.
  const movedTo = customer.data?.mergedInto;
  React.useEffect(() => { if (movedTo) navigate(`/customers/${movedTo}`, { replace: true }); }, [movedTo, navigate]);

  // The open tab is in the address, so Back and a shared link keep it. Arriving to add a follow-up
  // (?followup=1) opens Follow-ups on a phone; on a laptop they are always beside the tabs.
  const asked = params.get('tab');
  const tab = TABS.some(t => t.key === asked) ? asked : params.get('followup') === '1' ? 'work' : 'wear';
  const show = (key) => setParams(prev => { const next = new URLSearchParams(prev); next.set('tab', key); return next; }, { replace: true });

  // "← All customers" goes back to the list as it was left (search and page are in its address).
  const back = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/customers'));

  if (!can('customer:view')) {
    return (
      <div className="crm-notice">
        <div className="crm-card">
          <ShieldOff size={28} style={{ color: 'var(--accent-warning)' }} />
          <h2>You cannot see customers</h2>
          <p>Your role does not include seeing customers. Ask whoever manages your team if you need this.</p>
        </div>
      </div>
    );
  }

  return (
    <main className="crm-page cp-page">
      <button type="button" className="cp-back" onClick={back}><ArrowLeft size={14} /> All customers</button>

      {customer.isLoading || movedTo ? (
        <div className="crm-card crm-row crm-muted" aria-busy="true"><Loader2 size={16} className="animate-spin" /> Loading the customer…</div>
      ) : customer.isError && customer.error?.statusCode === 404 ? (
        <div className="crm-card">
          <div className="crm-empty">
            <UserX size={26} />
            <h3>This customer could not be found</h3>
            <p>They may have been removed, or the link is from another shop.</p>
            <Link className="btn-secondary" to="/customers">Back to customers</Link>
          </div>
        </div>
      ) : customer.isError ? (
        <div className="crm-card"><LoadFailed what="this customer" error={customer.error} onRetry={() => customer.refetch()} /></div>
      ) : (
        <>
          <Header profile={customer.data.profile} numbers={customer.data.numbers} />
          <section className={`cp-body${tab === 'work' ? ' on-work' : ''}`}>
            <div className="crm-card cp-main">
              <div className="cp-tabs" role="tablist" aria-label="About this customer">
                {TABS.map(t => (
                  <button key={t.key} type="button" role="tab" id={`cp-tab-${t.key}`} aria-selected={tab === t.key}
                    className={`cp-tab${tab === t.key ? ' on' : ''}${t.phoneOnly ? ' phone-only' : ''}`} onClick={() => show(t.key)}>
                    {t.label}
                  </button>
                ))}
              </div>
              {/* Follow-ups are a tab on a phone only; on a laptop that tab shows What they wear. */}
              <div className="cp-pane" role="tabpanel" aria-labelledby={`cp-tab-${tab === 'work' ? 'wear' : tab}`}>
                {tab === 'timeline' ? <Timeline id={id} />
                  : tab === 'festivals' ? <FestivalsTab customerId={customer.data.profile.id} />
                  : <WhatTheyWear customerId={customer.data.profile.id} onFestivals={() => show('festivals')} />}
              </div>
            </div>
            <FollowUpsAndNotes customerId={customer.data.profile.id} />
          </section>
        </>
      )}
    </main>
  );
}

const initials = (name) => (name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
const monthYear = (iso) => new Date(iso).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });

/** Only what is known: an empty field is left out rather than shown as a dash. */
function Reach({ icon: Icon, label, children }) {
  if (!children) return null;
  return (
    <span className="cp-reach-item" title={label}>
      <Icon size={14} aria-hidden="true" /><span className="sr-only">{label}: </span><span>{children}</span>
    </span>
  );
}

/**
 * Who they are, how to reach them, and their numbers: one card (the owner, 28 Oct: the page was too
 * long). Points, credit and returns show only when there are some.
 */
function Header({ profile: p, numbers: n }) {
  const address = p.addresses[0]
    ? `${p.addresses[0].line}${p.addresses[0].pincode ? ` ${p.addresses[0].pincode}` : ''}`
    : (p.shippingAddress || p.billingAddress || null);
  const moreAddresses = Math.max(0, p.addresses.length - 1);
  const inventoryLink = (p.links ?? []).find(l => l.source === 'inventory');
  const inventoryHref = inventoryLink ? `${INVENTORY_URL}/customers/${encodeURIComponent(inventoryLink.externalId)}` : null;

  return (
    <section className="crm-card cp-head" data-testid="profile">
      <div className="cp-head-top">
        <span className="cp-av" aria-hidden="true">{initials(p.name)}</span>
        <div className="cp-who">
          <h1>{p.name}{p.tags.map(t => <span key={t} className="crm-tag">{t}</span>)}</h1>
          <div className="cp-code">
            {[p.code, p.companyName, p.customerType === 'WALK_IN' ? 'Walk-in' : null, `customer since ${monthYear(p.createdAt)}`].filter(Boolean).join(' · ')}
          </div>
        </div>
        <div className="cp-head-acts">
          <Consent consent={p.consent} customerId={p.id} name={p.name} inventoryHref={inventoryHref} />
          {/* Only for a person Inventory knows: CRM's own id is not Inventory's (plan §14). */}
          {inventoryHref && (
            <a className="btn-secondary cp-btn" href={inventoryHref} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Open in Inventory</a>
          )}
        </div>
      </div>
      <div className="cp-reach">
        <Reach icon={Phone} label="Phone">{p.phone ? formatPhone(p.phone) : null}</Reach>
        <Reach icon={Mail} label="Email">{p.email}</Reach>
        <Reach icon={MapPin} label="Address">{address ? `${address}${moreAddresses ? ` (+${moreAddresses} more)` : ''}` : null}</Reach>
        <Reach icon={Cake} label="Birthday">{dayOfYear(p.birthday)}</Reach>
        <Reach icon={Heart} label="Anniversary">{dayOfYear(p.anniversary)}</Reach>
        <Reach icon={Receipt} label="GSTIN">{p.gstNumber}</Reach>
      </div>
      <div className="cp-nums" data-testid="numbers">
        <Num testid="num-spend" value={formatRupees(n.lifetimeSpend)}
          note={`${n.bills === 1 ? '1 bill' : `${n.bills} bills`}${n.online > 0 ? ` · ${n.online} online` : ''}`} />
        <Num testid="num-average" value={n.averageBill === null ? '—' : formatRupees(n.averageBill)} note={n.averageBillOver === 'year' ? 'a bill, last 12 months' : 'a bill'} />
        <Num testid="num-last" value={n.lastVisit ? formatDay(n.lastVisit) : 'Not yet'} note={n.lastVisit ? `last visit, ${since(n.lastVisit)}` : 'no visit yet'} />
        {n.loyaltyPoints > 0 && <Num testid="num-points" value={n.loyaltyPoints.toLocaleString('en-IN')} note="points" />}
        {n.storeCredit > 0 && <Num testid="num-credit" value={formatRupees(n.storeCredit)} note="store credit" />}
        {n.returns > 0 && <Num testid="num-returns" value={n.returns.toLocaleString('en-IN')} note={`${n.returns === 1 ? 'return' : 'returns'}, ${formatRupees(n.refunded)} refunded`} />}
      </div>
    </section>
  );
}

/**
 * WhatsApp consent, with the proof the DPDP Act asks for: who recorded it, and when. A button: it
 * opens the whole record (every yes, no and STOP, and where each came from).
 */
function Consent({ consent: c, customerId, name, inventoryHref }) {
  const [open, setOpen] = useState(false);
  let tone = 'no';
  let icon = <CircleAlert size={15} />;
  let words = 'WhatsApp offers: not agreed yet';
  if (c.stoppedAt) {
    icon = <CircleSlash size={15} />;
    words = `Replied STOP on ${formatDay(c.stoppedAt)}: no offers on WhatsApp`;
  } else if (c.whatsappOffers) {
    const proof = [c.by ? `taken by ${c.by}` : null, c.at ? `on ${formatDay(c.at)}` : null].filter(Boolean).join(' ');
    tone = '';
    icon = <CircleCheck size={15} />;
    words = `WhatsApp offers: yes${proof ? ` · ${proof}` : ''}`;
  }
  return (
    <>
      <button type="button" className={`cp-consent${tone ? ` ${tone}` : ''}`} data-testid="consent" onClick={() => setOpen(true)} aria-haspopup="dialog">
        {icon} <span>{words}</span> <span className="cp-consent-more">Record <ChevronRight size={14} /></span>
      </button>
      {open && <ConsentRecord customerId={customerId} name={name} inventoryHref={inventoryHref} onClose={() => setOpen(false)} />}
    </>
  );
}

function Num({ value, note, testid }) {
  return (
    <div className="cp-num" data-testid={testid}>
      <strong>{value}</strong>
      {note && <span>{note}</span>}
    </div>
  );
}

/** The Festivals tab: the same reading as What they wear, its festival part in full. */
function FestivalsTab({ customerId }) {
  const card = useCounterCard(customerId, readStore());
  if (card.isLoading) return <div className="crm-row crm-muted" aria-busy="true"><Loader2 size={16} className="animate-spin" /> Reading their festivals…</div>;
  if (card.isError) return <LoadFailed what="their festivals" error={card.error} onRetry={() => card.refetch()} />;
  return <FestivalBuying data={card.data.festivals} />;
}

function Timeline({ id }) {
  const [kind, setKind] = useState('all');
  const timeline = useTimeline(id, kind);
  const events = useMemo(() => (timeline.data?.pages ?? []).flatMap(p => p.events), [timeline.data]);

  // Grouped by day, in the order they came.
  const days = useMemo(() => {
    const out = [];
    for (const e of events) {
      const key = dayKey(e.at);
      if (!out.length || out[out.length - 1].key !== key) out.push({ key, heading: dayHeading(e.at), events: [] });
      out[out.length - 1].events.push(e);
    }
    return out;
  }, [events]);

  return (
    <section className="cp-timeline" data-testid="timeline">
      <div className="cp-tl-head">
        <div className="cp-chips" role="group" aria-label="Show">
          {FILTERS.map(f => (
            <button key={f.key} type="button" aria-pressed={kind === f.key}
              className={`cp-chip${kind === f.key ? ' on' : ''}`} onClick={() => setKind(f.key)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {timeline.isLoading ? (
        <div className="crm-row crm-muted" aria-busy="true" style={{ padding: '12px 0' }}><Loader2 size={16} className="animate-spin" /> Loading the timeline…</div>
      ) : timeline.isError ? (
        <LoadFailed what="the timeline" error={timeline.error} onRetry={() => timeline.refetch()} />
      ) : events.length === 0 ? (
        <div className="crm-empty" data-testid="timeline-empty">
          <h3>{kind === 'all' ? 'Nothing here yet' : 'None of these yet'}</h3>
          <p>{kind === 'all' ? 'Bills, returns, visits and messages appear here as they happen.' : 'Choose Everything to see all that happened with this customer.'}</p>
        </div>
      ) : (
        <div>
          {days.map(d => (
            <div key={d.key}>
              <div className="cp-day">{d.heading}</div>
              {d.events.map(e => <Event key={e.id} event={e} />)}
            </div>
          ))}
        </div>
      )}

      {timeline.hasNextPage && (
        <div className="crm-row" style={{ justifyContent: 'center', paddingTop: 6 }}>
          <button type="button" className="btn-secondary" disabled={timeline.isFetchingNextPage} onClick={() => timeline.fetchNextPage()}>
            {timeline.isFetchingNextPage ? 'Loading…' : 'Show earlier'}
          </button>
        </div>
      )}
    </section>
  );
}

function Event({ event: e }) {
  const k = KIND[e.kind] ?? KIND.note;
  const Icon = k.icon;
  const amount = amountText(e);
  return (
    <div className={`cp-ev${e.flag ? ` ${e.flag}` : ''}`} data-testid="event" data-kind={e.kind} data-id={e.id}>
      <div className={`cp-ico ${k.tone}`} aria-hidden="true"><Icon size={16} /></div>
      <div style={{ minWidth: 0 }}>
        <div className="cp-ev-title">{e.title}</div>
        {e.detail && (e.kind === 'note' ? <div className="cp-note">{e.detail}</div> : <div className="cp-ev-detail">{e.detail}</div>)}
      </div>
      <div className="cp-ev-end">
        {amount && <div className={`cp-amt${e.flag === 'cancelled' ? ' struck' : ''}`}>{amount}</div>}
        {/* A note carries a day, not a moment, so it has no time of its own. */}
        {!e.dayOnly && <div className="cp-when">{timeOf(e.at)}</div>}
      </div>
    </div>
  );
}
