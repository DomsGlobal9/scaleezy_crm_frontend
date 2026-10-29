import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bell, CalendarCheck2, DoorOpen, Users } from 'lucide-react';
import { api } from '../lib/api';

/**
 * The top bar's bell (the mockup approved 29 Oct): what needs the person signed in now -- their
 * follow-ups due, people waiting at the door, duplicates to review -- each a tap to where it is done.
 * Asked again every minute. Sends nothing to anyone.
 */
const plural = (n, one, many) => `${n.toLocaleString('en-IN')} ${n === 1 ? one : many}`;

export default function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  const q = useQuery({ queryKey: ['notifications'], queryFn: async () => (await api.get('/notifications')).data, refetchInterval: 60_000 });

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!wrap.current?.contains(e.target)) setOpen(false); };
    const key = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    window.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', away); window.removeEventListener('keydown', key); };
  }, [open]);

  const d = q.data;
  const total = d?.total ?? 0;
  const close = () => setOpen(false);
  return (
    <div className="tb-bell" ref={wrap}>
      <button type="button" className={`crm-iconbtn tb-ib${open ? ' on' : ''}`} onClick={() => setOpen(o => !o)} aria-haspopup="dialog" aria-expanded={open}
        aria-label={total ? `Notifications: ${plural(total, 'thing needs', 'things need')} you` : 'Notifications: nothing needs you'} data-testid="bell">
        <Bell size={18} />
        {total > 0 && <span className="tb-dot" aria-hidden="true">{total > 99 ? '99+' : total}</span>}
      </button>
      {open && (
        <div className="tb-drop tb-notes" role="dialog" aria-label="Needs you now" data-testid="bell-panel">
          <h3>Needs you now</h3>
          {q.isError ? <p className="tb-empty">This could not be checked just now.</p>
            : !d ? <p className="tb-empty">Checking…</p>
            : total === 0 ? <p className="tb-empty">Nothing needs you right now.</p>
            : (
              <>
                {d.followUps.count > 0 && (
                  <Link to="/today" className="tb-note" onClick={close}>
                    <span className="tb-i" aria-hidden="true"><CalendarCheck2 size={16} /></span>
                    <span><b>{plural(d.followUps.count, 'follow-up', 'follow-ups')} due{d.followUps.items.some(f => f.late) ? ', some late' : ' today'}</b>
                      <small>{d.followUps.items.map(f => `${f.customer}: ${f.body}`).join(' · ')}</small></span>
                  </Link>
                )}
                {d.waiting.count > 0 && (
                  <Link to="/counter" className="tb-note" onClick={close}>
                    <span className="tb-i" aria-hidden="true"><DoorOpen size={16} /></span>
                    <span><b>{plural(d.waiting.count, 'waiting', 'waiting')} at the door</b>
                      <small>{d.waiting.items.map(w => `${w.name}${w.store ? `, ${w.store}` : ''}, waiting ${w.minutes} ${w.minutes === 1 ? 'minute' : 'minutes'}`).join(' · ')}</small></span>
                  </Link>
                )}
                {d.duplicates?.count > 0 && (
                  <Link to="/duplicates" className="tb-note" onClick={close}>
                    <span className="tb-i" aria-hidden="true"><Users size={16} /></span>
                    <span><b>{plural(d.duplicates.count, 'duplicate', 'duplicates')} to review</b><small>Same phone or email, maybe the same person</small></span>
                  </Link>
                )}
              </>
            )}
        </div>
      )}
    </div>
  );
}
