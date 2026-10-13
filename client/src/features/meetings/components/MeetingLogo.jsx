import React from 'react';
import { useMeetingLogo } from '../hooks/useMeetingLogo';

// Small meeting logo (the user's own, or the default). Used in the navbar and on the Meetings page.
export default function MeetingLogo({ size = 22, style }) {
  const { url } = useMeetingLogo();
  return (
    <img src={url} alt="" width={size} height={size}
      style={{ objectFit: 'contain', borderRadius: 4, flexShrink: 0, ...style }} />
  );
}
