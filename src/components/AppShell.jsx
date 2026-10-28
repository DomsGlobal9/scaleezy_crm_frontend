import React, { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { CalendarCheck2, TrendingUp, DoorOpen, Users, Tags, ListFilter, Moon, Sun, LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usePermission } from '../hooks/usePermission';
import { useTodayCount } from '../hooks/useWork';

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
  const { can } = usePermission();
  const location = useLocation();
  const [theme, setTheme] = useState(readTheme);
  const [open, setOpen] = useState(false);
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
  useEffect(() => { setOpen(false); }, [location.pathname]);
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
  ] : [];

  const initials = (user?.name || user?.email || '?').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="crm-shell">
      {/* Phones and tablets: a slim bar with the menu button; the sidebar slides in over the page. */}
      <header className="crm-mobilebar">
        <button ref={menuButton} type="button" className="crm-iconbtn" onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open} aria-controls="crm-sidebar">
          <Menu size={20} />
        </button>
        <Link className="crm-brand" to="/today" aria-label="Scaleezy CRM, go to Today">
          <img src="/scaleezy-logo.png" alt="Scaleezy" className="logo-on-light" />
          <img src="/scaleezy-logo-dark.png" alt="Scaleezy" className="logo-on-dark" />
          <span className="crm-brand-app">CRM</span>
        </Link>
        {dueCount > 0 ? (
          <Link to="/today" className="crm-mobilebar-due" aria-label={`Today: ${dueCount} follow-up${dueCount === 1 ? '' : 's'} due`}>
            <CalendarCheck2 size={16} /> {dueCount > 99 ? '99+' : dueCount}
          </Link>
        ) : <span className="crm-mobilebar-spacer" />}
      </header>

      {open && <div className="crm-sidebar-overlay" onClick={() => setOpen(false)} aria-hidden="true" />}

      <aside id="crm-sidebar" className={`crm-sidebar${open ? ' open' : ''}`} aria-label="CRM">
        <div className="crm-sidebar-brand">
          <Link className="crm-brand" to="/today" aria-label="Scaleezy CRM, go to Today">
            <img src="/scaleezy-logo.png" alt="Scaleezy" className="logo-on-light" />
            <img src="/scaleezy-logo-dark.png" alt="Scaleezy" className="logo-on-dark" />
            <span className="crm-brand-app">CRM</span>
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
          <div className="crm-me">
            <span className="crm-me-initials" aria-hidden="true">{initials}</span>
            <span className="crm-me-who">
              <span className="crm-me-name">{user?.name || 'Signed in'}</span>
              {user?.email && <span className="crm-me-email">{user.email}</span>}
            </span>
          </div>
          <div className="crm-me-actions">
            <button type="button" className="crm-iconbtn" onClick={() => setTheme(t => (t === 'dark' ? 'light' : 'dark'))}
              aria-label={theme === 'dark' ? 'Switch to light' : 'Switch to dark'} title={theme === 'dark' ? 'Light' : 'Dark'}>
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button type="button" className="crm-iconbtn crm-signout" onClick={signOut} aria-label="Sign out" title="Sign out">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>

      <div className="crm-main">
        <Outlet />
      </div>
    </div>
  );
}
