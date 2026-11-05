import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Users, Search, X, Loader2, ShieldOff, UserX, DownloadCloud, GitMerge, SlidersHorizontal } from 'lucide-react';
import { useShop } from '../hooks/useShop';
import { useCustomerOverview, useCustomers } from '../hooks/useCustomers';
import CustomerFilters from '../components/CustomerFilters';
import Select from '../components/common/Select';
import { chipsOf, rangeWord, readRules } from '../utils/customerFilters';
import { useMerges } from '../hooks/useWork';
import { usePermission } from '../hooks/usePermission';
import LoadFailed from '../components/LoadFailed';
import CustomerList from '../components/CustomerList';

/**
 * Customers: everyone the shop knows, across every channel, with what they spent and when they were
 * last here. Search by name, phone (written any way), code or email. The first CRM screen.
 */
export default function Customers() {
  const { can } = usePermission();
  const mayMerge = can('crm:customer:merge');
  const merges = useMerges('open', mayMerge);
  const openPairs = merges.data?.open ?? 0;
  const navigate = useNavigate();
  // The search and the page live in the address (?q=…&page=…), so coming back from a customer
  // lands on the same list, and a list can be shared or bookmarked.
  const [params, setParams] = useSearchParams();
  const search = (params.get('q') || '').trim();
  const page = Math.max(1, Number.parseInt(params.get('page') || '1', 10) || 1);
  const [typed, setTyped] = useState(search);
  // The filters and the order live there too.
  const rules = readRules(params.get('rules'));
  const sort = ['spend', 'last'].includes(params.get('sort')) ? params.get('sort') : 'newest';
  const [filtering, setFiltering] = useState(false);
  const closeFilters = useCallback(() => setFiltering(false), []);
  const setRules = (next) => setParams(p => {
    if (Object.keys(next).length) p.set('rules', JSON.stringify(next)); else p.delete('rules');
    p.delete('page');
    return p;
  });
  const setSort = (next) => setParams(p => {
    if (next === 'newest') p.delete('sort'); else p.set('sort', next);
    p.delete('page');
    return p;
  });
  const without = (keys) => setRules(Object.fromEntries(Object.entries(rules).filter(([k]) => !keys.includes(k))));
  const chips = chipsOf(rules);
  const filtered = chips.length > 0;
  // A search started elsewhere (the top bar) while this page is open fills the box too.
  useEffect(() => { setTyped(t => (t.trim() === search ? t : search)); }, [search]);

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

  // The shop's first copy from Inventory: until it is done, an empty list is "on its way", not "none".
  const shop = useShop();
  const copying = !!shop.data && shop.data.on && !shop.data.firstCopyDone;
  const notOn = !!shop.data && !shop.data.on;
  const result = useCustomers({ search, page, rules, sort, refetchInterval: copying ? 5000 : false });
  const overview = useCustomerOverview();
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
          <h1><Users size={26} /> All customers</h1>
          <p>Everyone who has bought from you, from the till, the online shop and Shopify, in one list.</p>
        </div>
        <div className="cu-head-end">
          {data && !filtered && (
            <span className="crm-muted" data-testid="count">
              {total === 0 ? 'No customers' : total === 1 ? '1 customer' : `${total.toLocaleString('en-IN')} customers`}
              {search ? ' match' : ''}
            </span>
          )}
          {mayMerge && (
            <Link to="/duplicates" className="btn-secondary cu-dupes" data-testid="check-duplicates">
              <GitMerge size={14} aria-hidden="true" /> Check duplicates{openPairs > 0 && <span className="crm-badge quiet" aria-label={`${openPairs} to review`}>{openPairs}</span>}
            </Link>
          )}
        </div>
      </div>

      {overview.data?.show && !filtered && !search && <Overview data={overview.data} onPick={setRules} />}

      <div className="cf-bar">
      <div className="crm-search">
        <Search size={20} className="crm-search-icon" />
        <input
          className="input-field"
          type="search"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="Search by name, phone, code, email or bill number"
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
      <button type="button" className="btn-secondary cf-open" onClick={() => setFiltering(true)} data-testid="filters-open">
        <SlidersHorizontal size={15} aria-hidden="true" /> Filters{filtered && <span className="crm-badge" aria-label={`${chips.length} on`}>{chips.length}</span>}
      </button>
      <span className="cf-sort">
        <Select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort customers">
          <option value="newest">Sort: Newest</option>
          <option value="spend">Sort: Highest spend</option>
          <option value="last">Sort: Last visit</option>
        </Select>
      </span>
      </div>

      {filtered && (
        <>
          <div className="cf-on" data-testid="filters-on">
            {chips.map(c => (
              <span key={c.id} className="cf-tag" data-testid="filter-chip">
                <span>{c.group}</span> <b>{c.value}</b>
                <button type="button" className="crm-iconbtn" style={{ width: 22, height: 22 }} aria-label={`Take off ${c.group} ${c.value}`} onClick={() => without(c.keys)}><X size={13} /></button>
              </span>
            ))}
            <button type="button" className="si-link" onClick={() => setRules({})} data-testid="filters-clear-all">Clear all</button>
          </div>
          {data && (
            <div className="cf-result">
              <span><strong>{total.toLocaleString('en-IN')}</strong> {total === 1 ? 'customer matches' : 'customers match'}</span>
              {can('crm:segment:manage') && total > 0 && <Link className="si-link" to={`/segments/new?rules=${encodeURIComponent(JSON.stringify(rules))}`} data-testid="filters-save">Save as a list</Link>}
            </div>
          )}
        </>
      )}
      {filtering && <CustomerFilters rules={rules} search={search} onClose={closeFilters} onApply={(next) => { setRules(next); setFiltering(false); }} />}

      {copying && rows.length > 0 && (
        <div className="cu-copying" role="status" data-testid="copying-banner">
          <DownloadCloud size={16} /> Still bringing customers over from Inventory: {shop.data.customersSoFar.toLocaleString('en-IN')} so far. The list fills in by itself.
        </div>
      )}

      {result.isLoading ? (
        <div className="crm-card crm-row crm-muted" aria-busy="true"><Loader2 size={16} className="animate-spin" /> Loading customers…</div>
      ) : result.isError ? (
        <div className="crm-card"><LoadFailed what="the customers" error={result.error} onRetry={() => result.refetch()} /></div>
      ) : rows.length === 0 && copying && !search ? (
        <div className="crm-card" data-testid="copying">
          <div className="crm-empty">
            <Loader2 size={26} className="animate-spin" style={{ color: 'var(--brand-ink)' }} />
            <h3>Bringing your customers over from Inventory…</h3>
            <p>This happens once, the first time your shop opens CRM. They will appear here by themselves; you can leave this page open.</p>
          </div>
        </div>
      ) : rows.length === 0 && filtered ? (
        <div className="crm-card">
          <div className="crm-empty" data-testid="filters-none">
            <UserX size={26} />
            <h3>Nobody matches these filters</h3>
            <p>{rules.crafts || rules.colours || rules.sizes
              ? 'Earlier records do not always have a craft, colour or size, so those customers appear under these only once they buy again. Try a kind or a budget instead.'
              : 'Take a filter off to see more customers.'}</p>
            <button type="button" className="btn-secondary" onClick={() => setRules({})}>Clear all</button>
          </div>
        </div>
      ) : rows.length === 0 ? (
        <div className="crm-card">
          <div className="crm-empty">
            <UserX size={26} />
            <h3>{search ? 'Nobody matches that' : notOn ? (shop.data.paused ? 'Copying is paused for your shop' : 'CRM is not switched on for your shop yet') : 'No customers yet'}</h3>
            <p>{search ? 'Try fewer letters, or the phone number written differently.'
              : notOn ? 'Your customers stay safe in Inventory. Ask ScaleEzy to switch CRM on for your shop.'
              : 'Customers appear here as soon as a sale is made, an order arrives, or one is added in Inventory.'}</p>
          </div>
        </div>
      ) : (
        <CustomerList rows={rows} onOpen={open} />
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

/** The small overview: how many customers at each budget and by what they buy. A number opens that filter. */
function Overview({ data, onPick }) {
  const bars = (rows, words, ruleKey, title) => {
    const most = Math.max(1, ...rows.map(r => r.count));
    return (
      <section className="crm-card" aria-label={title}>
        <h2>{title}</h2>
        {rows.map(r => (
          <button key={r.key} type="button" className="cf-bar-row" onClick={() => onPick({ [ruleKey]: [r.key] })} data-testid={`overview-${r.key}`}>
            <span>{words ? words(r.key) : r.key}</span>
            <span className="cf-track" aria-hidden="true"><i style={{ width: `${Math.max(r.count ? 2 : 0, (r.count / most) * 100)}%` }} /></span>
            <b>{r.count.toLocaleString('en-IN')}</b>
          </button>
        ))}
      </section>
    );
  };
  return (
    <div className="cf-overview" data-testid="customer-overview">
      {bars(data.budget, rangeWord, 'budget', 'By budget')}
      {data.kinds.length > 0 && bars(data.kinds, null, 'boughtKinds', 'By what they buy')}
    </div>
  );
}
