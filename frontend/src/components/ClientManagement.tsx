'use client';
import { useState, type ReactNode } from 'react';
import { useClientPermissions } from './ClientPermissions';
export default function ClientManagement({ children, manager }: { children:ReactNode; manager:ReactNode }) {
  const { canManage } = useClientPermissions(); const [manage,setManage] = useState(false);
  return <>{canManage && <div className="client-page" style={{ paddingBottom:0 }}><button className="client-secondary" onClick={() => setManage(value => !value)}>{manage ? 'Back to client view' : 'Manage records'}</button></div>}{canManage && manage ? manager : children}</>;
}