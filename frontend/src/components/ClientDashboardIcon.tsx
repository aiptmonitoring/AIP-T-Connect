import type { ReactNode } from 'react';

export type DashboardIconName = 'quotations' | 'fees' | 'requirements' | 'statements' | 'poa' | 'projects' | 'notifications' | 'user' | 'home' | 'arrow';

const paths: Record<DashboardIconName, ReactNode> = {
  quotations: <><path d="M15 3H5v18h8M15 3v5h5l-5-5Z"/><path d="M10 8v1m2 1H9.5a1.5 1.5 0 0 0 0 3h1a1.5 1.5 0 0 1 0 3H8m2 0v1m8-4v1m2 1h-2.5a1.5 1.5 0 0 0 0 3h1a1.5 1.5 0 0 1 0 3H16m2 0v1"/></>,
  fees: <><ellipse cx="15" cy="5" rx="6" ry="2.5"/><path d="M9 5v4m12-4v4c0 1.4-2.7 2.5-6 2.5M21 9v4c0 1.4-2 2.3-4 2.5M21 13v4c0 1.4-2 2.3-4 2.5"/><ellipse cx="8" cy="12" rx="6" ry="2.5"/><path d="M2 12v4c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-4M2 16v4c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-4"/></>,
  requirements: <><path d="M8 4H4v18h16V4h-4M9 3h2a1 1 0 0 1 2 0h2v4H9Z"/><path d="m7 11 1 1 2-2m-3 7 1 1 2-2m3-5h4m-4 6h4"/></>,
  statements: <><path d="M13 3H4v19h9M13 3v6h6l-6-6ZM8 8h2M8 12h4M8 16h2"/><circle cx="16" cy="16" r="4"/><path d="m19 19 3 3"/></>,
  poa: <><path d="M18 7V3H3v19h16v-8M6 7h8M6 11h6m-6 7 2-3 2 2"/><path d="m19 8 3 3-9 9-3 1 1-4Z"/></>,
  projects: <><path d="M3 8V4h7l3 3h8v3M3 8h8l2 3h10l-4 10H3Z"/></>,
  notifications: <><path d="M5 10a7 7 0 0 1 14 0c0 7 2 8 2 8H3s2-1 2-8Zm7-9v2m-3 19h6"/></>,
  user: <><circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 6 0 0 1 16 0v2Z"/></>,
  home: <><path d="m2 10 10-8 10 8M5 8v14h14V8M9 22v-9h6v9"/></>,
  arrow: <path d="M3 12h18m-8-8 8 8-8 8"/>,
};

export default function ClientDashboardIcon({ name }: { name: DashboardIconName }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
