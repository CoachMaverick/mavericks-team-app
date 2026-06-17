"use client";

import React from 'react';

export function TeamBanner() {
  return (
    <img 
      src="/images/mavericks-banner.jpg" 
      alt="Mavericks 12U Team Banner" 
      className="w-full h-full object-cover"
      onError={(e) => {
        // Fallback if banner not found - hide image, parent has themed bg
        const target = e.target as HTMLImageElement;
        target.style.display = 'none';
      }}
    />
  );
}
