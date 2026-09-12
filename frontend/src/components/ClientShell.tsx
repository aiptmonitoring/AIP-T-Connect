'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { fetchSupabaseFunction, getSupabaseBrowserClient } from '../lib/supabase/browser';
import AccountMenu from './AccountMenu';

type IconName = 'dashboard' | 'projects' | 'notifications' | 'statements' | 'quotations' | 'requirements' | 'support' | 'menu' | 'search';

const ClientIcon = ({ name }: { name: IconName }) => {
  const paths = {
    dashboard: <><rect x='3' y='3' width='7' height='7' rx='1'/><rect x='14' y='3' width='7' height='7' rx='1'/><rect x='3' y='14' width='7' height='7' rx='1'/><rect x='14' y='14' width='7' height='7' rx='1'/></>,
    projects: <><path d='M4 7h16v12H4z'/><path d='M8 7V5h8v2M4 11h16M10 14h4'/></>,
    notifications: <><path d='M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9'/><path d='M10 21h4'/></>,
    statements: <><path d='M6 3h12v18H6z'/><path d='M9 8h6M9 12h6M9 16h4'/></>,
    quotations: <><path d='M5 3h14v18H5z'/><path d='M8 7h8M8 11h8M8 15h5'/></>,
    requirements: <><path d='M6 3h12v18H6z'/><path d='M9 8h6M9 12h6M9 16h4'/></>,
    support: <><path d='M4 13a8 8 0 0 1 16 0'/><path d='M4 13v5h4v-6H4M20 13v5h-4v-6h4M16 18c0 2-2 3-4 3'/></>,
    menu: <path d='M4 6h16M4 12h16M4 18h16'/>,
    search: <><circle cx='11' cy='11' r='7'/><path d='m20 20-4-4'/></>,
  };
  return <svg viewBox='0 0 24 24' aria-hidden='true' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round'>{paths[name]}</svg>;
};

const links: Array<{ href: string; label: string; icon: IconName }> = [
  { href: '/client-dashboard', label: 'Dashboard', icon: 'dashboard' },
  { href: '/client-dashboard/projects', label: 'Projects', icon: 'projects' },
  { href: '/client-dashboard/notifications', label: 'Notifications', icon: 'notifications' },
  { href: '/client-dashboard/statements', label: 'Statements', icon: 'statements' },
  { href: '/client-dashboard/invoices', label: 'Invoices', icon: 'statements' },
  { href: '/client-dashboard/quotations', label: 'Quotations', icon: 'quotations' },
  { href: '/client-dashboard/requirements', label: 'Requirements', icon: 'requirements' },
  { href: '/client-dashboard/customer-service', label: 'Customer Service', icon: 'support' },
];

export default function ClientShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [name, setName] = useState('Client');
  const [email, setEmail] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [accessState, setAccessState] = useState<'checking' | 'allowed' | 'denied'>('checking');
  const [unreadMessages, setUnreadMessages] = useState(0);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    void supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { router.replace('/login'); return; }
      setName(data.user.user_metadata?.full_name || data.user.email?.split('@')[0] || 'Client');
      setEmail(data.user.email || '');
      const { data: profile } = await supabase.from('profiles').select('role,client_id,approval_status,account_status').eq('id', data.user.id).maybeSingle();
      const { data: client } = profile?.client_id ? await supabase.from('clients').select('email').eq('id', profile.client_id).is('deleted_at', null).maybeSingle() : { data: null };
      const authenticatedEmail = (data.user.email || '').trim().toLowerCase();
      const linkedEmail = (client?.email || '').trim().toLowerCase();
      const role = String(profile?.role || '').toLowerCase();
      const approvalStatus = String(profile?.approval_status || '').toLowerCase();
      const accountStatus = String(profile?.account_status || '').toLowerCase();
      if (role !== 'client' || approvalStatus !== 'approved' || accountStatus !== 'active' || !profile?.client_id || !authenticatedEmail || linkedEmail !== authenticatedEmail) {
        setAccessState('denied');
        await supabase.auth.signOut();
        window.sessionStorage.setItem('aipt-auth-message', 'This account is not approved or its registered client email is not correctly linked.');
        router.replace('/login');
        return;
      }
      setAccessState('allowed');
    });
  }, [router]);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const syncBreakpoint = () => setIsDesktop(media.matches);
    setCollapsed(window.localStorage.getItem('aipt-client-sidebar-collapsed') === 'true');
    syncBreakpoint();
    media.addEventListener('change', syncBreakpoint);
    return () => media.removeEventListener('change', syncBreakpoint);
  }, []);

  useEffect(() => { if (isDesktop) setDrawerOpen(false); }, [isDesktop]);

  useEffect(() => {
    if (accessState !== 'allowed') return;
    let active = true;
    const refreshUnread = async () => {
      const supabase = getSupabaseBrowserClient();
      const session = supabase ? (await supabase.auth.getSession()).data.session : null;
      if (!session) return;
      const response = await fetchSupabaseFunction('customer-service', { headers: { Authorization: `Bearer ${session.access_token}` } });
      if (!response.ok) return;
      const body = await response.json();
      if (active) setUnreadMessages((body.tickets ?? []).reduce((total: number, ticket: { unread_count?: number }) => total + (ticket.unread_count ?? 0), 0));
    };
    void refreshUnread();
    const timer = window.setInterval(() => void refreshUnread(), 10000);
    window.addEventListener('focus', refreshUnread);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', refreshUnread); };
  }, [accessState, pathname]);

  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'CL';
  const toggleSidebar = () => {
    if (!isDesktop) { setDrawerOpen((value) => !value); return; }
    setCollapsed((value) => {
      window.localStorage.setItem('aipt-client-sidebar-collapsed', String(!value));
      return !value;
    });
  };
  const closeDrawer = () => setDrawerOpen(false);
  const sidebarClass = `client-sidebar${isDesktop && collapsed ? ' is-collapsed' : ''}${!isDesktop && drawerOpen ? ' is-drawer-open' : ''}`;
  const breadcrumb = pathname === '/client-dashboard' ? 'Dashboard' : pathname.includes('quotations') ? 'Quotations' : pathname.includes('notifications') ? 'Notifications' : pathname.includes('requirements') ? 'Requirements' : pathname.includes('customer-service') ? 'Customer Service' : pathname.includes('settings') ? 'Settings' : pathname.includes('statements') ? 'Statements' : pathname.includes('invoices') ? 'Invoices' : 'Projects';

  return <div className='client-app-shell'>
    {!isDesktop && <button className='client-mobile-toggle' type='button' aria-label={drawerOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={drawerOpen} onClick={toggleSidebar}><ClientIcon name='menu'/></button>}
    {!isDesktop && drawerOpen && <button className='client-sidebar-backdrop' type='button' aria-label='Close navigation' onClick={closeDrawer}/>} 
    <aside className={sidebarClass}>
      <Link className='client-brand' href='/client-dashboard' onClick={closeDrawer}><strong>AIP&amp;T</strong><small>INTELLECTUAL PROPERTY</small></Link>
      <button className='client-sidebar-toggle' type='button' aria-label={isDesktop ? (collapsed ? 'Expand sidebar' : 'Collapse sidebar') : 'Close navigation'} aria-expanded={isDesktop ? !collapsed : drawerOpen} onClick={toggleSidebar}><ClientIcon name='menu'/></button>
      <div className='client-search'><ClientIcon name='search'/><span>Search</span><kbd>Ctrl K</kbd></div>
      <nav className='client-nav' aria-label='Client navigation'>
        {links.map((link) => {
          const hasUnread = link.label === 'Customer Service' && unreadMessages > 0;
          return <Link key={link.href} href={link.href} className={`${pathname === link.href ? 'is-active' : ''}${hasUnread ? ' has-unread' : ''}`} onClick={closeDrawer}><i><ClientIcon name={link.icon}/></i><span>{link.label}</span>{hasUnread && <b aria-label={`${unreadMessages} unread support messages`}>{unreadMessages > 99 ? '99+' : unreadMessages}</b>}</Link>;
        })}
      </nav>
      <Link className={`client-support${unreadMessages ? ' has-unread' : ''}`} href='/client-dashboard/customer-service' onClick={closeDrawer}><ClientIcon name='support'/><span>Help &amp; Support</span>{unreadMessages > 0 && <b>{unreadMessages > 99 ? '99+' : unreadMessages}</b>}</Link>
      <AccountMenu name={name} email={email} initials={initials} updateHref='/client-dashboard/settings' className='client-account'/>
    </aside>
    <main className='client-main'>
      <header className='client-topbar'><p>Home <i>/</i> <b>{breadcrumb}</b></p><div className='client-user'><button type='button' aria-label='Notifications' onClick={() => router.push('/client-dashboard/notifications')}><ClientIcon name='notifications'/></button><span>{initials}</span><strong>{name}<small>{email || 'Client'}</small></strong></div></header>
      {accessState === 'checking' && <section className='client-access-state'>Checking client access...</section>}
      {accessState === 'denied' && <section className='client-access-state client-error'>Client access is required.</section>}
      {accessState === 'allowed' && children}
    </main>
  </div>;
}
