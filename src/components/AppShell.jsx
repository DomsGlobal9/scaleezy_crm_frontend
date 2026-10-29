import React, { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { CalendarCheck2, TrendingUp, DoorOpen, Users, Tags, ListFilter, Megaphone, Moon, Sun, LogOut, Menu, X, Search } from 'lucide-react';
import CustomerSearch from './CustomerSearch';
import NotificationsBell from './NotificationsBell';
import { useAuth } from '../context/AuthContext';
import { usePermission } from '../hooks/usePermission';
import { useTodayCount } from '../hooks/useWork';
import CrmLogo from './CrmLogo';

const THEME_KEY = 'scale_easy_theme'; // Inventory's key, so the two apps share one setting

function readTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* storage unavailable */ }
  return document.documentElement.getAttribute('data-theme') || 'dark';
}

/**
 * Every CRM screen sits beside this sidebar, as Inventory's do: the brand, the places, and at the
 * foot who is signed in, light or dark, sign out. Same width, same links, same slide-in below 1024px
 * (a tablet in portrait gets the whole width back), so moving between the two apps feels like one.
 *
 * The places: Today (with my follow-ups due), In the store, Customers, Groups, Segments, Duplicates (only for those who may merge,
 * with the pairs waiting). Only places that exist are listed: no "coming soon".
 */
export default function AppShell() {
  const { user, signOut } = useAuth();
  const { can, isOwner } = usePermission();
  const location = useLocation();
  const [theme, setTheme] = useState(readTheme);
  const [open, setOpen] = useState(false);
  // The phone's search, opened across the bar.
  const [searching, setSearching] = useState(false);
  const firstLink = useRef(null);
  const menuButton = useRef(null);
  const seesCustomers = can('customer:view');
  const due = useTodayCount(seesCustomers);
  const dueCount = due.data?.mine ?? 0;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* fine */ }
  }, [theme]);

  // A slid-in menu gets out of the way by itself: on every new page, and on Escape.
  useEffect(() => { setOpen(false); setSearching(false); }, [location.pathname]);
  useEffect(() => {
    if (!open) return undefined;
    firstLink.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); menuButton.current?.focus(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const places = seesCustomers ? [
    { to: '/today', label: 'To do today', icon: CalendarCheck2, count: dueCount, countLabel: `${dueCount} due` },
    ...(can('crm:team:view') ? [{ to: '/week', label: 'This week', icon: TrendingUp }] : []),
    { to: '/counter', label: 'At the door', icon: DoorOpen },
    { to: '/customers', label: 'All customers', icon: Users },
    { to: '/groups', label: 'Customer groups', icon: Tags },
    { to: '/segments', label: 'Saved lists', icon: ListFilter },
    ...(can('campaign:view') ? [{ to: '/messages', label: 'Messages', icon: Megaphone }] : []),
  ] : [];

  const initials = (user?.name || user?.email || '?').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const themeButton = (
    <button type="button" className="crm-iconbtn tb-ib" onClick={() => setTheme(t => (t === 'dark' ? 'light' : 'dark'))}
      aria-label={theme === 'dark' ? 'Switch to light' : 'Switch to dark'} title={theme === 'dark' ? 'Light' : 'Dark'} data-testid="theme">
      {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );

  return (
    <div className="crm-shell">
      {/* Phones and tablets: menu and logo on the left, the search in the middle, the bell and light/dark
          on the right (the mockup approved 29 Oct); the sidebar slides in over the page. */}
      <header className="crm-mobilebar">
        {searching ? (
          <div className="tb-msearch">
            <CustomerSearch autoFocus onDone={() => setSearching(false)} />
            <button type="button" className="tb-cancel" onClick={() => setSearching(false)}>Cancel</button>
          </div>
        ) : (
          <>
            <button ref={menuButton} type="button" className="crm-iconbtn" onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open} aria-controls="crm-sidebar">
              <Menu size={20} />
            </button>
            <Link className="crm-brand" to="/today" aria-label="Scaleezy CRM, go to Today">
              <CrmLogo height={22} />
            </Link>
            {seesCustomers ? (
              <button type="button" className="tb-mfield" onClick={() => setSearching(true)} data-testid="top-search-open"><Search size={15} aria-hidden="true" /> Search</button>
            ) : <span />}
            {seesCustomers ? <NotificationsBell /> : <span />}
            {themeButton}
          </>
        )}
      </header>

      {open && <div className="crm-sidebar-overlay" onClick={() => setOpen(false)} aria-hidden="true" />}

      <aside id="crm-sidebar" className={`crm-sidebar${open ? ' open' : ''}`} aria-label="CRM">
        <div className="crm-sidebar-brand">
          <Link className="crm-brand" to="/today" aria-label="Scaleezy CRM, go to Today">
            <CrmLogo height={30} />
          </Link>
          <button type="button" className="crm-iconbtn crm-sidebar-close" onClick={() => setOpen(false)} aria-label="Close menu">
            <X size={20} />
          </button>
        </div>

        <nav className="crm-nav" aria-label="CRM places">
          {places.map((p, i) => {
            const Icon = p.icon;
            return (
              <NavLink key={p.to} ref={i === 0 ? firstLink : undefined} to={p.to} className={({ isActive }) => `crm-tab${isActive ? ' on' : ''}`}>
                <Icon size={19} aria-hidden="true" />
                <span className="crm-tab-label">{p.label}</span>
                {p.count > 0 && <span className={`crm-badge${p.quiet ? ' quiet' : ''}`} aria-label={p.countLabel}>{p.count > 99 ? '99+' : p.count}</span>}
              </NavLink>
            );
          })}
        </nav>

        <div className="crm-sidebar-foot">
          {/* The owner's name opens Shop settings (theirs alone); for everyone else it is just who is signed in. */}
          {isOwner ? (
            <Link to="/settings" className="crm-me crm-me-link" title="Shop settings" onClick={() => setOpen(false)}>
              <span className="crm-me-initials" aria-hidden="true">{initials}</span>
              <span className="crm-me-who">
                <span className="crm-me-name">{user?.name || 'Signed in'}</span>
                <span className="crm-me-email">Shop settings</span>
              </span>
            </Link>
          ) : (
            <div className="crm-me">
              <span className="crm-me-initials" aria-hidden="true">{initials}</span>
              <span className="crm-me-who">
                <span className="crm-me-name">{user?.name || 'Signed in'}</span>
                {user?.email && <span className="crm-me-email">{user.email}</span>}
              </span>
            </div>
          )}
          <div className="crm-me-actions">
            <button type="button" className="crm-iconbtn crm-signout" onClick={signOut} aria-label="Sign out" title="Sign out">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>

      <div className="crm-main">
        {/* Laptops: customer search in the middle; the bell and light/dark on the right. */}
        <header className="crm-topbar">
          <span />
          {seesCustomers ? <CustomerSearch shortcut /> : <span />}
          <div className="tb-right">{seesCustomers && <NotificationsBell />}{themeButton}</div>
        </header>
        <Outlet />
      </div>
    </div>
  );
}
