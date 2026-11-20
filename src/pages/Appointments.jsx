import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { CalendarDays, Loader2, Phone, Plus, BellRing } from 'lucide-react';
import { useShopServices } from '../hooks/useBoutique';
import { useAppointments, useChangeAppointment, useReminderSetting, dayKey, addDays, clock, dayName, howLong, STATUS_WORDS } from '../hooks/useBookings';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { usePermission } from '../hooks/usePermission';
import BookSheet from '../components/BookSheet';
import LoadFailed from '../components/LoadFailed';

/**
 * Appointments (the mockup approved 20 Nov), for a boutique on CRM: today in time order on a phone, the week a column a
 * day on a laptop, a person's own diary, and those over that nobody marked. "Came in" in one tap; Move opens the same
 * sheet as booking. Boutique's app books into the same diary. A shop that does not use Boutique never has it.
 */
const VIEWS = [
  { key: 'today', label: 'Today' },
  { key: 'tomorrow', label: 'Tomorrow' },
  { key: 'week', label: 'This week' },
  { key: 'unmarked', label: 'Not marked' }
];
const firstOf = (name) => (name || '').trim().split(/\s+/)[0] || 'them';

function Card({ a, onMove, onCame, busy }) {
  const open = ['booked', 'confirmed'].includes(a.status);
  const past = new Date(a.endsAt).getTime() < Date.now();
  const tone = a.status === 'cancelled' || a.status === 'missed' ? 'off' : a.status === 'came' ? 'came' : !past && new Date(a.startsAt).getTime() - Date.now() < 3_600_000 ? 'soon' : '';
  return (
    <article className={`ap-card ${tone}`} data-testid="appt">
      <div className="ap-time"><b>{clock(a.startsAt)}</b><small>{howLong(a.minutes)}</small></div>
      <div className="ap-body">
        <div className="ap-top">
          <div className="ap-who">
            <Link to={`/customers/${a.customer?.id}?tab=boutique`}>{a.customer?.name ?? 'Someone'}</Link>
            <small>{[a.kindWords, a.work?.title, a.staff].filter(Boolean).join(' · ')}</small>
          </div>
          <span className={`ap-pill ${a.unmarked ? 'late' : a.status}`}>{a.unmarked ? 'Not marked' : STATUS_WORDS[a.status]}</span>
        </div>
        {a.reminderSentAt && open && <p className="ap-sent">✓ Reminder sent on WhatsApp {dayName(a.reminderSentAt)}, {clock(a.reminderSentAt)}</p>}
        {a.note && <p className="ap-note">{a.note}</p>}
        {open && (
          <div className="ap-acts">
            <button type="button" className="btn-primary" onClick={() => onCame(a, 'came')} disabled={busy} data-testid="appt-came">Came in</button>
            {a.unmarked
              ? <button type="button" className="btn-secondary" onClick={() => onCame(a, 'missed')} disabled={busy}>Did not come</button>
              : <button type="button" className="btn-secondary" onClick={() => onMove(a)} data-testid="appt-move">Move</button>}
            {a.customer?.phone && <a className="btn-secondary ap-call" href={`tel:${a.customer.phone}`} aria-label={`Call ${a.customer.name}`}><Phone size={16} /></a>}
          </div>
        )}
      </div>
    </article>
  );
}

export default function Appointments() {
  const services = useShopServices();
  const using = !!services.data?.using;
  const { can } = usePermission();
  const [params, setParams] = useSearchParams();
  const view = VIEWS.some(v => v.key === params.get('view')) ? params.get('view') : 'today';
  const staff = params.get('staff') || '';
  const wide = useMediaQuery('(min-width: 1024px)');
  const today = dayKey(new Date());
  const query = view === 'unmarked' ? { show: 'unmarked' }
    : view === 'tomorrow' ? { from: addDays(today, 1), to: addDays(today, 1), staff: staff || undefined }
      : view === 'week' ? { from: today, to: addDays(today, 6), staff: staff || undefined }
        : { from: today, to: today, staff: staff || undefined };
  const list = useAppointments(query, using);
  const counts = useAppointments({ from: today, to: addDays(today, 6) }, using);
  const change = useChangeAppointment();
  const reminders = useReminderSetting();
  const [sheet, setSheet] = useState(null); // { appointment? }

  const all = counts.data?.items ?? [];
  const live = (a) => !['cancelled'].includes(a.status);
  const n = {
    today: all.filter(a => live(a) && dayKey(new Date(a.startsAt)) === today).length,
    tomorrow: all.filter(a => live(a) && dayKey(new Date(a.startsAt)) === addDays(today, 1)).length,
    week: all.filter(live).length,
    unmarked: counts.data?.unmarked ?? 0
  };
  const items = list.data?.items ?? [];
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(today, i)), [today]);
  const set = (next) => setParams(Object.fromEntries(Object.entries({ view, staff, ...next }).filter(([k, v]) => v && !(k === 'view' && v === 'today'))), { replace: true });

  const mark = async (a, status) => {
    try {
      await change.mutateAsync({ id: a.id, status });
      toast.success(status === 'came' ? `${firstOf(a.customer?.name)} came in.` : 'Marked as not come.');
    } catch (err) { toast.error(err?.message || 'It could not be saved. Try again.'); }
  };

  if (services.isLoading) return <main className="crm-page"><div className="crm-card crm-row crm-muted"><Loader2 size={16} className="animate-spin" /> Loading…</div></main>;
  if (!using) {
    return <main className="crm-page"><div className="crm-card"><div className="crm-empty"><CalendarDays size={24} /><h3>This shop does not use Boutique</h3><p>Appointments are kept here for shops that take stitching in Boutique.</p><Link className="btn-secondary" to="/today">Go to To do today</Link></div></div></main>;
  }
  const names = list.data?.staff ?? counts.data?.staff ?? [];
  const on = list.data?.reminders ?? counts.data?.reminders ?? true;

  return (
    <main className="crm-page ap-page">
      <div className="crm-head">
        <div style={{ minWidth: 0 }}>
          <h1><CalendarDays size={24} aria-hidden="true" /> Appointments</h1>
          <p>{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}. Boutique's bookings are here too.</p>
        </div>
        <button type="button" className="btn-primary ap-book" onClick={() => setSheet({})} data-testid="appt-book"><Plus size={16} /> Book an appointment</button>
      </div>

      <div className="ap-bar">
        <div className="bk-chips ap-views" role="group" aria-label="Show">
          {VIEWS.map(v => (
            <button key={v.key} type="button" aria-pressed={view === v.key} className={`bk-chip${view === v.key ? ' on' : ''}${v.key === 'unmarked' && n.unmarked ? ' warn' : ''}`} onClick={() => set({ view: v.key })} data-testid={`appt-view-${v.key}`}>
              {v.label} <i>{n[v.key]}</i>
            </button>
          ))}
        </div>
        {view !== 'unmarked' && names.length > 0 && (
          <div className="bk-chips" role="group" aria-label="Whose diary">
            <button type="button" aria-pressed={!staff} className={`bk-chip${!staff ? ' on' : ''}`} onClick={() => set({ staff: '' })}>Everyone</button>
            {names.map(s => <button key={s} type="button" aria-pressed={staff === s} className={`bk-chip${staff === s ? ' on' : ''}`} onClick={() => set({ staff: s })}>{s}</button>)}
          </div>
        )}
      </div>

      {list.isLoading ? <div className="crm-card crm-row crm-muted" aria-busy="true"><Loader2 size={16} className="animate-spin" /> Loading the diary…</div>
        : list.isError ? <div className="crm-card"><LoadFailed what="the appointments" error={list.error} onRetry={() => list.refetch()} /></div>
          : view === 'week' && wide ? (
            <div className="ap-week" data-testid="appt-week">
              {days.map(d => {
                const mine = items.filter(a => dayKey(new Date(a.startsAt)) === d && a.status !== 'cancelled');
                return (
                  <section key={d} className="ap-day" aria-label={dayName(`${d}T12:00`)}>
                    <h2>{dayName(`${d}T12:00`)}{d === today && <small> today</small>}</h2>
                    {mine.length === 0 ? <p className="crm-muted ap-free">Nothing booked</p> : mine.map(a => (
                      <button key={a.id} type="button" className={`ap-slot k-${a.kind}${a.status === 'came' ? ' came' : ''}`} onClick={() => setSheet({ appointment: a })} data-testid="appt-slot">
                        <b>{clock(a.startsAt)} {a.customer?.name}</b><small>{[a.kindWords, a.staff].filter(Boolean).join(' · ')}</small>
                      </button>
                    ))}
                  </section>
                );
              })}
            </div>
          ) : items.filter(a => view === 'unmarked' || a.status !== 'cancelled').length === 0 ? (
            <div className="crm-card"><div className="crm-empty" data-testid="appt-empty"><CalendarDays size={22} />
              <h3>{view === 'unmarked' ? 'Everyone is marked' : view === 'tomorrow' ? 'Nothing booked tomorrow' : view === 'week' ? 'Nothing booked this week' : 'Nothing booked today'}</h3>
              <p>{view === 'unmarked' ? 'Appointments that are over and not marked came or not come show here.' : 'Book a trial, measurement or consultation, or Boutique books one from its app.'}</p>
            </div></div>
          ) : (
            <div className="ap-list">
              {(view === 'week' || view === 'unmarked' ? [...new Set(items.map(a => dayKey(new Date(a.startsAt))))] : [null]).map(d => {
                const mine = items.filter(a => (d === null || dayKey(new Date(a.startsAt)) === d) && (view === 'unmarked' || a.status !== 'cancelled'));
                if (!mine.length) return null;
                return (
                  <section key={d ?? 'one'} aria-label={d ? dayName(`${d}T12:00`) : 'Appointments'}>
                    {d && <h2 className="ap-dayhead">{dayName(`${d}T12:00`)}{d === today ? ' · today' : ''}</h2>}
                    {mine.map(a => <Card key={a.id} a={a} busy={change.isPending} onCame={mark} onMove={(x) => setSheet({ appointment: x })} />)}
                  </section>
                );
              })}
            </div>
          )}

      {can('crm:shop') && (
        <div className="ap-remind">
          <BellRing size={16} aria-hidden="true" />
          <span>One WhatsApp reminder the evening before (6 to 9 pm): <b>{on ? 'on' : 'off'}</b></span>
          <button type="button" className="pe-chg" disabled={reminders.isPending} onClick={() => reminders.mutate(!on, { onSuccess: () => toast.success(on ? 'Reminders switched off.' : 'Reminders switched on.'), onError: (e) => toast.error(e?.message || 'Could not save.') })} data-testid="appt-reminders">
            {on ? 'Switch off' : 'Switch on'}
          </button>
        </div>
      )}

      {sheet && <BookSheet appointment={sheet.appointment} staffNames={names} reminders={on} onClose={() => setSheet(null)} />}
    </main>
  );
}
