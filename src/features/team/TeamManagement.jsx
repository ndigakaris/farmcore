// src/features/team/TeamManagement.jsx
// ─────────────────────────────────────────────────────────────
// Team & Roles — rebuilt.
//   • Add member: auto-detects existing FarmCore accounts; for new people
//     the admin sets a temporary password (created server-side on Vercel).
//   • Edit member: change name/phone/role/status + reset their password.
//   • Roles: fixed system roles (with sensible default permissions) plus
//     custom roles with granular per-feature permissions.
// Backed by team-schema.sql (profiles.email, farm_users.user_code/is_active/
// status, farm_roles table + RLS).
// ─────────────────────────────────────────────────────────────
import { useState, useEffect, useMemo, useCallback } from 'react';
import supabase from '../../services/supabase.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { Modal, KPICard, StatGrid } from '../../components/UI.jsx';
import { formatDate, getInitials, cn } from '../../utils/index.js';
import { Plus, Search, LogOut, Edit2, Trash2, UserX, Check, X,
         ChevronDown, ChevronUp, Save, KeyRound, Copy, RefreshCw } from 'lucide-react';

// ── Permission catalogue ──────────────────────────────────────
const ALL_PERMISSIONS = [
  { group:'Farm Operations', items:['animals','production','health','reproduction','feed','crops'] },
  { group:'Business',        items:['finance','employees','procurement','assets'] },
  { group:'Management',      items:['calendar','reports','lab','notifications'] },
  { group:'Admin',           items:['team','settings'] },
];
const ALL_PERM_KEYS = ALL_PERMISSIONS.flatMap(g => g.items);

// Default permission sets for the fixed roles. These give the roles real
// meaning and serve as the basis for app-wide enforcement later.
const SYSTEM_ROLE_PERMISSIONS = {
  owner:   ALL_PERM_KEYS,
  admin:   ALL_PERM_KEYS,
  manager: ['animals','production','health','reproduction','feed','crops',
            'finance','employees','procurement','assets','calendar','reports','lab','notifications'],
  worker:  ['animals','production','health','reproduction','feed','crops','calendar','notifications'],
  vet:     ['animals','health','reproduction','lab','calendar','notifications'],
  viewer:  ['reports','notifications'],
};

const SYSTEM_ROLES = {
  owner:   { label:'Owner',        color:'bg-purple-100 text-purple-700' },
  admin:   { label:'Admin',        color:'bg-blue-100 text-blue-700' },
  manager: { label:'Farm Manager', color:'bg-green-100 text-green-700' },
  worker:  { label:'Farm Worker',  color:'bg-amber-100 text-amber-700' },
  vet:     { label:'Vet',          color:'bg-red-100 text-red-700' },
  viewer:  { label:'Viewer',       color:'bg-gray-100 text-gray-600' },
};

// Roles an admin can assign (owner is unique to the farm creator).
const ASSIGNABLE_SYSTEM_ROLES = Object.entries(SYSTEM_ROLES).filter(([k]) => k !== 'owner');

const STATUS_BADGE = {
  active:    'bg-green-100 text-green-700',
  pending:   'bg-amber-100 text-amber-700',
  suspended: 'bg-red-100 text-red-700',
  inactive:  'bg-gray-100 text-gray-500',
};

// Resolve the effective permission list for any role (system or custom).
export function getRolePermissions(role, customRoles = []) {
  if (SYSTEM_ROLE_PERMISSIONS[role]) return SYSTEM_ROLE_PERMISSIONS[role];
  return customRoles.find(r => r.id === role)?.permissions || [];
}
export function roleHasPermission(role, perm, customRoles = []) {
  return getRolePermissions(role, customRoles).includes(perm);
}
export const FARM_ROLES = SYSTEM_ROLES;
export function InviteAcceptPage() { return null; }

const genPassword = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
};

// Next member code = one above the highest existing W### in THIS farm.
// Count-based codes repeat after a member is removed, which collides with the
// unique index — this never reuses a number.
function nextUserCode(members = []) {
  const max = members
    .map(m => /^W(\d+)$/i.exec(m.user_code || ''))
    .filter(Boolean)
    .reduce((hi, x) => Math.max(hi, parseInt(x[1], 10)), 0);
  return `W${String(max + 1).padStart(3, '0')}`;
}
const isLocalhost = () =>
  typeof window !== 'undefined' &&
  ['localhost', '127.0.0.1'].includes(window.location.hostname);

// ── Small presentational bits ─────────────────────────────────
function RolePill({ role, customRoles }) {
  const sys = SYSTEM_ROLES[role];
  if (sys) return <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', sys.color)}>{sys.label}</span>;
  const custom = customRoles?.find(r => r.id === role);
  return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">{custom?.name || role}</span>;
}
function StatusPill({ status }) {
  const s = status || 'active';
  return <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium capitalize', STATUS_BADGE[s] || STATUS_BADGE.active)}>{s}</span>;
}
function CopyField({ label, value }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { /* clipboard unavailable */ }
  };
  return (
    <div className="flex items-center justify-between bg-[#F5F0E8] rounded-lg px-3 py-2">
      <div className="min-w-0">
        <p className="text-[10px] uppercase font-semibold text-gray-500">{label}</p>
        <p className="text-sm font-mono text-[#1a3009] truncate">{value}</p>
      </div>
      <button onClick={copy} className="btn btn-secondary py-1 px-2 text-xs flex-shrink-0">
        {copied ? <><Check size={12}/>Copied</> : <><Copy size={12}/>Copy</>}
      </button>
    </div>
  );
}

// ── Add / Edit Member ─────────────────────────────────────────
function MemberModal({ farmId, member, customRoles, nextCode, currentUserId, onClose, onSaved }) {
  const isEdit = !!member;
  const isOwnerRow = member?.role === 'owner';

  const [form, setForm] = useState({
    email:    member?.profiles?.email || '',
    fullName: member?.profiles?.full_name || '',
    phone:    member?.profiles?.phone || '',
    password: '',
    role:     member?.role || 'worker',
    status:   member?.status || 'active',
  });
  // lookup: null = not checked, {found:true,id} = existing, {found:false} = new
  const [lookup,   setLookup]   = useState(isEdit ? { found: true, id: member.user_id } : null);
  const [checking, setChecking] = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');
  const [created,  setCreated]  = useState(null); // {email, password} after a new account is made
  const [done,     setDone]     = useState(false);

  // password-reset (edit mode)
  const [resetOpen, setResetOpen] = useState(false);
  const [resetPw,   setResetPw]   = useState('');
  const [resetDone, setResetDone] = useState(false);

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const isNewUser = !isEdit && lookup && !lookup.found;

  const lookupEmail = useCallback(async () => {
    const email = form.email.trim().toLowerCase();
    if (!email || isEdit) return;
    setChecking(true); setError(''); setLookup(null);
    try {
      // already in this farm?
      const { data: inFarm } = await supabase
        .from('farm_users').select('id, profiles(email)').eq('farm_id', farmId);
      const taken = (inFarm || []).map(m => m.profiles?.email?.toLowerCase()).filter(Boolean);
      if (taken.includes(email)) { setError('That email is already a member of this farm.'); return; }

      const { data } = await supabase
        .from('profiles').select('id, full_name, phone, email')
        .eq('email', email).maybeSingle();

      if (data) {
        setLookup({ found: true, id: data.id });
        setForm(p => ({ ...p, fullName: data.full_name || p.fullName, phone: data.phone || p.phone }));
      } else {
        setLookup({ found: false });
      }
    } catch (e) { console.warn('[Team] lookup:', e.message); setError('Could not check that email. Try again.'); }
    finally { setChecking(false); }
  }, [form.email, farmId, isEdit]);

  const handleSave = async () => {
    if (!isEdit) {
      if (!form.email.trim())    { setError('Email is required'); return; }
      if (!lookup)               { setError('Press Enter or the search button to check the email first'); return; }
    }
    if (!form.fullName.trim())   { setError('Full name is required'); return; }

    setSaving(true); setError('');
    try {
      if (isEdit) {
        await supabase.from('profiles')
          .update({ full_name: form.fullName, phone: form.phone, updated_at: new Date().toISOString() })
          .eq('id', member.user_id);
        await supabase.from('farm_users')
          .update({
            // never reassign the owner's role from here
            role: isOwnerRow ? member.role : form.role,
            status: form.status,
            is_active: form.status === 'active',
          })
          .eq('id', member.id);
        setDone(true); onSaved();
        return;
      }

      const code = nextCode;

      if (lookup.found) {
        // Existing account → just link to this farm.
        const { error: e } = await supabase.from('farm_users').insert({
          farm_id: farmId, user_id: lookup.id, role: form.role,
          invited_by: currentUserId, user_code: code, is_active: true, status: 'active',
        });
        if (e) throw e;
        setDone(true); onSaved();
      } else {
        // New account → server-side create (needs Vercel + service-role key).
        if (!form.password || form.password.length < 8) {
          setError('Password must be at least 8 characters'); return;
        }
        if (isLocalhost()) {
          setError('Creating brand-new accounts only works on the deployed (Vercel) site. On localhost, add someone who already has a FarmCore account.');
          return;
        }
        const res = await fetch('/api/create-user', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: form.email.trim(), password: form.password, fullName: form.fullName,
            farmId, role: form.role, invitedBy: currentUserId, userCode: code,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to create the account');
        // Show the credentials so the admin can share them.
        setCreated({ email: form.email.trim(), password: form.password });
        onSaved();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resetPw || resetPw.length < 8) { setError('New password must be at least 8 characters'); return; }
    if (isLocalhost()) { setError('Password reset only works on the deployed (Vercel) site.'); return; }
    setSaving(true); setError('');
    try {
      const res = await fetch('/api/reset-member-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: member.user_id, password: resetPw, farmId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reset password');
      setResetDone(true);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  // ── Success: brand-new account created ──────────────────────
  if (created) return (
    <div className="space-y-4 py-2">
      <div className="text-center space-y-1">
        <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto">
          <Check size={28} className="text-green-600"/>
        </div>
        <p className="font-semibold text-gray-900">Account created</p>
        <p className="text-sm text-gray-500">Share these details with {form.fullName}. They can change the password after signing in.</p>
      </div>
      <CopyField label="Email" value={created.email}/>
      <CopyField label="Temporary password" value={created.password}/>
      <button onClick={onClose} className="btn btn-primary w-full justify-center">Done</button>
    </div>
  );

  // ── Success: profile saved (edit) ───────────────────────────
  if (done) return (
    <div className="text-center py-8 space-y-3">
      <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto">
        <Check size={28} className="text-green-600"/>
      </div>
      <p className="font-semibold text-gray-900">Saved</p>
      <p className="text-sm text-gray-500">{form.fullName} has been updated.</p>
      <button onClick={onClose} className="btn btn-primary px-8">Done</button>
    </div>
  );

  return (
    <div className="space-y-5">
      {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>}

      {/* Email */}
      <div>
        <label className="form-label">Email Address<span className="text-red-500">*</span></label>
        <div className="flex gap-2">
          <input className="form-input flex-1" type="email" value={form.email} readOnly={isEdit}
            onChange={e => { f('email', e.target.value); setLookup(null); setError(''); }}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); lookupEmail(); } }}
            onBlur={() => { if (!isEdit && form.email.trim() && !lookup) lookupEmail(); }}
            placeholder="james@email.com"/>
          {!isEdit && (
            <button onClick={lookupEmail} disabled={!form.email.trim() || checking}
              className="btn btn-secondary px-3" title="Check this email">
              {checking
                ? <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"/>
                : <Search size={14}/>}
            </button>
          )}
        </div>
        {!isEdit && lookup?.found && (
          <p className="text-xs text-green-700 mt-1 bg-green-50 px-3 py-1.5 rounded-lg">✅ Existing FarmCore account found — they'll be added directly, no password needed.</p>
        )}
        {isNewUser && (
          <p className="text-xs text-amber-700 mt-1 bg-amber-50 px-3 py-1.5 rounded-lg">⚠️ No account found. Set a name and temporary password to create one.</p>
        )}
      </div>

      {/* Name & phone */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="form-label">Full Name<span className="text-red-500">*</span></label>
          <input className="form-input" value={form.fullName} onChange={e => f('fullName', e.target.value)} placeholder="James Mwangi"/>
        </div>
        <div>
          <label className="form-label">Phone <span className="text-gray-400 text-xs">(optional)</span></label>
          <input className="form-input" value={form.phone} onChange={e => f('phone', e.target.value)} placeholder="0712 345 678"/>
        </div>
      </div>

      {/* Temp password — new accounts only */}
      {isNewUser && (
        <div>
          <label className="form-label">Temporary Password <span className="text-gray-400 text-xs">(min 8 characters)</span></label>
          <div className="flex gap-2">
            <input className="form-input flex-1" type="text" value={form.password}
              onChange={e => f('password', e.target.value)} placeholder="Create a password for them"/>
            <button type="button" onClick={() => f('password', genPassword())}
              className="btn btn-secondary px-3" title="Generate a password">
              <RefreshCw size={14}/>
            </button>
          </div>
          <p className="text-[11px] text-gray-400 mt-1">You'll be able to copy and share this after creating the account.</p>
        </div>
      )}

      {/* Role */}
      <div>
        <label className="form-label">Role<span className="text-red-500">*</span></label>
        {isOwnerRow ? (
          <div className="form-input bg-gray-50 text-gray-500 flex items-center">Owner · cannot be changed</div>
        ) : (
          <select className="form-input" value={form.role} onChange={e => f('role', e.target.value)}>
            <optgroup label="System Roles">
              {ASSIGNABLE_SYSTEM_ROLES.map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </optgroup>
            {customRoles?.length > 0 && (
              <optgroup label="Custom Roles">
                {customRoles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </optgroup>
            )}
          </select>
        )}
      </div>

      {/* Status — edit only */}
      {isEdit && !isOwnerRow && (
        <div>
          <label className="form-label">Status</label>
          <select className="form-input" value={form.status} onChange={e => f('status', e.target.value)}>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      )}

      {/* Password reset — edit only */}
      {isEdit && (
        <div className="border-t border-[#e8e0d0] pt-4">
          {!resetOpen ? (
            <button onClick={() => { setResetOpen(true); setResetPw(genPassword()); }}
              className="btn btn-secondary text-sm"><KeyRound size={14}/>Reset password</button>
          ) : resetDone ? (
            <div className="space-y-3">
              <p className="text-sm text-green-700">Password updated. Share the new one:</p>
              <CopyField label="New password" value={resetPw}/>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="form-label">New temporary password</label>
              <div className="flex gap-2">
                <input className="form-input flex-1" type="text" value={resetPw}
                  onChange={e => setResetPw(e.target.value)} placeholder="Min 8 characters"/>
                <button type="button" onClick={() => setResetPw(genPassword())} className="btn btn-secondary px-3"><RefreshCw size={14}/></button>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setResetOpen(false)} className="btn btn-secondary text-sm flex-1">Cancel</button>
                <button onClick={handleResetPassword} disabled={saving} className="btn btn-primary text-sm flex-1">
                  {saving ? 'Saving…' : 'Set password'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end gap-3 pt-2 border-t border-[#e8e0d0]">
        <button onClick={onClose} className="btn btn-secondary">Cancel</button>
        <button onClick={handleSave} disabled={saving} className="btn btn-primary">
          {saving ? 'Saving…' : isEdit ? <><Save size={14}/>Save Changes</> : <><Plus size={14}/>Add Member</>}
        </button>
      </div>
    </div>
  );
}

// ── Role editor ───────────────────────────────────────────────
function RoleModal({ farmId, role, currentUserId, onClose, onSaved }) {
  const isEdit = !!role;
  const [name,  setName]  = useState(role?.name || '');
  const [desc,  setDesc]  = useState(role?.description || '');
  const [perms, setPerms] = useState(new Set(role?.permissions || []));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(new Set(ALL_PERMISSIONS.map(g => g.group)));

  const togglePerm = (p) => setPerms(prev => { const s = new Set(prev); s.has(p) ? s.delete(p) : s.add(p); return s; });
  const toggleGroup = (items) => {
    const allOn = items.every(p => perms.has(p));
    setPerms(prev => { const s = new Set(prev); items.forEach(p => allOn ? s.delete(p) : s.add(p)); return s; });
  };
  const toggleExpand = (g) => setExpanded(prev => { const s = new Set(prev); s.has(g) ? s.delete(g) : s.add(g); return s; });

  const handleSave = async () => {
    if (!name.trim()) { setError('Role name is required'); return; }
    if (perms.size === 0) { setError('Pick at least one permission'); return; }
    setSaving(true); setError('');
    try {
      const payload = {
        name: name.trim(), description: desc.trim(),
        permissions: Array.from(perms), farm_id: farmId, created_by: currentUserId,
      };
      const { error: e } = isEdit
        ? await supabase.from('farm_roles').update(payload).eq('id', role.id)
        : await supabase.from('farm_roles').insert(payload);
      if (e) throw e;
      onSaved(); onClose();
    } catch (err) {
      setError(err.message?.includes('duplicate') ? 'A role with that name already exists.' : err.message);
    } finally { setSaving(false); }
  };

  const allSelected = ALL_PERM_KEYS.every(p => perms.has(p));

  return (
    <div className="space-y-4">
      {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>}
      <div>
        <label className="form-label">Role Name<span className="text-red-500">*</span></label>
        <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Dairy Supervisor"/>
      </div>
      <div>
        <label className="form-label">Description</label>
        <input className="form-input" value={desc} onChange={e => setDesc(e.target.value)} placeholder="What does this role do?"/>
      </div>

      <div className="border border-[#e8e0d0] rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-[#F5F0E8] border-b border-[#e8e0d0]">
          <span className="text-sm font-semibold text-[#1a3009]">Permissions</span>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">{perms.size} of {ALL_PERM_KEYS.length} selected</span>
            <label className="flex items-center gap-1.5 text-xs text-[#2D5016] cursor-pointer">
              <input type="checkbox" checked={allSelected}
                onChange={() => setPerms(allSelected ? new Set() : new Set(ALL_PERM_KEYS))}
                className="w-3.5 h-3.5 accent-[#2D5016]"/>
              Select all
            </label>
          </div>
        </div>
        {ALL_PERMISSIONS.map(group => {
          const groupSelected = group.items.filter(p => perms.has(p)).length;
          const isExpanded = expanded.has(group.group);
          return (
            <div key={group.group} className="border-b border-[#e8e0d0] last:border-0">
              <button onClick={() => toggleExpand(group.group)}
                className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-[#F5F0E8]/60 transition-colors">
                <div className="flex items-center gap-3">
                  <input type="checkbox" checked={group.items.every(p => perms.has(p))}
                    onChange={() => toggleGroup(group.items)} className="w-3.5 h-3.5 accent-[#2D5016]"
                    onClick={e => e.stopPropagation()}/>
                  <span className="text-sm font-medium text-gray-700">{group.group}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">{groupSelected}/{group.items.length}</span>
                  {isExpanded ? <ChevronUp size={14} className="text-gray-400"/> : <ChevronDown size={14} className="text-gray-400"/>}
                </div>
              </button>
              {isExpanded && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 px-4 py-3 bg-white border-t border-[#e8e0d0]/50">
                  {group.items.map(p => (
                    <label key={p} className={cn('flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-xs capitalize transition-all',
                      perms.has(p) ? 'bg-[#2D5016] text-white border-[#2D5016]' : 'bg-white border-[#e8e0d0] text-gray-600 hover:border-[#2D5016]')}>
                      <input type="checkbox" checked={perms.has(p)} onChange={() => togglePerm(p)} className="sr-only"/>
                      {perms.has(p) && <Check size={9}/>}{p}
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
          {saving ? 'Saving…' : isEdit ? 'Save Role' : 'Add Role'}
        </button>
      </div>
    </div>
  );
}

// ── Member row ────────────────────────────────────────────────
function MemberRow({ member, customRoles, isMe, canManage, onEdit, onRemove }) {
  const name = member.profiles?.full_name || 'Unnamed';
  const email = member.profiles?.email || '';
  const isOwner = member.role === 'owner';
  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[#eef5dd] flex items-center justify-center text-xs font-bold text-[#2D5016] flex-shrink-0">
            {getInitials(name)}
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">{name}{isMe && <span className="ml-1 text-[10px] text-gray-400">(you)</span>}</p>
            <p className="text-xs text-gray-400">{email}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3"><StatusPill status={member.status || 'active'}/></td>
      <td className="px-4 py-3 text-xs font-mono text-[#2D5016]">{member.user_code || '—'}</td>
      <td className="px-4 py-3"><RolePill role={member.role} customRoles={customRoles}/></td>
      <td className="px-4 py-3 text-xs text-gray-400">{member.joined_at ? formatDate(member.joined_at) : '—'}</td>
      <td className="px-4 py-3">
        {canManage && !isOwner && (
          <div className="flex gap-1">
            <button onClick={() => onEdit(member)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-[#2D5016] transition-colors" title="Edit member"><Edit2 size={13}/></button>
            {!isMe && <button onClick={() => onRemove(member)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors" title="Remove member"><UserX size={13}/></button>}
          </div>
        )}
      </td>
    </tr>
  );
}

// ── Main ──────────────────────────────────────────────────────
export default function TeamManagement() {
  const { farm, farmUser, user, signOut } = useAuth();
  const [tab, setTab] = useState('members');
  const [members, setMembers] = useState([]);
  const [customRoles, setCustomRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showMember, setShowMember] = useState(false);
  const [editMember, setEditMember] = useState(null);
  const [showRole, setShowRole] = useState(false);
  const [editRole, setEditRole] = useState(null);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [confirm, setConfirm] = useState(null); // {message, action}

  const isOwnerOrAdmin = ['owner', 'admin'].includes(farmUser?.role);

  const loadData = useCallback(async () => {
    if (!farm?.id) return;
    setLoading(true);
    try {
      const [{ data: membersData }, { data: rolesData }] = await Promise.all([
        supabase.from('farm_users')
          .select('*, profiles(full_name, email, phone, avatar_url)')
          .eq('farm_id', farm.id).order('joined_at', { ascending: false }),
        supabase.from('farm_roles').select('*').eq('farm_id', farm.id).order('name'),
      ]);
      setMembers(membersData || []);
      setCustomRoles(rolesData || []);
    } catch (e) { console.warn('[Team] load:', e.message); }
    finally { setLoading(false); }
  }, [farm?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  const removeMember = (member) => setConfirm({
    message: `Remove ${member.profiles?.full_name || 'this member'} from ${farm?.name}? They lose access to this farm but their account stays.`,
    action: async () => {
      await supabase.from('farm_users').delete().eq('id', member.id);
      setMembers(prev => prev.filter(m => m.id !== member.id));
      setConfirm(null);
    },
  });
  const deleteRole = (role) => setConfirm({
    message: `Delete role "${role.name}"? Members on this role keep access until reassigned.`,
    action: async () => {
      await supabase.from('farm_roles').delete().eq('id', role.id);
      setCustomRoles(prev => prev.filter(r => r.id !== role.id));
      setConfirm(null);
    },
  });

  const filtered = useMemo(() => members.filter(m => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      (m.profiles?.full_name || '').toLowerCase().includes(q) ||
      (m.profiles?.email || '').toLowerCase().includes(q) ||
      (m.user_code || '').toLowerCase().includes(q);
    const matchStatus = filterStatus === 'all' || (m.status || 'active') === filterStatus;
    return matchSearch && matchStatus;
  }), [members, search, filterStatus]);

  const counts = useMemo(() => ({
    total: members.length,
    active: members.filter(m => (m.status || 'active') === 'active').length,
    suspended: members.filter(m => m.status === 'suspended').length,
  }), [members]);

  const roleUsage = useMemo(() => {
    const map = {};
    members.forEach(m => { map[m.role] = (map[m.role] || 0) + 1; });
    return map;
  }, [members]);

  return (
    <div className="page-content">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-[#1a3009]">Team Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">{farm?.name} · {counts.total} member{counts.total !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-2">
          {isOwnerOrAdmin && (
            <button onClick={() => { setEditMember(null); setShowMember(true); }} className="btn btn-primary">
              <Plus size={15}/>Add member
            </button>
          )}
          <button onClick={() => setConfirmLogout(true)} className="btn btn-secondary text-red-600 border-red-200 hover:bg-red-50">
            <LogOut size={14}/>Log out
          </button>
        </div>
      </div>

      <StatGrid cols={4}>
        <KPICard label="Total members" value={counts.total} icon="👥"/>
        <KPICard label="Active" value={counts.active} icon="✅"/>
        <KPICard label="Suspended" value={counts.suspended} icon="⏸️" color={counts.suspended > 0 ? '#d97706' : undefined}/>
        <KPICard label="Custom roles" value={customRoles.length} icon="🛡️"/>
      </StatGrid>

      <div className="flex gap-0 mb-0 border-b border-gray-200">
        {[['members', 'Members'], ['roles', 'Roles']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={cn('px-5 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px',
              tab === k ? 'border-[#2D5016] text-[#2D5016]' : 'border-transparent text-gray-500 hover:text-gray-700')}>
            {l}
          </button>
        ))}
      </div>

      {/* MEMBERS */}
      {tab === 'members' && (
        <div className="bg-white rounded-b-2xl border border-t-0 border-gray-200 overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
            <div className="relative flex-1 max-w-xs">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
              <input className="form-input pl-8 py-1.5 text-sm" placeholder="Search members…" value={search} onChange={e => setSearch(e.target.value)}/>
            </div>
            <select className="form-input py-1.5 text-sm w-36" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="inactive">Inactive</option>
            </select>
            <span className="text-xs text-gray-400 ml-auto">{filtered.length} of {members.length}</span>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <div className="w-8 h-8 border-4 border-[#2D5016] border-t-transparent rounded-full animate-spin mx-auto mb-3"/>
              <p className="text-sm text-gray-400">Loading members…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-4xl mb-3">👥</p>
              <p className="text-sm text-gray-500 mb-1">{members.length === 0 ? 'No members yet' : 'No members match your search'}</p>
              {members.length === 0 && isOwnerOrAdmin && (
                <button onClick={() => { setEditMember(null); setShowMember(true); }} className="btn btn-primary mt-3"><Plus size={14}/>Add first member</button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {['Member', 'Status', 'Code', 'Role', 'Joined', ''].map((h, i) => (
                      <th key={i} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(m => (
                    <MemberRow key={m.id} member={m} customRoles={customRoles}
                      isMe={m.user_id === user?.id} canManage={isOwnerOrAdmin}
                      onEdit={mm => { setEditMember(mm); setShowMember(true); }} onRemove={removeMember}/>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ROLES */}
      {tab === 'roles' && (
        <div className="bg-white rounded-b-2xl border border-t-0 border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">System Roles</p>
          </div>
          {Object.keys(SYSTEM_ROLES).map(k => (
            <div key={k} className="flex items-center justify-between px-4 py-3 border-b border-gray-100 hover:bg-gray-50">
              <div className="flex items-center gap-3">
                <RolePill role={k} customRoles={[]}/>
                <span className="text-xs text-gray-400">{roleUsage[k] || 0} member{roleUsage[k] !== 1 ? 's' : ''}</span>
              </div>
              <span className="text-xs text-gray-400">{getRolePermissions(k).length} permission{getRolePermissions(k).length !== 1 ? 's' : ''} · built-in</span>
            </div>
          ))}

          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Custom Roles</p>
            {isOwnerOrAdmin && (
              <button onClick={() => { setEditRole(null); setShowRole(true); }} className="btn btn-secondary py-1 px-3 text-xs"><Plus size={11}/>Add role</button>
            )}
          </div>
          {customRoles.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-sm text-gray-400 mb-3">No custom roles yet</p>
              {isOwnerOrAdmin && <button onClick={() => { setEditRole(null); setShowRole(true); }} className="btn btn-primary text-sm"><Plus size={13}/>Create first role</button>}
            </div>
          ) : customRoles.map(role => (
            <div key={role.id} className="flex items-center justify-between px-4 py-3.5 border-b border-gray-100 hover:bg-gray-50 last:border-0">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <p className="text-sm font-medium text-gray-900">{role.name}</p>
                  <span className="text-xs text-gray-400">{roleUsage[role.id] || 0} member{roleUsage[role.id] !== 1 ? 's' : ''}</span>
                </div>
                {role.description && <p className="text-xs text-gray-400">{role.description}</p>}
                <div className="flex flex-wrap gap-1 mt-2">
                  {(role.permissions || []).slice(0, 6).map(p => (
                    <span key={p} className="px-1.5 py-0.5 bg-[#eef5dd] text-[#2D5016] rounded text-[10px] capitalize">{p}</span>
                  ))}
                  {(role.permissions || []).length > 6 && (
                    <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded text-[10px]">+{role.permissions.length - 6} more</span>
                  )}
                </div>
              </div>
              {isOwnerOrAdmin && (
                <div className="flex gap-1 ml-4 flex-shrink-0">
                  <button onClick={() => { setEditRole(role); setShowRole(true); }} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-[#2D5016]"><Edit2 size={13}/></button>
                  <button onClick={() => deleteRole(role)} className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500"><Trash2 size={13}/></button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Member modal */}
      {showMember && (
        <Modal open title={editMember ? `Edit — ${editMember.profiles?.full_name || 'Member'}` : 'Add team member'}
          onClose={() => { setShowMember(false); setEditMember(null); }} size="lg">
          <MemberModal farmId={farm?.id} member={editMember} customRoles={customRoles}
            nextCode={nextUserCode(members)} currentUserId={user?.id}
            onClose={() => { setShowMember(false); setEditMember(null); loadData(); }} onSaved={loadData}/>
        </Modal>
      )}

      {/* Role modal */}
      {showRole && (
        <Modal open title={editRole ? `Edit role — ${editRole.name}` : 'Add role'}
          onClose={() => { setShowRole(false); setEditRole(null); }} size="lg">
          <RoleModal farmId={farm?.id} role={editRole} currentUserId={user?.id}
            onClose={() => { setShowRole(false); setEditRole(null); }} onSaved={loadData}/>
        </Modal>
      )}

      {/* Generic confirm */}
      {confirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <p className="text-sm text-gray-700 mb-5">{confirm.message}</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirm(null)} className="btn btn-secondary flex-1">Cancel</button>
              <button onClick={confirm.action} className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold text-sm">Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* Logout */}
      {confirmLogout && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm text-center shadow-2xl">
            <div className="text-4xl mb-3">👋</div>
            <h3 className="font-bold text-gray-900 text-lg mb-2">Log out of FarmCore?</h3>
            <p className="text-sm text-gray-500 mb-5">Unsynced data is saved locally and will sync when you log back in.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmLogout(false)} className="btn btn-secondary flex-1">Stay</button>
              <button onClick={signOut} className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold text-sm">Log Out</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
