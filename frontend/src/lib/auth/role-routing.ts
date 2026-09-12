import type { SupabaseClient } from '@supabase/supabase-js';

type ProfileRole = 'administrator' | 'client' | 'associate' | 'user';

const destinations: Record<ProfileRole, string> = {
  administrator: '/overview',
  client: '/client-dashboard',
  associate: '/user-dashboard',
  user: '/user-dashboard',
};

export async function getRoleDestination(supabase: SupabaseClient) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('Your verified session could not be read.');

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, approval_status, account_status')
    .eq('id', userData.user.id)
    .single();

  if (profileError || !profile || !(String(profile.role).toLowerCase() in destinations)) {
    throw new Error('Your account role is not configured. Please contact an administrator.');
  }

  const role = String(profile.role).toLowerCase() as ProfileRole;
  const approvalStatus = String(profile.approval_status || '').toLowerCase();
  const accountStatus = String(profile.account_status || '').toLowerCase();
  if (role !== 'administrator' && approvalStatus !== 'approved') {
    await supabase.auth.signOut();
    throw new Error('Your account is awaiting administrator approval.');
  }

  if (accountStatus === 'inactive') {
    await supabase.auth.signOut();
    throw new Error('Your account is deactivated. Contact an administrator.');
  }

  return destinations[role];
}
