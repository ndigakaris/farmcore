import { useState, useEffect, useMemo } from 'react';
import supabase from '../../services/supabase.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { canAddUser } from '../../services/license.js';
import { Modal, PageHeader, DataTable, KPICard, StatGrid } from '../../components/UI.jsx';
import { formatDate, getInitials, cn } from '../../utils/index.js';
import { Plus, Shield, Trash2, Crown, Eye, Edit, Wrench, Stethoscope, UserX, Check, Search } from 'lucide-react';

// ── ROLE DEFINITIONS ──────────────────────────────────────────
export const FARM_ROLES = {
  owner:   { label:'Owner',       icon:Crown,       color:'badge-purple', description:'Full access including billing and team management.', permissions:['all'] },
  admin:   { label:'Admin',       icon:Shield,      color:'badge-blue',   description:'Full access except billing. Can manage team.', permissions:['animals','production','health','reproduction','feed','finance','employees','procurement','assets','crops','calendar','lab','reports','notifications','settings','team'] },
  manager: { label:'Farm Manager',icon:Edit,        color:'badge-green',  description:'View and edit all farm data. Cannot manage team or billing.', permissions:['animals','production','health','reproduction','feed','finance','employees','procurement','assets','crops','calendar','lab','reports','notifications'] },
  worker:  { label:'Farm Worker', icon:Wrench,      color:'badge-amber',  description:'Log daily activities. Read-only on financials.', permissions:['animals','production','health','feed','employees','calendar','notifications'] },
  vet:     { label:'Vet/Consultant',icon:Stethoscope,color:'badge-red',   description:'View animals and log health treatments only.', permissions:['animals','health','reproduction','lab','notifications'] },
  viewer:  { label:'Viewer',      icon:Eye,         color:'badge-gray',   description:'Read-only access to all data.', permissions:[] },
};

const ALL_MODULES = ['animals','production','health','reproduction','feed','finance','employees','procurement','assets','crops','calendar','lab','reports','notifications','settings','team'];

function RoleBadge({ role }) {
  const r = FARM_ROLES[role] || FARM_ROLES.viewer;
  const Icon = r.icon;
  return <span className={cn('badge gap-1', r.color)}><Icon size={10}/>{r.label}</span>;
}

// ── ADD MEMBER DIRECTLY (no invite needed) ────────────────────
function AddMemberForm({ farmId, onClose, onAdded }) {
  const { user, farm, license } = useAuth();
  const [step,    setStep]    = useState('form'); // form | confirm | done
  const [form,    setForm]    = useState({ identifier:'', password:'', fullName:'', role:'worker' });
  const [customPerms, setCustomPerms] = useState(null); // null = use role defaults
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [memberCount, setMemberCount] = useState(0);
  const [preview, setPreview] = useState(null); // existing user found
  const f = (k,v) => setForm(p=>({...p,[k]:v}));

  useEffect(()=>{
    supabase.from('farm_users').select('id',{count:'exact'}).eq('farm_id',farmId)
      .then(({count})=>setMemberCount(count||0));
  },[farmId]);

  const canInvite = canAddUser(license, memberCount);
  const rolePerms = FARM_ROLES[form.role]?.permissions || [];
  const effectivePerms = customPerms ?? (rolePerms.includes('all') ? ALL_MODULES : rolePerms);

  const togglePerm = (mod) => {
    const base = customPerms ?? (rolePerms.includes('all') ? ALL_MODULES : rolePerms);
    if (base.includes(mod)) setCustomPerms(base.filter(p=>p!==mod));
    else setCustomPerms([...base, mod]);
  };

  // Check if user already exists in Supabase auth
  const lookupUser = async () => {
    setError(''); setLoading(true);
    try {
      const identifier = form.identifier.trim();
      // Try to find by email in profiles
      const { data } = await supabase.from('profiles')
        .select('id, full_name')
        .or(`email.eq.${identifier},phone.eq.${identifier}`)
        .maybeSingle();
      if (data) setPreview(data);
      else setPreview(null);
    } catch {}
    finally { setLoading(false); }
  };

  const handleAdd = async () => {
    if (!form.identifier.trim()) { setError('Email or phone is required.'); return; }
    if (!canInvite) { setError('User limit reached. Upgrade your plan.'); return; }
    setError(''); setLoading(true);
    try {
      let userId = preview?.id;

      if (!userId) {
        // Create the user account directly
        if (!form.fullName.trim()) { setError('Full name is required for new users.'); setLoading(false); return; }
        if (form.password.length < 8) { setError('Password must be at least 8 characters.'); setLoading(false); return; }

        const isEmail = form.identifier.includes('@');
        const { data: authData, error: signupErr } = await supabase.auth.admin
          ? await supabase.auth.signUp({
              email:    isEmail ? form.identifier : `${form.identifier}@farmcore.app`,
              password: form.password,
              options:  { data: { full_name: form.fullName } }
            })
          : await supabase.functions.invoke('create-user', {
              body: { email: form.identifier, password: form.password, fullName: form.fullName }
            });

        if (signupErr) throw signupErr;
        userId = authData?.user?.id;
        if (!userId) throw new Error('Failed to create user account.');
      }

      // Check not already a member
      const { data: existing } = await supabase.from('farm_users')
        .select('id').eq('farm_id', farmId).eq('user_id', userId).maybeSingle();
      if (existing) throw new Error('This user is already a member of your farm.');

      // Add to farm_users with role and custom permissions
      const permsToSave = customPerms ?? null; // null = inherit from role
      await supabase.from('farm_users').insert({
        farm_id:    farmId,
        user_id:    userId,
        role:       form.role,
        invited_by: user.id,
        custom_permissions: permsToSave,
      });

      setStep('done');
      onAdded?.();
    } catch (err) {
      setError(err.message || 'Failed to add member.');
    } finally { setLoading(false); }
  };

  if (step === 'done') return (
    <div className="text-center py-6">
      <div className="text-5xl mb-3">🎉</div>
      <h3 className="text-lg font-semibold text-[#2D5016] mb-2">Member Added!</h3>
      <p className="text-sm text-gray-500 mb-1">
        <strong>{form.fullName || form.identifier}</strong> has been added to <strong>{farm?.name}</strong>
      </p>
      <p className="text-xs text-gray-400 mb-4">Role: <strong>{FARM_ROLES[form.role]?.label}</strong></p>
      <button onClick={onClose} className="btn btn-primary w-full justify-center">Done</button>
    </div>
  );

  return (
    <div className="space-y-5">
      {!canInvite && <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-700">⚠️ User limit reached. Upgrade to add more members.</div>}
      {error && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>}

      {/* Step 1: Identifier */}
      <div>
        <label className="form-label">Email or Phone Number<span className="text-red-500">*</span></label>
        <div className="flex gap-2">
          <input className="form-input flex-1" type="text" value={form.identifier}
            onChange={e=>{ f('identifier',e.target.value); setPreview(null); }}
            placeholder="e.g. james@email.com or 0712345678"/>
          <button className="btn btn-secondary px-3" onClick={lookupUser} disabled={!form.identifier.trim()||loading}>
            <Search size={14}/>
          </button>
        </div>
        {preview && (
          <div className="mt-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-xs text-green-800">
            ✅ Found existing user: <strong>{preview.full_name}</strong> — will be added directly, no password needed.
          </div>
        )}
        {!preview && form.identifier && (
          <p className="text-xs text-gray-400 mt-1">No existing account found — fill in name and password to create one.</p>
        )}
      </div>

      {/* New user fields */}
      {!preview && (
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="form-label">Full Name <span className="text-gray-400 text-xs">(for new accounts)</span></label>
            <input className="form-input" value={form.fullName} onChange={e=>f('fullName',e.target.value)} placeholder="James Mwangi"/>
          </div>
          <div className="col-span-2">
            <label className="form-label">Password <span className="text-gray-400 text-xs">(min 8 characters)</span></label>
            <input className="form-input" type="password" value={form.password} onChange={e=>f('password',e.target.value)} placeholder="Create a password for them"/>
          </div>
        </div>
      )}

      {/* Role selection */}
      <div>
        <label className="form-label">Role<span className="text-red-500">*</span></label>
        <div className="space-y-2 mt-1">
          {Object.entries(FARM_ROLES).filter(([k])=>k!=='owner').map(([k,v])=>{
            const Icon = v.icon;
            return (
              <label key={k} className={cn('flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all',
                form.role===k?'border-[#2D5016] bg-[#eef5dd]':'border-[#e8e0d0] hover:border-[#6B7C3A]')}>
                <input type="radio" name="role" value={k} checked={form.role===k}
                  onChange={()=>{ f('role',k); setCustomPerms(null); }} className="mt-1"/>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Icon size={14} className="text-[#2D5016]"/>
                    <span className="text-sm font-semibold">{v.label}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{v.description}</p>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {/* Permission checkboxes */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="form-label mb-0">Permissions (checkboxes)</label>
          <button className="text-xs text-[#2D5016] underline" onClick={()=>setCustomPerms(null)}>
            Reset to role defaults
          </button>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {ALL_MODULES.map(mod=>(
            <label key={mod} className={cn(
              'flex items-center gap-2 px-2 py-1.5 rounded-lg border cursor-pointer text-xs transition-all capitalize',
              effectivePerms.includes(mod)
                ? 'bg-[#2D5016] text-white border-[#2D5016]'
                : 'bg-white border-[#e8e0d0] text-gray-600 hover:border-[#6B7C3A]'
            )}>
              <input type="checkbox" checked={effectivePerms.includes(mod)}
                onChange={()=>togglePerm(mod)} className="sr-only"/>
              {effectivePerms.includes(mod) && <Check size={10}/>}
              {mod}
            </label>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2 border-t border-[#e8e0d0]">
        <button onClick={onClose} className="btn btn-secondary">Cancel</button>
        <button onClick={handleAdd} disabled={loading||!canInvite} className="btn btn-primary">
          {loading ? 'Adding…' : <><Plus size={14}/>Add to Farm</>}
        </button>
      </div>
    </div>
  );
}

// ── PERMISSIONS TABLE ─────────────────────────────────────────
function PermissionsTable() {
  const modules = ALL_MODULES;
  const roles   = Object.entries(FARM_ROLES);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr>
            <th className="table-th text-left">Module</th>
            {roles.map(([k,v])=><th key={k} className="table-th text-center">{v.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {modules.map(mod=>(
            <tr key={mod} className="hover:bg-[#F5F0E8]/60">
              <td className="table-td font-medium capitalize">{mod}</td>
              {roles.map(([k,v])=>{
                const has = v.permissions.includes('all')||v.permissions.includes(mod);
                return <td key={k} className="table-td text-center">{has?<span className="text-green-600 font-bold">✓</span>:<span className="text-gray-300">—</span>}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── INVITE ACCEPT PAGE (kept for backward compat) ─────────────
export function InviteAcceptPage({ token }) {
  return (
    <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center">
        <div className="text-5xl mb-4">🌾</div>
        <h2 className="text-xl font-semibold text-[#2D5016] mb-2">Join FarmCore</h2>
        <p className="text-sm text-gray-500">Ask your farm admin to add you directly from the Team Management page using your email or phone number.</p>
      </div>
    </div>
  );
}

// ── MAIN TEAM MODULE ──────────────────────────────────────────
export default function TeamManagement() {
  const { farm, farmUser, user, license } = useAuth();
  const [members,   setMembers]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [showAdd,   setShowAdd]   = useState(false);
  const [tab,       setTab]       = useState('members');
  const [memberSearch, setMemberSearch] = useState('');

  const isOwnerOrAdmin = ['owner','admin'].includes(farmUser?.role);
  const isOwner        = farmUser?.role === 'owner';

  const loadData = async () => {
    if (!farm?.id) return;
    setLoading(true);
    try {
      const { data } = await supabase.from('farm_users')
        .select('*, profiles(full_name, avatar_url, email)')
        .eq('farm_id', farm.id);
      setMembers(data || []);
    } finally { setLoading(false); }
  };

  useEffect(()=>{ loadData(); },[farm?.id]);

  const changeRole = async (memberId, newRole) => {
    if (!isOwnerOrAdmin) return;
    await supabase.from('farm_users').update({ role:newRole }).eq('id', memberId);
    loadData();
  };

  const removeMember = async (memberId, memberUserId) => {
    if (memberUserId === user?.id) { alert("You can't remove yourself."); return; }
    if (!confirm('Remove this team member from the farm?')) return;
    await supabase.from('farm_users').delete().eq('id', memberId);
    loadData();
  };

  const filteredMembers = useMemo(()=>
    members.filter(m=>
      !memberSearch ||
      (m.profiles?.full_name||'').toLowerCase().includes(memberSearch.toLowerCase()) ||
      (m.profiles?.email||'').toLowerCase().includes(memberSearch.toLowerCase()) ||
      m.role.toLowerCase().includes(memberSearch.toLowerCase())
    ),[members, memberSearch]);

  const memberCols = [
    { key:'profiles', label:'Member', render:(_,row)=>(
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-[#eef5dd] flex items-center justify-center text-xs font-bold text-[#2D5016] flex-shrink-0">
            {getInitials(row.profiles?.full_name||'U')}
          </div>
          <div>
            <p className="text-sm font-medium">{row.profiles?.full_name||'Unnamed User'}</p>
            <p className="text-xs text-gray-400">{row.profiles?.email||''} {row.user_id===user?.id?'· You':''}</p>
          </div>
        </div>
      )},
    { key:'role', label:'Role', render:(v,row)=>(
        isOwnerOrAdmin && row.user_id !== user?.id
          ? <select className="form-input py-1 text-xs w-36" value={v} onChange={e=>changeRole(row.id,e.target.value)}>
              {Object.entries(FARM_ROLES).filter(([k])=>k!=='owner').map(([k,r])=>(
                <option key={k} value={k}>{r.label}</option>
              ))}
            </select>
          : <RoleBadge role={v}/>
      )},
    { key:'joined_at', label:'Joined', render:v=>formatDate(v) },
    { key:'id', label:'', render:(_,row)=>(
        isOwnerOrAdmin && row.user_id !== user?.id
          ? <button onClick={()=>removeMember(row.id,row.user_id)}
              className="btn btn-secondary py-1 px-2 text-xs text-red-500 hover:bg-red-50">
              <UserX size={12}/>Remove
            </button>
          : null
      )},
  ];

  const roleCount = Object.entries(FARM_ROLES).reduce((acc,[k])=>{
    acc[k] = members.filter(m=>m.role===k).length; return acc;
  },{});

  return (
    <div className="page-content">
      <PageHeader
        title="Team Management"
        subtitle={`${members.length} members · ${farm?.name}`}
        actions={isOwnerOrAdmin && (
          <button onClick={()=>setShowAdd(true)} className="btn btn-primary">
            <Plus size={15}/>Add Team Member
          </button>
        )}
      />

      <StatGrid cols={4}>
        <KPICard label="Total Members" value={members.length}      icon="👥"/>
        <KPICard label="Admins/Managers" value={(roleCount.admin||0)+(roleCount.manager||0)} icon="🛡️"/>
        <KPICard label="Workers/Vets"  value={(roleCount.worker||0)+(roleCount.vet||0)} icon="👷"/>
        <KPICard label="Viewers"       value={roleCount.viewer||0}  icon="👁️"/>
      </StatGrid>

      <div className="flex gap-2 mb-4">
        {[['members','Members'],['permissions','Role Permissions']].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${tab===k?'bg-[#2D5016] text-white':'bg-white border border-[#e8e0d0] text-[#6B7C3A]'}`}>
            {l}
          </button>
        ))}
      </div>

      {tab==='members' && (
        <>
          <div className="relative mb-4">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
            <input className="form-input pl-8" placeholder="Search members by name, email or role…"
              value={memberSearch} onChange={e=>setMemberSearch(e.target.value)}/>
          </div>
          <div className="card">
            {loading
              ? <p className="text-sm text-gray-400 text-center py-8">Loading members…</p>
              : <DataTable columns={memberCols} rows={filteredMembers} emptyText="No team members yet."/>}
          </div>
        </>
      )}

      {tab==='permissions' && (
        <div className="card">
          <p className="text-xs text-gray-500 mb-3">This table shows default permissions per role. Individual permissions can be customized when adding a member.</p>
          <PermissionsTable/>
        </div>
      )}

      {showAdd && (
        <Modal open title="Add Team Member" subtitle="Create or link a user account directly" onClose={()=>setShowAdd(false)} size="lg">
          <AddMemberForm farmId={farm?.id} onClose={()=>setShowAdd(false)} onAdded={loadData}/>
        </Modal>
      )}
    </div>
  );
}
