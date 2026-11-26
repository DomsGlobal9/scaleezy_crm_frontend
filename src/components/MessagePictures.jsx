import { useAuth } from '../context/AuthContext';
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X, Upload, Search, Trash2 } from 'lucide-react';
import LoadFailed from './LoadFailed';
import { useAddPicture, useDeleteTemplate, usePictures, useProductPhotos, useSaveTemplate, useTemplates } from '../hooks/useMessages';

/**
 * Adding a picture to a message (18 Nov, the approved mockup): upload one, use a product's photo, or one used
 * before. ScaleEzy makes it ready for WhatsApp (the size, turned the right way, no location inside); this only
 * chooses. And the templates: messages saved to use again, and saving one.
 */
const MAX_BYTES = 15 * 1024 * 1024;

function Dialog({ title, sub, onClose, children, testid, wide }) {
  const closeRef = useRef(null);
  useEffect(() => {
    closeRef.current?.focus();
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return createPortal(
    <div className="cr-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`cr-dialog${wide ? ' mp-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="mp-title" data-testid={testid}>
        <header className="cr-head">
          <div><h2 id="mp-title">{title}</h2>{sub && <p>{sub}</p>}</div>
          <button ref={closeRef} type="button" className="crm-iconbtn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>
        {children}
      </div>
    </div>,
    document.body
  );
}

const TABS = [['upload', 'Upload'], ['products', 'From your products'], ['used', 'Used before']];

export function PicturePicker({ onPick, onClose }) {
  const [tab, setTab] = useState('upload');
  const { hasInventory } = useAuth(); // product photos are Inventory's
  const add = useAddPicture();
  const [error, setError] = useState(null);
  const use = async (input) => {
    setError(null);
    try { onPick(await add.mutateAsync(input)); }
    catch (e) { setError(e?.message || 'That picture could not be used. Try another.'); }
  };
  return (
    <Dialog title="Add a picture" sub="It goes above the words, the way customers see it on WhatsApp." onClose={onClose} testid="picture-picker" wide>
      <div className="ms-tabs" role="tablist" aria-label="Where the picture comes from">
        {TABS.filter(([k]) => hasInventory || k !== 'products').map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={`ms-tab${tab === k ? ' on' : ''}`} onClick={() => { setTab(k); setError(null); }} data-testid={`pp-tab-${k}`}>{l}</button>)}
      </div>
      {add.isPending ? (
        <div className="mp-busy" role="status" data-testid="pp-busy"><Loader2 size={16} className="animate-spin" /> Making the picture ready for WhatsApp…</div>
      ) : (
        <>
          {tab === 'upload' && <UploadTab onFile={(base64) => use({ base64 })} onError={setError} />}
          {tab === 'products' && <ProductsTab onChoose={(productImageId) => use({ productImageId })} />}
          {tab === 'used' && <UsedTab onPick={onPick} />}
        </>
      )}
      {error && <p className="pe-err" role="alert" data-testid="pp-error">{error}</p>}
    </Dialog>
  );
}

function UploadTab({ onFile, onError }) {
  const input = useRef(null);
  const [over, setOver] = useState(false);
  const take = (file) => {
    if (!file) return;
    if (!/^image\//.test(file.type)) { onError('That is not a picture. Choose a photo (JPG or PNG).'); return; }
    if (file.size > MAX_BYTES) { onError('The picture is larger than 15 MB. Choose a smaller one.'); return; }
    const r = new FileReader();
    r.onload = () => onFile(String(r.result));
    r.onerror = () => onError('The picture could not be read. Choose it again.');
    r.readAsDataURL(file);
  };
  return (
    <div className={`mp-drop${over ? ' over' : ''}`} data-testid="pp-drop"
      onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files?.[0]); }}>
      <b>Drop a picture here</b>
      <button type="button" className="btn-primary" onClick={() => input.current?.click()}><Upload size={15} /> Choose a picture</button>
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => { take(e.target.files?.[0]); e.target.value = ''; }} data-testid="pp-file" />
      <small>A photo from your phone or computer, up to 15 MB. CRM makes it ready for WhatsApp: the right size, turned the right way, and with no location or camera details inside.</small>
    </div>
  );
}

function ProductsTab({ onChoose }) {
  const [typed, setTyped] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => { const t = setTimeout(() => setQ(typed.trim()), 300); return () => clearTimeout(t); }, [typed]);
  const photos = useProductPhotos(q);
  const [chosen, setChosen] = useState(null);
  const tiles = (photos.data ?? []).flatMap(p => p.images.map(i => ({ ...i, title: p.title })));
  return (
    <div className="mp-products">
      <div className="mp-search"><Search size={15} aria-hidden="true" /><input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search your products by name or code" aria-label="Search your products" data-testid="pp-search" /></div>
      {photos.isLoading ? <div className="crm-row crm-muted"><Loader2 size={16} className="animate-spin" /> Loading your product photos…</div>
        : photos.isError ? <LoadFailed what="the product photos" error={photos.error} onRetry={() => photos.refetch()} />
        : tiles.length === 0 ? <p className="crm-muted" data-testid="pp-none">{q ? 'No product with a photo matches that.' : 'None of your products has a photo yet. Upload a picture instead.'}</p>
        : (
          <div className="mp-grid">
            {tiles.map(t => (
              <button key={t.id} type="button" className={`mp-tile${chosen === t.id ? ' on' : ''}`} aria-pressed={chosen === t.id} onClick={() => setChosen(t.id)} data-testid="pp-photo">
                <img src={t.url} alt="" loading="lazy" /><span>{t.title}</span>
              </button>
            ))}
          </div>
        )}
      <div className="pe-btns mp-end"><button type="button" className="btn-primary" disabled={!chosen} onClick={() => onChoose(chosen)} data-testid="pp-use">Use this photo</button></div>
    </div>
  );
}

function UsedTab({ onPick }) {
  const pics = usePictures();
  if (pics.isLoading) return <div className="crm-row crm-muted"><Loader2 size={16} className="animate-spin" /> Loading the pictures…</div>;
  if (pics.isError) return <LoadFailed what="the pictures" error={pics.error} onRetry={() => pics.refetch()} />;
  if (pics.data.length === 0) return <p className="crm-muted" data-testid="pp-used-none">No pictures used yet. Upload one, or use a product's photo.</p>;
  return (
    <div className="ms-pics">
      {pics.data.map(p => <button key={p.id} type="button" className="ms-pic-pick" onClick={() => onPick(p)} aria-label="Use this picture" data-testid="pp-used"><img src={p.url} alt="" /></button>)}
    </div>
  );
}

/** "Start from a template": fills the words, picture and link; the name and who gets it stay the shop's. */
export function TemplatesDialog({ onUse, onClose }) {
  const list = useTemplates();
  const del = useDeleteTemplate();
  const [asking, setAsking] = useState(null);
  const [error, setError] = useState(null);
  const remove = async (t) => {
    setError(null);
    try { await del.mutateAsync(t.id); setAsking(null); } catch (e) { setError(e?.message || 'The template could not be deleted. Try again.'); }
  };
  return (
    <Dialog title="Templates" sub="Messages your shop saved to use again." onClose={onClose} testid="templates">
      {list.isLoading ? <div className="crm-row crm-muted"><Loader2 size={16} className="animate-spin" /> Loading the templates…</div>
        : list.isError ? <LoadFailed what="the templates" error={list.error} onRetry={() => list.refetch()} />
        : (
          <ul className="mp-tpls">
            {!list.data.some(t => !t.starter) && <li className="mp-tpl-note crm-muted" data-testid="templates-none">No templates of your own yet. Write a message and press "Save as a template". Or start from one below.</li>}
            {list.data.map((t, i) => (
              <React.Fragment key={t.id}>
              {t.starter && !list.data[i - 1]?.starter && <li className="mp-tpl-head" data-testid="templates-starters">Ready-made</li>}
              <li className="mp-tpl" data-testid="template" data-starter={t.starter ? 'yes' : undefined}>
                {t.media?.url ? <img src={t.media.url} alt="" /> : <span className="mp-noimg" aria-hidden="true" />}
                {asking === t.id ? (
                  <>
                    <div style={{ minWidth: 0 }}><b>Delete "{t.name}"?</b><small>Messages already sent from it are not changed.</small></div>
                    <div className="pe-btns"><button type="button" className="btn-secondary" onClick={() => setAsking(null)}>Keep it</button><button type="button" className="pe-danger" disabled={del.isPending} onClick={() => remove(t)} data-testid="template-delete-yes">Yes, delete</button></div>
                  </>
                ) : (
                  <>
                    <div style={{ minWidth: 0 }}><b>{t.name}</b><small>{t.text}</small></div>
                    <div className="pe-btns"><button type="button" className="btn-primary" onClick={() => onUse(t)} data-testid="template-use">Use</button>{!t.starter && <button type="button" className="btn-secondary mp-del" onClick={() => setAsking(t.id)} aria-label={`Delete ${t.name}`}><Trash2 size={14} /> Delete</button>}</div>
                  </>
                )}
              </li>
              </React.Fragment>
            ))}
          </ul>
        )}
      {error && <p className="pe-err" role="alert">{error}</p>}
    </Dialog>
  );
}

/** "Save as a template": a name for it (the message's own name to start with). */
export function SaveTemplateDialog({ draft, onClose }) {
  const [name, setName] = useState(draft.name || '');
  const save = useSaveTemplate();
  const [error, setError] = useState(null);
  const submit = async (e) => {
    e.preventDefault(); setError(null);
    try { await save.mutateAsync({ ...draft, name }); onClose(true); } catch (err) { setError(err?.message || 'The template could not be saved. Try again.'); }
  };
  return (
    <Dialog title="Save as a template" sub="The words, the picture and the link, to use again. Never who gets it." onClose={() => onClose(false)} testid="save-template">
      <form onSubmit={submit} className="mp-form">
        <label className="pe-field"><span>Template name</span><input className="ms-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="New arrivals" data-testid="template-name" autoFocus /></label>
        {error && <p className="pe-err" role="alert" data-testid="template-error">{error}</p>}
        <div className="pe-btns"><button type="submit" className="btn-primary" disabled={save.isPending} data-testid="template-save">{save.isPending && <Loader2 size={14} className="animate-spin" />} Save template</button><button type="button" className="btn-secondary" onClick={() => onClose(false)}>Cancel</button></div>
      </form>
    </Dialog>
  );
}
