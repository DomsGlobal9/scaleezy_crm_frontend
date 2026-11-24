import React, { useState } from 'react';
import { CalendarDays, ChevronRight, Plus } from 'lucide-react';
import { useCustomerAppointments, useAppointments, clock, dayName, dayKey, STATUS_WORDS } from '../hooks/useBookings';
import { usePermission } from '../hooks/usePermission';
import BookSheet from './BookSheet';

/**
 * A customer's appointments on their page (the mockup approved 20 Nov), only in a shop that uses Boutique: the next one
 * joins the strip under the header, and the Boutique work tab lists them with "Book".
 */
const dayWords = (iso) => {
  const d = dayKey(new Date(iso)), today = dayKey(new Date());
  const tomorrow = dayKey(new Date(Date.now() + 86_400_000));
  return d === today ? 'today' : d === tomorrow ? 'tomorrow' : dayName(iso);
};

export function AppointmentStrip({ customerId, onOpen }) {
  const q = useCustomerAppointments(customerId);
  const next = q.data?.next?.[0];
  if (!next) return null;
  return (
    <button type="button" className="bw-strip" onClick={onOpen} data-testid="appt-strip">
      <span className="bw-strip-ico" aria-hidden="true"><CalendarDays size={15} /></span>
      <span className="bw-strip-words">
        <b>{next.kindWords} {dayWords(next.startsAt)} {clock(next.startsAt)}{next.staff ? ` with ${next.staff}` : ''}</b>
        <small>{[next.work?.title, STATUS_WORDS[next.status].toLowerCase()].filter(Boolean).join(' · ')}</small>
      </span>
      <span className="bw-strip-go">See <ChevronRight size={14} /></span>
    </button>
  );
}

export default function CustomerAppointments({ customerId, name, boutique = true }) {
  const q = useCustomerAppointments(customerId);
  const { can } = usePermission();
  const diary = useAppointments({ from: dayKey(new Date()), to: dayKey(new Date()) });
  const [sheet, setSheet] = useState(null);
  const all = q.data?.all ?? [];
  const next = new Set((q.data?.next ?? []).map(a => a.id));
  const shown = [...(q.data?.next ?? []), ...all.filter(a => !next.has(a.id))].slice(0, 8);
  return (
    <section className="ca" aria-label="Appointments" data-testid="customer-appointments">
      <div className="ca-head">
        <h3>Appointments</h3>
        {can('crm:customer:update') && <button type="button" className="btn-secondary bw-btn" onClick={() => setSheet({})} data-testid="ca-book"><Plus size={15} /> Book</button>}
      </div>
      {shown.length === 0 ? <p className="crm-muted ca-none">None booked.</p> : (
        <ul className="ca-list">
          {shown.map(a => {
            const open = next.has(a.id);
            return (
              <li key={a.id}>
                {open && can('crm:customer:update')
                  ? <button type="button" className="ca-row" onClick={() => setSheet({ appointment: a })}><span><b>{dayName(a.startsAt)}, {clock(a.startsAt)}</b> · {a.kindWords}{a.staff ? ` · ${a.staff}` : ''}</span><span className={`ap-pill ${a.status}`}>{STATUS_WORDS[a.status]}</span></button>
                  : <div className="ca-row"><span>{dayName(a.startsAt)} · {a.kindWords}</span><span className="crm-muted">{a.unmarked ? 'Not marked' : a.status === 'came' ? 'Came' : STATUS_WORDS[a.status]}</span></div>}
              </li>
            );
          })}
        </ul>
      )}
      {sheet && <BookSheet customer={sheet.appointment ? undefined : { id: customerId, name }} appointment={sheet.appointment} staffNames={diary.data?.staff ?? []} reminders={diary.data?.reminders ?? true} boutique={boutique} onClose={() => setSheet(null)} />}
    </section>
  );
}
