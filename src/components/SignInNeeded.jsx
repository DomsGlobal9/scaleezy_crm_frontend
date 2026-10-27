import React from 'react';
import { LogIn } from 'lucide-react';
import { INVENTORY_URL } from '../lib/config';

/**
 * CRM has no sign-in of its own. The person signs in to Inventory, and the same sign-in opens CRM.
 */
export default function SignInNeeded() {
  return (
    <div className="crm-notice">
      <div className="crm-card">
        <LogIn size={28} style={{ color: 'var(--brand-ink)' }} />
        <h2>Sign in to Inventory first</h2>
        <p>CRM uses the same sign-in as Scaleezy Inventory. Sign in there, then come back to this page.</p>
        <a className="btn-primary" href={`${INVENTORY_URL}/login`}>Go to Inventory sign-in</a>
      </div>
    </div>
  );
}
