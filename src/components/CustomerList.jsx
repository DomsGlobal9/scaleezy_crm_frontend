import React from 'react';
import { Phone, Mail } from 'lucide-react';
import { rowLink } from './common/rowLink';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { formatPhone } from '../utils/phone';
import { formatRupees } from '../utils/money';
import { formatDay, since } from '../utils/dates';

/**
 * A list of customers as the Customers screen shows them: a table on a laptop, a card each on a
 * phone (the table needs about 760px for every column). Segments show their people with it too,
 * so a person reads the same wherever they are listed.
 */
export default function CustomerList({ rows, onOpen }) {
  const narrow = useMediaQuery('(max-width: 760px)');
  const open = onOpen;
  return narrow ? (
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
