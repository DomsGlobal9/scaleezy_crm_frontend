import React from 'react';

/**
 * The Scaleezy CRM lockup (the owner approved it, 28 Oct): Inventory's own wordmark with "crm" under
 * it, between the rules, in the lettering of Inventory's "inventory" line. Made by
 * scripts/brand/make-logo.cjs from Inventory's logo.png, then trimmed to the artwork, so the height
 * given here is the drawing's own height (no empty margin to allow for).
 *
 * Two files, as Inventory has: crm-logo.png (deep green, for light pages) and crm-logo-dark.png
 * (light green, for dark pages and the green sign-in panel). "auto" follows the theme; "light"
 * always uses the light one, for a dark background whatever the theme.
 */
export default function CrmLogo({ height = 30, tone = 'auto', className = '' }) {
  const style = { height, width: 'auto', display: 'block' };
  if (tone === 'light') return <img src="/crm-logo-dark.png" alt="Scaleezy CRM" className={className} style={style} />;
  return (
    <span className={`crm-logo ${className}`}>
      <img src="/crm-logo.png" alt="Scaleezy CRM" className="logo-on-light" style={style} />
      <img src="/crm-logo-dark.png" alt="Scaleezy CRM" className="logo-on-dark" style={style} />
    </span>
  );
}
