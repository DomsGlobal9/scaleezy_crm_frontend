import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, Loader2, Phone, ShoppingBag, StickyNote, Store, MessageCircle, CalendarDays, UserRound, Flame } from 'lucide-react';
import {
  useLead, useReplyLead, useChangeLead, useTakeLead, useLogCall, useReadLead, useLeadTeam,
  sourceWords, sourceLong, LOST_REASONS, CALL_OUTCOMES, clock, dayName, dayKey, ago
} from '../hooks/useBookings';
import { usePermission } from '../hooks/usePermission';
import { useAuth } from '../context/AuthContext';
import Select from './common/Select';
import { PicksSheet } from './NextCards';
import BookSheet from './BookSheet';

/**
 * One lead, open (the mockup approved 25 Nov): who they are and where they came from, who on the team has them, the
 * whole history (their messages, the shop's replies, calls, notes, pieces sent, visits), and everything the team does
 * next: reply (sent by CRM from the shop's number), log a call, send pieces, a note, a follow-up day, what they want,
 * "not now". In a boutique, Book a visit too.
 */
const TICKS = { SENT: '✓', DELIVERED: '✓✓', READ: '✓✓ read', FAILED: 'not delivered' };
const STAGES = [{ key: 'new', label: 'New' }, { key: 'talking', label: 'Talking' }, { key: 'booked', label: 'Booked' }];
const ICON = { call: Phone, note: StickyNote, picks: ShoppingBag, appointment: CalendarDays, owner: UserRound, stage: Flame, 'follow-up': CalendarDays, asked: Store };

function Event({ a }) {
  const Icon = ICON[a.kind] ?? Store;
  const words = a.kind === 'call' ? `${a.by ?? 'Someone'} called · ${CALL_OUTCOMES.find(o => o.key === a.meta?.outcome)?.label.toLowerCase() ?? a.meta?.outcome}${a.text ? ` · "${a.text}"` : ''}`
    : a.kind === 'note' ? `${a.by ?? 'Someone'}: "${a.text}"`
      : a.kind === 'picks' ? `${a.by ?? 'Someone'} sent ${a.meta?.pieces ?? ''} pieces · a link to see, try on and buy online`
        : a.kind === 'appointment' ? `Visit booked${a.by ? ` by ${a.by}` : ''}`
          : a.kind === 'stage' && a.meta && 'temperature' in a.meta ? (a.meta.temperature ? `${a.by ?? 'Someone'} marked it ${a.meta.temperature}` : `${a.by ?? 'Someone'} cleared hot, warm or cold`)
          : a.kind === 'owner' ? (a.meta?.took ? `${a.text} took it` : a.meta?.ownerId ? `Handed to ${a.text}` : 'Anyone\'s now')
            : a.kind === 'follow-up' ? (a.meta?.at ? `Follow up ${dayName(a.meta.at)}${a.text ? `: ${a.text}` : ''}` : 'No follow-up day')
              : a.kind === 'asked' ? `${sourceLong(a.meta?.source)}${a.meta?.sourceDetail ? ` (${a.meta.sourceDetail})` : ''}${a.text ? `: ${a.text}` : ''}`
                : a.text ?? a.kind;
  return <div className="lp-evt" data-testid="lead-event"><Icon size={13} aria-hidden="true" /><span>{words} · {dayName(a.at)}, {clock(a.at)}</span></div>;
}

function CallBox({ lead, onDone }) {
  const call = useLogCall();
  const [outcome, setOutcome] = useState('');
  const [note, setNote] = useState('');
  const [day, setDay] = useState('');
  const save = async () => {
    try { await call.mutateAsync({ id: lead.id, outcome, ...(note.trim() ? { note: note.trim() } : {}), ...(day ? { nextFollowUpAt: day } : {}) }); toast.success('Call saved.'); onDone(); }
    catch (e) { toast.error(e?.message || 'Could not save the call.'); }
  };
  return (
    <div className="lp-box" data-testid="call-box">
      <div className="bk-chips" role="radiogroup" aria-label="How the call went">
        {CALL_OUTCOMES.map(o => <button key={o.key} type="button" role="radio" aria-checked={outcome === o.key} className={`bk-chip${outcome === o.key ? ' on' : ''}`} onClick={() => setOutcome(o.key)}>{o.label}</button>)}
      </div>
      <input className="input-field" value={note} maxLength={500} onChange={e => setNote(e.target.value)} placeholder="What they said (optional)" aria-label="What they said" />
      <label className="lp-inline"><span>Follow up on</span><input type="date" className="input-field" value={day} min={dayKey(new Date())} onChange={e => setDay(e.target.value)} aria-label="Follow up on" /></label>
      <div className="pe-btns"><button type="button" className="btn-primary" disabled={!outcome || call.isPending} onClick={save} data-testid="call-save">{call.isPending && <Loader2 size={14} className="animate-spin" />} Save the call</button><button type="button" className="btn-secondary" onClick={onDone}>Close</button></div>
    </div>
  );
}

export default function LeadPanel({ id, boutique, onBack }) {
  const { can } = usePermission();
  const { user } = useAuth();
  const q = useLead(id);
  const reply = useReplyLead();
  const change = useChangeLead();
  const take = useTakeLead();
  const read = useReadLead();
  const team = useLeadTeam(can('crm:customer:update'));
  const [text, setText] = useState('');
  const [box, setBox] = useState(null); // call | note | lost
  const [note, setNote] = useState('');
  const [why, setWhy] = useState('');
  const [picks, setPicks] = useState(false);
  const [booking, setBooking] = useState(false);
  const end = useRef(null);
  const ref = useMemo(() => `${id}-${Date.now().toString(36)}`, [id, reply.isSuccess]); // eslint-disable-line react-hooks/exhaustive-deps
  const l = q.data?.lead;
  const mayWork = can('crm:customer:update');

  // Opened: nothing unread any more.
  useEffect(() => { if (l?.unread) read.mutate(l.id); }, [l?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [q.data?.activities?.length]);

  const [follow, setFollow] = useState({ day: '', note: '' });
  const [wants, setWants] = useState({ occasion: '', budget: '', wants: '' });
  useEffect(() => {
    if (!l) return;
    setFollow({ day: l.nextFollowUpAt ? dayKey(new Date(l.nextFollowUpAt)) : '', note: l.followUpNote ?? '' });
    setWants({ occasion: l.interest?.occasion ?? '', budget: l.interest?.budget ?? '', wants: l.interest?.wants ?? '' });
  }, [l?.id, l?.nextFollowUpAt, l?.followUpNote]); // eslint-disable-line react-hooks/exhaustive-deps

  if (q.isLoading) return <div className="lp lp-empty"><Loader2 size={16} className="animate-spin" /> Loading…</div>;
  if (q.isError || !l) return <div className="lp lp-empty">{q.error?.message || 'That lead could not be opened.'}</div>;

  const act = async (body, said) => {
    try { await change.mutateAsync({ id: l.id, ...body }); if (said) toast.success(said); return true; }
    catch (e) { toast.error(e?.message || 'Could not save.'); return false; }
  };
  const send = async () => {
    try {
      const r = await reply.mutateAsync({ id: l.id, text: text.trim(), ref });
      if (r?.message?.state === 'not-sent') return toast.error(`It did not go: ${r.message.reason}`);
      setText('');
    } catch (e) { toast.error(e?.message || 'It could not be sent.'); }
  };
  const doTake = async () => {
    try { await take.mutateAsync(l.id); toast.success('It is yours now.'); }
    catch (e) { toast.error(e?.message || 'Could not take it.'); }
  };
  const done = l.stage === 'won' || l.stage === 'lost';
  // The history: what they asked and each step, with the shop's replies as bubbles on the right.
  const history = q.data.activities ?? [];
  const name = l.customer?.name && !/^\+?\d[\d\s]+$/.test(l.customer.name) ? l.customer.name : l.customer?.phone;

  return (
    <div className="lp" data-testid="lead-panel">
      <header className="lp-head">
        {onBack && <button type="button" className="crm-iconbtn lp-back" onClick={onBack} aria-label="Back to the leads"><ArrowLeft size={18} /></button>}
        <div className="lp-who">
          <b>{name}</b>
          <div className="lp-meta">
            <span className={`ld-src s-${l.source}`}>{sourceWords(l.source)}</span>
            {l.sourceDetail && <span className="crm-muted">{l.sourceDetail}</span>}
            <span className="crm-muted">asked {ago(l.askedAt)}{l.firstReplyMinutes !== null ? ` · first reply in ${l.firstReplyMinutes < 60 ? `${l.firstReplyMinutes} min` : `${Math.round(l.firstReplyMinutes / 60)} hr`}` : ''}</span>
            <Link to={`/customers/${l.customer?.id}`} className="pe-chg">Their page</Link>
          </div>
        </div>
        {mayWork && !done && (
          <div className="lp-ctrls">
            {l.owner ? (
              <Select value={l.owner.id} onChange={(e) => { const p = (team.data ?? []).find(x => x.id === e.target.value); if (p) act({ owner: { id: p.id, name: p.name } }, `Handed to ${p.name}.`); else if (e.target.value === '') act({ owner: null }); }} aria-label="Who has this lead">
                {[...(team.data ?? []), ...((team.data ?? []).some(x => x.id === l.owner.id) ? [] : [{ id: l.owner.id, name: l.owner.name }])].map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                <option value="">Anyone</option>
              </Select>
            ) : <button type="button" className="btn-secondary" onClick={doTake} disabled={take.isPending} data-testid="lead-take">Take it</button>}
            <Select value={STAGES.some(s => s.key === l.stage) ? l.stage : 'new'} onChange={(e) => act({ status: e.target.value })} aria-label="Stage">
              {STAGES.filter(s => boutique || s.key !== 'booked').map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </Select>
            <div className="lp-temp" role="radiogroup" aria-label="How likely to buy">
              {['hot', 'warm', 'cold'].map(t => <button key={t} type="button" role="radio" aria-checked={l.temperature === t} className={`lp-t t-${t}${l.temperature === t ? ' on' : ''}`} onClick={() => act({ temperature: l.temperature === t ? null : t })} data-testid={`lead-temp-${t}`}>{t[0].toUpperCase() + t.slice(1)}</button>)}
            </div>
          </div>
        )}
        {done && <span className={`ap-pill ${l.stage === 'won' ? 'came' : 'cancelled'}`}>{l.stage === 'won' ? 'Became a customer' : `Not now${l.lostReason ? `: ${LOST_REASONS.find(r => r.key === l.lostReason)?.label.toLowerCase() ?? l.lostReason}` : ''}`}</span>}
      </header>

      <div className="lp-body">
        <div className="lp-chat">
          <div className="lp-scroll" aria-label="History">
            {history.map(a => a.kind === 'in'
              ? <div key={a.id} className="rp-bubble them"><span>{a.text}</span><small>WhatsApp · {dayName(a.at)}, {clock(a.at)}</small></div>
              : a.kind === 'out'
                ? <div key={a.id} className="rp-bubble me"><span>{a.text}</span><small>{a.by} · {dayName(a.at)}, {clock(a.at)}</small></div>
                : <Event key={a.id} a={a} />)}
            {/* Sent before the history began (older replies). */}
            {!history.some(a => a.kind === 'out') && (q.data.messages ?? []).slice().reverse().map((m, i) => <div key={`m${i}`} className="rp-bubble me"><span>{m.text}</span><small>{m.by} · {TICKS[m.whatsapp] ?? m.state} · {dayName(m.at)}</small></div>)}
            <div ref={end} />
          </div>
          {mayWork && !done && (
            <div className="lp-compose">
              {l.customer?.phone && (
                <div className="lp-send">
                  <textarea className="ms-area" rows={2} maxLength={1000} value={text} onChange={e => setText(e.target.value)} placeholder="Type a reply. It goes on WhatsApp from the shop's number." aria-label="Reply" data-testid="lead-text" />
                  <button type="button" className="btn-primary" disabled={!text.trim() || reply.isPending} onClick={send} data-testid="lead-send">{reply.isPending ? <Loader2 size={14} className="animate-spin" /> : <MessageCircle size={15} />} Send</button>
                </div>
              )}
              <div className="lp-acts">
                {l.customer?.phone && <a className="btn-secondary bw-btn" href={`tel:${l.customer.phone}`} onClick={() => setBox('call')}><Phone size={15} /> Call</a>}
                <button type="button" className="btn-secondary bw-btn" onClick={() => setBox(box === 'call' ? null : 'call')} data-testid="lead-log-call">Log a call</button>
                {l.customer?.phone && <button type="button" className="btn-secondary bw-btn" onClick={() => setPicks(true)} data-testid="lead-picks"><ShoppingBag size={15} /> Send pieces</button>}
                {boutique && <button type="button" className="btn-secondary bw-btn" onClick={() => setBooking(true)} data-testid="lead-book"><CalendarDays size={15} /> Book</button>}
                <button type="button" className="btn-secondary bw-btn" onClick={() => setBox(box === 'note' ? null : 'note')} data-testid="lead-note"><StickyNote size={15} /> Note</button>
                <button type="button" className="btn-secondary" onClick={() => setBox(box === 'lost' ? null : 'lost')} data-testid="lead-notnow">Not now</button>
              </div>
              {box === 'call' && <CallBox lead={l} onDone={() => setBox(null)} />}
              {box === 'note' && (
                <div className="lp-box">
                  <input className="input-field" value={note} maxLength={500} onChange={e => setNote(e.target.value)} placeholder="Will come after checking with family" aria-label="Note" data-testid="note-text" />
                  <div className="pe-btns"><button type="button" className="btn-primary" disabled={!note.trim() || change.isPending} onClick={async () => { if (await act({ note: note.trim() }, 'Note saved.')) { setNote(''); setBox(null); } }} data-testid="note-save">Save the note</button></div>
                </div>
              )}
              {box === 'lost' && (
                <div className="lp-box" data-testid="not-now">
                  <div className="bk-chips" role="radiogroup" aria-label="Why not now">{LOST_REASONS.map(r => <button key={r.key} type="button" role="radio" aria-checked={why === r.key} className={`bk-chip${why === r.key ? ' on' : ''}`} onClick={() => setWhy(r.key)}>{r.label}</button>)}</div>
                  <div className="pe-btns"><button type="button" className="btn-primary" disabled={!why || change.isPending} onClick={async () => { if (await act({ status: 'lost', lostReason: why }, 'Moved to Not now. They come back if they ask again.')) setBox(null); }}>Save</button></div>
                </div>
              )}
            </div>
          )}
        </div>

        <aside className="lp-side">
          <h3>Follow up</h3>
          {l.followUpDue && <p className="lp-due">Due today</p>}
          <input type="date" className="input-field" value={follow.day} min={dayKey(new Date())} onChange={e => setFollow(f => ({ ...f, day: e.target.value }))} aria-label="Follow up on" disabled={!mayWork || done} data-testid="follow-day" />
          <input className="input-field" value={follow.note} maxLength={300} onChange={e => setFollow(f => ({ ...f, note: e.target.value }))} placeholder="Why: ask if she liked the second piece" aria-label="Why follow up" disabled={!mayWork || done} />
          {mayWork && !done && <button type="button" className="btn-secondary lp-save" disabled={change.isPending} onClick={() => act({ nextFollowUpAt: follow.day || null, followUpNote: follow.note.trim() || null }, follow.day ? `Follow up on ${dayName(`${follow.day}T12:00`)}.` : 'No follow-up day.')} data-testid="follow-save">Save follow-up</button>}

          <h3>What they want</h3>
          {[['occasion', 'Occasion', 'Sister\'s wedding'], ['budget', 'Budget', '₹15,000'], ['wants', 'Looking for', 'Green Kanchi silk']].map(([k, label, ph]) => (
            <label key={k} className="lp-field"><span>{label}</span><input className="input-field" value={wants[k]} maxLength={200} placeholder={ph} onChange={e => setWants(w => ({ ...w, [k]: e.target.value }))} disabled={!mayWork || done} /></label>
          ))}
          {mayWork && !done && <button type="button" className="btn-secondary lp-save" disabled={change.isPending} onClick={() => act({ interest: wants }, 'Saved.')} data-testid="wants-save">Save</button>}

          {l.nextVisit && <><h3>Coming in</h3><p className="lp-line">{dayName(l.nextVisit.at)}, {clock(l.nextVisit.at)}</p></>}
          <h3>Came from</h3>
          <p className="lp-line">{sourceLong(l.source)}{l.sourceDetail ? `: ${l.sourceDetail}` : ''}</p>
          {l.owner && user?.id === l.owner.id && <p className="lp-line crm-muted">This lead is yours.</p>}
        </aside>
      </div>
      {picks && <PicksSheet customerId={l.customer.id} name={l.customer.name} asReply onClose={() => setPicks(false)} />}
      {booking && <BookSheet customer={{ id: l.customer.id, name: l.customer.name }} boutique onClose={() => setBooking(false)} />}
    </div>
  );
}
