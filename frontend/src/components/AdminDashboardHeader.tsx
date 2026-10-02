'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import AccountMenu from './AccountMenu';
import { getSupabaseBrowserClient } from '../lib/supabase/browser';
export default function AdminDashboardHeader() {
 const [administrator, setAdministrator] = useState({ name: 'Administrator', email: '', initials: 'AD' });
 useEffect(() => {
  const db = getSupabaseBrowserClient(); if (!db) return;
  let active = true;
  const update = (user: { email?: string; user_metadata?: Record<string, unknown> } | null) => {
   if (!active || !user) return;
   const name = String(user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'Administrator');
   setAdministrator({ name, email: user.email ?? '', initials: name.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase() });
  };
  void db.auth.getSession().then(({ data }) => update(data.session?.user ?? null));
  const { data: { subscription } } = db.auth.onAuthStateChange((_event, session) => update(session?.user ?? null));
  return () => { active = false; subscription.unsubscribe(); };
 }, []);
 return (<header className="admin-poa-dashboard-header" aria-label="Dashboard header">
      <Link href="/overview" className="admin-poa-brand" aria-label="AIP&T dashboard"><span>AIP&amp;T</span><small>INTELLECTUAL PROPERTY</small></Link>
      <nav aria-label="Breadcrumb"><Link href="/overview" aria-label="Home"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 10 9-8 9 8M5 9v12h5v-7h4v7h5V9" /></svg><span>Home</span></Link><span aria-hidden="true">/</span><Link href="/overview" className="admin-poa-breadcrumb-current">Dashboard</Link></nav>
      <div className="admin-poa-header-account"><Link href="/admin-account" className="admin-poa-profile-link" aria-label="Administrator account"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 21v-3a7 7 0 0 1 14 0v3z"/></svg></Link><AccountMenu {...administrator} updateHref="/admin-account" className="admin-poa-account" /></div>
    </header>);
}
