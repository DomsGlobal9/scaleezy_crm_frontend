import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Loader2, CloudOff, RotateCw } from 'lucide-react';
import { useAuth } from './context/AuthContext';
import AppShell from './components/AppShell';
import SignIn from './pages/SignIn';
import Customers from './pages/Customers';
import CustomerDetail from './pages/CustomerDetail';
import Today from './pages/Today';
import Duplicates from './pages/Duplicates';
import Segments from './pages/Segments';
import SegmentEditor from './pages/SegmentEditor';
import SegmentView from './pages/SegmentView';
import CustomerFrom from './pages/CustomerFrom';
import Counter from './pages/Counter';

export default function App() {
  const { status, refresh } = useAuth();

  if (status === 'checking') {
    return (
      <div className="crm-notice" aria-busy="true">
        <div className="crm-row crm-muted"><Loader2 size={18} className="animate-spin" /> Checking your sign-in…</div>
      </div>
    );
  }
  if (status === 'out') return <SignIn />;
  if (status === 'unavailable') {
    return (
      <div className="crm-notice">
        <div className="crm-card">
          <CloudOff size={28} style={{ color: 'var(--accent-warning)' }} />
          <h2>We could not check your sign-in</h2>
          <p>Your sign-in could not be checked just now. Please try again in a moment.</p>
          <button type="button" className="btn-primary" onClick={refresh} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <RotateCw size={14} /> Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/today" element={<Today />} />
          <Route path="/counter" element={<Counter />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/duplicates" element={<Duplicates />} />
          <Route path="/customers/from/:source/:externalId" element={<CustomerFrom />} />
          <Route path="/customers/:id" element={<CustomerDetail />} />
          <Route path="/segments" element={<Segments />} />
          <Route path="/segments/new" element={<SegmentEditor />} />
          <Route path="/segments/:id" element={<SegmentView />} />
          <Route path="/segments/:id/edit" element={<SegmentEditor />} />
          <Route path="*" element={<Navigate to="/today" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
