import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Loader2, IndianRupee, Undo2, Star, Wallet, DoorOpen, Eye, MessageCircle, NotebookPen,
  CircleCheck, CircleAlert, CircleSlash, ExternalLink, UserX, ShieldOff, CalendarClock
} from 'lucide-react';
import { useCustomer, useTimeline } from '../hooks/useCustomer';
import { usePermission } from '../hooks/usePermission';
import { formatPhone } from '../utils/phone';
import { formatRupees } from '../utils/money';
import { formatDay, since } from '../utils/dates';
import { INVENTORY_URL } from '../lib/config';
import LoadFailed from '../components/LoadFailed';
import FollowUpsAndNotes from '../components/FollowUpsAndNotes';

/**
 * One customer: who they are and the numbers at the top, everything that happened with them below.
 * Read-only. The first screen staff open before talking to a customer (plan M2 and M3).
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

export default function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = usePermission();
  const customer = useCustomer(id);
  // An old link to someone since merged into another customer: open the one they are now.
  const movedTo = customer.data?.mergedInto;
  React.useEffect(() => { if (movedTo) navigate(`/customers/${movedTo}`, { replace: true }); }, [movedTo, navigate]);

  // "← Customers" goes back to the list as it was left (search and page are in its address).
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
    <main className="crm-page">
      <button type="button" className="cp-back" onClick={back}><ArrowLeft size={14} /> Customers</button>

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
          <section className="cp-top">
            <Profile profile={customer.data.profile} />
            <Numbers numbers={customer.data.numbers} favourites={customer.data.favourites} />
          </section>
          <section className="cp-split">
            <FollowUpsAndNotes customerId={customer.data.profile.id} />
            <Timeline id={id} />
          </section>
        </>
      )}
    </main>
  );
}

function Fact({ label, children }) {
  return (
    <div className="cp-fact">
      <small>{label}</small>
      <span>{children || <span className="crm-muted">—</span>}</span>
    </div>
  );
}

function Profile({ profile: p }) {
  const address = p.addresses[0]
    ? `${p.addresses[0].line}${p.addresses[0].pincode ? ` ${p.addresses[0].pincode}` : ''}`
    : (p.shippingAddress || p.billingAddress || null);
  const moreAddresses = Math.max(0, p.addresses.length - 1);
  const inventoryLink = (p.links ?? []).find(l => l.source === 'inventory');

  return (
    <div className="crm-card cp-who" data-testid="profile">
      <h1>{p.name}</h1>
      <div className="cp-code">
        {[p.code, p.companyName, p.customerType === 'WALK_IN' ? 'Walk-in' : null, `Customer since ${formatDay(p.createdAt)}`].filter(Boolean).join(' · ')}
        {p.tags.map(t => <span key={t} className="crm-tag" style={{ marginLeft: 6 }}>{t}</span>)}
      </div>
      <div className="cp-facts">
        <Fact label="Phone">{p.phone ? formatPhone(p.phone) : null}</Fact>
        <Fact label="Email">{p.email}</Fact>
        <Fact label="Birthday">{dayOfYear(p.birthday)}</Fact>
        <Fact label="Anniversary">{dayOfYear(p.anniversary)}</Fact>
        <Fact label="Address">{address ? `${address}${moreAddresses ? ` (+${moreAddresses} more)` : ''}` : null}</Fact>
        <Fact label="GSTIN">{p.gstNumber}</Fact>
      </div>
      <Consent consent={p.consent} />
      {/* Only for a person Inventory knows: CRM's own id is not Inventory's (plan §14). */}
      {inventoryLink && (
        <div className="cp-actions">
          <a className="btn-secondary cp-btn" href={`${INVENTORY_URL}/customers/${encodeURIComponent(inventoryLink.externalId)}`} target="_blank" rel="noreferrer">
            <ExternalLink size={14} /> Open in Inventory
          </a>
        </div>
      )}
    </div>
  );
}

/** WhatsApp consent, with the proof the DPDP Act asks for: who recorded it, and when. */
function Consent({ consent: c }) {
  if (c.stoppedAt) {
    return <span className="cp-consent no" data-testid="consent"><CircleSlash size={15} /> Replied STOP on {formatDay(c.stoppedAt)}: no offers on WhatsApp</span>;
  }
  if (c.whatsappOffers) {
    const proof = [c.by ? `taken by ${c.by}` : null, c.at ? `on ${formatDay(c.at)}` : null].filter(Boolean).join(' ');
    return <span className="cp-consent" data-testid="consent"><CircleCheck size={15} /> WhatsApp offers: yes{proof ? ` · ${proof}` : ''}</span>;
  }
  return <span className="cp-consent no" data-testid="consent"><CircleAlert size={15} /> WhatsApp offers: not agreed yet</span>;
}

function Num({ label, value, note, testid }) {
  return (
    <div className="cp-num" data-testid={testid}>
      <small>{label}</small>
      <strong>{value}</strong>
      {note && <em>{note}</em>}
    </div>
  );
}

function Numbers({ numbers: n, favourites: f }) {
  const kinds = f.kinds.map(k => k.toLowerCase());
  const tastes = [
    kinds.length ? <span key="k">Buys mostly <strong>{kinds.join(', ')}</strong></span> : null,
    // One size: "size L". Several kinds of garment: "sizes saree Free, kurti M" (an unknown kind is just its size).
    f.sizes.length ? <span key="s">{f.sizes.length === 1 ? 'size ' : 'sizes '}<strong>{f.sizes.length === 1 ? f.sizes[0].size : f.sizes.map(s => (s.kind === 'Other' ? s.size : `${s.kind.toLowerCase()} ${s.size}`)).join(', ')}</strong></span> : null,
    f.colours.length ? <span key="c">colours <strong>{f.colours.join(', ')}</strong></span> : null
  ].filter(Boolean);

  return (
    <div className="crm-card cp-numbers" data-testid="numbers">
      <div className="cp-nums">
        <Num testid="num-spend" label="Lifetime spend" value={formatRupees(n.lifetimeSpend)} note={n.bills === 1 ? '1 bill' : `${n.bills} bills`} />
        <Num testid="num-average" label="Average bill" value={n.averageBill === null ? '—' : formatRupees(n.averageBill)} note={n.averageBillOver === 'year' ? 'last 12 months' : n.averageBillOver === 'all' ? 'all bills' : null} />
        <Num testid="num-last" label="Last visit" value={n.lastVisit ? formatDay(n.lastVisit) : 'Not yet'} note={n.lastVisit ? since(n.lastVisit) : null} />
        <Num testid="num-points" label="Points" value={n.loyaltyPoints.toLocaleString('en-IN')} />
        <Num testid="num-credit" label="Store credit" value={formatRupees(n.storeCredit)} />
        <Num testid="num-returns" label="Returns" value={n.returns.toLocaleString('en-IN')} note={n.returns ? `${formatRupees(n.refunded)} refunded` : null} />
      </div>
      {n.bills > 0 && <div className="crm-muted">{n.inStore} in the shop · {n.online} online</div>}
      {tastes.length > 0 && <div className="crm-muted cp-tastes" data-testid="tastes">{tastes.reduce((acc, el, i) => (i ? [...acc, ' · ', el] : [el]), [])}</div>}
    </div>
  );
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
    <section className="crm-card cp-timeline" data-testid="timeline">
      <div className="cp-tl-head">
        <h2>Timeline</h2>
        <div className="cp-chips" role="tablist" aria-label="Show">
          {FILTERS.map(f => (
            <button key={f.key} type="button" role="tab" aria-selected={kind === f.key}
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
