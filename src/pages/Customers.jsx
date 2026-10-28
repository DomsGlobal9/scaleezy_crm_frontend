import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Users, Search, X, Loader2, Phone, Mail, ShieldOff, UserX } from 'lucide-react';
import { rowLink } from '../components/common/rowLink';
import { useCustomers } from '../hooks/useCustomers';
import { usePermission } from '../hooks/usePermission';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { formatPhone } from '../utils/phone';
import { formatRupees } from '../utils/money';
import { formatDay, since } from '../utils/dates';
import LoadFailed from '../components/LoadFailed';

/**
 * Customers: everyone the shop knows, across every channel, with what they spent and when they were
 * last here. Search by name, phone (written any way), code or email. The first CRM screen.
 */
export default function Customers() {
  const { can } = usePermission();
  const navigate = useNavigate();
  // The search and the page live in the address (?q=…&page=…), so coming back from a customer
  // lands on the same list, and a list can be shared or bookmarked.
  const [params, setParams] = useSearchParams();
  const search = (params.get('q') || '').trim();
  const page = Math.max(1, Number.parseInt(params.get('page') || '1', 10) || 1);
  const [typed, setTyped] = useState(search);
  // A card per customer on a phone; the table needs about 760px to show every column.
  const narrow = useMediaQuery('(max-width: 760px)');

  const setPage = (next) => setParams(p => {
    const n = typeof next === 'function' ? next(page) : next;
    if (n <= 1) p.delete('page'); else p.set('page', String(n));
    return p;
  });

  // The search sent to the server waits for typing to pause: a phone number is ten keystrokes.
  // A new search starts at page 1; arriving with the same search keeps the page.
  useEffect(() => {
    const t = setTimeout(() => {
      if (typed.trim() === search) return;
      setParams(p => {
        if (typed.trim()) p.set('q', typed.trim()); else p.delete('q');
        p.delete('page');
        return p;
      }, { replace: true });
    }, 300);
    return () => clearTimeout(t);
  }, [typed]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = (c) => navigate(`/customers/${c.id}`);

  const result = useCustomers({ search, page });
  const data = result.data;
  const rows = data?.customers ?? [];

  if (!can('customer:view')) {
    return (
      <div className="crm-notice">
        <div className="crm-card">
          <ShieldOff size={28} style={{ color: 'var(--accent-warning)' }} />
          <h2>You cannot see customers</h2>
          <p>Your role does not include seeing customers. Ask whoever manages your team if you need this.</p>
        </div>
      </div>
    );
  }

  const total = data?.total ?? 0;
  const first = total === 0 ? 0 : (data.page - 1) * data.pageSize + 1;
  const last = total === 0 ? 0 : Math.min(total, data.page * data.pageSize);

  return (
    <main className="crm-page">
      <div className="crm-head">
        <div style={{ minWidth: 0 }}>
          <h1><Users size={26} /> Customers</h1>
          <p>Everyone who has bought from you, from the till, the online shop and Shopify, in one list.</p>
        </div>
        {data && (
          <span className="crm-muted" data-testid="count">
            {total === 0 ? 'No customers' : total === 1 ? '1 customer' : `${total.toLocaleString('en-IN')} customers`}
            {search ? ' match' : ''}
          </span>
        )}
      </div>

      <div className="crm-search">
        <Search size={20} className="crm-search-icon" />
        <input
          className="input-field"
          type="search"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="Search by name, phone, code or email"
          aria-label="Search customers"
          autoComplete="off"
          enterKeyHint="search"
        />
        <div className="crm-search-end">
          {result.isFetching && <Loader2 size={18} className="animate-spin" aria-label="Searching" />}
          {typed && (
            <button type="button" className="crm-iconbtn" aria-label="Clear search" onClick={() => setTyped('')}>
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {result.isLoading ? (
        <div className="crm-card crm-row crm-muted" aria-busy="true"><Loader2 size={16} className="animate-spin" /> Loading customers…</div>
      ) : result.isError ? (
        <div className="crm-card"><LoadFailed what="the customers" error={result.error} onRetry={() => result.refetch()} /></div>
      ) : rows.length === 0 ? (
        <div className="crm-card">
          <div className="crm-empty">
            <UserX size={26} />
            <h3>{search ? 'Nobody matches that' : 'No customers yet'}</h3>
            <p>{search ? 'Try fewer letters, or the phone number written differently.' : 'Customers appear here as soon as a sale is made, an order arrives, or one is added in Inventory.'}</p>
          </div>
        </div>
      ) : narrow ? (
        <div className="crm-cards" data-testid="customer-cards">
          {rows.map(c => <CustomerCard key={c.id} customer={c} onOpen={() => open(c)} />)}
        </div>
      ) : (
        <div className="crm-card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="crm-table" data-testid="customer-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Groups</th>
                <th className="num">Total spent</th>
                <th>Last visit</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(c => (
                <tr key={c.id} data-testid="customer-row" {...rowLink(() => open(c), { label: `Open ${c.name}` })}>
                  <td>
                    <div className="crm-name">{c.name}</div>
                    <div className="crm-sub">{[c.code, c.companyName, c.customerType === 'WALK_IN' ? 'Walk-in' : null].filter(Boolean).join(' · ')}</div>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{c.phone ? formatPhone(c.phone) : <span className="crm-muted">—</span>}</td>
                  <td style={{ wordBreak: 'break-all' }}>{c.email || <span className="crm-muted">—</span>}</td>
                  <td><Tags tags={c.tags} /></td>
                  <td className="num">
                    <div style={{ fontWeight: 600 }}>{formatRupees(c.totalSpent)}</div>
                    {c.orders > 0 && <div className="crm-sub">{c.orders} {c.orders === 1 ? 'bill' : 'bills'}</div>}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {c.lastVisit ? <><div>{formatDay(c.lastVisit)}</div><div className="crm-sub">{since(c.lastVisit)}</div></> : <span className="crm-muted">Not yet</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.pages > 1 && (
        <nav className="crm-pager" aria-label="Pages">
          <button type="button" className="btn-secondary" disabled={page <= 1 || result.isFetching} onClick={() => setPage(p => p - 1)}>Previous</button>
          <span className="crm-muted" data-testid="page-info">{first}–{last} of {total.toLocaleString('en-IN')} · Page {data.page} of {data.pages}</span>
          <button type="button" className="btn-secondary" disabled={page >= data.pages || result.isFetching} onClick={() => setPage(p => p + 1)}>Next</button>
        </nav>
      )}
    </main>
  );
}

function Tags({ tags }) {
  if (!tags || tags.length === 0) return <span className="crm-muted">—</span>;
  return (
    <span className="crm-row" style={{ gap: 6, flexWrap: 'wrap' }}>
      {tags.map(t => <span key={t} className="crm-tag">{t}</span>)}
    </span>
  );
}

function CustomerCard({ customer: c, onOpen }) {
  return (
    <article data-testid="customer-row" {...rowLink(onOpen, { label: `Open ${c.name}` })} className="crm-card crm-cust row-link">
      <div className="crm-cust-top">
        <div style={{ minWidth: 0 }}>
          <div className="crm-name" style={{ fontSize: 16 }}>{c.name}</div>
          <div className="crm-sub">{[c.code, c.companyName, c.customerType === 'WALK_IN' ? 'Walk-in' : null].filter(Boolean).join(' · ')}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="crm-cust-spent">{formatRupees(c.totalSpent)}</div>
          <div className="crm-sub">{c.orders > 0 ? `${c.orders} ${c.orders === 1 ? 'bill' : 'bills'}` : 'no bills yet'}</div>
        </div>
      </div>
      {(c.phone || c.email) && (
        <div style={{ display: 'grid', gap: 4 }}>
          {c.phone && <div className="crm-cust-line"><Phone size={14} /> <span>{formatPhone(c.phone)}</span></div>}
          {c.email && <div className="crm-cust-line"><Mail size={14} /> <span>{c.email}</span></div>}
        </div>
      )}
      <div className="crm-cust-foot">
        <Tags tags={c.tags} />
        <span className="crm-muted">{c.lastVisit ? `Last visit ${formatDay(c.lastVisit)} · ${since(c.lastVisit)}` : 'No visit yet'}</span>
      </div>
    </article>
  );
}
