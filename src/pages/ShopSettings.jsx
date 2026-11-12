import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQueries, useQuery } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import toast from 'react-hot-toast';
import {
  LayoutGrid, Store, UserCog, Ruler, CalendarHeart, Send, Sparkles, Users, ShieldOff, Loader2, ExternalLink,
  Printer, CheckCircle2, CircleDashed, AlertCircle, ChevronRight, MessageCircle
} from 'lucide-react';
import { api } from '../lib/api';
import { INVENTORY_URL } from '../lib/config';
import { usePermission } from '../hooks/usePermission';
import { useMoved, useSetMoved, useSetProfileMoved } from '../hooks/useProfileEdit';
import { useFeedbackSettings, usePriceBands, useReviewAskSettings, useArrivalsSettings, useWinbackSettings } from '../hooks/useMessages';
import { useStores } from '../hooks/useCounter';
import { formatDay } from '../utils/dates';
import { rangeWord, rangesOf } from '../utils/customerFilters';
import Select from '../components/common/Select';
import LoadFailed from '../components/LoadFailed';
import FeedbackSettings from '../components/FeedbackSettings';
import PriceBands from '../components/PriceBands';
import TeamAccess from '../components/TeamAccess';

/**
 * Settings (the owner's, 12 Nov redesign): how CRM works for this shop, one section at a time.
 *
 * It opens on a setup overview: a ring for the ESSENTIALS (logo, WhatsApp linked, price ranges, a team
 * set up) and "Needs you" for what is missing. Automatic messages are choices, not chores: shown as on or
 * off, never counted as missing (no nudging towards more messages: the owner's no-spam rule). Each
 * section keeps today's controls; the address remembers the section (?section=), so a link opens it.
 * Shop and door QR is new: the logo (kept in Inventory, for every ScaleEzy module), and every store's
 * standee to print.
 */

const SECTIONS = [
  { key: 'overview', group: null, label: 'Overview', icon: LayoutGrid, sub: 'What is set, what needs you' },
  { key: 'shop', group: 'Your shop', label: 'Shop and door QR', icon: Store, sub: 'Logo, stores, standees' },
  { key: 'changes', group: 'Customers', label: 'Where changes are made', icon: UserCog, sub: 'Offers, birthdays, deletes' },
  { key: 'prices', group: 'Customers', label: 'Price ranges', icon: Ruler, sub: 'Your budget bands' },
  { key: 'festivals', group: 'Customers', label: 'Festivals', icon: CalendarHeart, sub: "Your shop's calendar" },
  { key: 'messages', group: 'Messages', label: 'Messages from CRM', icon: Send, sub: 'Campaigns, wishes' },
  { key: 'automatic', group: 'Messages', label: 'Automatic messages', icon: Sparkles, sub: 'Thank-you, ratings, new stock, win-back' },
  { key: 'team', group: 'People', label: 'Team and access', icon: Users, sub: 'Who can do what' }
];
const KEYS = new Set(SECTIONS.map(s => s.key));

/**
 * Each store's door QR. The first store is asked first: when the shop's WhatsApp is not linked, no store
 * can have one (the reason is the shop's, not the store's), so the others are not asked at all.
 */
function useDoorQrs(stores) {
  const list = stores ?? [];
  const first = useQuery({
    queryKey: ['door-qr', list[0]?.id], enabled: !!list[0],
    queryFn: async () => (await api.get('/counter/door-qr', { params: { locationId: list[0].id } })).data, staleTime: 5 * 60_000
  });
  const linked = !!first.data?.link;
  const rest = useQueries({
    queries: list.slice(1).map(s => ({
      queryKey: ['door-qr', s.id], enabled: linked,
      queryFn: async () => (await api.get('/counter/door-qr', { params: { locationId: s.id } })).data,
      staleTime: 5 * 60_000
    }))
  });
  return list.length ? [first, ...rest] : [];
}

/** Everything the overview and the section dots need, asked once. */
function useState_() {
  const moved = useMoved(true);
  const bands = usePriceBands();
  const feedback = useFeedbackSettings();
  const reviewAsk = useReviewAskSettings();
  const arrivals = useArrivalsSettings();
  const winback = useWinbackSettings();
  const stores = useStores();
  const qrs = useDoorQrs(stores.data);
  const team = useQuery({ queryKey: ['shop', 'team'], queryFn: async () => (await api.get('/shop/team')).data });
  const firstQr = qrs.find(q => q.data)?.data ?? null;
  const people = team.data?.people ?? [];
  return {
    moved, bands, feedback, reviewAsk, arrivals, winback, stores, qrs, team,
    shop: firstQr?.shop ?? null,
    logo: firstQr ? !!firstQr.logo : null,
    whatsapp: firstQr ? !!firstQr.link : null,
    bandsSet: bands.data ? (bands.data.bands ?? []).length > 0 : null,
    staff: team.data ? people.filter(p => !p.isOwner && p.access.length > 0).length : null,
    autoOn: [feedback.data?.on, reviewAsk.data?.on, arrivals.data?.on, winback.data?.on].filter(Boolean).length
  };
}

/** The essentials: what a shop needs for CRM to work well. Choices (automatic messages) are not here. */
function essentials(st) {
  return [
    { key: 'logo', section: 'shop', done: st.logo, title: 'Shop logo', yes: 'On the door QR and in the online shop', no: 'Not set: the door QR shows your first letter', action: { label: 'Add in Inventory', href: `${INVENTORY_URL}/settings?section=GENERAL` } },
    { key: 'whatsapp', section: 'shop', done: st.whatsapp, title: 'WhatsApp linked', yes: 'Door QR and messages reach customers', no: 'Not linked: no door QR and no messages', action: { label: 'Link in Inventory', href: `${INVENTORY_URL}/settings?section=WHATSAPP` } },
    { key: 'prices', section: 'prices', done: st.bandsSet, title: 'Price ranges', yes: 'Budgets read in your own price bands', no: 'Not set: budgets cannot be shown', action: { label: 'Set price ranges', to: '?section=prices' } },
    { key: 'team', section: 'team', done: st.staff === null ? null : st.staff > 0, title: 'Your team', yes: `${st.staff} ${st.staff === 1 ? 'person' : 'people'} using CRM with you`, no: 'Only you so far: give your staff CRM access in Team members', action: { label: 'Open Team members', href: `${INVENTORY_URL}/settings?section=USERS` } }
  ];
}

function Ring({ done, total }) {
  const r = 34, c = 2 * Math.PI * r, part = total ? done / total : 0;
  return (
    <svg className="st-ring" width="88" height="88" viewBox="0 0 88 88" role="img" aria-label={`${done} of ${total} ready`}>
      <circle cx="44" cy="44" r={r} className="st-ring-bg" />
      <circle cx="44" cy="44" r={r} className="st-ring-fg" strokeDasharray={`${c * part} ${c}`} transform="rotate(-90 44 44)" />
      <text x="44" y="44" textAnchor="middle" dominantBaseline="central" className="st-ring-text">{done}/{total}</text>
    </svg>
  );
}

function Dot({ tone, label }) {
  return <span className={`st-dot ${tone}`} aria-label={label} title={label} />;
}

function Head({ icon: Icon, title, sub }) {
  return (
    <div className="st-head">
      <span className="st-head-icon"><Icon size={20} aria-hidden="true" /></span>
      <div><h2>{title}</h2>{sub && <p className="crm-muted">{sub}</p>}</div>
    </div>
  );
}

function Overview({ st, go }) {
  const list = essentials(st);
  const known = list.filter(e => e.done !== null);
  const done = known.filter(e => e.done).length;
  const m = st.moved.data ?? {};
  const choices = [
    { title: 'Thank-you after a visit', on: st.feedback.data?.on, section: 'automatic' },
    { title: 'Ask online buyers to rate', on: st.reviewAsk.data?.on, section: 'automatic' },
    { title: 'New stock in their size', on: st.arrivals.data?.on, section: 'automatic' },
    { title: 'Win back regulars', on: st.winback.data?.on, section: 'automatic' },
    { title: 'Campaigns sent from CRM', on: m.campaigns === true, section: 'messages' },
    { title: 'Wishes sent from CRM', on: !!m.wishes, section: 'messages' },
    { title: 'Customer changes made in CRM', on: m.profile === true, section: 'changes' }
  ];
  return (
    <div className="st-panel" data-testid="st-overview">
      <section className="crm-card st-hero">
        <Ring done={done} total={list.length} />
        <div>
          <h2>{done === list.length ? `${st.shop ?? 'Your shop'} is all set up` : `${list.length - done} ${list.length - done === 1 ? 'thing needs' : 'things need'} you`}</h2>
          <p className="crm-muted">{done === list.length ? 'The essentials are in place. Everything below is your choice.' : 'The essentials for CRM to work well. Messages are your choice and never count as missing.'}</p>
        </div>
      </section>

      <section aria-labelledby="st-ess-h">
        <h3 id="st-ess-h" className="st-label">Essentials</h3>
        <div className="st-tiles">
          {[...list].sort((a, b) => Number(a.done !== false) - Number(b.done !== false)).map(e => (
            <div key={e.key} className={`crm-card st-tile${e.done ? ' ok' : e.done === false ? ' miss' : ''}`} data-testid={`st-tile-${e.key}`}>
              {e.done ? <CheckCircle2 size={20} className="st-ok" aria-hidden="true" /> : e.done === false ? <AlertCircle size={20} className="st-warn" aria-hidden="true" /> : <Loader2 size={20} className="animate-spin" aria-hidden="true" />}
              <span className="st-tile-text"><b>{e.title}</b><span className="crm-muted">{e.done === null ? 'Checking…' : e.done ? e.yes : e.no}</span></span>
              {e.done === false ? (
                e.action.href
                  ? <a className="btn-primary st-btn" href={e.action.href} target="_blank" rel="noreferrer" data-testid={`st-fix-${e.key}`}>{e.action.label} <ExternalLink size={12} aria-hidden="true" /></a>
                  : <button type="button" className="btn-primary st-btn" onClick={() => go(e.section)} data-testid={`st-fix-${e.key}`}>{e.action.label}</button>
              ) : (
                <button type="button" className="st-open" onClick={() => go(e.section)} aria-label={`Open ${e.title}`}><ChevronRight size={16} aria-hidden="true" /></button>
              )}
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="st-ch-h">
        <h3 id="st-ch-h" className="st-label">Your choices</h3>
        <div className="st-choices">
          {choices.map(c => (
            <button key={c.title} type="button" className="st-choice" onClick={() => go(c.section)}>
              <span>{c.title}</span>
              <span className={`st-chip${c.on ? ' on' : ''}`}>{c.on === undefined ? '…' : c.on ? 'On' : 'Off'}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

const pretty = (digits) => (digits?.length === 12 && digits.startsWith('91') ? `+91 ${digits.slice(2, 7)} ${digits.slice(7)}` : digits ? `+${digits}` : null);
const initialOf = (shop) => (shop || '?').trim().charAt(0).toUpperCase();

function ShopSection({ st }) {
  const stores = st.stores.data ?? [];
  const first = st.qrs.find(q => q.data)?.data;
  return (
    <div className="st-panel">
      <section className="crm-card">
        <Head icon={Store} title="Shop and door QR" sub="What customers see of your shop: the logo in the middle of the door QR, and a standee for each store." />
        <div className="st-shop">
          <div className={`st-logo${first?.logo ? '' : ' none'}`} data-testid="st-logo">
            {first?.logo ? <img src={first.logo} alt={`${first.shop} logo`} /> : <span aria-hidden="true">{initialOf(first?.shop)}</span>}
          </div>
          <div className="st-shop-text">
            <h3>{first?.shop ?? 'Your shop'}</h3>
            <p className="crm-muted">{first?.logo ? 'This logo is in the middle of every door QR.' : first ? `No logo yet: the door QR shows "${initialOf(first.shop)}" on a lime circle.` : 'Checking…'}</p>
            <a className="btn-secondary st-btn" href={`${INVENTORY_URL}/settings?section=GENERAL`} target="_blank" rel="noreferrer" data-testid="st-logo-change">
              {first?.logo ? 'Change in Inventory' : 'Add your logo in Inventory'} <ExternalLink size={12} aria-hidden="true" />
            </a>
          </div>
        </div>
        <p className="st-note">The logo and your shop's name are kept in Inventory (Settings, Shop details), so every ScaleEzy module shows the same. Add it there once; the door QR picks it up by itself.</p>
      </section>

      <section className="crm-card">
        <h3 className="st-sub-h"><MessageCircle size={16} aria-hidden="true" /> Door QR for each store{stores.length > 1 ? ` (${stores.length})` : ''}</h3>
        {first && !first.link && (
          <p className="st-note warn" style={{ margin: '0 0 12px' }} data-testid="st-whatsapp-note">
            {first.reason} <a href={`${INVENTORY_URL}/settings?section=${first.fix === 'GENERAL' ? 'GENERAL' : 'WHATSAPP'}`} target="_blank" rel="noreferrer">Open Inventory settings <ExternalLink size={11} aria-hidden="true" /></a>
          </p>
        )}
        {st.stores.isLoading ? <p className="crm-muted">Loading your stores…</p>
          : stores.length === 0 ? <p className="crm-muted">No stores yet. Stores are added in Inventory.</p> : (
            <div className="st-stores">
              {stores.map((s, i) => {
                const q = st.qrs[i];
                const d = q?.data;
                return (
                  <div key={s.id} className="st-store" data-testid="st-store">
                    <div className="st-mini">{d?.link ? <QRCodeSVG value={d.link} size={72} level="M" fgColor="#164B1E" aria-label={`Door QR for ${s.name}`} /> : <CircleDashed size={30} aria-hidden="true" />}</div>
                    <div className="st-store-text">
                      <b>{s.name}</b>
                      <span className="crm-muted">{d?.link ? `${d.code} · ${pretty(d.number) ?? ''}` : first && !first.link ? 'Waiting for WhatsApp' : q?.isLoading ? 'Making the QR…' : d?.reason ?? 'Not ready yet'}</span>
                    </div>
                    {d?.link && <Link className="btn-secondary st-btn" to={`/door-qr?locationId=${encodeURIComponent(s.id)}&from=settings`} data-testid="st-print"><Printer size={14} aria-hidden="true" /> Print</Link>}
                  </div>
                );
              })}
            </div>
          )}
      </section>
    </div>
  );
}

/** The shop's price ranges, drawn as a ruler above the boxes that set them. */
function PriceRuler({ bands }) {
  if (!bands?.length) return null;
  const ranges = rangesOf(bands);
  return (
    <div className="st-ruler" aria-hidden="true" data-testid="st-ruler">
      {ranges.map((r, i) => <span key={r} className={`st-seg s${i % 4}`}><b>{rangeWord(r)}</b></span>)}
    </div>
  );
}

function Row({ id, title, children, on, onFlip, busy, testid, refusal }) {
  return (
    <>
      <div className="pe-sw-row">
        <div>
          <h3 id={id}>{title}</h3>
          {children}
        </div>
        <button type="button" role="switch" aria-checked={on} aria-labelledby={id} className={`pe-toggle${on ? ' on' : ''}`} onClick={onFlip} disabled={busy} data-testid={testid} />
      </div>
      {refusal && <p className="ms-refused" role="alert" data-testid={`${testid}-refused`}>{refusal}</p>}
    </>
  );
}

export default function ShopSettings() {
  const { isOwner } = usePermission();
  const [params, setParams] = useSearchParams();
  const asked = params.get('section');
  const section = KEYS.has(asked) ? asked : 'overview';
  const go = (key) => { setParams(key === 'overview' ? {} : { section: key }); window.scrollTo({ top: 0 }); };

  if (!isOwner) {
    return (
      <div className="crm-notice">
        <div className="crm-card">
          <ShieldOff size={28} style={{ color: 'var(--accent-warning)' }} />
          <h2>Only the shop owner can see these</h2>
          <p>Settings change how the whole shop works. Ask the owner if something here needs changing.</p>
        </div>
      </div>
    );
  }
  return <Owner section={section} go={go} />;
}

function Owner({ section, go }) {
  const st = useState_();
  const setProfile = useSetProfileMoved();
  const setCampaigns = useSetMoved('campaigns');
  const setWishes = useSetMoved('wishes');
  const [refused, setRefused] = useState({});
  const m = st.moved.data ?? {};
  const flip = (key, mutation, on, words) => async () => {
    setRefused(r => ({ ...r, [key]: null }));
    try { await mutation.mutateAsync(on); toast.success(words[on ? 0 : 1]); }
    // Inventory's own sentence ("A campaign is still going out from Inventory: …"), shown under the switch.
    catch (err) { setRefused(r => ({ ...r, [key]: err?.message || 'The setting could not be changed. Try again.' })); }
  };

  // The dot by each section: green set, amber needs you, none for a choice that is simply off.
  const ess = essentials(st);
  const dotFor = (key) => {
    if (key === 'shop') { const e = ess.filter(x => x.section === 'shop'); return e.some(x => x.done === false) ? 'warn' : e.every(x => x.done) ? 'ok' : null; }
    if (key === 'prices') return st.bandsSet === false ? 'warn' : st.bandsSet ? 'ok' : null;
    if (key === 'team') return st.staff === 0 ? 'warn' : st.staff ? 'ok' : null;
    if (key === 'automatic') return st.autoOn > 0 ? 'ok' : null;
    if (key === 'messages') return m.campaigns === true || m.wishes ? 'ok' : null;
    if (key === 'changes') return m.profile === true ? 'ok' : null;
    return null;
  };
  const current = SECTIONS.find(s => s.key === section);

  let body;
  if (section === 'overview') body = <Overview st={st} go={go} />;
  else if (section === 'shop') body = <ShopSection st={st} />;
  else if (section === 'changes' || section === 'messages') {
    body = (
      <section className="crm-card pe-settings st-card" data-testid="shop-settings">
        <Head icon={current.icon} title={current.label} sub={section === 'changes' ? 'Where your staff change a customer: here in CRM, or in Inventory.' : 'Campaigns and birthday wishes: sent from CRM, or still from Inventory.'} />
        {st.moved.isLoading ? <div className="crm-row crm-muted" aria-busy="true"><Loader2 size={16} className="animate-spin" /> Loading…</div>
          : st.moved.isError ? <LoadFailed what="the shop settings" error={st.moved.error} onRetry={() => st.moved.refetch()} />
            : section === 'changes' ? (
              <>
                <Row id="pe-profile" title="Change offers, birthdays and deletes here" on={m.profile === true} busy={setProfile.isPending} testid="profile-switch" refusal={refused.profile}
                  onFlip={flip('profile', setProfile, !(m.profile === true), ['Offers, birthdays and deletes are changed here now.', 'Inventory looks after offers, birthdays and deletes again.'])}>
                  <p>When this is on, your staff change these in CRM, and Inventory shows them read only with a link here:</p>
                  <ul><li>the WhatsApp offers answer</li><li>birthday and anniversary</li><li>deleting a customer (you only)</li></ul>
                  <p className="pe-gap">Name, phone, email and groups stay in Inventory. The till still asks about offers at a sale.</p>
                </Row>
                <div className="pe-state" data-testid="profile-state">
                  {setProfile.isPending ? 'Saving…' : m.profile === true ? 'On: your staff change these here. Inventory shows them read only.' : 'Off: Inventory looks after these for now.'}
                </div>
              </>
            ) : (
              <>
                <Row id="pe-campaigns" title="Send campaigns from CRM" on={m.campaigns === true} busy={setCampaigns.isPending} testid="campaigns-switch" refusal={refused.campaigns}
                  onFlip={flip('campaigns', setCampaigns, !(m.campaigns === true), ['Campaigns are sent from CRM now.', 'Inventory sends your campaigns again.'])}>
                  <p>{m.campaigns === true ? "Your campaigns are made and sent here, in Messages. Inventory's Campaigns page shows the old ones, read only." : 'Off: Inventory sends your campaigns for now. Messages can be written here, and start once this is on.'}</p>
                </Row>
                <Row id="pe-wishes" title="Send birthday and anniversary wishes from CRM" on={!!m.wishes} busy={setWishes.isPending} testid="wishes-switch" refusal={refused.wishes}
                  onFlip={flip('wishes', setWishes, !m.wishes, ['Wishes are sent from CRM now, with the words and pictures you had.', 'Inventory sends your wishes again.'])}>
                  <p>{m.wishes?.fromDay ? `From ${formatDay(`${m.wishes.fromDay}T12:00:00Z`)}. Inventory wished the days before.` : 'Off: Inventory sends your wishes for now. When this goes on, the words and pictures come with them.'}</p>
                </Row>
                <p className="pe-hint">Birthday gift points and the "points lapsing" reminder stay in Inventory: they are about points.</p>
              </>
            )}
      </section>
    );
  } else if (section === 'prices') {
    body = (
      <section className="crm-card st-card">
        <PriceRuler bands={st.bands.data?.bands} />
        <PriceBands />
      </section>
    );
  } else if (section === 'festivals') {
    body = (
      <section className="crm-card st-card">
        <Head icon={CalendarHeart} title="Festivals" sub="The festivals your shop sells for, with this year's dates." />
        <p>Tick the festivals that matter to your shop. A bill in the weeks up to a ticked festival counts as buying for it, on each customer's page. Dates that move with the moon come built in; you can correct one if your almanac differs. Festivals never send a message on their own.</p>
        <Link className="btn-primary st-btn" to="/festivals" data-testid="st-festivals">Open festivals <ChevronRight size={14} aria-hidden="true" /></Link>
      </section>
    );
  } else if (section === 'automatic') {
    body = <section className="crm-card st-card"><FeedbackSettings /></section>;
  } else {
    body = <TeamAccess />;
  }

  return (
    <main className="crm-page st-page">
      <div className="crm-head">
        <div style={{ minWidth: 0 }}>
          <h1>Settings</h1>
          <p>How CRM works for {st.shop ?? 'your shop'}. Only you, the owner, see this.</p>
        </div>
      </div>
      <div className="st-layout">
        <nav className="crm-card st-nav" aria-label="Settings sections" data-testid="st-nav">
          {SECTIONS.map((s, i) => {
            const Icon = s.icon;
            const showGroup = s.group && s.group !== SECTIONS[i - 1]?.group;
            const dot = dotFor(s.key);
            return (
              <React.Fragment key={s.key}>
                {showGroup && <h4 className="st-group">{s.group}</h4>}
                <button type="button" className={`st-link${s.key === section ? ' on' : ''}`} aria-current={s.key === section ? 'page' : undefined} onClick={() => go(s.key)} data-testid={`st-go-${s.key}`}>
                  <Icon size={17} aria-hidden="true" />
                  <span className="st-link-text"><b>{s.label}</b><span>{s.sub}</span></span>
                  {dot && <Dot tone={dot} label={dot === 'warn' ? 'Needs you' : 'Set'} />}
                </button>
              </React.Fragment>
            );
          })}
        </nav>
        <div className="st-pick">
          <Select value={section} onChange={(e) => go(e.target.value)} aria-label="Settings section">
            {SECTIONS.map(s => <option key={s.key} value={s.key}>{s.group ? `${s.group}: ${s.label}` : s.label}</option>)}
          </Select>
        </div>
        <div className="st-body" data-testid={`st-section-${section}`}>{body}</div>
      </div>
    </main>
  );
}
