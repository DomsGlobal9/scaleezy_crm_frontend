import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowLeft, ExternalLink, Loader2, Printer, ScanLine, Send, Sparkles } from 'lucide-react';
import { api } from '../lib/api';
import { INVENTORY_URL } from '../lib/config';
import { useStores } from '../hooks/useCounter';
import LoadFailed from '../components/LoadFailed';

/**
 * The door standee (12 Nov: moved here from Inventory, whose Door QR screen is gone): a card with a QR
 * that opens WhatsApp with "I'm at the shop" and this store's door code already written. Print it and
 * stand it at the door. Inventory makes the QR (shop, store, logo, code, link); CRM shows and prints it.
 * Only the standee prints (styles/door-qr.css). The store comes in the link, never a guess: a standee
 * printed for another store sends this door's customers to the other store's list.
 */

// The standee is the shop's printed sign: its colours are fixed, whatever the screen's theme.
const DEEP = '#164B1E', LIME = '#A6D92B';
const pretty = (digits) => (digits?.length === 12 && digits.startsWith('91') ? `+91 ${digits.slice(2, 7)} ${digits.slice(7)}` : `+${digits}`);
// A shop with no logo still gets a mark in the middle of the QR: its first letter on a lime disc.
const initialBadge = (shop) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 44 44"><circle cx="22" cy="22" r="21" fill="${LIME}"/><text x="22" y="29.5" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" font-size="21" fill="${DEEP}">${(shop || '?').trim().charAt(0).toUpperCase().replace(/[<&]/g, '')}</text></svg>`)}`;

export default function DoorQr() {
  const [params] = useSearchParams();
  const locationId = params.get('locationId') || '';
  const back = params.get('from') === 'counter' ? { to: '/counter', label: 'At the door' } : { to: '/sales', label: 'Shop floor' };
  const stores = useStores();
  const store = (stores.data ?? []).find(s => s.id === locationId) ?? null;
  const unknownStore = !!locationId && stores.isSuccess && !store;
  const q = useQuery({
    queryKey: ['door-qr', locationId],
    queryFn: async () => (await api.get('/counter/door-qr', { params: { locationId } })).data,
    enabled: !!locationId && !unknownStore,
    staleTime: 5 * 60_000
  });
  const d = q.data;

  return (
    <main className="crm-page dq-page">
      <div className="dq-grid">
        <div className="dq-chrome">
          <Link to={back.to} className="cp-back"><ArrowLeft size={14} /> {back.label}</Link>
          <h1>Door QR</h1>
          <p className="crm-muted">
            {!locationId ? 'Choose your store on Shop floor first: each store has its own door QR.'
              : unknownStore ? 'This store is not one of yours, so there is no QR to print here. Open Door QR from the store you are in.'
                : <>Print it and stand it at the door of <strong>{store?.name ?? d?.store ?? 'this store'}</strong>.</>}
          </p>
          <ol className="dq-steps">
            {[
              [ScanLine, 'The customer scans it', 'WhatsApp opens with a message already written.'],
              [Send, 'They press send', 'Nothing to type, no app to install.'],
              [Sparkles, 'You see them in seconds', 'They appear under "In the shop now" on Shop floor, with their sizes and picks.']
            ].map(([Icon, title, text]) => (
              <li key={title}><span className="dq-step-icon"><Icon size={18} aria-hidden="true" /></span><span><b>{title}</b><span className="crm-muted">{text}</span></span></li>
            ))}
          </ol>
          {d?.link && <button type="button" className="btn-primary" onClick={() => window.print()} data-testid="dq-print"><Printer size={16} aria-hidden="true" /> Print</button>}
        </div>

        <div>
          {q.isLoading && <div className="crm-card crm-row crm-muted"><Loader2 size={16} className="animate-spin" /> Making the QR…</div>}
          {q.isError && <div className="crm-card"><LoadFailed what="the door QR" error={q.error} onRetry={() => q.refetch()} /></div>}
          {d && !d.link && (
            <div className="crm-card" role="alert" data-testid="dq-fix">
              <p style={{ marginTop: 0 }}>{d.reason}</p>
              <a className="btn-primary" href={`${INVENTORY_URL}/settings?section=${d.fix === 'GENERAL' ? 'GENERAL' : 'WHATSAPP'}`} target="_blank" rel="noreferrer">
                {d.fix === 'GENERAL' ? 'Open shop details in Inventory' : 'Open WhatsApp settings in Inventory'} <ExternalLink size={12} aria-hidden="true" />
              </a>
            </div>
          )}
          {d?.link && (
            <div className="dq-paper" data-testid="dq-standee">
              <div className="dq-card">
                <div className="dq-top">
                  <div className="dq-shop">{d.shop}</div>
                  <div className="dq-store">{d.store}</div>
                </div>
                <div className="dq-mid">
                  <div className="dq-lead">Your sizes and today's picks</div>
                  <div className="dq-sub">ready before you reach the first rack</div>
                  <div className="dq-code">{/* 18px of white round the code: the quiet zone a scanner needs */}
                    <span className="dq-corner tl" /><span className="dq-corner tr" /><span className="dq-corner bl" /><span className="dq-corner br" />
                    {/* Level H survives about 30% of the code being covered, so the logo in the middle never stops it scanning. */}
                    <QRCodeSVG value={d.link} size={196} level="H" fgColor={DEEP} aria-label="QR code that opens WhatsApp" style={{ display: 'block' }}
                      imageSettings={{ src: d.logo || initialBadge(d.shop), height: 44, width: 44, excavate: true }} />
                  </div>
                  <div className="dq-how">
                    {['Scan', 'Press send', "We'll find your fit"].map((s, i) => (
                      <React.Fragment key={s}>{i > 0 && <span className="dq-arrow" aria-hidden="true">→</span>}<span><i>{i + 1}</i>{s}</span></React.Fragment>
                    ))}
                  </div>
                </div>
                <div className="dq-foot">No camera? WhatsApp <b>{d.code}</b> to <b className="dq-num">{pretty(d.number)}</b></div>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
