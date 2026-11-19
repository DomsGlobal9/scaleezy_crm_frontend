import React from 'react';

/**
 * The message as a customer sees it on WhatsApp: the picture, the words with {name}, {link}, {points} and
 * {points_value} filled in for an example customer, and the STOP line that always goes at the end.
 */
export function fillIn(text, { name = 'Meena', shop = 'your shop', link = null, points = '1,250', pointsValue = '₹125' } = {}) {
  return (text || '')
    .replace(/\{name\}/g, name)
    .replace(/\{shop\}/g, shop)
    .replace(/\{link\}/g, link ?? '')
    .replace(/\{points\}/g, points)
    .replace(/\{points_value\}/g, pointsValue);
}

export default function MessageBubble({ text, media, link, shop, name = 'Meena' }) {
  const words = fillIn(text, { name, shop, link: link ? 'shop.link/d7Kq' : null });
  const parts = words.split(/(shop\.link\/d7Kq)/);
  return (
    <div className="ms-phone" aria-label={`What ${name} sees`}>
      <div className="ms-bub">
        {media?.url && <img className="ms-pic" src={media.url} alt="" />}
        <div className="ms-words">{parts.map((p, i) => (p === 'shop.link/d7Kq' ? <span key={i} className="ms-link">{p}</span> : <React.Fragment key={i}>{p}</React.Fragment>))}</div>
        <div className="ms-stop">{shop || 'Your shop'}. Reply STOP to stop these messages.</div>
      </div>
    </div>
  );
}
