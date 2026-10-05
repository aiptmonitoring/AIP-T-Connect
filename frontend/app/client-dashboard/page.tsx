'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useClientIdentity } from '../../src/components/ClientShell';
import ClientDashboardIcon, { type DashboardIconName } from '../../src/components/ClientDashboardIcon';
import { fetchSupabaseFunction } from '../../src/lib/supabase/browser';
const destinations: { key: string; label: string; href: string; icon: DashboardIconName }[] = [
  { key: 'schedule-of-fees', label: 'Schedule of Fees', href: '/client-dashboard/schedule-of-fees', icon: 'fees' },
  { key: 'quotations', label: 'Quotations', href: '/client-dashboard/quotations', icon: 'quotations' },
  { key: 'requirements', label: 'Requirements', href: '/client-dashboard/requirements', icon: 'requirements' },
  { key: 'statements', label: 'Statements', href: '/client-dashboard/statements', icon: 'statements' },
  { key: 'poa', label: 'POA', href: '/client-dashboard/poa', icon: 'poa' },
  { key: 'projects', label: 'Project', href: '/client-dashboard/projects', icon: 'projects' },
  { key: 'notifications', label: 'Notification', href: '/client-dashboard/notifications', icon: 'notifications' },
  { key: 'customer-service', label: 'Customer Service', href: '/client-dashboard/customer-service', icon: 'support' },
];
const displayLabels: Record<string, string> = {
  quotations: 'QUOTATION',
  'schedule-of-fees': 'SCHEDULE\nOF\nFEES',
  requirements: 'REQUIREMENTS',
  statements: 'STATEMENTS',
  poa: 'POA',
  projects: 'YOUR WORK',
  notifications: 'NOTIFICATIONS',
  'customer-service': '',
};
type TutorialLink = { card_key: string; title: string; url: string };
export default function ClientDashboardPage() {
  const { name } = useClientIdentity();
  const [tutorials, setTutorials] = useState<Record<string, TutorialLink>>({});
  const [tutorialsLoaded, setTutorialsLoaded] = useState(false);
  const [tutorialsFailed, setTutorialsFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetchSupabaseFunction('video-tutorials?client=true', { signal: controller.signal });
        if (!response.ok) throw new Error('Unable to load tutorials.');
        const body = await response.json();
        if (!controller.signal.aborted && Array.isArray(body.data)) {
          setTutorials(Object.fromEntries(body.data.map((item: TutorialLink) => [item.card_key, item])));
        }
      } catch {
        if (!controller.signal.aborted) {
          setTutorials({});
          setTutorialsFailed(true);
        }
      } finally {
        if (!controller.signal.aborted) setTutorialsLoaded(true);
      }
    };
    void load();
    return () => controller.abort();
  }, []);
  return <section className="client-home" aria-label="Client dashboard">
    <nav className="client-home-grid" aria-label="Dashboard services">
      {destinations.map(({ key, label, href, icon }) => <div className="client-home-card-wrap" key={key}>
        {tutorials[key]?.url ? <a className="client-home-tutorial-link" href={tutorials[key].url} target="_blank" rel="noopener noreferrer" title={tutorials[key].title} aria-label={`Watch ${tutorials[key].title} tutorial for ${label}`}>
          <span>Tutorial</span>
        </a> : <span className="client-home-tutorial-link is-unavailable" aria-label={`${label} tutorial ${tutorialsLoaded ? (tutorialsFailed ? 'unavailable' : 'not assigned') : 'loading'}`}>
          <span>Tutorial</span>
        </span>}
        <Link href={href} className="client-home-card" aria-label={label}>
          <span className="client-home-card-label">{displayLabels[key] || <span className="client-home-card-sr-only">{label}</span>}</span>
        </Link>
        <Link href="/client-dashboard/customer-service" className="client-home-chat" aria-label={`Chat Us about ${label}`}>
          <span className="client-home-chat-bubble" aria-hidden="true" />
          <span>Chat Us</span>
          <ClientDashboardIcon name="arrow" />
        </Link>
      </div>)}
    </nav>
  </section>;
}
