import React, { useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Loader2, Search } from 'lucide-react';
import { api } from '../lib/api';
import { formatPhone } from '../utils/phone';
import { formatDay } from '../utils/dates';

/**
 * The top bar's customer search (the mockup approved 29 Oct): a name, any part of a phone number, or a
 * customer code. The best five show as you type; Enter opens the one highlighted, or the full list on
 * All customers (?q=). "/" jumps here from anywhere that is not already a text box.
 *
 * `onDone` closes the phone's search when something is opened.
 */
const initials = (name) => (name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
const isTyping = (el) => !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);

/** The name with what was typed shown, as plain text pieces (never HTML). */
function Marked({ text, query }) {
  const q = query.trim().toLowerCase();
  const i = q ? text.toLowerCase().indexOf(q) : -1;
  if (i < 0) return text;
  return <>{text.slice(0, i)}<mark>{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
}

export default function CustomerSearch({ autoFocus = false, onDone, shortcut = false }) {
  const navigate = useNavigate();
  const [typed, setTyped] = useState('');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const input = useRef(null);
  const wrap = useRef(null);
  const listId = useId();

  // Asked when typing pauses: a phone number is ten keystrokes.
  useEffect(() => { const t = setTimeout(() => setQuery(typed.trim()), 200); return () => clearTimeout(t); }, [typed]);
  useEffect(() => { setActive(-1); }, [query]);
  const found = useQuery({
    queryKey: ['customers', 'top-search', query],
    queryFn: async () => (await api.get('/customers', { params: { search: query, page: 1, pageSize: 5 } })).data,
    enabled: query.length >= 2,
    placeholderData: keepPreviousData,
    staleTime: 30_000
  });

  // "/" from anywhere, unless they are already typing somewhere.
  useEffect(() => {
    if (!shortcut) return undefined;
    const onKey = (e) => { if (e.key === '/' && !isTyping(document.activeElement)) { e.preventDefault(); input.current?.focus(); setOpen(true); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shortcut]);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!wrap.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  const rows = query.length >= 2 ? (found.data?.customers ?? []) : [];
  const total = found.data?.total ?? 0;
  const digits = /^[\d\s+]+$/.test(query);
  const finish = (to) => { setOpen(false); setTyped(''); setQuery(''); input.current?.blur(); navigate(to); onDone?.(); };
  const openAll = () => query && finish(`/customers?q=${encodeURIComponent(query)}`);

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(a => Math.min(rows.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(-1, a - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (active >= 0 && rows[active]) finish(`/customers/${rows[active].id}`); else openAll(); }
    else if (e.key === 'Escape') { setOpen(false); input.current?.blur(); onDone?.(); }
  };

  const showList = open && query.length >= 2;
  return (
    <div className="tb-search" ref={wrap}>
      <div className={`tb-field${open ? ' on' : ''}`}>
        <Search size={16} aria-hidden="true" />
        <input ref={input} type="search" value={typed} autoFocus={autoFocus} placeholder="Search customers: name, phone or code"
          onChange={(e) => { setTyped(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={onKeyDown}
          role="combobox" aria-label="Find a customer" aria-expanded={showList} aria-controls={listId} aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined} data-testid="top-search" />
        {found.isFetching && query.length >= 2 ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : shortcut && !typed && <kbd aria-hidden="true">/</kbd>}
      </div>
      {showList && (
        <div className="tb-drop" role="listbox" id={listId} aria-label="Customers found" data-testid="top-search-results">
          {found.isError ? <p className="tb-empty">The search did not work just now. Try again in a moment.</p>
            : !found.isLoading && rows.length === 0 ? <p className="tb-empty">No customer matches "{query}".</p>
            : rows.map((c, i) => (
              <button key={c.id} id={`${listId}-${i}`} type="button" role="option" aria-selected={i === active} className={`tb-hit${i === active ? ' on' : ''}`}
                onMouseEnter={() => setActive(i)} onClick={() => finish(`/customers/${c.id}`)}>
                <span className="tb-av" aria-hidden="true">{initials(c.name)}</span>
                <span className="tb-who">
                  <b><Marked text={c.name} query={digits ? '' : query} /></b>
                  <small>{[c.code, c.phone ? (digits ? formatPhone(c.phone) : `…${c.phone.replace(/\D/g, '').slice(-4)}`) : 'no phone'].filter(Boolean).join(' · ')}</small>
                </span>
                <span className="tb-when">{c.lastVisit ? `Last visit ${formatDay(c.lastVisit)}` : 'Not yet'}</span>
              </button>
            ))}
          {rows.length > 0 && <button type="button" className="tb-all" onClick={openAll}>See all {total.toLocaleString('en-IN')} {total === 1 ? 'customer' : 'customers'} for "{query}" ›</button>}
        </div>
      )}
    </div>
  );
}
