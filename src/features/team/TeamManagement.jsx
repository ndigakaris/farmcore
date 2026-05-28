import { useState, useEffect, useMemo } from 'react';
import supabase from '../../services/supabase.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { canAddUser } from '../../services/license.js';
import { Modal, PageHeader, DataTable, KPICard, StatGrid } from '../../components/UI.jsx';
import { formatDate, getInitials, cn } from '../../utils/index.js';
import { Plus, Shield, Trash2, Crown, Eye, Edit, Wrench, Stethoscope,
         UserX, Check, Search, LogOut, ToggleLeft, ToggleRight } from 'lucide-react';

export const FARM_ROLES = {
  owner:   { label:'Owner',        icon:Crown,       color:'badge-purple', description:'Full access including billing and team.', permissions:['all'] },
  admin:   { label:'Admin',        icon:Shield,      color:'badge-blue',   description:'Full access except billing. Can manage team.', permissions:['animals','production','health','reproduction','feed','finance','employees','procurement','assets','crops','calendar','lab','reports','notifications','settings','team'] },
  manager: { label:'Farm Manager', icon:Edit,        color:'badge-green',  description:'View and edit all farm data.', permissions:['animals','production','health','reproduction','feed','finance','employees','procurement','assets','crops','calendar','lab','reports','notifications'] },
  worker:  { label:'Farm Worker',  icon:Wrench,      color:'badge-amber',  description:'Log daily activities. Read-only on financials.', permissions:['animals','production','health','feed','employees','calendar','notifications'] },
  vet:     { label:'Vet',          icon:Stethoscope, color:'badge-red',    description:'View animals and log health treatments.', permissions:['animals','health','reproduction','lab','notifications'] },
  viewer:  { label:'Viewer',       icon:Eye,         color:'badge-gray',   description:'Read-only access.', permissions:[] },
};

const ALL_MODULES = ['animals','production','health','reproduction','feed','finance','employees','procurement','assets','crops','calendar','lab','reports','notifications','settings','team'];

// Auto-generate worker code: W001, W002 etc
async function generateUserCode() {
  const { data } = await supabase.from('farm_users').select('user_code').not('user_code','is',null);
  const existing = (data||[]).map(r=>{
    const m = (r.user_code||'').match(/W(\d+)/);
    return m ? parseInt(m[1]) : 0;
  });
  const next = existing.length ? Math.max(...existing)+1 : 1;
  return `W${String(next).padStart(3,'0')}`;
}

function RoleBadge({ role }) {
  const r = FARM_ROLES[role]||FARM_ROLES.viewer;
  const Icon = r.icon;
  return <span className={cn('badge gap-1 text-[10px]', r.color)}><Icon size={9}/>{r.label}</span>;
}

// ── Add Member Form ───────────────────────────────────────────
function AddMemberForm({ farmId, onClose, onAdded }) {
  const { user, farm, license } = useAuth();
  const [form,    setForm]    = useState({ identifier:'', password:'', fullName:'', role:'worker' });
  const [customPerms, setCustomPerms] = useState(null);
  const [loading, setLoading] = useState(false);
  const [checking,setChecking]= useState(false);
  const [error,   setError]   = useState('');
  const [step,    setStep]    = useState('form'); // form | done
  const [preview, setPreview] = useState(null);
  const [memberCount, setMemberCount] = useState(0);
  const f = (k,v) => setForm(p=>({...p,[k]:v}));

  useEffect(()=>{
    supabase.from('farm_users').select('id',{count:'exact'}).eq('farm_id',farmId)
      .then(({count})=>setMemberCount(count||0));
  },[farmId]);

  const canInvite = canAddUser(license, memberCount);
  const rolePerms = FARM_ROLES[form.role]?.permissions||[];
  const effectivePerms = customPerms ?? (rolePerms.includes('all') ? ALL_MODULES : rolePerms);
  const togglePerm = (mod) => {
    const base = customPerms ?? (rolePerms.includes('all') ? ALL_MODULES : rolePerms);
    setCustomPerms(base.includes(mod) ? base.filter(p=>p!==mod) : [...base, mod]);
  };

  const lookupUser = async () => {
    if (!form.identifier.trim()) return;
    setChecking(true); setError(''); setPreview(null);
    try {
      // Check for duplicate in this farm
      const { data: existing } = await supabase
        .from('farm_users')
        .select('id, profiles(full_name, email)')
        .eq('farm_id', farmId);
      const emails = (existing||[]).map(m=>m.profiles?.email?.toLowerCase()).filter(Boolean);
      if (emails.includes(form.identifier.toLowerCase())) {
        setError('This email is already a member of this farm.');
        setChecking(false); return;
      }
      // Look up in profiles
      const { data } = await supabase.from('profiles')
        .select('id, full_name, email')
        .eq('email', form.identifier.toLowerCase().trim())
        .maybeSingle();
      setPreview(data||null);
    } catch {}
    finally { setChecking(false); }
  };

  const handleAdd = async () => {
    if (!form.identifier.trim()) { setError('Email is required.'); return; }
    if (!canInvite) { setError('User limit reached. Upgrade your plan.'); return; }
    setError(''); setLoading(true);
    try {
      let userId = preview?.id;
      const userCode = await generateUserCode();

      if (!userId) {
        if (!form.fullName.trim()) { setError('Full name required for new users.'); setLoading(false); return; }
        if (form.password.length < 8) { setError('Password must be at least 8 characters.'); setLoading(false); return; }
        // Check email doesn't exist in auth
        const { data: existCheck } = await supabase.from('profiles').select('id').eq('email',form.identifier.toLowerCase()).maybeSingle();
        if (existCheck) { setError('An account with this email already exists. Click Search to find them.'); setLoading(false); return; }
        const { data: authData, error: signupErr } = await supabase.auth.signUp({
          email: form.identifier.toLowerCase().trim(),
          password: form.password,
          options: { data: { full_name: form.fullName } }
        });
        if (signupErr) throw signupErr;
        userId = authData?.user?.id;
        if (!userId) throw new Error('Failed to create account.');
      }

      // Check not already a member
      const { data: alreadyMember } = await supabase.from('farm_users')
        .select('id').eq('farm_id',farmId).eq('user_id',userId).maybeSingle();
      if (alreadyMember) throw new Error('This user is already a member of this farm.');

      await supabase.from('farm_users').insert({
        farm_id: farmId, user_id: userId, role: form.role,
        invited_by: user.id, user_code: userCode,
        custom_permissions: customPerms,
        is_active: true,
      });

      setStep('done');
      onAdded?.();
    } catch (err) {
      setError(err.message||'Failed to add member.');
    } finally { setLoading(false); }
  };

  if (step==='done') return (
    <div className="text-center py-6">
      <div className="text-5xl mb-3">🎉</div>
      <h3 className="text-lg font-semibold text-[#2D5016] mb-2">Member Added!</h3>
      <p className="text-sm text-gray-500 mb-1"><strong>{form.fullName||form.identifier}</strong> added to <strong>{farm?.name}</strong></p>
      <p className="text-xs text-gray-400 mb-4">Role: <strong>{FARM_ROLES[form.role]?.label}</strong></p>
      <button onClick={onClose} className="btn btn-primary w-full justify-center">Done</button>
    </div>
  );

  return (
    <div className="space-y-4">
      {!canInvite && <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-700">⚠️ User limit reached. Upgrade to add more members.</div>}
      {error && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>}

      <div>
        <label className="form-label">Email Address<span className="text-red-500">*</span></label>
        <div className="flex gap-2">
          <input className="form-input flex-1" type="email" value={form.identifier}
            onChange={e=>{ f('identifier',e.target.value); setPreview(null); setError(''); }}
            placeholder="colleague@example.com"/>
          <button className="btn btn-secondary px-3" onClick={lookupUser} disabled={!form.identifier.trim()||checking}>
            {checking ? <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"/> : <Search size={14}/>}
          </button>
        </div>
        {preview && <div className="mt-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-xs text-green-800">✅ Found: <strong>{preview.full_name}</strong> — will be added directly, no password needed.</div>}
        {!preview && form.identifier && <p className="text-xs text-gray-400 mt-1">Click Search to check for existing account. If not found, fill in name and password below.</p>}
      </div>

      {!preview && (
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2"><label className="form-label">Full Name</label>
            <input className="form-input" value={form.fullName} onChange={e=>f('fullName',e.target.value)} placeholder="James Mwangi"/></div>
          <div className="col-span-2"><label className="form-label">Password <span className="text-gray-400 text-xs">(min 8 characters)</span></label>
            <input className="form-input" type="password" value={form.password} onChange={e=>f('password',e.target.value)} placeholder="Create a password"/></div>
        </div>
      )}

      <div>
        <label className="form-label">Role<span className="text-red-500">*</span></label>
        <div className="space-y-1.5">
          {Object.entries(FARM_ROLES).filter(([k])=>k!=='owner').map(([k,v])=>{
            const Icon=v.icon;
            return (
              <label key={k} className={cn('flex items-start gap-3 p-2.5 rounded-xl border-2 cursor-pointer transition-all',
                form.role===k?'border-[#2D5016] bg-[#eef5dd]':'border-[#e8e0d0] hover:border-[#6B7C3A]')}>
                <input type="radio" name="role" value={k} checked={form.role===k}
                  onChange={()=>{ f('role',k); setCustomPerms(null); }} className="mt-1"/>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Icon size={13} className="text-[#2D5016]"/>
                    <span className="text-sm font-semibold">{v.label}</span>
                  </div>
                  <p className="text-xs text-gray-500">{v.description}</p>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="form-label mb-0">Permissions</label>
          <button className="text-xs text-[#2D5016] underline" onClick={()=>setCustomPerms(null)}>Reset to role defaults</button>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {ALL_MODULES.map(mod=>(
            <label key={mod} className={cn('flex items-center gap-1.5 px-2 py-1.5 rounded-lg border cursor-pointer text-xs transition-all capitalize',
              effectivePerms.includes(mod)?'bg-[#2D5016] text-white border-[#2D5016]':'bg-white border-[#e8e0d0] text-gray-600')}>
              <input type="checkbox" checked={effectivePerms.includes(mod)} onChange={()=>togglePerm(mod)} className="sr-only"/>
              {effectivePerms.includes(mod)&&<Check size={9}/>} {mod}
            </label>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2 border-t border-[#e8e0d0]">
        <button onClick={onClose} className="btn btn-secondary">Cancel</button>
        <button onClick={handleAdd} disabled={loading||!canInvite} className="btn btn-primary">
          {loading?'Adding…':<><Plus size={14}/>Add to Farm</>}
        </button>
      </div>
    </div>
  );
}

// ── Edit Role Modal ───────────────────────────────────────────
function EditRoleModal({ member, onClose, onSaved }) {
  const [role, setRole]           = useState(member.role);
  const [customPerms, setCustomPerms] = useState(member.custom_permissions||null);
  const [saving, setSaving]       = useState(false);
  const rolePerms = FARM_ROLES[role]?.permissions||[];
  const effectivePerms = customPerms ?? (rolePerms.includes('all') ? ALL_MODULES : rolePerms);
  const togglePerm = (mod) => {
    const base = customPerms ?? (rolePerms.includes('all') ? ALL_MODULES : rolePerms);
    setCustomPerms(base.includes(mod) ? base.filter(p=>p!==mod) : [...base, mod]);
  };

  const handleSave = async () => {
    setSaving(true);
    await supabase.from('farm_users').update({ role, custom_permissions: customPerms }).eq('id', member.id);
    setSaving(false); onSaved(); onClose();
  };

  return (
    <div className="space-y-4">
      <div className="bg-[#F5F0E8] rounded-xl p-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-[#2D5016] flex items-center justify-center text-white text-xs font-bold">
          {getInitials(member.profiles?.full_name||'U')}
        </div>
        <div>
          <p className="font-semibold text-sm">{member.profiles?.full_name||'Unknown'}</p>
          <p className="text-xs text-gray-400">{member.user_code||''} · {member.profiles?.email||''}</p>
        </div>
      </div>

      <div>
        <label className="form-label">Role</label>
        <div className="space-y-1.5">
          {Object.entries(FARM_ROLES).filter(([k])=>k!=='owner').map(([k,v])=>{
            const Icon=v.icon;
            return (
              <label key={k} className={cn('flex items-start gap-3 p-2.5 rounded-xl border-2 cursor-pointer',
                role===k?'border-[#2D5016] bg-[#eef5dd]':'border-[#e8e0d0]')}>
                <input type="radio" checked={role===k} onChange={()=>{ setRole(k); setCustomPerms(null); }} className="mt-1"/>
                <div><div className="flex items-center gap-2"><Icon size={13} className="text-[#2D5016]"/><span className="text-sm font-semibold">{v.label}</span></div>
                  <p className="text-xs text-gray-500">{v.description}</p></div>
              </label>
            );
          })}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="form-label mb-0">Permissions</label>
          <button className="text-xs text-[#2D5016] underline" onClick={()=>setCustomPerms(null)}>Reset to role defaults</button>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {ALL_MODULES.map(mod=>(
            <label key={mod} className={cn('flex items-center gap-1.5 px-2 py-1.5 rounded-lg border cursor-pointer text-xs capitalize',
              effectivePerms.includes(mod)?'bg-[#2D5016] text-white border-[#2D5016]':'bg-white border-[#e8e0d0] text-gray-600')}>
              <input type="checkbox" checked={effectivePerms.includes(mod)} onChange={()=>togglePerm(mod)} className="sr-only"/>
              {effectivePerms.includes(mod)&&<Check size={9}/>} {mod}
            </label>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2 border-t border-[#e8e0d0]">
        <button onClick={onClose} className="btn btn-secondary">Cancel</button>
        <button onClick={handleSave} disabled={saving} className="btn btn-primary">{saving?'Saving…':'Save Changes'}</button>
      </div>
    </div>
  );
}

// ── Permissions Table ─────────────────────────────────────────
function PermissionsTable() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead><tr>
          <th className="table-th text-left">Module</th>
          {Object.entries(FARM_ROLES).map(([k,v])=><th key={k} className="table-th text-center">{v.label}</th>)}
        </tr></thead>
        <tbody>
          {ALL_MODULES.map(mod=>(
            <tr key={mod} className="hover:bg-[#F5F0E8]/60">
              <td className="table-td font-medium capitalize">{mod}</td>
              {Object.entries(FARM_ROLES).map(([k,v])=>{
                const has=v.permissions.includes('all')||v.permissions.includes(mod);
                return <td key={k} className="table-td text-center">{has?<span className="text-green-600 font-bold">✓</span>:<span className="text-gray-300">—</span>}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function InviteAcceptPage() {
  return (
    <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center">
        <div className="text-5xl mb-4">🌾</div>
        <h2 className="text-xl font-semibold text-[#2D5016] mb-2">Join FarmCore</h2>
        <p className="text-sm text-gray-500">Ask your farm admin to add you directly from the Team Management page using your email address.</p>
      </div>
    </div>
  );
}

// ── Main Team Management ──────────────────────────────────────
export default function TeamManagement() {
  const { farm, farmUser, user, license, signOut } = useAuth();
  const [members,     setMembers]     = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [showAdd,     setShowAdd]     = useState(false);
  const [editMember,  setEditMember]  = useState(null);
  const [tab,         setTab]         = useState('members');
  const [memberSearch,setMemberSearch]= useState('');
  const [confirmLogout, setConfirmLogout] = useState(false);

  const isOwnerOrAdmin = ['owner','admin'].includes(farmUser?.role);

  const loadData = async () => {
    if (!farm?.id) return;
    setLoading(true);
    try {
      const { data } = await supabase.from('farm_users')
        .select('*, profiles(full_name, avatar_url, email)')
        .eq('farm_id', farm.id)
        .order('created_at', { ascending: false });
      setMembers(data||[]);
    } finally { setLoading(false); }
  };

  useEffect(()=>{ loadData(); },[farm?.id]);

  const toggleActive = async (member) => {
    const newActive = !(member.is_active !== false);
    await supabase.from('farm_users').update({ is_active: newActive }).eq('id', member.id);
    loadData();
  };

  const removeMember = async (memberId, memberUserId) => {
    if (memberUserId===user?.id) { alert("You can't remove yourself."); return; }
    if (!confirm('Remove this team member from the farm?')) return;
    await supabase.from('farm_users').delete().eq('id', memberId);
    loadData();
  };

  const filtered = useMemo(()=>
    members.filter(m=>
      !memberSearch ||
      (m.profiles?.full_name||'').toLowerCase().includes(memberSearch.toLowerCase()) ||
      (m.profiles?.email||'').toLowerCase().includes(memberSearch.toLowerCase()) ||
      (m.user_code||'').toLowerCase().includes(memberSearch.toLowerCase()) ||
      m.role.toLowerCase().includes(memberSearch.toLowerCase())
    ),[members, memberSearch]);

  const memberCols = [
    { key:'profiles', label:'Member', render:(_,row)=>(
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-[#eef5dd] flex items-center justify-center text-xs font-bold text-[#2D5016] flex-shrink-0">
            {getInitials(row.profiles?.full_name||'U')}
          </div>
          <div>
            <p className="text-sm font-medium">{row.profiles?.full_name||'Unnamed'}</p>
            <p className="text-xs text-gray-400">{row.profiles?.email||''}</p>
          </div>
        </div>)},
    { key:'user_code', label:'Code', render:v=><span className="font-mono text-xs text-[#2D5016] font-semibold">{v||'—'}</span> },
    { key:'role',      label:'Role',   render:v=><RoleBadge role={v}/> },
    { key:'is_active', label:'Status', render:(v,row)=>{
        const active = v!==false;
        return <span className={`badge ${active?'badge-green':'badge-red'}`}>{active?'Active':'Inactive'}</span>;
      }},
    { key:'joined_at', label:'Joined', render:v=>formatDate(v) },
    { key:'id', label:'', render:(_,row)=>(
        <div className="flex gap-1">
          {isOwnerOrAdmin && row.user_id!==user?.id && <>
            <button onClick={()=>setEditMember(row)}
              className="btn btn-secondary py-1 px-2 text-xs" title="Edit role & permissions">
              <Edit size={11}/>
            </button>
            <button onClick={()=>toggleActive(row)}
              className={`btn py-1 px-2 text-xs ${row.is_active!==false?'btn-secondary text-amber-600':'btn-secondary text-green-600'}`}
              title={row.is_active!==false?'Deactivate':'Activate'}>
              {row.is_active!==false?<ToggleLeft size={13}/>:<ToggleRight size={13}/>}
            </button>
            <button onClick={()=>removeMember(row.id,row.user_id)}
              className="btn btn-secondary py-1 px-2 text-xs text-red-500">
              <UserX size={11}/>
            </button>
          </>}
          {row.user_id===user?.id && <span className="text-[10px] text-gray-400 px-2">You</span>}
        </div>)},
  ];

  const roleCounts = Object.entries(FARM_ROLES).reduce((acc,[k])=>{
    acc[k]=(members||[]).filter(m=>m.role===k).length; return acc;
  },{});
  const activeCount   = members.filter(m=>m.is_active!==false).length;
  const inactiveCount = members.filter(m=>m.is_active===false).length;

  return (
    <div className="page-content">
      <PageHeader
        title="Team Management"
        subtitle={`${members.length} members · ${farm?.name||''}`}
        actions={
          <div className="flex gap-2">
            {isOwnerOrAdmin && (
              <button onClick={()=>setShowAdd(true)} className="btn btn-primary">
                <Plus size={15}/>Add Member
              </button>
            )}
            <button onClick={()=>setConfirmLogout(true)}
              className="btn btn-secondary text-red-600 hover:bg-red-50">
              <LogOut size={14}/>Log Out
            </button>
          </div>
        }
      />

      <StatGrid cols={4}>
        <KPICard label="Total Members" value={members.length}   icon="👥"/>
        <KPICard label="Active"        value={activeCount}      icon="✅"/>
        <KPICard label="Inactive"      value={inactiveCount}    icon="⏸️" color={inactiveCount>0?'#d97706':undefined}/>
        <KPICard label="Admins/Managers" value={(roleCounts.admin||0)+(roleCounts.manager||0)} icon="🛡️"/>
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
            <input className="form-input pl-8" placeholder="Search by name, email, code or role…"
              value={memberSearch} onChange={e=>setMemberSearch(e.target.value)}/>
          </div>
          <div className="card">
            {loading
              ? <p className="text-sm text-gray-400 text-center py-8">Loading members…</p>
              : filtered.length===0
                ? <div className="text-center py-12">
                    <p className="text-4xl mb-3">👥</p>
                    <p className="text-sm text-gray-500 mb-1">{members.length===0?'No team members yet':'No members match your search'}</p>
                    {members.length===0&&isOwnerOrAdmin && <button onClick={()=>setShowAdd(true)} className="btn btn-primary mt-3"><Plus size={14}/>Add First Member</button>}
                  </div>
                : <DataTable columns={memberCols} rows={filtered} emptyText=""/>}
          </div>
        </>
      )}

      {tab==='permissions' && (
        <div className="card">
          <p className="text-xs text-gray-500 mb-3">Default permissions per role. Individual permissions can be customised when adding or editing a member.</p>
          <PermissionsTable/>
        </div>
      )}

      {showAdd && (
        <Modal open title="Add Team Member" subtitle="No invite email needed — add directly" onClose={()=>setShowAdd(false)} size="lg">
          <AddMemberForm farmId={farm?.id} onClose={()=>setShowAdd(false)} onAdded={loadData}/>
        </Modal>
      )}

      {editMember && (
        <Modal open title="Edit Role & Permissions" onClose={()=>setEditMember(null)} size="lg">
          <EditRoleModal member={editMember} onClose={()=>setEditMember(null)} onSaved={loadData}/>
        </Modal>
      )}

      {/* Logout confirmation */}
      {confirmLogout && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm text-center">
            <div className="text-4xl mb-3">👋</div>
            <h3 className="font-semibold text-gray-900 mb-2">Log out of FarmCore?</h3>
            <p className="text-sm text-gray-500 mb-5">Any unsynced data will be saved locally and synced when you log back in.</p>
            <div className="flex gap-3">
              <button onClick={()=>setConfirmLogout(false)} className="btn btn-secondary flex-1">Cancel</button>
              <button onClick={signOut} className="btn btn-primary flex-1 bg-red-600 hover:bg-red-700">Log Out</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
