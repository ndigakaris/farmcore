import { useState, useEffect, useMemo } from 'react';
import supabase from '../../services/supabase.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { canAddUser } from '../../services/license.js';
import { Modal, PageHeader, DataTable, KPICard, StatGrid, SectionCard, Badge } from '../../components/UI.jsx';
import { formatDate, getInitials, cn } from '../../utils/index.js';
import { Plus, Mail, Shield, Trash2, Crown, Eye, Edit, Wrench, Stethoscope, UserX, Send, Copy, Check } from 'lucide-react';

// ── ROLE DEFINITIONS ──────────────────────────────────────────
export const FARM_ROLES = {
  owner: {
    label: 'Owner',
    icon: Crown,
    color: 'badge-purple',
    description: 'Full access to everything. Can manage billing and team.',
    permissions: ['all'],
  },
  admin: {
    label: 'Admin',
    icon: Shield,
    color: 'badge-blue',
    description: 'Full access except billing. Can manage team members.',
    permissions: ['animals','production','health','reproduction','feed','finance','employees','procurement','assets','crops','calendar','lab','reports','notifications','settings','team'],
  },
  manager: {
    label: 'Farm Manager',
    icon: Edit,
    color: 'badge-green',
    description: 'Can view and edit all farm data. Cannot manage team or billing.',
    permissions: ['animals','production','health','reproduction','feed','finance','employees','procurement','assets','crops','calendar','lab','reports','notifications'],
  },
  worker: {
    label: 'Farm Worker',
    icon: Wrench,
    color: 'badge-amber',
    description: 'Can log daily activities — milk, feed, attendance. Read-only on financials.',
    permissions: ['animals','production','health','feed','employees','calendar','notifications'],
  },
  vet: {
    label: 'Vet / Consultant',
    icon: Stethoscope,
    color: 'badge-red',
    description: 'Can view animal records and log health treatments only.',
    permissions: ['animals','health','reproduction','lab','notifications'],
  },
  viewer: {
    label: 'Viewer',
    icon: Eye,
    color: 'badge-gray',
    description: 'Read-only access to all farm data. Cannot edit anything.',
    permissions: [],
  },
};

// ── INVITE FORM ───────────────────────────────────────────────
function InviteForm({ farmId, onClose, onInvited }) {
  const { user, farm, license } = useAuth();
  const [form, setForm] = useState({ email: '', role: 'worker', message: '' });
  const [loading, setLoading] = useState(false);
  const [done, setDone]       = useState(false);
  const [error, setError]     = useState('');
  const [memberCount, setMemberCount] = useState(0);
  const f = (k,v) => setForm(p=>({...p,[k]:v}));

  useEffect(() => {
    supabase.from('farm_users').select('id', { count:'exact' }).eq('farm_id', farmId)
      .then(({ count }) => setMemberCount(count || 0));
  }, [farmId]);

  const canInvite = canAddUser(license, memberCount);

  const handleInvite = async () => {
    if (!form.email) { setError('Email is required.'); return; }
    if (!canInvite)  { setError('User limit reached. Upgrade your plan to add more team members.'); return; }
    setError(''); setLoading(true);
    try {
      // Store invite in pending_invites table
      const { error: invErr } = await supabase.from('pending_invites').insert({
        farm_id:    farmId,
        email:      form.email.toLowerCase().trim(),
        role:       form.role,
        invited_by: user.id,
        message:    form.message,
        token:      crypto.randomUUID(),
        expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      });
      if (invErr) throw invErr;

      setDone(true);
      onInvited?.();
    } catch (err) {
      setError(err.message || 'Failed to send invite.');
    } finally { setLoading(false); }
  };

  if (done) return (
    <div className="text-center py-4">
      <div className="text-5xl mb-3">📧</div>
      <h3 style={{fontFamily:'Fraunces,serif'}} className="text-lg font-semibold text-[#2D5016] mb-2">Invite sent!</h3>
      <p className="text-sm text-gray-500 mb-2">An invitation has been sent to <strong>{form.email}</strong></p>
      <p className="text-xs text-gray-400 mb-4">They'll receive a link to join <strong>{farm?.name}</strong> as <strong>{FARM_ROLES[form.role]?.label}</strong>. The invite expires in 7 days.</p>
      <button onClick={onClose} className="btn btn-primary justify-center w-full">Done</button>
    </div>
  );

  return (
    <div className="space-y-4">
      {!canInvite && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-700">
          ⚠️ You've reached your plan's user limit. Upgrade to add more team members.
        </div>
      )}
      {error && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>}

      <div>
        <label className="form-label">Email Address<span className="text-red-500">*</span></label>
        <input className="form-input" type="email" value={form.email}
          onChange={e=>f('email',e.target.value)} placeholder="colleague@example.com" autoFocus/>
      </div>

      <div>
        <label className="form-label">Role<span className="text-red-500">*</span></label>
        <div className="space-y-2 mt-1">
          {Object.entries(FARM_ROLES).filter(([k])=>k!=='owner').map(([k,v])=>{
            const Icon = v.icon;
            return (
              <label key={k} className={cn(
                'flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all',
                form.role===k ? 'border-[#2D5016] bg-[#eef5dd]' : 'border-[#e8e0d0] hover:border-[#6B7C3A]'
              )}>
                <input type="radio" name="role" value={k} checked={form.role===k}
                  onChange={()=>f('role',k)} className="mt-1"/>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Icon size={14} className="text-[#2D5016]"/>
                    <span className="text-sm font-semibold text-[#1a3009]">{v.label}</span>
                    <span className={`badge text-[9px] ${v.color}`}>{v.label}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{v.description}</p>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      <div>
        <label className="form-label">Personal Message (optional)</label>
        <textarea className="form-input resize-y min-h-[60px]" value={form.message}
          onChange={e=>f('message',e.target.value)}
          placeholder="Hi James, I'm inviting you to manage our dairy farm on FarmCore…"/>
      </div>

      <div className="flex justify-end gap-3 pt-2 border-t border-[#e8e0d0]">
        <button onClick={onClose} className="btn btn-secondary">Cancel</button>
        <button onClick={handleInvite} disabled={loading || !canInvite} className="btn btn-primary">
          {loading ? 'Sending…' : <><Send size={14}/>Send Invite</>}
        </button>
      </div>
    </div>
  );
}

// ── ROLE BADGE ────────────────────────────────────────────────
function RoleBadge({ role }) {
  const r = FARM_ROLES[role] || FARM_ROLES.viewer;
  const Icon = r.icon;
  return (
    <span className={cn('badge gap-1', r.color)}>
      <Icon size={10}/>{r.label}
    </span>
  );
}

// ── PERMISSIONS TABLE ─────────────────────────────────────────
function PermissionsTable() {
  const modules = ['animals','production','health','reproduction','feed','finance','employees','procurement','assets','crops','calendar','lab','reports','team'];
  const roles   = Object.entries(FARM_ROLES);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr>
            <th className="table-th text-left">Module</th>
            {roles.map(([k,v])=>(
              <th key={k} className="table-th text-center">{v.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {modules.map(mod=>(
            <tr key={mod} className="hover:bg-[#F5F0E8]/60">
              <td className="table-td font-medium capitalize">{mod}</td>
              {roles.map(([k,v])=>{
                const hasAccess = v.permissions.includes('all') || v.permissions.includes(mod);
                return (
                  <td key={k} className="table-td text-center">
                    {hasAccess
                      ? <span className="text-green-600 font-bold">✓</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── INVITE ACCEPT PAGE ────────────────────────────────────────
export function InviteAcceptPage({ token }) {
  const { user, signIn, signUp, refreshFarm } = useAuth();
  const [invite,  setInvite]  = useState(null);
  const [loading, setLoading] = useState(true);
  const [step,    setStep]    = useState('loading'); // loading|register|login|done|expired
  const [form,    setForm]    = useState({ fullName:'', password:'' });
  const [error,   setError]   = useState('');
  const f = (k,v) => setForm(p=>({...p,[k]:v}));

  useEffect(() => {
    supabase.from('pending_invites')
      .select('*, farms(name)')
      .eq('token', token)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) { setStep('expired'); setLoading(false); return; }
        const expired = new Date(data.expires_at) < new Date();
        if (expired) { setStep('expired'); setLoading(false); return; }
        setInvite(data);
        setStep(user ? 'accept' : 'register');
        setLoading(false);
      });
  }, [token, user]);

  const handleAccept = async (isNewUser = false) => {
    setError(''); setLoading(true);
    try {
      let acceptUserId = user?.id;

      if (isNewUser) {
        const { data: authData } = await signUp({ email: invite.email, password: form.password, fullName: form.fullName });
        acceptUserId = authData?.user?.id;
        if (!acceptUserId) throw new Error('Signup failed');
      }

      // Add to farm_users
      await supabase.from('farm_users').insert({
        farm_id: invite.farm_id, user_id: acceptUserId, role: invite.role, invited_by: invite.invited_by,
      });

      // Mark invite as used
      await supabase.from('pending_invites').update({ used_at: new Date().toISOString() }).eq('id', invite.id);

      await refreshFarm?.();
      setStep('done');
    } catch (err) {
      setError(err.message || 'Failed to accept invite.');
    } finally { setLoading(false); }
  };

  if (loading) return (
    <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center">
      <div className="text-center"><div className="text-5xl mb-3 animate-pulse">🌾</div><p className="text-gray-400">Loading invite…</p></div>
    </div>
  );

  if (step === 'expired') return (
    <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center">
        <div className="text-5xl mb-4">⏰</div>
        <h2 style={{fontFamily:'Fraunces,serif'}} className="text-xl font-semibold text-[#2D5016] mb-2">Invite Expired</h2>
        <p className="text-sm text-gray-500">This invitation has expired or is invalid. Ask your farm admin to send a new one.</p>
      </div>
    </div>
  );

  if (step === 'done') return (
    <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center">
        <div className="text-5xl mb-4">🎉</div>
        <h2 style={{fontFamily:'Fraunces,serif'}} className="text-xl font-semibold text-[#2D5016] mb-2">Welcome to {invite?.farms?.name}!</h2>
        <p className="text-sm text-gray-500 mb-4">You've joined as <strong>{FARM_ROLES[invite?.role]?.label}</strong>.</p>
        <a href="/" className="btn btn-primary justify-center w-full">Open FarmCore 🌾</a>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl p-8 max-w-sm w-full">
        <div className="text-center mb-6">
          <div className="text-4xl mb-3">🌾</div>
          <h2 style={{fontFamily:'Fraunces,serif'}} className="text-xl font-semibold text-[#2D5016] mb-1">You've been invited!</h2>
          <p className="text-sm text-gray-500">
            Join <strong>{invite?.farms?.name}</strong> on FarmCore as <RoleBadge role={invite?.role}/>
          </p>
          {invite?.message && (
            <div className="bg-[#F5F0E8] rounded-lg p-3 mt-3 text-sm text-gray-600 italic">"{invite.message}"</div>
          )}
        </div>

        {error && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4 text-sm text-red-700">{error}</div>}

        {step === 'register' && (
          <div className="space-y-4">
            <p className="text-xs text-gray-500 text-center">Create your FarmCore account to accept this invite.</p>
            <div>
              <label className="form-label">Your Full Name</label>
              <input className="form-input" value={form.fullName} onChange={e=>f('fullName',e.target.value)} placeholder="James Mwangi"/>
            </div>
            <div>
              <label className="form-label">Email</label>
              <input className="form-input" value={invite?.email} disabled className="opacity-60"/>
            </div>
            <div>
              <label className="form-label">Create Password</label>
              <input className="form-input" type="password" value={form.password}
                onChange={e=>f('password',e.target.value)} placeholder="Min 8 characters"/>
            </div>
            <button onClick={()=>handleAccept(true)} disabled={loading} className="btn btn-primary w-full justify-center py-2.5">
              {loading?'Creating account…':'Create Account & Join Farm'}
            </button>
            <p className="text-xs text-center text-gray-400">
              Already have an account?{' '}
              <button onClick={()=>setStep('login')} className="text-[#2D5016] font-semibold">Sign in instead</button>
            </p>
          </div>
        )}

        {step === 'login' && (
          <div className="space-y-4">
            <p className="text-xs text-gray-500 text-center">Sign in to accept this invite.</p>
            <div>
              <label className="form-label">Password</label>
              <input className="form-input" type="password" value={form.password}
                onChange={e=>f('password',e.target.value)}/>
            </div>
            <button onClick={async()=>{
              setLoading(true);
              try {
                await signIn({ email: invite.email, password: form.password });
                await handleAccept(false);
              } catch(e) { setError(e.message); setLoading(false); }
            }} className="btn btn-primary w-full justify-center">
              {loading?'Signing in…':'Sign In & Join Farm'}
            </button>
            <p className="text-xs text-center text-gray-400">
              <button onClick={()=>setStep('register')} className="text-[#2D5016] font-semibold">Create new account instead</button>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── MAIN TEAM MODULE ──────────────────────────────────────────
export default function TeamManagement() {
  const { farm, farmUser, user, license } = useAuth();
  const [members,  setMembers]  = useState([]);
  const [invites,  setInvites]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [tab,      setTab]      = useState('members');
  const [copied,   setCopied]   = useState(null);

  const isOwnerOrAdmin = ['owner','admin'].includes(farmUser?.role);
  const isOwner        = farmUser?.role === 'owner';

  const loadData = async () => {
    if (!farm?.id) return;
    setLoading(true);
    try {
      const { data: members } = await supabase
        .from('farm_users')
        .select('*, profiles(full_name, avatar_url)')
        .eq('farm_id', farm.id);
      setMembers(members || []);

      const { data: invites } = await supabase
        .from('pending_invites')
        .select('*')
        .eq('farm_id', farm.id)
        .is('used_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });
      setInvites(invites || []);
    } finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, [farm?.id]);

  const changeRole = async (memberId, newRole) => {
    if (!isOwnerOrAdmin) return;
    await supabase.from('farm_users').update({ role: newRole }).eq('id', memberId);
    loadData();
  };

  const removeMember = async (memberId, memberUserId) => {
    if (memberUserId === user?.id) { alert("You can't remove yourself."); return; }
    if (!confirm('Remove this team member?')) return;
    await supabase.from('farm_users').delete().eq('id', memberId);
    loadData();
  };

  const cancelInvite = async (inviteId) => {
    await supabase.from('pending_invites').delete().eq('id', inviteId);
    loadData();
  };

  const copyInviteLink = (token) => {
    const link = `${window.location.origin}/invite/${token}`;
    navigator.clipboard.writeText(link);
    setCopied(token);
    setTimeout(() => setCopied(null), 2000);
  };

  const resendInvite = async (invite) => {
    // In production this would trigger an email via Supabase Edge Function
    // For now copy the link
    copyInviteLink(invite.token);
    alert(`Invite link copied! Share this with ${invite.email}`);
  };

  const memberCols = [
    { key:'profiles', label:'Member', render:(_,row)=>(
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-[#eef5dd] flex items-center justify-center text-xs font-bold text-[#2D5016] flex-shrink-0">
            {getInitials(row.profiles?.full_name || 'U')}
          </div>
          <div>
            <p className="text-sm font-medium">{row.profiles?.full_name || 'Unnamed User'}</p>
            <p className="text-xs text-gray-400">{row.user_id === user?.id ? 'You' : ''}</p>
          </div>
        </div>
      )},
    { key:'role', label:'Role', render:(v,row)=>(
        isOwnerOrAdmin && row.user_id !== user?.id
          ? <select className="form-input py-1 text-xs w-36"
              value={v} onChange={e=>changeRole(row.id, e.target.value)}>
              {Object.entries(FARM_ROLES).filter(([k])=>k!=='owner').map(([k,r])=>(
                <option key={k} value={k}>{r.label}</option>
              ))}
            </select>
          : <RoleBadge role={v}/>
      )},
    { key:'joined_at', label:'Joined', render:v=>formatDate(v) },
    { key:'id', label:'', render:(_,row)=>(
        isOwnerOrAdmin && row.user_id !== user?.id
          ? <button onClick={()=>removeMember(row.id, row.user_id)}
              className="btn btn-secondary py-1 px-2 text-xs text-red-500 hover:bg-red-50">
              <UserX size={12}/>Remove
            </button>
          : null
      )},
  ];

  const inviteCols = [
    { key:'email',      label:'Email',   render:v=><span className="font-medium">{v}</span> },
    { key:'role',       label:'Role',    render:v=><RoleBadge role={v}/> },
    { key:'created_at', label:'Sent',    render:v=>formatDate(v) },
    { key:'expires_at', label:'Expires', render:v=>{ const d=Math.ceil((new Date(v)-new Date())/86400000); return <span className={d<2?'text-red-600 font-semibold':'text-gray-500'}>in {d}d</span>; }},
    { key:'token', label:'', render:(token,row)=>(
        <div className="flex gap-1">
          <button onClick={()=>copyInviteLink(token)}
            className="btn btn-secondary py-1 px-2 text-xs">
            {copied===token?<><Check size={12}/>Copied!</>:<><Copy size={12}/>Copy Link</>}
          </button>
          <button onClick={()=>resendInvite(row)}
            className="btn btn-secondary py-1 px-2 text-xs">
            <Mail size={12}/>Resend
          </button>
          <button onClick={()=>cancelInvite(row.id)}
            className="btn btn-secondary py-1 px-2 text-xs text-red-500">
            <Trash2 size={12}/>
          </button>
        </div>
      )},
  ];

  return (
    <div className="page-content">
      <PageHeader
        title="Team Management"
        subtitle={`${members.length} members · ${farm?.name}`}
        actions={
          isOwnerOrAdmin && (
            <button onClick={()=>setShowInvite(true)} className="btn btn-primary">
              <Plus size={15}/>Invite Team Member
            </button>
          )
        }
      />

      <StatGrid cols={4}>
        <KPICard label="Total Members" value={members.length} icon="👥"/>
        <KPICard label="Pending Invites" value={invites.length} icon="📧" color={invites.length>0?'#d97706':undefined}/>
        <KPICard label="Your Role" value={FARM_ROLES[farmUser?.role]?.label||'—'} icon="🎭"/>
        <KPICard label="User Limit" value={`${members.length} / ${license?.user_limit||2}`} icon="📊"/>
      </StatGrid>

      <div className="flex gap-2 mb-4">
        {[['members',`Members (${members.length})`],['invites',`Pending Invites (${invites.length})`],['permissions','Permissions']].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)}
            className={cn('px-4 py-1.5 rounded-lg text-sm font-medium transition-all',
              tab===k?'bg-[#2D5016] text-white':'bg-white border border-[#e8e0d0] text-[#6B7C3A]')}>
            {l}
          </button>
        ))}
      </div>

      {tab==='members' && (
        <div className="card">
          <DataTable columns={memberCols} rows={members} loading={loading} emptyText="No team members yet."/>
        </div>
      )}

      {tab==='invites' && (
        <>
          {invites.length===0
            ? <div className="card text-center py-12">
                <div className="text-4xl mb-3">📧</div>
                <p className="text-sm font-semibold text-[#2D5016] mb-1">No pending invites</p>
                <p className="text-xs text-gray-500 mb-4">Invite team members to collaborate on your farm.</p>
                {isOwnerOrAdmin && <button onClick={()=>setShowInvite(true)} className="btn btn-primary justify-center mx-auto"><Plus size={14}/>Send First Invite</button>}
              </div>
            : <div className="card">
                <DataTable columns={inviteCols} rows={invites} emptyText="No pending invites."/>
              </div>
          }
        </>
      )}

      {tab==='permissions' && (
        <SectionCard title="Role Permissions Matrix">
          <p className="text-xs text-gray-500 mb-4">Overview of what each role can access in FarmCore.</p>
          <PermissionsTable/>
        </SectionCard>
      )}

      {showInvite && (
        <Modal open title="Invite Team Member" subtitle={`Inviting to ${farm?.name}`}
          onClose={()=>setShowInvite(false)} size="lg">
          <InviteForm farmId={farm?.id} onClose={()=>setShowInvite(false)} onInvited={loadData}/>
        </Modal>
      )}
    </div>
  );
}
