import React, { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Moon, Sun } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const THEME_KEY = 'scale_easy_theme'; // Inventory's key, so the two apps share one setting

function readTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* storage unavailable */ }
  return document.documentElement.getAttribute('data-theme') || 'dark';
}

/** The top bar every CRM screen sits under: the brand, who is signed in, light or dark. */
export default function AppShell() {
  const { user } = useAuth();
  const [theme, setTheme] = useState(readTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* fine */ }
  }, [theme]);

  return (
    <div className="crm-shell">
      <header className="crm-topbar">
        <a className="crm-brand" href="/customers" aria-label="Scaleezy CRM">
          <img src="/scaleezy-logo.png" alt="Scaleezy" className="logo-on-light" />
          <img src="/scaleezy-logo-dark.png" alt="Scaleezy" className="logo-on-dark" />
          <span className="crm-brand-app">CRM</span>
        </a>
        <div className="crm-topbar-right">
          {user?.name && <span className="crm-user" title={user.email}>{user.name}</span>}
          <button type="button" className="crm-iconbtn" onClick={() => setTheme(t => (t === 'dark' ? 'light' : 'dark'))}
            aria-label={theme === 'dark' ? 'Switch to light' : 'Switch to dark'} title={theme === 'dark' ? 'Light' : 'Dark'}>
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
