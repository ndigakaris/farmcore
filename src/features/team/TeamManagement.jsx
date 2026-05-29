// TeamManagement.jsx — uses only columns that exist in farm_users table:
// id, farm_id, user_id, role, invited_by, joined_at
// Extra columns (user_code, is_active, custom_permissions) require running fix_2_farm_users_columns.sql first
import { useState, useEffect, useMemo } from 'react';
import supabase from '../../services/supabase.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { canAddUser } from '../../services/license.js';
import { Modal, PageHeader, DataTable, KPICard, StatGrid } from '../../components/UI.jsx';
import { formatDate, getInitials, cn } from '../../utils/index.js';
import { Plus, Shield, Trash2, Crown, Eye, Edit, Wrench, Stethoscope,
         UserX, Check, Search, LogOut } from 'lucide-react';

export const FARM_ROLES = {
  owner:   { label:'Owner',        icon:Crown,        color:'badge-purple', description:'Full access including billing and team.' },
  admin:   { label:'Admin',        icon:Shield,       color:'badge-blue',   description:'Full access except billing. Can manage team.' },
  manager: { label:'Farm Manager', icon:Edit,         color:'badge-green',  description:'View and edit all farm data.' },
  worker:  { label:'Farm Worker',  icon:Wrench,       color:'badge-amber',  description:'Log daily activities. Read-only on financials.' },
  vet:     { label:'Vet',          icon:Stethoscope,  color:'badge-red',    description:'View animals and log health treatments.' },
  viewer:  { label:'Viewer',       icon:Eye,          color:'badge-gray',   description:'Read-only access.' },
};

const ALL_MODULES = ['animals','production','health','reproduction','feed','finance',
  'employees','procurement','assets','crops','calendar','lab','reports','notifications','settings','team'];

function RoleBadge({ role }) {
  const r = FARM_ROLES[role] || FARM_ROLES.viewer;
  const Icon = r.icon;
  return <span className={cn('badge gap-1 text-[10px]', r.color)}><Icon size={9}/>{r.label}</span>;
}

// ── Add Member Form ────────────────────────────────────────────
function AddMemberForm({ farmId, onClose, onAdded }) {
  const { user, farm, license } = useAuth();
  const [form,    setForm]    = useState({ email:'', password:'', fullName:'', role:'worker' });
  const [loading, setLoading] = useState(false);
  const [checking,setChecking]= useState(false);
  const [error,   setError]   = useState('');
  const [done,    setDone]    = useState(false);
  const [preview, setPreview] = useState(null); // existing user found
  const [memberCount, setMemberCount] = useState(0);
  const f = (k,v) => setForm(p=>({...p,[k]:v}));

  useEffect(()=>{
    supabase.from('farm_users').select('id',{count:'exact',head:true}).eq('farm_id',farmId)
      .then(({count})=>setMemberCount(count||0));
  },[farmId]);

  const canAdd = canAddUser(license, memberCount);

  const lookupUser = async () => {
    if (!form.email.trim()) return;
    setChecking(true); setError(''); setPreview(null);
    try {
      // 1. Check not already in this farm
      const { data: existing } = await supabase
        .from('farm_users')
        .select('id, profiles!inner(email)')
        .eq('farm_id', farmId);
      const inFarm = (existing||[]).map(m=>m.profiles?.email?.toLowerCase()).filter(Boolean);
      if (inFarm.includes(form.email.toLowerCase())) {
        setError('This email is already a member of this farm.'); setChecking(false); return;
      }
      // 2. Look up in profiles
      const { data } = await supabase.from('profiles')
        .select('id, full_name, email')
        .eq('email', form.email.toLowerCase().trim())
        .maybeSingle();
      setPreview(data||null);
    } catch(e) { console.warn(e); }
    finally { setChecking(false); }
  };

  const handleAdd = async () => {
    if (!form.email.trim()) { setError('Email is required.'); return; }
    if (!canAdd) { setError('User limit reached. Upgrade your plan.'); return; }
    setError(''); setLoading(true);
    try {
      let userId = preview?.id;

      if (!userId) {
        // Validate new user fields
        if (!form.fullName.trim()) { setError('Full name is required for new users.'); setLoading(false); return; }
        if (form.password.length < 8) { setError('Password must be at least 8 characters.'); setLoading(false); return; }
        // Double-check email doesn't exist
        const { data: dup } = await supabase.from('profiles')
          .select('id').eq('email', form.email.toLowerCase()).maybeSingle();
        if (dup) { setError('An account with this email already exists. Click the search button to find them.'); setLoading(false); return; }
        // Create new Supabase Auth user
        const { data: authData, error: signErr } = await supabase.auth.signUp({
          email:    form.email.toLowerCase().trim(),
          password: form.password,
          options:  { data: { full_name: form.fullName } }
        });
        if (signErr) throw signErr;
        userId = authData?.user?.id;
        if (!userId) throw new Error('Account creation failed. Try again.');
      }

      // Check not already a member of this farm
      const { data: alreadyIn } = await supabase.from('farm_users')
        .select('id').eq('farm_id',farmId).eq('user_id',userId).maybeSingle();
      if (alreadyIn) throw new Error('This user is already a member of this farm.');

      // Insert into farm_users with base columns only (extra cols need SQL migration first)
      const insertData = { farm_id:farmId, user_id:userId, role:form.role, invited_by:user.id };

      // Try to insert with optional extra columns — safe if they don't exist yet
      try {
        const code = `W${String(memberCount+1).padStart(3,'0')}`;
        await supabase.from('farm_users').insert({ ...insertData, user_code:code, is_active:true });
      } catch {
        // Fallback: insert without extra columns if migration not run
        await supabase.from('farm_users').insert(insertData);
      }

      setDone(true);
      onAdded?.();
    } catch(err) {
      setError(err.message || 'Failed to add member.');
    } finally { setLoading(false); }
  };

  if (done) return (
    <div className="text-center py-6 space-y-3">
      <div className="text-5xl">🎉</div>
      <h3 className="text-lg font-semibold text-[#2D5016]">Member Added!</h3>
      <p className="text-sm text-gray-500"><strong>{form.fullName||form.email}</strong> has been added to <strong>{farm?.name}</strong> as <strong>{FARM_ROLES[form.role]?.label}</strong>.</p>
      <button onClick={onClose} className="btn btn-primary w-full justify-center">Done</button>
    </div>
  );

  return (
    <div className="space-y-4">
      {!canAdd && <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-700">⚠️ User limit reached. Upgrade your plan to add more members.</div>}
      {error && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>}

      {/* Email lookup */}
      <div>
        <label className="form-label">Email Address<span className="text-red-500">*</span></label>
        <div className="flex gap-2">
          <input className="form-input flex-1" type="email" value={form.email}
            onChange={e=>{ f('email',e.target.value); setPreview(null); setError(''); }}
            placeholder="colleague@example.com"/>
          <button className="btn btn-secondary px-3" onClick={lookupUser}
            disabled={!form.email.trim()||checking} title="Check if user exists">
            {checking
              ? <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"/>
              : <Search size={14}/>}
          </button>
        </div>
        {preview && (
          <div className="mt-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-xs text-green-800">
            ✅ <strong>{preview.full_name}</strong> found — will be added directly, no password needed.
          </div>
        )}
        {!preview && form.email && (
          <p className="text-xs text-gray-400 mt-1">Click 🔍 to check for existing account. If not found, enter their name and create a password below.</p>
        )}
      </div>

      {/* New user fields — only shown if not found */}
      {!preview && (
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="form-label">Full Name <span className="text-gray-400 text-xs">(for new account)</span></label>
            <input className="form-input" value={form.fullName} onChange={e=>f('fullName',e.target.value)} placeholder="James Mwangi"/>
          </div>
          <div className="col-span-2">
            <label className="form-label">Password <span className="text-gray-400 text-xs">(min 8 characters)</span></label>
            <input className="form-input" type="password" value={form.password}
              onChange={e=>f('password',e.target.value)} placeholder="Create a password for them"/>
          </div>
        </div>
      )}

      {/* Role selection */}
      <div>
        <label className="form-label">Role<span className="text-red-500">*</span></label>
        <div className="space-y-1.5">
          {Object.entries(FARM_ROLES).filter(([k])=>k!=='owner').map(([k,v])=>{
            const Icon=v.icon;
            return (
              <label key={k} className={cn('flex items-start gap-3 p-2.5 rounded-xl border-2 cursor-pointer transition-all',
                form.role===k?'border-[#2D5016] bg-[#eef5dd]':'border-[#e8e0d0] hover:border-[#6B7C3A]')}>
                <input type="radio" name="role" value={k} checked={form.role===k}
                  onChange={()=>f('role',k)} className="mt-1"/>
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

      <div className="flex justify-end gap-3 pt-2 border-t border-[#e8e0d0]">
        <button onClick={onClose} className="btn btn-secondary">Cancel</button>
        <button onClick={handleAdd} disabled={loading||!canAdd} className="btn btn-primary">
          {loading?'Adding…':<><Plus size={14}/>Add to Farm</>}
        </button>
      </div>
    </div>
  );
}

// ── Edit Role Modal ────────────────────────────────────────────
function EditRoleModal({ member, onClose, onSaved }) {
  const [role, setRole] = useState(member.role);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await supabase.from('farm_users').update({ role }).eq('id', member.id);
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
          <p className="text-xs text-gray-400">{member.profiles?.email||''}</p>
        </div>
      </div>

      <div>
        <label className="form-label">New Role</label>
        <div className="space-y-1.5">
          {Object.entries(FARM_ROLES).filter(([k])=>k!=='owner').map(([k,v])=>{
            const Icon=v.icon;
            return (
              <label key={k} className={cn('flex items-start gap-3 p-2.5 rounded-xl border-2 cursor-pointer transition-all',
                role===k?'border-[#2D5016] bg-[#eef5dd]':'border-[#e8e0d0] hover:border-[#6B7C3A]')}>
                <input type="radio" checked={role===k} onChange={()=>setRole(k)} className="mt-1"/>
                <div>
                  <div className="flex items-center gap-2"><Icon size={13} className="text-[#2D5016]"/><span className="text-sm font-semibold">{v.label}</span></div>
                  <p className="text-xs text-gray-500">{v.description}</p>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2 border-t border-[#e8e0d0]">
        <button onClick={onClose} className="btn btn-secondary">Cancel</button>
        <button onClick={handleSave} disabled={saving} className="btn btn-primary">{saving?'Saving…':'Save Role'}</button>
      </div>
    </div>
  );
}

// ── Permissions Reference Table ────────────────────────────────
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
              {Object.entries(FARM_ROLES).map(([k])=>{
                const perms = { owner:true, admin:!['settings'].includes(mod), manager:!['team','settings'].includes(mod),
                  worker:['animals','production','health','feed','employees','calendar','notifications'].includes(mod),
                  vet:['animals','health','reproduction','lab','notifications'].includes(mod), viewer:true };
                return <td key={k} className="table-td text-center">
                  {perms[k]?<span className="text-green-600 font-bold">✓</span>:<span className="text-gray-300">—</span>}
                </td>;
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
        <p className="text-sm text-gray-500">Ask your farm admin to add you directly from Team Management using your email address.</p>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────
export default function TeamManagement() {
  const { farm, farmUser, user, license, signOut } = useAuth();
  const [members,      setMembers]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [showAdd,      setShowAdd]      = useState(false);
  const [editMember,   setEditMember]   = useState(null);
  const [tab,          setTab]          = useState('members');
  const [search,       setSearch]       = useState('');
  const [confirmLogout,setConfirmLogout]= useState(false);
  const [togglingId,   setTogglingId]   = useState(null);

  const isOwnerOrAdmin = ['owner','admin'].includes(farmUser?.role);

  const loadData = async () => {
    if (!farm?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('farm_users')
        .select('*, profiles(full_name, email, avatar_url)')
        .eq('farm_id', farm.id)
        .order('joined_at', { ascending: false });
      if (!error) setMembers(data||[]);
      else console.warn('farm_users fetch error:', error.message);
    } finally { setLoading(false); }
  };

  useEffect(()=>{ loadData(); },[farm?.id]);

  const toggleActive = async (member) => {
    setTogglingId(member.id);
    const current = member.is_active !== false;
    try {
      await supabase.from('farm_users').update({ is_active: !current }).eq('id', member.id);
      setMembers(prev=>prev.map(m=>m.id===member.id?{...m,is_active:!current}:m));
    } catch(e) { console.warn('Toggle active requires SQL migration:', e.message); }
    finally { setTogglingId(null); }
  };

  const removeMember = async (memberId, memberUserId) => {
    if (memberUserId===user?.id) { alert("You can't remove yourself."); return; }
    if (!confirm('Remove this member from the farm?')) return;
    await supabase.from('farm_users').delete().eq('id', memberId);
    setMembers(prev=>prev.filter(m=>m.id!==memberId));
  };

  const filtered = useMemo(()=>
    members.filter(m=>
      !search ||
      (m.profiles?.full_name||'').toLowerCase().includes(search.toLowerCase()) ||
      (m.profiles?.email||'').toLowerCase().includes(search.toLowerCase()) ||
      (m.user_code||'').toLowerCase().includes(search.toLowerCase()) ||
      m.role.toLowerCase().includes(search.toLowerCase())
    ),[members, search]);

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
    { key:'user_code', label:'Code',   render:v=><span className="font-mono text-xs text-[#2D5016] font-semibold">{v||'—'}</span> },
    { key:'role',      label:'Role',   render:v=><RoleBadge role={v}/> },
    { key:'is_active', label:'Status', render:(v,row)=>{
        const active = v!==false;
        return <span className={`badge ${active?'badge-green':'badge-red'}`}>{active?'Active':'Inactive'}</span>;
      }},
    { key:'joined_at', label:'Joined', render:v=>v?formatDate(v):'—' },
    { key:'id', label:'Actions', render:(_,row)=>(
        <div className="flex gap-1 items-center">
          {row.user_id===user?.id
            ? <span className="text-[10px] text-gray-400">You</span>
            : isOwnerOrAdmin && <>
                <button onClick={()=>setEditMember(row)}
                  className="btn btn-secondary py-1 px-2 text-xs" title="Edit role">
                  <Edit size={11}/> Role
                </button>
                <button
                  onClick={()=>toggleActive(row)}
                  disabled={togglingId===row.id}
                  className={`btn py-1 px-2 text-xs btn-secondary ${row.is_active!==false?'text-amber-600':'text-green-600'}`}
                  title={row.is_active!==false?'Deactivate':'Activate'}>
                  {togglingId===row.id?'…':row.is_active!==false?'Deactivate':'Activate'}
                </button>
                <button onClick={()=>removeMember(row.id,row.user_id)}
                  className="btn btn-secondary py-1 px-2 text-xs text-red-500" title="Remove">
                  <UserX size={11}/>
                </button>
              </>
          }
        </div>)},
  ];

  const active   = members.filter(m=>m.is_active!==false).length;
  const inactive = members.filter(m=>m.is_active===false).length;

  return (
    <div className="page-content">
      <PageHeader title="Team Management"
        subtitle={`${members.length} members · ${farm?.name||''}`}
        actions={
          <div className="flex gap-2">
            {isOwnerOrAdmin && (
              <button onClick={()=>setShowAdd(true)} className="btn btn-primary">
                <Plus size={15}/>Add Member
              </button>
            )}
            <button onClick={()=>setConfirmLogout(true)}
              className="btn btn-secondary text-red-600 border-red-200 hover:bg-red-50">
              <LogOut size={14}/>Log Out
            </button>
          </div>
        }
      />

      <StatGrid cols={4}>
        <KPICard label="Total Members"     value={members.length} icon="👥"/>
        <KPICard label="Active"            value={active}         icon="✅"/>
        <KPICard label="Inactive"          value={inactive}       icon="⏸️" color={inactive>0?'#d97706':undefined}/>
        <KPICard label="Admins & Managers" value={members.filter(m=>['admin','manager'].includes(m.role)).length} icon="🛡️"/>
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
              value={search} onChange={e=>setSearch(e.target.value)}/>
          </div>
          <div className="card">
            {loading
              ? <div className="text-center py-10">
                  <div className="w-8 h-8 border-4 border-[#2D5016] border-t-transparent rounded-full animate-spin mx-auto mb-3"/>
                  <p className="text-sm text-gray-400">Loading members…</p>
                </div>
              : filtered.length===0
                ? <div className="text-center py-12">
                    <p className="text-4xl mb-3">👥</p>
                    <p className="text-sm text-gray-500 mb-1">{members.length===0?'No team members yet':'No members match your search'}</p>
                    {members.length===0 && isOwnerOrAdmin && (
                      <button onClick={()=>setShowAdd(true)} className="btn btn-primary mt-3">
                        <Plus size={14}/>Add First Member
                      </button>
                    )}
                  </div>
                : <DataTable columns={memberCols} rows={filtered} emptyText=""/>}
          </div>
        </>
      )}

      {tab==='permissions' && (
        <div className="card">
          <p className="text-xs text-gray-500 mb-3">Default permissions per role. You can change a member's role using the Edit Role button.</p>
          <PermissionsTable/>
        </div>
      )}

      {/* Add member modal */}
      {showAdd && (
        <Modal open title="Add Team Member" subtitle="No email invite required" onClose={()=>setShowAdd(false)} size="lg">
          <AddMemberForm farmId={farm?.id} onClose={()=>setShowAdd(false)} onAdded={loadData}/>
        </Modal>
      )}

      {/* Edit role modal */}
      {editMember && (
        <Modal open title="Edit Member Role" onClose={()=>setEditMember(null)}>
          <EditRoleModal member={editMember} onClose={()=>setEditMember(null)} onSaved={loadData}/>
        </Modal>
      )}

      {/* Logout confirmation */}
      {confirmLogout && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm text-center shadow-2xl">
            <div className="text-4xl mb-3">👋</div>
            <h3 className="font-bold text-gray-900 text-lg mb-2">Log out?</h3>
            <p className="text-sm text-gray-500 mb-5">Any unsynced data is saved locally and will sync when you log back in.</p>
            <div className="flex gap-3">
              <button onClick={()=>setConfirmLogout(false)} className="btn btn-secondary flex-1">Stay</button>
              <button onClick={signOut} className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold text-sm">Log Out</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
