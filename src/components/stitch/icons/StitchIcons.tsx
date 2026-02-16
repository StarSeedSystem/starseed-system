import React from 'react';

// Wrappers for Stitch-generated assets
// In a real production environment, these would be individually sliced SVGs or Sprites.
// For now, we display the generated "set" or "dock" strip.

interface StitchIconProps {
  className?: string;
  width?: number | string;
  height?: number | string;
}

// TODO: Replace with functional StitchNetworkControls
export const StitchNetworkSub: React.FC<StitchIconProps> = ({ className, width, height }) => (
  <img
    src="/assets/stitch/icons/network-sub-v1.png"
    alt="Network Sub-sections"
    className={className}
    style={{ width, height, objectFit: 'contain' }}
  />
);
