// src/features/team/TeamManagement.jsx
// Shopify-style: Members list + Roles list + editable profiles
import { useState, useEffect, useMemo } from 'react';
import supabase from '../../services/supabase.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { canAddUser } from '../../services/license.js';
import { Modal, PageHeader, KPICard, StatGrid } from '../../components/UI.jsx';
import { formatDate, getInitials, cn } from '../../utils/index.js';
import { Plus, Search, LogOut, Edit2, Trash2, ChevronRight,
         Shield, Crown, Eye, Wrench, Stethoscope, UserX,
         Check, X, ChevronDown, ChevronUp, Save } from 'lucide-react';

// ── Constants ─────────────────────────────────────────────────
const ALL_PERMISSIONS = [
  { group:'Farm Operations', items:['animals','production','health','reproduction','feed','crops'] },
  { group:'Business',        items:['finance','employees','procurement','assets'] },
  { group:'Management',      items:['calendar','reports','lab','notifications'] },
  { group:'Admin',           items:['team','settings'] },
];

const STATUS_BADGE = {
  active:    'bg-green-100 text-green-700',
  pending:   'bg-amber-100 text-amber-700',
  suspended: 'bg-red-100 text-red-700',
  inactive:  'bg-gray-100 text-gray-500',
};

const SYSTEM_ROLES = {
  owner:   { label:'Owner',        color:'bg-purple-100 text-purple-700' },
  admin:   { label:'Admin',        color:'bg-blue-100 text-blue-700' },
  manager: { label:'Farm Manager', color:'bg-green-100 text-green-700' },
  worker:  { label:'Farm Worker',  color:'bg-amber-100 text-amber-700' },
  vet:     { label:'Vet',          color:'bg-red-100 text-red-700' },
  viewer:  { label:'Viewer',       color:'bg-gray-100 text-gray-600' },
};

function RolePill({ role, customRoles }) {
  const sys = SYSTEM_ROLES[role];
  if (sys) return <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', sys.color)}>{sys.label}</span>;
  const custom = customRoles?.find(r=>r.id===role);
  return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">{custom?.name||role}</span>;
}

function StatusPill({ status }) {
  const s = status||'active';
  return <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium capitalize', STATUS_BADGE[s]||STATUS_BADGE.active)}>{s}</span>;
}

// ── Add/Edit Member Modal ─────────────────────────────────────
function MemberModal({ farmId, member, customRoles, memberCount, license, currentUserId, onClose, onSaved }) {
  const isEdit = !!member;
  const [form, setForm] = useState({
    email:    member?.profiles?.email||'',
    fullName: member?.profiles?.full_name||'',
    phone:    member?.profiles?.phone||'',
    password: '',
    role:     member?.role||'worker',
    status:   member?.status||'active',
  });
  const [preview,  setPreview]  = useState(member ? { id:member.user_id, found:true } : null);
  const [checking, setChecking] = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');
  const [done,     setDone]     = useState(false);
  const f = (k,v) => setForm(p=>({...p,[k]:v}));

  const canAdd = canAddUser(license, memberCount);

  // Check if email exists
  const lookupEmail = async () => {
    if (!form.email.trim()) return;
    setChecking(true); setError(''); setPreview(null);
    try {
      // Check already in farm
      const { data: inFarm } = await supabase
        .from('farm_users')
        .select('id, profiles(email)')
        .eq('farm_id', farmId);
      const farmEmails = (inFarm||[]).map(m=>m.profiles?.email?.toLowerCase()).filter(Boolean);
      if (!isEdit && farmEmails.includes(form.email.toLowerCase())) {
        setError('This email is already a member of this farm.'); setChecking(false); return;
      }
      // Check in profiles
      const { data } = await supabase.from('profiles')
        .select('id, full_name, phone, email')
        .eq('email', form.email.toLowerCase().trim())
        .maybeSingle();
      if (data) {
        setPreview({ id:data.id, found:true });
        setForm(p=>({...p, fullName:data.full_name||p.fullName, phone:data.phone||p.phone}));
      } else {
        setPreview({ found:false });
      }
    } catch(e){ console.warn(e); }
    finally { setChecking(false); }
  };

  const handleSave = async () => {
    if (!form.email.trim())    { setError('Email is required'); return; }
    if (!form.fullName.trim()) { setError('Full name is required'); return; }
    if (!isEdit && !preview)   { setError('Click the search icon to verify the email first'); return; }
    if (!isEdit && !canAdd)    { setError('User limit reached. Upgrade your plan.'); return; }
    setSaving(true); setError('');
    try {
      if (isEdit) {
        // Update profile
        await supabase.from('profiles').update({
          full_name: form.fullName, phone: form.phone, updated_at:new Date()
        }).eq('id', member.user_id);
        // Update farm_users
        await supabase.from('farm_users').update({
          role: form.role, status: form.status, is_active: form.status==='active'
        }).eq('id', member.id);
        setDone(true); onSaved();
      } else {
        // Generate user code
        const code = `W${String(memberCount+1).padStart(3,'0')}`;

        if (preview?.found) {
          // Existing user — add directly to farm
          await supabase.from('farm_users').insert({
            farm_id: farmId, user_id: preview.id,
            role: form.role, invited_by: currentUserId,
            user_code: code, is_active: true, status:'active',
          });
        } else {
          // New user — call server-side API
          if (!form.password || form.password.length < 8) {
            setError('Password must be at least 8 characters'); setSaving(false); return;
          }
          const isLocal = window.location.hostname==='localhost'||window.location.hostname==='127.0.0.1';
          if (isLocal) {
            setError('Creating new users requires the app to be deployed on Vercel. On localhost, use the Search button to find an existing FarmCore user and add them directly.'); setSaving(false); return;
          }
          const res = await fetch('/api/create-user', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({
              email: form.email, password: form.password,
              fullName: form.fullName, farmId, role: form.role,
              invitedBy: currentUserId, userCode: code,
            })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error||'Failed to create user');
        }
        setDone(true); onSaved();
      }
    } catch(err) { setError(err.message); }
    finally { setSaving(false); }
  };

  if (done) return (
    <div className="text-center py-8 space-y-3">
      <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto">
        <Check size={28} className="text-green-600"/>
      </div>
      <p className="font-semibold text-gray-900">{isEdit?'Profile updated!':'Member added!'}</p>
      <p className="text-sm text-gray-500">{form.fullName} has been {isEdit?'updated':'added'} successfully.</p>
      <button onClick={onClose} className="btn btn-primary px-8">Done</button>
    </div>
  );

  return (
    <div className="space-y-5">
      {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>}

      {/* Email row */}
      <div>
        <label className="form-label">Email Address<span className="text-red-500">*</span></label>
        <div className="flex gap-2">
          <input className="form-input flex-1" type="email" value={form.email}
            readOnly={isEdit}
            onChange={e=>{ f('email',e.target.value); setPreview(null); setError(''); }}
            placeholder="james@email.com"/>
          {!isEdit && (
            <button onClick={lookupEmail} disabled={!form.email.trim()||checking}
              className="btn btn-secondary px-3" title="Search for existing account">
              {checking ? <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"/> : <Search size={14}/>}
            </button>
          )}
        </div>
        {!isEdit && preview?.found && <p className="text-xs text-green-700 mt-1 bg-green-50 px-3 py-1.5 rounded-lg">✅ Existing FarmCore account found — will be added directly, no password needed.</p>}
        {!isEdit && preview && !preview.found && <p className="text-xs text-amber-700 mt-1 bg-amber-50 px-3 py-1.5 rounded-lg">⚠️ No account found. Fill in name and password to create a new account.</p>}
      </div>

      {/* Name & Phone */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="form-label">Full Name<span className="text-red-500">*</span></label>
          <input className="form-input" value={form.fullName} onChange={e=>f('fullName',e.target.value)} placeholder="James Mwangi"/>
        </div>
        <div>
          <label className="form-label">Phone <span className="text-gray-400 text-xs">(optional)</span></label>
          <input className="form-input" value={form.phone} onChange={e=>f('phone',e.target.value)} placeholder="0712 345 678"/>
        </div>
      </div>

      {/* Password — only for new users without existing account */}
      {!isEdit && preview && !preview.found && (
        <div>
          <label className="form-label">Password <span className="text-gray-400 text-xs">(min 8 characters)</span></label>
          <input className="form-input" type="password" value={form.password}
            onChange={e=>f('password',e.target.value)} placeholder="Create a password for them"/>
        </div>
      )}

      {/* Role */}
      <div>
        <label className="form-label">Role<span className="text-red-500">*</span></label>
        <select className="form-input" value={form.role} onChange={e=>f('role',e.target.value)}>
          <optgroup label="System Roles">
            {Object.entries(SYSTEM_ROLES).filter(([k])=>k!=='owner').map(([k,v])=>(
              <option key={k} value={k}>{v.label}</option>
            ))}
          </optgroup>
          {customRoles?.length > 0 && (
            <optgroup label="Custom Roles">
              {customRoles.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}
            </optgroup>
          )}
        </select>
      </div>

      {/* Status — edit only */}
      {isEdit && (
        <div>
          <label className="form-label">Status</label>
          <select className="form-input" value={form.status} onChange={e=>f('status',e.target.value)}>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      )}

      <div className="flex justify-end gap-3 pt-2 border-t border-[#e8e0d0]">
        <button onClick={onClose} className="btn btn-secondary">Cancel</button>
        <button onClick={handleSave} disabled={saving||(!isEdit&&!canAdd)} className="btn btn-primary">
          {saving ? 'Saving…' : isEdit ? <><Save size={14}/>Save Changes</> : <><Plus size={14}/>Add Member</>}
        </button>
      </div>
    </div>
  );
}

// ── Role Editor Modal ─────────────────────────────────────────
function RoleModal({ farmId, role, currentUserId, onClose, onSaved }) {
  const isEdit = !!role;
  const [name,  setName]  = useState(role?.name||'');
  const [desc,  setDesc]  = useState(role?.description||'');
  const [perms, setPerms] = useState(new Set(role?.permissions||[]));
  const [saving,setSaving]= useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(new Set(ALL_PERMISSIONS.map(g=>g.group)));

  const togglePerm = (p) => setPerms(prev => {
    const s = new Set(prev);
    s.has(p) ? s.delete(p) : s.add(p);
    return s;
  });
  const toggleGroup = (items) => {
    const allOn = items.every(p=>perms.has(p));
    setPerms(prev => {
      const s = new Set(prev);
      items.forEach(p => allOn ? s.delete(p) : s.add(p));
      return s;
    });
  };
  const toggleExpand = (g) => setExpanded(prev => {
    const s = new Set(prev);
    s.has(g) ? s.delete(g) : s.add(g);
    return s;
  });

  const handleSave = async () => {
    if (!name.trim()) { setError('Role name is required'); return; }
    setSaving(true); setError('');
    try {
      const payload = {
        name: name.trim(), description: desc.trim(),
        permissions: Array.from(perms), farm_id: farmId,
        created_by: currentUserId,
      };
      if (isEdit) {
        const { error:e } = await supabase.from('farm_roles').update(payload).eq('id',role.id);
        if (e) throw e;
      } else {
        const { error:e } = await supabase.from('farm_roles').insert(payload);
        if (e) throw e;
      }
      onSaved(); onClose();
    } catch(err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const allItems = ALL_PERMISSIONS.flatMap(g=>g.items);
  const allSelected = allItems.every(p=>perms.has(p));
  const totalSelected = perms.size;

  return (
    <div className="space-y-4">
      {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>}
      <div>
        <label className="form-label">Role Name<span className="text-red-500">*</span></label>
        <input className="form-input" value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Dairy Supervisor"/>
      </div>
      <div>
        <label className="form-label">Description</label>
        <input className="form-input" value={desc} onChange={e=>setDesc(e.target.value)} placeholder="What does this role do?"/>
      </div>

      {/* Permissions */}
      <div className="border border-[#e8e0d0] rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-[#F5F0E8] border-b border-[#e8e0d0]">
          <span className="text-sm font-semibold text-[#1a3009]">Permissions</span>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">{totalSelected} of {allItems.length} selected</span>
            <label className="flex items-center gap-1.5 text-xs text-[#2D5016] cursor-pointer">
              <input type="checkbox" checked={allSelected}
                onChange={()=>{ if(allSelected) setPerms(new Set()); else setPerms(new Set(allItems)); }}
                className="w-3.5 h-3.5 accent-[#2D5016]"/>
              Select all
            </label>
          </div>
        </div>
        {ALL_PERMISSIONS.map(group=>{
          const groupSelected = group.items.filter(p=>perms.has(p)).length;
          const isExpanded = expanded.has(group.group);
          return (
            <div key={group.group} className="border-b border-[#e8e0d0] last:border-0">
              <button onClick={()=>toggleExpand(group.group)}
                className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-[#F5F0E8]/60 transition-colors">
                <div className="flex items-center gap-3">
                  <input type="checkbox"
                    checked={group.items.every(p=>perms.has(p))}
                    onChange={()=>toggleGroup(group.items)}
                    className="w-3.5 h-3.5 accent-[#2D5016]"
                    onClick={e=>e.stopPropagation()}/>
                  <span className="text-sm font-medium text-gray-700">{group.group}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">{groupSelected}/{group.items.length}</span>
                  {isExpanded ? <ChevronUp size={14} className="text-gray-400"/> : <ChevronDown size={14} className="text-gray-400"/>}
                </div>
              </button>
              {isExpanded && (
                <div className="grid grid-cols-3 gap-2 px-4 py-3 bg-white border-t border-[#e8e0d0]/50">
                  {group.items.map(p=>(
                    <label key={p} className={cn('flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-xs capitalize transition-all',
                      perms.has(p)?'bg-[#2D5016] text-white border-[#2D5016]':'bg-white border-[#e8e0d0] text-gray-600 hover:border-[#2D5016]')}>
                      <input type="checkbox" checked={perms.has(p)} onChange={()=>togglePerm(p)} className="sr-only"/>
                      {perms.has(p)&&<Check size={9}/>}
                      {p}
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex justify-end gap-3 pt-2 border-t border-[#e8e0d0]">
        <button onClick={onClose} className="btn btn-secondary">Cancel</button>
        <button onClick={handleSave} disabled={saving} className="btn btn-primary">
          {saving?'Saving…':isEdit?'Save Role':'Add Role'}
        </button>
      </div>
    </div>
  );
}

// ── Member Row ────────────────────────────────────────────────
function MemberRow({ member, customRoles, isMe, canManage, onEdit, onRemove }) {
  const name   = member.profiles?.full_name || 'Unnamed';
  const email  = member.profiles?.email || '';
  const status = member.status || 'active';

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[#eef5dd] flex items-center justify-center text-xs font-bold text-[#2D5016] flex-shrink-0">
            {getInitials(name)}
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">{name}{isMe&&<span className="ml-1 text-[10px] text-gray-400">(you)</span>}</p>
            <p className="text-xs text-gray-400">{email}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3"><StatusPill status={status}/></td>
      <td className="px-4 py-3 text-xs font-mono text-[#2D5016]">{member.user_code||'—'}</td>
      <td className="px-4 py-3"><RolePill role={member.role} customRoles={customRoles}/></td>
      <td className="px-4 py-3 text-xs text-gray-400">{member.joined_at?formatDate(member.joined_at):'—'}</td>
      <td className="px-4 py-3">
        {canManage && !isMe && (
          <div className="flex gap-1">
            <button onClick={()=>onEdit(member)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-[#2D5016] transition-colors" title="Edit member">
              <Edit2 size={13}/>
            </button>
            <button onClick={()=>onRemove(member)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors" title="Remove member">
              <UserX size={13}/>
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

// ── Main Component ────────────────────────────────────────────
export const FARM_ROLES = SYSTEM_ROLES;
export function InviteAcceptPage() { return null; }

export default function TeamManagement() {
  const { farm, farmUser, user, license, signOut } = useAuth();
  const [tab,          setTab]          = useState('members');
  const [members,      setMembers]      = useState([]);
  const [customRoles,  setCustomRoles]  = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showMember,   setShowMember]   = useState(false);
  const [editMember,   setEditMember]   = useState(null);
  const [showRole,     setShowRole]     = useState(false);
  const [editRole,     setEditRole]     = useState(null);
  const [confirmLogout,setConfirmLogout]= useState(false);

  const isOwnerOrAdmin = ['owner','admin'].includes(farmUser?.role);

  const loadData = async () => {
    if (!farm?.id) return;
    setLoading(true);
    try {
      const [{ data:membersData }, { data:rolesData }] = await Promise.all([
        supabase.from('farm_users')
          .select('*, profiles(full_name, email, phone, avatar_url)')
          .eq('farm_id', farm.id)
          .order('joined_at', { ascending:false }),
        supabase.from('farm_roles')
          .select('*')
          .eq('farm_id', farm.id)
          .order('name'),
      ]);
      setMembers(membersData||[]);
      setCustomRoles(rolesData||[]);
    } catch(e) { console.warn('Load error:', e.message); }
    finally { setLoading(false); }
  };

  useEffect(()=>{ loadData(); },[farm?.id]);

  const removeMember = async (member) => {
    if (!confirm(`Remove ${member.profiles?.full_name||'this member'} from ${farm?.name}?`)) return;
    await supabase.from('farm_users').delete().eq('id', member.id);
    setMembers(prev=>prev.filter(m=>m.id!==member.id));
  };

  const deleteRole = async (role) => {
    if (!confirm(`Delete role "${role.name}"? Members using this role will keep their access but role label will reset.`)) return;
    await supabase.from('farm_roles').delete().eq('id', role.id);
    setCustomRoles(prev=>prev.filter(r=>r.id!==role.id));
  };

  const filtered = useMemo(()=>
    members.filter(m=>{
      const matchSearch = !search ||
        (m.profiles?.full_name||'').toLowerCase().includes(search.toLowerCase()) ||
        (m.profiles?.email||'').toLowerCase().includes(search.toLowerCase()) ||
        (m.user_code||'').toLowerCase().includes(search.toLowerCase());
      const matchStatus = filterStatus==='all' || (m.status||'active')===filterStatus;
      return matchSearch && matchStatus;
    }),[members, search, filterStatus]);

  const counts = useMemo(()=>({
    total:     members.length,
    active:    members.filter(m=>(m.status||'active')==='active').length,
    suspended: members.filter(m=>m.status==='suspended').length,
    pending:   members.filter(m=>m.status==='pending').length,
  }),[members]);

  const roleUsage = useMemo(()=>{
    const map = {};
    members.forEach(m=>{ map[m.role]=(map[m.role]||0)+1; });
    return map;
  },[members]);

  return (
    <div className="page-content">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-[#1a3009]">Team Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">{farm?.name} · {counts.total} members</p>
        </div>
        <div className="flex gap-2">
          {isOwnerOrAdmin && (
            <button onClick={()=>{setEditMember(null);setShowMember(true);}} className="btn btn-primary">
              <Plus size={15}/>Add member
            </button>
          )}
          <button onClick={()=>setConfirmLogout(true)}
            className="btn btn-secondary text-red-600 border-red-200 hover:bg-red-50">
            <LogOut size={14}/>Log out
          </button>
        </div>
      </div>

      {/* Stats row */}
      <StatGrid cols={4}>
        <KPICard label="Total members" value={counts.total}     icon="👥"/>
        <KPICard label="Active"        value={counts.active}    icon="✅"/>
        <KPICard label="Suspended"     value={counts.suspended} icon="⏸️" color={counts.suspended>0?'#d97706':undefined}/>
        <KPICard label="Custom roles"  value={customRoles.length} icon="🛡️"/>
      </StatGrid>

      {/* Tabs */}
      <div className="flex gap-0 mb-0 border-b border-gray-200">
        {[['members','Members'],['roles','Roles']].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)}
            className={cn('px-5 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px',
              tab===k?'border-[#2D5016] text-[#2D5016]':'border-transparent text-gray-500 hover:text-gray-700')}>
            {l}
          </button>
        ))}
      </div>

      {/* ── MEMBERS TAB ──────────────────────────────────────── */}
      {tab==='members' && (
        <div className="bg-white rounded-b-2xl border border-t-0 border-gray-200 overflow-hidden">
          {/* Filters row */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
            <div className="relative flex-1 max-w-xs">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
              <input className="form-input pl-8 py-1.5 text-sm" placeholder="Search members…"
                value={search} onChange={e=>setSearch(e.target.value)}/>
            </div>
            <select className="form-input py-1.5 text-sm w-36"
              value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}>
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="pending">Pending</option>
            </select>
            <span className="text-xs text-gray-400 ml-auto">{filtered.length} of {members.length}</span>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <div className="w-8 h-8 border-4 border-[#2D5016] border-t-transparent rounded-full animate-spin mx-auto mb-3"/>
              <p className="text-sm text-gray-400">Loading members…</p>
            </div>
          ) : filtered.length===0 ? (
            <div className="text-center py-16">
              <p className="text-4xl mb-3">👥</p>
              <p className="text-sm text-gray-500 mb-1">{members.length===0?'No members yet':'No members match your search'}</p>
              {members.length===0 && isOwnerOrAdmin && (
                <button onClick={()=>setShowMember(true)} className="btn btn-primary mt-3"><Plus size={14}/>Add First Member</button>
              )}
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Member</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Code</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Role</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Joined</th>
                  <th className="px-4 py-2.5"/>
                </tr>
              </thead>
              <tbody>
                {filtered.map(m=>(
                  <MemberRow key={m.id} member={m} customRoles={customRoles}
                    isMe={m.user_id===user?.id} canManage={isOwnerOrAdmin}
                    onEdit={m=>{ setEditMember(m); setShowMember(true); }}
                    onRemove={removeMember}/>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── ROLES TAB ─────────────────────────────────────────── */}
      {tab==='roles' && (
        <div className="bg-white rounded-b-2xl border border-t-0 border-gray-200 overflow-hidden">
          {/* System roles */}
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">System Roles</p>
          </div>
          {Object.entries(SYSTEM_ROLES).map(([k,v])=>(
            <div key={k} className="flex items-center justify-between px-4 py-3 border-b border-gray-100 hover:bg-gray-50">
              <div className="flex items-center gap-3">
                <RolePill role={k} customRoles={[]}/>
                <span className="text-xs text-gray-400">{roleUsage[k]||0} member{roleUsage[k]!==1?'s':''}</span>
              </div>
              <span className="text-xs text-gray-400">Built-in · cannot be edited</span>
            </div>
          ))}

          {/* Custom roles header */}
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Custom Roles</p>
            {isOwnerOrAdmin && (
              <button onClick={()=>{setEditRole(null);setShowRole(true);}} className="btn btn-secondary py-1 px-3 text-xs">
                <Plus size={11}/>Add role
              </button>
            )}
          </div>
          {customRoles.length===0 ? (
            <div className="text-center py-10">
              <p className="text-sm text-gray-400 mb-3">No custom roles yet</p>
              {isOwnerOrAdmin && <button onClick={()=>setShowRole(true)} className="btn btn-primary text-sm"><Plus size={13}/>Create first role</button>}
            </div>
          ) : customRoles.map(role=>(
            <div key={role.id} className="flex items-center justify-between px-4 py-3.5 border-b border-gray-100 hover:bg-gray-50 last:border-0">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <p className="text-sm font-medium text-gray-900">{role.name}</p>
                  <span className="text-xs text-gray-400">{roleUsage[role.id]||0} member{roleUsage[role.id]!==1?'s':''}</span>
                </div>
                {role.description && <p className="text-xs text-gray-400">{role.description}</p>}
                <div className="flex flex-wrap gap-1 mt-2">
                  {(role.permissions||[]).slice(0,6).map(p=>(
                    <span key={p} className="px-1.5 py-0.5 bg-[#eef5dd] text-[#2D5016] rounded text-[10px] capitalize">{p}</span>
                  ))}
                  {(role.permissions||[]).length > 6 && (
                    <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded text-[10px]">+{role.permissions.length-6} more</span>
                  )}
                </div>
              </div>
              {isOwnerOrAdmin && (
                <div className="flex gap-1 ml-4 flex-shrink-0">
                  <button onClick={()=>{setEditRole(role);setShowRole(true);}}
                    className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-[#2D5016]">
                    <Edit2 size={13}/>
                  </button>
                  <button onClick={()=>deleteRole(role)}
                    className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500">
                    <Trash2 size={13}/>
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Member Modal */}
      {showMember && (
        <Modal open title={editMember?`Edit — ${editMember.profiles?.full_name||'Member'}`:'Add team member'}
          onClose={()=>{setShowMember(false);setEditMember(null);}} size="lg">
          <MemberModal farmId={farm?.id} member={editMember} customRoles={customRoles}
            memberCount={members.length} license={license} currentUserId={user?.id}
            onClose={()=>{setShowMember(false);setEditMember(null);}} onSaved={loadData}/>
        </Modal>
      )}

      {/* Add/Edit Role Modal */}
      {showRole && (
        <Modal open title={editRole?`Edit role — ${editRole.name}`:'Add role'}
          onClose={()=>{setShowRole(false);setEditRole(null);}} size="lg">
          <RoleModal farmId={farm?.id} role={editRole} currentUserId={user?.id}
            onClose={()=>{setShowRole(false);setEditRole(null);}} onSaved={loadData}/>
        </Modal>
      )}

      {/* Logout confirmation */}
      {confirmLogout && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm text-center shadow-2xl">
            <div className="text-4xl mb-3">👋</div>
            <h3 className="font-bold text-gray-900 text-lg mb-2">Log out of FarmCore?</h3>
            <p className="text-sm text-gray-500 mb-5">Unsynced data is saved locally and will sync when you log back in.</p>
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
