import React from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';

/**
 * What a screen shows when it could not ask, as opposed to when the answer was nothing. A failure
 * says it failed, in one sentence, and offers the only useful action. It never claims the list is empty.
 */
export default function LoadFailed({ what = 'this', error, onRetry }) {
  return (
    <div className="crm-empty" role="alert">
      <AlertTriangle size={22} style={{ color: 'var(--accent-danger)' }} />
      <h3>Could not load {what}.</h3>
      <p>{error?.message || 'Something went wrong reaching the server.'}</p>
      {onRetry && (
        <button type="button" className="btn-secondary" onClick={onRetry} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <RotateCw size={14} /> Try again
        </button>
      )}
    </div>
  );
}
