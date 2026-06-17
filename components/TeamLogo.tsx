"use client";

import React, { useState, useEffect } from 'react';

interface TeamLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'h-8 w-8',
  md: 'h-12 w-12',
  lg: 'h-16 w-16',
};

export function TeamLogo({ className = '', size = 'md' }: TeamLogoProps) {
  const [logoSrc, setLogoSrc] = useState<string>('/images/mavericks-logo.jpg');

  useEffect(() => {
    // Load from localStorage if available (for uploaded logos)
    const savedLogo = localStorage.getItem('mavericks-logo');
    if (savedLogo) {
      setLogoSrc(savedLogo);
    }
  }, []);

  return (
    <img
      src={logoSrc}
      alt="Mavericks 12U Logo"
      className={`${sizeClasses[size]} object-contain ${className}`}
      onError={(e) => {
        // Fallback to default main logo if image fails
        (e.target as HTMLImageElement).src = '/images/mavericks-logo.jpg';
      }}
    />
  );
}
