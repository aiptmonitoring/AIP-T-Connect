'use client';
import Link from 'next/link';
import { useClientIdentity } from '../../src/components/ClientShell';
import ClientDashboardIcon, { type DashboardIconName } from '../../src/components/ClientDashboardIcon';
const destinations: { label: string; href: string; icon: DashboardIconName }[] = [
  { label: 'Quotations', href: '/client-dashboard/quotations', icon: 'quotations' },
  { label: 'Schedule of Fees', href: '/client-dashboard/schedule-of-fees', icon: 'fees' },
  { label: 'Requirements', href: '/client-dashboard/requirements', icon: 'requirements' },
  { label: 'Statements', href: '/client-dashboard/statements', icon: 'statements' },
  { label: 'POA', href: '/client-dashboard/poa', icon: 'poa' },
  { label: 'Project', href: '/client-dashboard/projects', icon: 'projects' },
  { label: 'Notification', href: '/client-dashboard/notifications', icon: 'notifications' },
  { label: 'Customer Service', href: '/client-dashboard/customer-service', icon: 'support' },
];
export default function ClientDashboardPage() {
  const { name } = useClientIdentity();
  return <section className="client-home" aria-label="Client dashboard">
    <div className="client-welcome">
      <span className="client-welcome-avatar"><ClientDashboardIcon name="user" /></span>
      <h1><span>Welcome,</span><strong>{name}</strong></h1>
    </div>
    <nav className="client-home-grid" aria-label="Dashboard services">
      {destinations.map(({ label, href, icon }) => <Link href={href} key={icon} className="client-home-card">
        <span className="client-home-card-icon"><ClientDashboardIcon name={icon} /></span>
        <span className="client-home-card-label">{label}</span>
        <span className="client-home-card-arrow"><ClientDashboardIcon name="arrow" /></span>
      </Link>)}
    </nav>
  </section>;
}
