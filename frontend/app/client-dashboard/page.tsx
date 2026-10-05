'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useClientIdentity } from '../../src/components/ClientShell';
import ClientDashboardIcon, { type DashboardIconName } from '../../src/components/ClientDashboardIcon';
import { fetchSupabaseFunction } from '../../src/lib/supabase/browser';
const destinations: { key: string; label: string; href: string; icon: DashboardIconName }[] = [
  { key: 'quotations', label: 'Quotations', href: '/client-dashboard/quotations', icon: 'quotations' },
  { key: 'schedule-of-fees', label: 'Schedule of Fees', href: '/client-dashboard/schedule-of-fees', icon: 'fees' },
  { key: 'requirements', label: 'Requirements', href: '/client-dashboard/requirements', icon: 'requirements' },
  { key: 'statements', label: 'Statements', href: '/client-dashboard/statements', icon: 'statements' },
  { key: 'poa', label: 'POA', href: '/client-dashboard/poa', icon: 'poa' },
  { key: 'projects', label: 'Project', href: '/client-dashboard/projects', icon: 'projects' },
  { key: 'notifications', label: 'Notification', href: '/client-dashboard/notifications', icon: 'notifications' },
  { key: 'customer-service', label: 'Customer Service', href: '/client-dashboard/customer-service', icon: 'support' },
];
type TutorialLink = { card_key: string; title: string; url: string };
export default function ClientDashboardPage() {
  const { name } = useClientIdentity();
  const [tutorials, setTutorials] = useState<Record<string, TutorialLink>>({});
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetchSupabaseFunction('video-tutorials?client=true', { signal: controller.signal });
        if (!response.ok) return;
        const body = await response.json();
        if (!controller.signal.aborted && Array.isArray(body.data)) {
          setTutorials(Object.fromEntries(body.data.map((item: TutorialLink) => [item.card_key, item])));
        }
      } catch {
        if (!controller.signal.aborted) setTutorials({});
      }
    };
    void load();
    return () => controller.abort();
  }, []);
  return <section className="client-home" aria-label="Client dashboard">
    <div className="client-welcome">
      <span className="client-welcome-avatar"><ClientDashboardIcon name="user" /></span>
      <h1><span>Welcome,</span><strong>{name}</strong></h1>
    </div>
    <nav className="client-home-grid" aria-label="Dashboard services">
      {destinations.map(({ key, label, href, icon }) => <div className="client-home-card-wrap" key={key}>
        <Link href={href} className="client-home-card">
          <span className="client-home-card-icon"><ClientDashboardIcon name={icon} /></span>
          <span className="client-home-card-label">{label}</span>
          <span className="client-home-card-arrow"><ClientDashboardIcon name="arrow" /></span>
        </Link>
        {tutorials[key] && <a className="client-home-tutorial-link" href={tutorials[key].url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${tutorials[key].title} tutorial for ${label}`}>
          <span>Tutorial</span><span>{tutorials[key].title}</span>
        </a>}
      </div>)}
    </nav>
  </section>;
}
