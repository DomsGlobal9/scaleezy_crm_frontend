import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2, Search, X } from 'lucide-react';
import { api } from '../lib/api';
import { useCustomerWork } from '../hooks/useBoutique';
import { KINDS, useBook, useChangeAppointment, dayKey, clock, dayName } from '../hooks/useBookings';

/**
 * Book an appointment, or move or change one (the mockup approved 20 Nov). Who (searched, or the person whose page or
 * lead it came from), what for, which work, the day and time, with whom. A clash with the same person is shown
 * with who is there, and "Book anyway" is the shop's choice. Ticked, CRM tells the customer the time on WhatsApp
 * from the shop's number (never from a staff phone). Slides up from the bottom on a phone.
 */
const LENGTHS = [15, 30, 45, 60, 90, 120];
const firstOf = (name) => (name || '').trim().split(/\s+/)[0] || 'them';

function PickCustomer({ onPick }) {
  const [q, setQ] = useState('');
  const box = useRef(null);
  useEffect(() => { box.current?.focus(); }, []);
  const found = useQuery({
    queryKey: ['book-pick', q], enabled: q.trim().length >= 2,
    queryFn: async () => (await api.get('/customers', { params: { search: q.trim(), page: 1, pageSize: 6 } })).data
  });
  const rows = q.trim().length >= 2 ? (found.data?.customers ?? []) : [];
  return (
    <div className="bk-pick">
      <label className="bk-search"><Search size={16} aria-hidden="true" />
        <input ref={box} className="input-field" value={q} onChange={e => setQ(e.target.value)} placeholder="Name or phone number" aria-label="Find the customer or lead" data-testid="book-search" />
      </label>
      {found.isFetching && <p className="pe-hint"><Loader2 size={12} className="animate-spin" /> Looking…</p>}
      {rows.length > 0 && (
        <ul className="bk-found" role="listbox" aria-label="Customers found">
          {rows.map(c => (
            <li key={c.id}><button type="button" onClick={() => onPick({ id: c.id, name: c.name })}>
              <b>{c.name}</b><small>{[c.code, c.phone ? `…${c.phone.replace(/\D/g, '').slice(-4)}` : null].filter(Boolean).join(' · ')}</small>
            </button></li>
          ))}
        </ul>
      )}
      {!found.isFetching && q.trim().length >= 2 && rows.length === 0 && <p className="pe-hint">No one matches "{q.trim()}". Add them as a lead first.</p>}
    </div>
  );
}

export default function BookSheet({ customer: given, appointment, staffNames = [], reminders = true, boutique = true, onClose }) {
  // A retail shop books a store visit (from a lead); a boutique its consultations, trials, measurements and deliveries.
  const kinds = boutique ? KINDS.filter(k => k.key !== 'visit') : KINDS.filter(k => k.key === 'visit');
  const editing = !!appointment;
  const [customer, setCustomer] = useState(given ?? (appointment ? appointment.customer : null));
  const start = appointment ? new Date(appointment.startsAt) : null;
  const [kind, setKind] = useState(appointment?.kind ?? (boutique ? 'trial' : 'visit'));
  const [kindNote, setKindNote] = useState(appointment?.kindNote ?? '');
  const [workRef, setWorkRef] = useState(appointment?.work?.ref ?? '');
  const [day, setDay] = useState(start ? dayKey(start) : dayKey(new Date(Date.now() + 86_400_000)));
  const [time, setTime] = useState(start ? `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}` : '11:00');
  const [minutes, setMinutes] = useState(appointment?.minutes ?? 30);
  const [staff, setStaff] = useState(appointment?.staff ?? '');
  const [note, setNote] = useState(appointment?.note ?? '');
  const [tell, setTell] = useState(true);
  const [clash, setClash] = useState(null);
  const [error, setError] = useState(null);
  const book = useBook();
  const change = useChangeAppointment();
  const work = useCustomerWork(customer?.id, !!customer?.id);
  const openWork = work.data?.open ?? [];
  const busy = book.isPending || change.isPending;
  const first = firstOf(customer?.name);

  const closing = useRef(onClose);
  closing.current = onClose;
  const opener = useRef(document.activeElement);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') closing.current(); };
    window.addEventListener('keydown', onKey);
    const back = opener.current;
    return () => { window.removeEventListener('keydown', onKey); back?.focus?.(); };
  }, []);

  const pickKind = (k) => {
    setKind(k);
    // A first choice of kind brings its usual length; a length the shop chose stays.
    if (!editing && minutes === (KINDS.find(x => x.key === kind)?.minutes ?? 30)) setMinutes(KINDS.find(x => x.key === k)?.minutes ?? 30);
  };

  const told = (r, verb) => {
    const m = r?.message;
    if (!m) return toast.success(verb);
    if (m.state === 'not-sent') return toast(`${verb} The WhatsApp to ${first} did not go: ${m.reason}`, { icon: '⚠️', duration: 7000 });
    toast.success(`${verb} ${first} is told on WhatsApp.`);
  };

  const submit = async (e, force = false) => {
    e?.preventDefault?.();
    setError(null);
    if (!customer) return setError('Pick who the appointment is for.');
    if (kind === 'other' && !kindNote.trim()) return setError('Say in a few words what it is for.');
    const w = openWork.find(x => x.externalId === workRef);
    const body = {
      kind, kindNote: kind === 'other' ? kindNote.trim() : null, startsAt: `${day}T${time}`, minutes, staff: staff.trim() || null,
      note: note.trim() || null, work: workRef ? { ref: workRef, title: w ? (w.title || w.service.name) : appointment?.work?.title ?? null } : null,
      force, tell
    };
    try {
      if (editing) {
        const { work: _w, ...rest } = body;
        const r = await change.mutateAsync({ id: appointment.id, ...rest, ...(workRef !== (appointment.work?.ref ?? '') ? { work: body.work } : {}) });
        told(r, 'Saved.');
      } else {
        const r = await book.mutateAsync({ customerId: customer.id, ...body });
        told(r, `Booked for ${dayName(r.appointment.startsAt)}, ${clock(r.appointment.startsAt)}.`);
      }
      onClose();
    } catch (err) {
      if (err?.code === 'CLASH') { setClash(err.message); return; }
      setError(err?.message || 'It could not be saved. Try again.');
    }
  };

  const setStatus = async (status) => {
    setError(null);
    try {
      const r = await change.mutateAsync({ id: appointment.id, status, tell: status === 'cancelled' ? tell : false });
      told(r, status === 'cancelled' ? 'Cancelled.' : 'Marked as not come.');
      onClose();
    } catch (err) { setError(err?.message || 'It could not be saved. Try again.'); }
  };

  return createPortal(
    <div className="cr-backdrop bk-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="cr-dialog bk-sheet" role="dialog" aria-modal="true" aria-labelledby="bk-title" onSubmit={submit} data-testid="book-sheet">
        <header className="cr-head">
          <div style={{ minWidth: 0 }}>
            <h2 id="bk-title">{editing ? 'Move or change' : boutique ? 'Book an appointment' : 'Book a store visit'}</h2>
            {customer && <p>{customer.name}</p>}
          </div>
          <button type="button" className="crm-iconbtn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>

        {!customer ? <PickCustomer onPick={setCustomer} /> : !given && !editing && (
          <p className="bk-who"><b>{customer.name}</b> <button type="button" className="pe-chg" onClick={() => setCustomer(null)}>Change</button></p>
        )}

        <fieldset className="bk-field">
          <legend>For</legend>
          <div className="bk-chips" role="radiogroup" aria-label="What it is for">
            {kinds.map(k => <button key={k.key} type="button" role="radio" aria-checked={kind === k.key} className={`bk-chip${kind === k.key ? ' on' : ''}`} onClick={() => pickKind(k.key)}>{k.label}</button>)}
          </div>
          {kind === 'other' && <input className="input-field" value={kindNote} maxLength={50} onChange={e => setKindNote(e.target.value)} placeholder="Saree draping class" aria-label="What it is for" />}
        </fieldset>

        {openWork.length > 0 && (
          <label className="pe-field"><span>Which work (optional)</span>
            <select className="input-field" value={workRef} onChange={e => setWorkRef(e.target.value)} data-testid="book-work">
              <option value="">None</option>
              {openWork.map(w => <option key={w.id} value={w.externalId}>{w.service.name}{w.title ? ` · ${w.title}` : ''}</option>)}
            </select>
          </label>
        )}

        <div className="bk-two">
          <label className="pe-field"><span>Day</span><input type="date" className="input-field" value={day} onChange={e => setDay(e.target.value)} required data-testid="book-day" /></label>
          <label className="pe-field"><span>Time</span><input type="time" className="input-field" value={time} step={900} onChange={e => setTime(e.target.value)} required data-testid="book-time" /></label>
        </div>
        <div className="bk-two">
          <label className="pe-field"><span>With</span>
            <input className="input-field" list="bk-staff" value={staff} maxLength={80} onChange={e => { setStaff(e.target.value); setClash(null); }} placeholder="Anyone" data-testid="book-staff" />
            <datalist id="bk-staff">{staffNames.map(n => <option key={n} value={n} />)}</datalist>
          </label>
          <label className="pe-field"><span>How long</span>
            <select className="input-field" value={minutes} onChange={e => setMinutes(Number(e.target.value))}>
              {[...new Set([...LENGTHS, minutes])].sort((a, b) => a - b).map(m => <option key={m} value={m}>{m >= 60 ? `${m / 60} hr`.replace('.5 hr', '½ hr') : `${m} min`}</option>)}
            </select>
          </label>
        </div>
        <label className="pe-field"><span>Note (optional)</span>
          <input className="input-field" value={note} maxLength={500} onChange={e => setNote(e.target.value)} placeholder="Bring the lining fabric" />
        </label>

        {clash && (
          <div className="bk-clash" role="alert" data-testid="book-clash">
            <span>{clash}</span>
            <button type="button" className="btn-secondary" onClick={(e) => submit(e, true)} disabled={busy}>{editing ? 'Keep it anyway' : 'Book anyway'}</button>
          </div>
        )}

        <label className="bk-tell">
          <input type="checkbox" checked={tell} onChange={e => setTell(e.target.checked)} data-testid="book-tell" />
          <span>{editing ? `Tell ${first} on WhatsApp if the time changes or it is cancelled` : `Send ${first} the time on WhatsApp now${reminders ? ', and one reminder the evening before' : ''}`}</span>
        </label>
        {error && <p className="pe-err" role="alert">{error}</p>}
        <div className="pe-btns">
          <button type="submit" className="btn-primary bk-go" disabled={busy || !customer} data-testid="book-save">
            {busy && <Loader2 size={14} className="animate-spin" />} {editing ? 'Save' : `Book ${day ? dayName(`${day}T${time || '00:00'}`).split(',')[0] : ''}${time ? `, ${clock(`${day}T${time}`)}` : ''}`}
          </button>
          <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
        </div>
        {editing && ['booked', 'confirmed'].includes(appointment.status) && (
          <div className="bk-more">
            <button type="button" className="pe-chg" onClick={() => setStatus('missed')} disabled={busy}>Did not come</button>
            <button type="button" className="pe-chg danger" onClick={() => setStatus('cancelled')} disabled={busy} data-testid="book-cancel">Cancel the appointment</button>
          </div>
        )}
      </form>
    </div>,
    document.body
  );
}
