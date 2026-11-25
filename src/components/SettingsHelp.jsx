import React, { createContext, useContext, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, X } from 'lucide-react';
import { useMediaQuery } from '../hooks/useMediaQuery';

/**
 * Settings that explain themselves (25 Nov, the mockup mockups/settings-explained.html; then "pages are too long, do
 * it user friendly"). A section opens with three short steps in one compact strip (folded behind "How this works" on
 * a phone). A list of settings shows one plain sentence each; everything about one setting is in a panel that opens
 * on it: how it works, the message as the customer reads it, its options and its switch.
 */

/** Inside a panel, "How it works" is the point of opening it: shown at once. */
const InPanel = createContext(false);

/** The three steps a section opens with. A phone keeps them folded until asked. */
export function HowSteps({ steps, testid }) {
  const phone = useMediaQuery('(max-width: 760px)');
  const [open, setOpen] = useState(false);
  const id = useId();
  const list = (
    <ol className="sh-steps" data-testid={testid} id={id}>
      {steps.map(([title, text], i) => (
        <li key={title}><span className="sh-n" aria-hidden="true">{i + 1}</span><span className="sh-step"><b>{title}</b><span>{text}</span></span></li>
      ))}
    </ol>
  );
  if (!phone) return list;
  return (
    <div className="sh-steps-fold">
      <button type="button" className="sh-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen(o => !o)} data-testid={testid ? `${testid}-toggle` : undefined}>
        <ChevronDown size={15} aria-hidden="true" className={open ? 'up' : ''} /> How this works
      </button>
      {open && list}
    </div>
  );
}

/** A section's opening sentence: what this is for, in the owner's words. */
export function Lede({ children }) {
  return <p className="sh-lede">{children}</p>;
}

/**
 * "How it works" under one setting: folded in a list, open in a panel. rows are [label, words]; message is the
 * WhatsApp the customer gets, as they would read it ({ who, text, foot }).
 */
export function HowItWorks({ rows, message, testid, children }) {
  const inPanel = useContext(InPanel);
  const [open, setOpen] = useState(false);
  const id = useId();
  const shown = inPanel || open;
  return (
    <div className="sh-how">
      {inPanel ? <h4 className="sh-how-h">How it works</h4> : (
        <button type="button" className="sh-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen(o => !o)} data-testid={testid}>
          <ChevronDown size={15} aria-hidden="true" className={open ? 'up' : ''} /> How it works
        </button>
      )}
      {shown && (
        <div className={`sh-open${message ? '' : ' one'}`} id={id} data-testid={testid ? `${testid}-open` : undefined}>
          <dl>
            {rows.map(([label, words]) => <React.Fragment key={label}><dt>{label}</dt><dd>{words}</dd></React.Fragment>)}
          </dl>
          {message && (
            <div className="sh-wa">
              <small>{message.who ?? 'What they get on WhatsApp'}</small>
              <div className="sh-bubble">{message.text}{message.foot && <i>{message.foot}</i>}</div>
              {message.note && <small>{message.note}</small>}
            </div>
          )}
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * Everything about one setting, beside the list on a laptop and the whole screen on a phone. Escape or the cross
 * closes it; focus goes in on open and back to the row on close.
 */
export function SidePanel({ title, onClose, children, testid }) {
  const box = useRef(null);
  const back = useRef(typeof document !== 'undefined' ? document.activeElement : null);
  // The latest onClose, without opening the panel again (focus, scroll lock) each time the page redraws.
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    box.current?.focus();
    const k = (e) => { if (e.key === 'Escape') close.current(); };
    window.addEventListener('keydown', k);
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const was = back.current;
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = before; was?.focus?.(); };
  }, []);
  return createPortal(
    <div className="sh-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="sh-panel" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={box} data-testid={testid}>
        <header className="sh-panel-head">
          <h2>{title}</h2>
          <button type="button" className="crm-iconbtn" onClick={onClose} aria-label="Close" data-testid={testid ? `${testid}-close` : undefined}><X size={18} /></button>
        </header>
        <div className="sh-panel-body"><InPanel.Provider value={true}>{children}</InPanel.Provider></div>
      </aside>
    </div>, document.body);
}

/** The words in a message with the shop's name and an example customer put in. */
export const filled = (text, shop, extra = {}) => Object.entries({ name: 'Meena', shop: shop || 'your shop', link: 'https://…', ...extra })
  .reduce((t, [k, v]) => t.split(`{${k}}`).join(v), text);
