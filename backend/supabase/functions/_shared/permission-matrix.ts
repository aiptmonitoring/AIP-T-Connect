export const permissionActions = ['view', 'add', 'edit', 'update', 'delete'] as const;
export type PermissionAction = typeof permissionActions[number];
export const permissionPages = [
  { key: 'dashboard', label: 'Dashboard', scope: 'Overview', actions: ['view'] },
  { key: 'overview', label: 'Portfolio overview', scope: 'Own records', actions: ['view'] },
  { key: 'quotations', label: 'Quotations', scope: 'Own pending quotations', actions: permissionActions },
  { key: 'fees', label: 'Schedule of Fees', scope: 'Shared documents', actions: permissionActions },
  { key: 'requirements', label: 'Requirements', scope: 'Shared catalog', actions: permissionActions },
  { key: 'statements', label: 'Statements', scope: 'Own records', actions: permissionActions },
  { key: 'poa', label: 'POA', scope: 'Shared catalog', actions: permissionActions },
  { key: 'projects', label: 'Projects', scope: 'Own records', actions: permissionActions },
  { key: 'notifications', label: 'Notifications', scope: 'Shared catalog', actions: permissionActions },
  { key: 'customer-service', label: 'Customer Service', scope: 'Own tickets', actions: permissionActions },
  { key: 'invoices', label: 'Invoices', scope: 'Approved invoices; managed through Quotations', actions: ['view'] },
  { key: 'settings', label: 'Account Settings', scope: 'Own account', actions: ['view', 'edit', 'update'] },
] as const;
export type PermissionPage = typeof permissionPages[number]['key'];
export type PagePermissions = Record<PermissionAction, boolean>;
export type ClientPermissions = Record<PermissionPage, PagePermissions>;
export function defaultClientPermissions(): ClientPermissions {
  return Object.fromEntries(permissionPages.map(page => [page.key, Object.fromEntries(permissionActions.map(action => [action,
    action === 'view' || (page.key === 'quotations' && ['add', 'edit', 'update'].includes(action)) || (page.key === 'customer-service' && action === 'add') || (page.key === 'settings' && ['edit', 'update'].includes(action)),
  ]))])) as ClientPermissions;
}
export function pageForClientPath(path: string): PermissionPage {
  const key = path.replace(/^\/client-dashboard\/?/, '').split('/')[0] || 'dashboard';
  if (key === 'schedule-of-fees') return 'fees';
  return permissionPages.some(page => page.key === key) ? key as PermissionPage : 'dashboard';
}