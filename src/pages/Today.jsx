import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, ShieldOff, Phone, Check, Clock, MessageCircle, Undo2 } from 'lucide-react';
import { usePermission } from '../hooks/usePermission';
import { useFollowUpDone, useSetLanguage, useTalkList, useTodayAct } from '../hooks/useWork';
import { formatPhone } from '../utils/phone';
import { formatRupees } from '../utils/money';
import { formatDay } from '../utils/dates';
import { LANGUAGES, messageFor, whatsappLink } from '../utils/messages';
import LoadFailed from '../components/LoadFailed';

/**
 * Today: who to talk to, why, and what to say -- one ranked list (the owner approved the mockup,
 * 28 Oct). Promises first (late ones first), then people who asked to be told about something, then
 * regulars not seen lately. Birthdays are not here: Inventory wishes customers by itself. Each person:
 * the reason in a sentence, WhatsApp (a short message in their language, opened on this phone, changed
 * before sending) where a message may go, Call, Done, Later.
 */
const SWATCH = { Pink: '#e0569b', Orange: '#ee8a3c', Red: '#c62f3a', Gold: '#c9a227', Yellow: '#e8c93b', Green: '#3f9d4e', Blue: '#2f6fd0', Purple: '#7d4bc4', Brown: '#8a5a3b', White: '#f4f1ea', Grey: '#8b8f96', Black: '#1b1b1b' };
const NO_WHATSAPP = {
  stopped: 'Replied STOP: call or talk in person',
  no_consent: 'No WhatsApp consent: a call is best',
  no_phone: 'No phone number'
};

export default function Today() {
  const { can } = usePermission();
  const [scope, setScope] = useState('mine');
  const list = useTalkList(scope);
  const d = list.data;

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
  const left = d?.items.length ?? 0;
  const doneCount = d?.done.filter(x => x.status === 'done').length ?? 0;

  return (
    <main className="crm-page tk-page">
      <div className="crm-head">
        <div style={{ minWidth: 0 }}>
          <h1>To do today</h1>
          <p data-testid="today-line">{heading ? `${heading} · ` : ''}{d ? (left ? <><strong>{left} {left === 1 ? 'person' : 'people'} to talk to.</strong> Start at the top.</> : 'Nobody left to talk to today.') : 'Who to talk to, why, and what to say.'}</p>
        </div>
        <div className="cp-chips" role="tablist" aria-label="Whose list">
          {[['mine', 'Mine'], ['everyone', "Everyone's"]].map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={scope === k} className={`cp-chip${scope === k ? ' on' : ''}`} onClick={() => setScope(k)}>{l}</button>
          ))}
        </div>
      </div>

      {list.isLoading ? (
        <div className="crm-card crm-row crm-muted" aria-busy="true"><Loader2 size={16} className="animate-spin" /> Getting today ready…</div>
      ) : list.isError ? (
        <div className="crm-card"><LoadFailed what="today" error={list.error} onRetry={() => list.refetch()} /></div>
      ) : (
        <>
          {(left > 0 || doneCount > 0) && (
            <div className="tk-progress" data-testid="progress">
              <div className="tk-bar"><i style={{ width: `${Math.round((100 * doneCount) / Math.max(1, doneCount + left))}%` }} /></div>
              <span>{doneCount} of {doneCount + left} done today</span>
            </div>
          )}
          {left === 0 && doneCount === 0 ? <FirstSteps /> : (
            <ol className="tk-list">
              {d.items.map((item, i) => <Row key={item.key} item={item} rank={i + 1} shopName={d.shopName} today={d.today} mayAct={can('customer:update')} />)}
            </ol>
          )}
          {d.done.length > 0 && <DoneToday done={d.done} mayAct={can('customer:update')} />}
        </>
      )}
    </main>
  );
}

/** A day with nothing on it teaches the three things that fill it. */
function FirstSteps() {
  return (
    <section className="crm-card tk-first" data-testid="first-steps">
      <h2>Nobody to talk to yet. Three things fill this list:</h2>
      <ol>
        <li><strong>Promise a call, then add a follow-up.</strong> On the customer's page, when you say "I'll call you when it comes in".</li>
        <li><strong>Ask their birthday at the till.</strong> Birthdays and anniversaries come here a week ahead.</li>
        <li><strong>Ask if they want offers on WhatsApp.</strong> With their yes, you can wish them and tell them about new stock from here.</li>
      </ol>
    </section>
  );
}

function reasonOf(item, today) {
  const f = item.facts;
  switch (item.kind) {
    case 'promise':
      return { label: f.lateDays > 0 ? `You promised · ${f.lateDays} ${f.lateDays === 1 ? 'day' : 'days'} late` : 'You promised · due today', late: f.lateDays > 0, text: <><Who item={item} />: {f.promise}</> };
    case 'stock':
      return { label: 'Asked to be told', text: <><Who item={item} /> asked about {f.item}. Check it's in, then tell them.</> };
    default:
      return {
        label: `Not seen in ${f.daysAway} days`,
        text: <><Who item={item} /> {f.cadence ? `used to come ${f.cadence}` : 'is a regular'} · {formatRupees(f.totalSpent)} over {f.bills} bills. Ask how they are.</>
      };
  }
}
const Who = ({ item }) => <Link to={`/customers/${item.customer.id}`}>{item.customer.name}</Link>;

function Row({ item, rank, shopName, today, mayAct }) {
  const act = useTodayAct();
  const followUpDone = useFollowUpDone();
  const setLanguage = useSetLanguage();
  const [composing, setComposing] = useState(false);
  const [laterOpen, setLaterOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [language, setLang] = useState(item.customer.language || 'en');
  const [text, setText] = useState(() => messageFor(item, item.customer.language || 'en', shopName));
  const [how, setHow] = useState(null);
  useEffect(() => { setText(messageFor(item, language, shopName)); }, [language]); // eslint-disable-line react-hooks/exhaustive-deps
  const r = reasonOf(item, today);
  const c = item.context;
  const body = { customerId: item.customer.id, kind: item.kind, ref: item.ref, followUpId: item.followUpId };
  const busy = act.isPending || followUpDone.isPending;

  const chooseLanguage = (l) => { setLang(l); if (mayAct) setLanguage.mutate({ customerId: item.customer.id, language: l }); };
  const done = () => act.mutate({ ...body, status: 'done', how });
  const later = (when) => { setLaterOpen(false); act.mutate({ ...body, status: 'later', later: when }); };

  return (
    <li className={`tk-row ${item.kind}`} data-testid="talk-row" data-kind={item.kind}>
      <span className="tk-rank" aria-hidden="true">{rank}</span>
      <div className="tk-why">
        <span className="tk-kind"><i aria-hidden="true" />{r.label.includes('late') ? <>{r.label.split(' · ')[0]} · <em className="tk-late">{r.label.split(' · ')[1]}</em></> : r.label}</span>
        <div className="tk-reason">{r.text}</div>
        <div className="tk-ctx">
          {item.customer.phone && <span>{formatPhone(item.customer.phone)}</span>}
          {item.customer.groups.map(g => <span key={g} className="crm-tag">{g}</span>)}
          {c.spend && <span>usually spends {c.spend.from === c.spend.to ? formatRupees(c.spend.from) : `${formatRupees(c.spend.from)}–${formatRupees(c.spend.to)}`}</span>}
          {c.colours.length > 0 && <span className="tk-sw" title={c.colours.join(', ')}>{c.colours.map(f => <b key={f} style={{ background: SWATCH[f] ?? 'var(--bg-input)' }} />)} {c.colours.join(', ').toLowerCase()}</span>}
        </div>
      </div>
      <div className="tk-acts">
        {!item.whatsapp.allowed && <span className="tk-nowa" data-testid="no-whatsapp">{NO_WHATSAPP[item.whatsapp.why] ?? 'No WhatsApp'}</span>}
        {item.whatsapp.allowed && <button type="button" className="tk-btn wa" onClick={() => setComposing(v => !v)} aria-expanded={composing}><MessageCircle size={15} /> WhatsApp</button>}
        {item.customer.phone && <a className="tk-btn" href={`tel:${item.customer.phone}`} onClick={() => setHow('call')}><Phone size={14} /> Call</a>}
        {mayAct && <button type="button" className={`tk-btn done${how ? ' ready' : ''}`} onClick={done} disabled={busy}><Check size={15} /> Done</button>}
        {mayAct && (
          <span className="tk-later">
            <button type="button" className="tk-btn ghost" onClick={() => setLaterOpen(v => !v)} aria-expanded={laterOpen} disabled={busy}><Clock size={14} /> Later</button>
            {laterOpen && (
              <span className="tk-later-menu" role="group" aria-label="Later">
                <button type="button" onClick={() => later('tomorrow')}>Tomorrow</button>
                <button type="button" onClick={() => later('next_week')}>Next week</button>
              </span>
            )}
          </span>
        )}
      </div>
      {composing && item.whatsapp.allowed && (
        <div className="tk-compose" data-testid="compose">
          {langOpen ? (
            <div className="tk-langs" role="group" aria-label="Their language">
              {LANGUAGES.map(([k, l]) => <button key={k} type="button" lang={k} className={`tk-lang${language === k ? ' on' : ''}`} aria-pressed={language === k} onClick={() => { chooseLanguage(k); setLangOpen(false); }}>{l}</button>)}
            </div>
          ) : (
            <button type="button" className="si-link tk-change-lang" onClick={() => setLangOpen(true)}>
              In {LANGUAGES.find(([k]) => k === language)?.[1] ?? 'English'} · change language
            </button>
          )}
          <textarea value={text} onChange={(e) => setText(e.target.value)} aria-label="The message" lang={language} />
          <div className="tk-compose-foot">
            <small>Opens WhatsApp on this phone. Change anything before you send.</small>
            <a className="tk-btn wa" href={whatsappLink(item.customer.phone, text)} target="_blank" rel="noreferrer" onClick={() => setHow('whatsapp')} data-testid="open-whatsapp">Open WhatsApp</a>
          </div>
        </div>
      )}
    </li>
  );
}

const HOW = { whatsapp: 'on WhatsApp', call: 'on a call', in_person: 'in person' };
const DONE_WORDS = { promise: 'follow-up done', stock: 'told', notseen: 'got in touch' };
function DoneToday({ done, mayAct }) {
  const act = useTodayAct();
  const followUpDone = useFollowUpDone();
  const [open, setOpen] = useState(false);
  const undo = (x) => (x.kind === 'promise'
    ? followUpDone.mutate({ id: x.id, done: false })
    : act.mutate({ customerId: x.customerId, kind: x.kind, ref: x.ref, status: 'open' }));
  const words = (x) => `${x.name} (${x.status === 'later' ? `later: ${x.laterUntil ? formatDay(`${x.laterUntil}T06:30:00Z`) : 'soon'}` : [DONE_WORDS[x.kind] ?? 'done', x.how ? HOW[x.how] : null, x.byMe ? 'you' : x.byName].filter(Boolean).join(', ')})`;
  return (
    <section className="tk-done" data-testid="done-today">
      <div className="tk-done-head">
        <span><strong>Done today:</strong> {done.slice(0, 3).map(words).join(' · ')}{done.length > 3 ? ` and ${done.length - 3} more` : ''}</span>
        <button type="button" className="si-link" onClick={() => setOpen(v => !v)} aria-expanded={open}>{open ? 'Hide' : 'Show'}</button>
      </div>
      {open && (
        <ul className="tk-done-list">
          {done.map(x => (
            <li key={`${x.kind}-${x.id}`}>
              <span>{words(x)}</span>
              {mayAct && (x.byMe || x.kind !== 'promise') && <button type="button" className="tk-btn ghost" onClick={() => undo(x)}><Undo2 size={13} /> Undo</button>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
