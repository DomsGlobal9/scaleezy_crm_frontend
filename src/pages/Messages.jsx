import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Loader2, Megaphone, Plus, ShieldOff, CircleCheck, CircleAlert, Clock, Users } from 'lucide-react';
import { usePermission } from '../hooks/usePermission';
import { useMessages, useMessagesOverview, useSaveWishes, useWishes } from '../hooks/useMessages';
import { formatRupees } from '../utils/money';
import { formatDay } from '../utils/dates';
import LoadFailed from '../components/LoadFailed';
import { rowLink } from '../components/common/rowLink';

/**
 * Messages (Phase 3, the mockup approved 29 Oct): WhatsApp from the shop's own number. The three facts
 * that decide whether a message reaches anybody, then the shop's own messages and the automatic ones
 * (birthday and anniversary wishes) as tabs. Inventory's Campaigns page, moved here.
 */
export const STATUS = {
  draft: { label: 'Draft', tone: 'draft' },
  sending: { label: 'Sending', tone: 'sending' },
  paused: { label: 'Paused', tone: 'draft' },
  stopped: { label: 'Stopped', tone: 'done' },
  done: { label: 'Sent', tone: 'done' }
};
export const StatusPill = ({ status }) => {
  const s = STATUS[status] ?? { label: status, tone: 'done' };
  return <span className={`ms-status ${s.tone}`} data-testid="status">{s.label}</span>;
};

/** Sent, read, the rest: one bar, and the words under it. */
export function Progress({ n, status }) {
  if (!n || status === 'draft') return null;
  const total = Math.max(1, n.total);
  return (
    <>
      <div className="ms-bar" aria-hidden="true">
        <i className="read" style={{ width: `${(n.read / total) * 100}%` }} />
        <i style={{ width: `${((n.handed - n.read) / total) * 100}%` }} />
      </div>
      <div className="ms-legend">
        <span>{status === 'sending' || status === 'paused' ? `${n.handed.toLocaleString('en-IN')} sent of ${n.total.toLocaleString('en-IN')}` : `${n.handed.toLocaleString('en-IN')} sent`}</span>
        <span>{n.read.toLocaleString('en-IN')} read</span>
        {n.tapped > 0 && <span>{n.tapped.toLocaleString('en-IN')} tapped the link</span>}
        {n.skipped + n.failed > 0 && <span>{(n.skipped + n.failed).toLocaleString('en-IN')} not sent</span>}
      </div>
      {n.cameIn > 0 && <div className="ms-came">{n.cameIn.toLocaleString('en-IN')} came in and bought since · {formatRupees(n.cameInAmount)}</div>}
    </>
  );
}

function Facts({ o }) {
  const linked = o?.whatsapp?.status === 'CONNECTED';
  return (
    <div className="ms-facts">
      <div className="crm-card ms-fact" data-testid="fact-whatsapp">
        {linked ? <CircleCheck size={18} className="ok" aria-hidden="true" /> : <CircleAlert size={18} className="warn" aria-hidden="true" />}
        <div>
          <b>{linked ? "Your shop's WhatsApp is linked" : o?.problem ? "Could not check your shop's WhatsApp" : "Your shop's WhatsApp is not linked"}</b>
          <span>{linked ? `Messages go from your own number${o.whatsapp.phone ? `, ${o.whatsapp.phone}` : ''}.` : o?.problem ?? "Messages wait until it is. Link it in Inventory's Settings."}</span>
        </div>
      </div>
      <div className="crm-card ms-fact" data-testid="fact-agreed">
        <Users size={18} aria-hidden="true" />
        <div>
          <b>{(o?.customers.agreed ?? 0).toLocaleString('en-IN')} customers agreed to offers</b>
          <span>Of {(o?.customers.withPhone ?? 0).toLocaleString('en-IN')} with a phone number.{o?.customers.stopped ? ` ${o.customers.stopped.toLocaleString('en-IN')} replied STOP.` : ''}</span>
        </div>
      </div>
      <div className="crm-card ms-fact" data-testid="fact-pace">
        <Clock size={18} aria-hidden="true" />
        <div>
          <b>Up to {o?.perDay ?? 20} a day, {o?.hours ?? '10 am to 8 pm'}</b>
          <span>Sent slowly on purpose, so WhatsApp never blocks your number and bills always get through.</span>
        </div>
      </div>
    </div>
  );
}

function List({ tab, navigate }) {
  const list = useMessages(tab);
  if (list.isLoading) return <div className="crm-card crm-row crm-muted" aria-busy="true"><Loader2 size={16} className="animate-spin" /> Loading the messages…</div>;
  if (list.isError) return <div className="crm-card"><LoadFailed what="the messages" error={list.error} onRetry={() => list.refetch()} /></div>;
  const rows = list.data ?? [];
  if (rows.length === 0) {
    return (
      <div className="crm-card">
        <div className="crm-empty">
          <Megaphone size={26} aria-hidden="true" />
          <h3>{tab === 'shop' ? 'No messages yet' : 'No wishes sent yet'}</h3>
          <p>{tab === 'shop' ? 'Write one message, choose who gets it, and CRM sends it to each customer by name.' : 'Wishes, "How was your visit?" and news of new stock show here once they are switched on.'}</p>
        </div>
      </div>
    );
  }
  return (
    <ul className="ms-list" aria-label="Messages">
      {rows.map(m => (
        <li key={m.id} data-testid="message" {...rowLink(() => navigate(`/messages/${m.id}`), { label: `Open ${m.name}` })} className="crm-card ms-item row-link">
          <div className="ms-item-top">
            <div style={{ minWidth: 0 }}>
              <Link to={`/messages/${m.id}`} className="ms-name" onClick={(e) => e.stopPropagation()}>{m.name}</Link>
              <div className="ms-meta">
                {[m.audienceText, m.numbers?.total ? `${m.numbers.total.toLocaleString('en-IN')} ${m.numbers.total === 1 ? 'person' : 'people'}` : null,
                  m.startedAt ? `started ${formatDay(m.startedAt)}${m.createdBy ? ` by ${m.createdBy}` : ''}` : 'not started'].filter(Boolean).join(' · ')}
              </div>
            </div>
            <StatusPill status={m.status} />
          </div>
          <div className="ms-snip">{m.text}</div>
          <Progress n={m.numbers} status={m.status} />
        </li>
      ))}
    </ul>
  );
}

/** One kind of wish: on or off, its words, and how many get it today. */
function Wish({ kind, data, mayChange, moved }) {
  const save = useSaveWishes();
  const [text, setText] = useState(null);
  const label = kind === 'birthday' ? 'Birthday wishes' : 'Anniversary wishes';
  const words = text ?? data.text;
  const send = async (body, ok) => {
    try { await save.mutateAsync({ [kind]: body }); setText(null); toast.success(ok); }
    catch (err) { toast.error(err?.message || 'The wishes could not be saved. Try again.'); }
  };
  return (
    <div className="ms-wish" data-testid={`wish-${kind}`}>
      <div className="ms-wish-head">
        <h3 id={`ms-${kind}`}>{label}</h3>
        <button type="button" role="switch" aria-checked={data.on} aria-labelledby={`ms-${kind}`} className={`pe-toggle${data.on ? ' on' : ''}`}
          disabled={!mayChange || save.isPending} onClick={() => send({ on: !data.on }, !data.on ? `${label} are on.` : `${label} are off.`)} />
      </div>
      {mayChange ? (
        <textarea className="ms-area" rows={2} value={words} onChange={(e) => setText(e.target.value)} aria-label={`${label}: the words`} />
      ) : <div className="ms-area" aria-label={`${label}: the words`}>{words}</div>}
      <div className="ms-wish-foot">
        <p className="pe-hint">
          {data.on ? `Sent on the day, from 10 am. Only to customers who agreed to offers. Today: ${data.today.toLocaleString('en-IN')} ${data.today === 1 ? 'person' : 'people'}.` : 'Off. Switch on to send on the day.'}
          {!moved && ' They start once wishes move here from Inventory.'}
        </p>
        {mayChange && text !== null && text !== data.text && (
          <button type="button" className="btn-primary ms-small" disabled={save.isPending} onClick={() => send({ text }, 'The words are saved.')}>Save the words</button>
        )}
      </div>
    </div>
  );
}

function Wishes({ mayChange }) {
  const w = useWishes();
  if (w.isLoading) return <div className="crm-card crm-row crm-muted" aria-busy="true"><Loader2 size={16} className="animate-spin" /> Loading the wishes…</div>;
  if (w.isError) return <div className="crm-card"><LoadFailed what="the wishes" error={w.error} onRetry={() => w.refetch()} /></div>;
  return (
    <section className="crm-card ms-wishes" aria-label="Automatic wishes">
      {!w.data.moved && <p className="ms-note">Wishes are still sent from Inventory. The owner can move them here in Shop settings; the words and pictures come with them.</p>}
      <Wish kind="birthday" data={w.data.birthday} mayChange={mayChange} moved={!!w.data.moved} />
      <Wish kind="anniversary" data={w.data.anniversary} mayChange={mayChange} moved={!!w.data.moved} />
      <p className="pe-hint">Birthday gift points and the "points lapsing" reminder stay in Inventory: they are about points.</p>
    </section>
  );
}

export default function Messages() {
  const { can, isOwner } = usePermission();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'automatic' ? 'automatic' : 'shop';
  const overview = useMessagesOverview(can('campaign:view'));

  if (!can('campaign:view')) {
    return (
      <div className="crm-notice">
        <div className="crm-card">
          <ShieldOff size={28} style={{ color: 'var(--accent-warning)' }} />
          <h2>Messages are not part of your role</h2>
          <p>Ask the owner if you need to send WhatsApp messages to many customers. You can still message one customer from their page.</p>
        </div>
      </div>
    );
  }
  const o = overview.data;
  return (
    <main className="crm-page ms-page">
      <div className="crm-head">
        <div style={{ minWidth: 0 }}>
          <h1><Megaphone size={24} aria-hidden="true" /> Messages</h1>
          <p>Send an offer or news to your customers on WhatsApp, from your shop's own number.</p>
        </div>
        {can('campaign:send') && <Link to="/messages/new" className="btn-primary ms-new"><Plus size={16} /> New message</Link>}
      </div>

      {overview.isError ? <div className="crm-card"><LoadFailed what="the facts about your WhatsApp" error={overview.error} onRetry={() => overview.refetch()} /></div> : <Facts o={o} />}
      {o && !o.moved?.campaigns && (
        <p className="ms-note" data-testid="not-moved">
          Campaigns are still sent from Inventory. Messages can be written and saved here, and start once the owner moves campaigns to CRM{isOwner ? <> in <Link to="/settings">Shop settings</Link></> : ' in Shop settings'}.
        </p>
      )}
      {o && !o.sendingSetUp && <p className="ms-note">WhatsApp sending is not set up for CRM yet. Messages can be written and saved, and go out once it is.</p>}

      <div className="ms-tabs" role="tablist" aria-label="Messages">
        {[['shop', 'Sent by the shop'], ['automatic', 'Automatic']].map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={`ms-tab${tab === key ? ' on' : ''}`}
            onClick={() => setParams(key === 'shop' ? {} : { tab: key }, { replace: true })}>{label}</button>
        ))}
      </div>
      {tab === 'automatic' && <Wishes mayChange={can('campaign:send')} />}
      <List tab={tab} navigate={navigate} />
    </main>
  );
}
