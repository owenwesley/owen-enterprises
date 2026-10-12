import React, { useEffect, useState } from 'react';
import { getBlobUrl } from '../utils/api';

/**
 * A picture from a protected route (patient photos). Fetches it with the sign-in header and shows it;
 * the temporary URL is released when the picture goes away. Click handler is optional.
 */
export default function AuthImage({ src, alt, style, onClick }) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let made = null;
    setUrl(null); setFailed(false);
    getBlobUrl(src).then((u) => {
      if (cancelled) { if (u) URL.revokeObjectURL(u); return; }
      made = u;
      if (u) setUrl(u); else setFailed(true);
    });
    return () => { cancelled = true; if (made) URL.revokeObjectURL(made); };
  }, [src]);
  const box = { background: '#eceff1', color: '#777', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', ...style };
  if (failed) return <div style={box}>Could not load</div>;
  if (!url) return <div style={box}>Loading…</div>;
  return <img src={url} alt={alt} style={{ objectFit: 'cover', cursor: onClick ? 'pointer' : 'default', ...style }} onClick={onClick} />;
}
