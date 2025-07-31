// FILE: app-config.ts

import type { AppConfig } from './lib/types';

export const APP_CONFIG_DEFAULTS: AppConfig = {
  // --- Branding Changes ---
  companyName: 'Kairos',
  pageTitle: 'Kairos | A space to be heard',
  pageDescription: 'An AI companion for mindful conversation and self-reflection.',
  startButtonText: 'Begin Session',

  // --- Feature Flags (can be left as is) ---
  supportsChatInput: true,
  supportsVideoInput: true,
  supportsScreenShare: true,
  isPreConnectBufferEnabled: true,

  // --- Visuals (we will override these, but good to have fallbacks) ---
  logo: '/logo.svg', // You can create a simple logo later
  accent: '#4A90E2', // A calming blue
  logoDark: '/logo-dark.svg',
  accentDark: '#81A1C1', // A softer, Nordic blue for dark mode
};
