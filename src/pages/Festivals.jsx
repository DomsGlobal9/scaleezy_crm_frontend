import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Loader2, ShieldOff } from 'lucide-react';
import { usePermission } from '../hooks/usePermission';
import { useFestivals, useSetFestivalOn, useSetFestivalDate } from '../hooks/useFestivals';
import LoadFailed from '../components/LoadFailed';

/**
 * The shop's festivals (the owner approved the mockup, 28 Oct): which ones count as festival buying
 * on a customer's reading, and each one's next date. Dasara, Diwali, Ugadi and Ramzan move with the
 * moon; their dates come built in and the owner can correct one. Seen by anyone who sees customers;
 * changed by the owner and admins.
 */
const longDay = (day) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export default function Festivals() {
  const { can } = usePermission();
  const list = useFestivals();
  const mayManage = can('crm:festivals:manage');

  if (!can('customer:view')) {
    return (
      <div className="crm-notice"><div className="crm-card">
        <ShieldOff size={28} style={{ color: 'var(--accent-warning)' }} />
        <h2>You cannot see customers</h2>
        <p>Your role does not include seeing customers. Ask whoever manages your team if you need this.</p>
      </div></div>
    );
  }

  return (
    <main className="crm-page fs-page">
      <Link to="/customers" className="fs-back"><ArrowLeft size={15} aria-hidden="true" /> All customers</Link>
      <div className="crm-head">
        <div style={{ minWidth: 0 }}>
          <h1>The shop's festivals</h1>
          <p>
            A bill in the {list.data?.windowDays ?? 21} days up to a ticked festival counts as buying for it, on each customer's page.
            {mayManage ? ' Dates that move with the moon come built in; correct one if your almanac differs.' : ''}
          </p>
        </div>
      </div>

      {list.isLoading ? (
        <div className="crm-card crm-row crm-muted" aria-busy="true"><Loader2 size={16} className="animate-spin" /> Loading the festivals…</div>
      ) : list.isError ? (
        <div className="crm-card"><LoadFailed what="the festivals" error={list.error} onRetry={() => list.refetch()} /></div>
      ) : (
        <ul className="crm-card fs-list">
          {list.data.festivals.map(f => <FestivalRow key={f.key} f={f} mayManage={mayManage} />)}
        </ul>
      )}
    </main>
  );
}

function FestivalRow({ f, mayManage }) {
  const setOn = useSetFestivalOn();
  const setDate = useSetFestivalDate();
  const [editing, setEditing] = useState(false);
  const [day, setDay] = useState(f.next?.date ?? '');
  const save = (e) => {
    e.preventDefault();
    setDate.mutate({ key: f.key, year: f.next.year, date: day }, { onSuccess: () => setEditing(false) });
  };

  return (
    <li className="fs-row" data-testid="festival-row">
      <label className="fs-on">
        <input type="checkbox" checked={f.on} disabled={!mayManage || setOn.isPending} onChange={(e) => setOn.mutate({ key: f.key, on: e.target.checked })} aria-label={`${f.name} counts`} />
        <span>
          <span className="fs-name">{f.name}</span>
          {f.note && <small>{f.note}</small>}
        </span>
      </label>
      {f.next && (editing ? (
        <form className="fs-edit" onSubmit={save}>
          <input type="date" className="input-field" value={day} onChange={(e) => setDay(e.target.value)} aria-label={`${f.name} ${f.next.year} date`} required />
          <button type="submit" className="btn-primary" disabled={setDate.isPending || !day}>{setDate.isPending ? 'Saving…' : 'Save'}</button>
          <button type="button" className="btn-secondary" onClick={() => { setEditing(false); setDay(f.next.date); }}>Cancel</button>
        </form>
      ) : (
        <div className="fs-date">
          <span data-testid="festival-date">{longDay(f.next.date)}</span>
          {f.next.corrected && <small>you changed it{f.next.builtIn ? ` (built in: ${longDay(f.next.builtIn)})` : ''}</small>}
          {mayManage && (
            <span className="fs-links">
              <button type="button" className="si-link" onClick={() => setEditing(true)}>Change date</button>
              {f.next.corrected && <button type="button" className="si-link" disabled={setDate.isPending} onClick={() => setDate.mutate({ key: f.key, year: f.next.year, date: null })}>Use the built-in date</button>}
            </span>
          )}
        </div>
      ))}
    </li>
  );
}
