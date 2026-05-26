import { useState, useEffect, useMemo } from 'react';
import supabase from '../../services/supabase.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { TIERS } from '../../services/license.js';
import { KPICard, StatGrid, SectionCard, DataTable, Modal, PageHeader } from '../../components/UI.jsx';
import { formatDate, cn } from '../../utils/index.js';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { RefreshCw, Check, Ban, Zap, ChevronDown, LogOut, Settings } from 'lucide-react';

// ── ADMIN NAV ─────────────────────────────────────────────────
function AdminNav({ page, setPage, signOut }) {
  const NAV = [
    { id:'overview',  label:'Overview',     emoji:'📊' },
    { id:'farms',     label:'All Farms',    emoji:'🏡' },
    { id:'licenses',  label:'Licenses',     emoji:'🔑' },
    { id:'users',     label:'Users',        emoji:'👥' },
    { id:'revenue',   label:'Revenue',      emoji:'💰' },
  ];
  return (
    <div className="w-56 flex-shrink-0 flex flex-col h-full" style={{background:'#1a3009'}}>
      <div className="px-5 py-5 border-b border-white/10">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🌾</span>
          <div>
            <p style={{fontFamily:'Fraunces,serif'}} className="text-white font-semibold text-sm">FarmCore Admin</p>
            <p className="text-white/40 text-[10px]">Super Admin Console</p>
          </div>
        </div>
      </div>
      <div className="flex-1 py-3">
        {NAV.map(n=>(
          <button key={n.id} onClick={()=>setPage(n.id)}
            className={cn('w-full flex items-center gap-3 px-5 py-2.5 text-sm transition-all border-l-[3px] text-left',
              page===n.id?'bg-white/15 text-white border-[#C9A84C]':'text-white/60 border-transparent hover:bg-white/8 hover:text-white')}>
            <span>{n.emoji}</span>{n.label}
          </button>
        ))}
      </div>
      <div className="p-4 border-t border-white/10">
        <button onClick={signOut} className="flex items-center gap-2 text-white/50 hover:text-white text-xs transition-colors">
          <LogOut size={14}/> Sign out
        </button>
      </div>
    </div>
  );
}

// ── LICENSE ACTION MODAL ──────────────────────────────────────
function LicenseActionModal({ farm, license, open, onClose, onRefresh }) {
  const { user } = useAuth();
  const [form, setForm]     = useState({ tier: license?.tier || 'trial', status: license?.status || 'active', periodEnd: '', notes: '', amountKes: '' });
  const [loading, setLoading] = useState(false);
  const f = (k,v) => setForm(p=>({...p,[k]:v}));

  const handleSave = async () => {
    setLoading(true);
    try {
      const updates = {
        tier: form.tier,
        status: form.status,
        animal_limit: TIERS[form.tier]?.animalLimit === Infinity ? 999999 : (TIERS[form.tier]?.animalLimit || 50),
        user_limit:   TIERS[form.tier]?.userLimit   === Infinity ? 999999 : (TIERS[form.tier]?.userLimit   || 2),
        notes: form.notes,
        updated_at: new Date().toISOString(),
      };
      if (form.periodEnd)  updates.current_period_end = form.periodEnd;
      if (form.amountKes)  updates.amount_kes = parseInt(form.amountKes);

      await supabase.from('licenses').update(updates).eq('farm_id', farm.id);

      // Log event
      await supabase.from('license_events').insert({
        farm_id: farm.id,
        event_type: form.tier !== license.tier ? 'upgraded' : 'updated',
        old_tier: license.tier,
        new_tier: form.tier,
        amount_kes: parseInt(form.amountKes) || null,
        notes: form.notes,
        created_by: user?.id,
      });

      onRefresh();
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const suspendFarm = async () => {
    if (!confirm(`Suspend license for ${farm.name}?`)) return;
    await supabase.from('licenses').update({ status: 'suspended' }).eq('farm_id', farm.id);
    onRefresh(); onClose();
  };

  return (
    <Modal open={open} title={`Manage License — ${farm?.name}`} subtitle={`Current: ${license?.tier} · ${license?.status}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">License Tier</label>
            <select className="form-input" value={form.tier} onChange={e=>f('tier',e.target.value)}>
              {Object.entries(TIERS).map(([k,v])=><option key={k} value={k}>{v.emoji} {v.name}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Status</label>
            <select className="form-input" value={form.status} onChange={e=>f('status',e.target.value)}>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">Period End Date</label>
            <input className="form-input" type="date" value={form.periodEnd} onChange={e=>f('periodEnd',e.target.value)}/>
          </div>
          <div>
            <label className="form-label">Amount Paid (KES)</label>
            <input className="form-input" type="number" value={form.amountKes} onChange={e=>f('amountKes',e.target.value)} placeholder="e.g. 8000"/>
          </div>
        </div>
        <div>
          <label className="form-label">Notes (visible to admin only)</label>
          <textarea className="form-input resize-y min-h-[60px]" value={form.notes} onChange={e=>f('notes',e.target.value)} placeholder="Payment reference, special terms…"/>
        </div>
        <div className="flex items-center gap-3 pt-2 border-t border-[#e8e0d0]">
          <button onClick={suspendFarm} className="btn btn-danger text-xs">
            <Ban size={13}/>Suspend
          </button>
          <div className="flex-1"/>
          <button onClick={onClose} className="btn btn-secondary">Cancel</button>
          <button onClick={handleSave} disabled={loading} className="btn btn-primary">
            {loading?'Saving…':'Save Changes'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── MAIN ADMIN DASHBOARD ──────────────────────────────────────
export default function AdminDashboard() {
  const { signOut } = useAuth();
  const [page,     setPage]     = useState('overview');
  const [farms,    setFarms]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [editing,  setEditing]  = useState(null); // { farm, license }
  const [filter,   setFilter]   = useState('all');

  const loadFarms = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('admin_farms_overview')
      .select('*')
      .order('created_at', { ascending: false });
    setFarms(data || []);
    setLoading(false);
  };

  useEffect(() => { loadFarms(); }, []);

  // ── KPI calculations ───────────────────────────────────────
  const stats = useMemo(() => {
    const active    = farms.filter(f=>f.license_status==='active');
    const trial     = farms.filter(f=>f.tier==='trial');
    const paid      = farms.filter(f=>f.tier!=='trial'&&f.license_status==='active');
    const suspended = farms.filter(f=>f.license_status==='suspended');
    const expiring  = farms.filter(f=>{
      if(!f.current_period_end) return false;
      const d=Math.ceil((new Date(f.current_period_end)-new Date())/86400000);
      return d>=0&&d<=7;
    });
    const mrr = paid.reduce((s,f)=>s+(f.amount_kes||0),0);
    return { total:farms.length, active:active.length, trial:trial.length, paid:paid.length, suspended:suspended.length, expiring:expiring.length, mrr };
  }, [farms]);

  // ── Monthly growth chart ───────────────────────────────────
  const growthChart = useMemo(() => {
    const months = {};
    farms.forEach(f=>{
      const m = (f.created_at||'').slice(0,7);
      if (!months[m]) months[m]={month:m.slice(5),signups:0};
      months[m].signups++;
    });
    return Object.values(months).slice(-6);
  }, [farms]);

  const filteredFarms = useMemo(() => {
    if (filter==='all') return farms;
    if (filter==='trial') return farms.filter(f=>f.tier==='trial');
    if (filter==='paid') return farms.filter(f=>f.tier!=='trial');
    if (filter==='suspended') return farms.filter(f=>f.license_status==='suspended');
    if (filter==='expiring') return farms.filter(f=>{
      const d=f.current_period_end?Math.ceil((new Date(f.current_period_end)-new Date())/86400000):null;
      return d!=null&&d>=0&&d<=7;
    });
    return farms;
  }, [farms, filter]);

  const TOOLTIP = { contentStyle:{ fontSize:12, borderRadius:8, border:'1px solid #e8e0d0' } };

  const farmCols = [
    { key:'name',           label:'Farm',       render:v=><span className="font-semibold">{v}</span> },
    { key:'tier',           label:'Plan',       render:v=><span className={cn('badge', v==='enterprise'?'badge-purple':v==='professional'?'badge-blue':v==='starter'?'badge-green':'badge-gray')}>{TIERS[v]?.emoji} {TIERS[v]?.name||v}</span> },
    { key:'license_status', label:'Status',     render:v=><span className={cn('badge',v==='active'?'badge-green':v==='suspended'?'badge-red':'badge-gray')}>{v}</span> },
    { key:'animal_count',   label:'Animals',    render:v=><span className="font-mono">{v||0}</span> },
    { key:'user_count',     label:'Users',      render:v=><span className="font-mono">{v||0}</span> },
    { key:'current_period_end', label:'Expires', render:v=>{ if(!v)return'—'; const d=Math.ceil((new Date(v)-new Date())/86400000); return <span className={d<7?'text-red-600 font-semibold':d<30?'text-amber-600':''}>{d}d ({formatDate(v)})</span>; }},
    { key:'amount_kes',     label:'MRR (KES)',  render:v=>v?`KES ${v.toLocaleString()}`:'—' },
    { key:'created_at',     label:'Joined',     render:v=>formatDate(v) },
    { key:'id',             label:'',           render:(_,row)=>(
        <button className="btn btn-primary py-1 px-2 text-xs"
          onClick={async()=>{
            const { data: lic } = await supabase.from('licenses').select('*').eq('farm_id', row.id).single();
            setEditing({ farm: row, license: lic });
          }}>
          <Zap size={12}/>Manage
        </button>
      )},
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-[#F5F0E8]">
      <AdminNav page={page} setPage={setPage} signOut={signOut}/>

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Admin top bar */}
        <div className="bg-white border-b border-[#e8e0d0] px-5 h-12 flex items-center justify-between flex-shrink-0">
          <p style={{fontFamily:'Fraunces,serif'}} className="font-semibold text-[#2D5016] capitalize">
            {page === 'overview' ? '📊 Admin Overview' : page === 'farms' ? '🏡 All Farms' : page === 'licenses' ? '🔑 Licenses' : page === 'revenue' ? '💰 Revenue' : '👥 Users'}
          </p>
          <button onClick={loadFarms} className="btn btn-secondary py-1 px-3 text-xs">
            <RefreshCw size={13}/>Refresh
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">

          {/* OVERVIEW PAGE */}
          {page === 'overview' && (
            <>
              <StatGrid cols={4}>
                <KPICard label="Total Farms"    value={stats.total}     icon="🏡"/>
                <KPICard label="Active Paid"    value={stats.paid}      icon="✅" color="#16a34a"/>
                <KPICard label="On Trial"       value={stats.trial}     icon="🌱" color="#6B7C3A"/>
                <KPICard label="Monthly Revenue" value={`KES ${stats.mrr.toLocaleString()}`} icon="💰" color="#2D5016"/>
              </StatGrid>
              <StatGrid cols={3}>
                <KPICard label="Suspended"     value={stats.suspended}  icon="🚫" color={stats.suspended>0?'#dc2626':undefined}/>
                <KPICard label="Expiring (7d)" value={stats.expiring}   icon="⏰" color={stats.expiring>0?'#d97706':undefined}/>
                <KPICard label="ARR Estimate"  value={`KES ${(stats.mrr*12).toLocaleString()}`} icon="📈"/>
              </StatGrid>

              <div className="grid grid-cols-2 gap-4 mb-5">
                <SectionCard title="Monthly Farm Signups">
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={growthChart}>
                      <XAxis dataKey="month" tick={{fontSize:11}} axisLine={false} tickLine={false}/>
                      <YAxis tick={{fontSize:11}} axisLine={false} tickLine={false}/>
                      <Tooltip {...TOOLTIP}/>
                      <Bar dataKey="signups" fill="#2D5016" radius={[4,4,0,0]}/>
                    </BarChart>
                  </ResponsiveContainer>
                </SectionCard>

                <SectionCard title="Plan Distribution">
                  <div className="space-y-3 mt-2">
                    {Object.entries(TIERS).map(([k,v])=>{
                      const count = farms.filter(f=>f.tier===k).length;
                      const pct   = farms.length ? Math.round(count/farms.length*100) : 0;
                      return (
                        <div key={k}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium">{v.emoji} {v.name}</span>
                            <span className="text-xs text-gray-500">{count} farms ({pct}%)</span>
                          </div>
                          <div className="w-full bg-[#F5F0E8] rounded-full h-2">
                            <div className="h-2 rounded-full transition-all" style={{width:`${pct}%`, background:v.color}}/>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </SectionCard>
              </div>

              {/* Farms expiring soon */}
              {stats.expiring > 0 && (
                <SectionCard title={`⚠️ Licenses Expiring Soon (${stats.expiring})`}>
                  <DataTable
                    columns={farmCols.slice(0,7)}
                    rows={farms.filter(f=>{const d=f.current_period_end?Math.ceil((new Date(f.current_period_end)-new Date())/86400000):null;return d!=null&&d>=0&&d<=7;})}
                  />
                </SectionCard>
              )}
            </>
          )}

          {/* FARMS PAGE */}
          {(page==='farms' || page==='licenses') && (
            <>
              {/* Filter tabs */}
              <div className="flex gap-2 mb-4">
                {[['all',`All (${farms.length})`],['trial','Trial'],['paid','Paid'],['suspended','Suspended'],['expiring','Expiring']].map(([k,l])=>(
                  <button key={k} onClick={()=>setFilter(k)}
                    className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                      filter===k?'bg-[#2D5016] text-white':'bg-white border border-[#e8e0d0] text-[#6B7C3A]')}>
                    {l}
                  </button>
                ))}
              </div>
              <div className="card">
                <DataTable columns={farmCols} rows={filteredFarms} loading={loading} emptyText="No farms match this filter."/>
              </div>
            </>
          )}

          {/* REVENUE PAGE */}
          {page === 'revenue' && (
            <>
              <StatGrid cols={3}>
                <KPICard label="Current MRR" value={`KES ${stats.mrr.toLocaleString()}`} icon="💰"/>
                <KPICard label="ARR Estimate" value={`KES ${(stats.mrr*12).toLocaleString()}`} icon="📈"/>
                <KPICard label="Paid Clients" value={stats.paid} icon="✅"/>
              </StatGrid>
              <SectionCard title="Revenue by Plan">
                <div className="space-y-4 mt-2">
                  {Object.entries(TIERS).filter(([k])=>k!=='trial').map(([k,v])=>{
                    const planFarms = farms.filter(f=>f.tier===k&&f.license_status==='active');
                    const rev = planFarms.reduce((s,f)=>s+(f.amount_kes||v.priceMonthly||0),0);
                    return (
                      <div key={k} className="flex items-center justify-between p-4 bg-[#F5F0E8] rounded-xl">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{v.emoji}</span>
                          <div>
                            <p className="font-semibold text-sm">{v.name}</p>
                            <p className="text-xs text-gray-400">{planFarms.length} active farm{planFarms.length!==1?'s':''}</p>
                          </div>
                        </div>
                        <p className="font-semibold text-[#2D5016]">KES {rev.toLocaleString()}/mo</p>
                      </div>
                    );
                  })}
                </div>
              </SectionCard>
            </>
          )}

          {/* USERS PAGE */}
          {page === 'users' && (
            <SectionCard title="Registered Users">
              <UserList/>
            </SectionCard>
          )}
        </div>
      </div>

      {/* License management modal */}
      {editing && (
        <LicenseActionModal
          open={!!editing}
          farm={editing.farm}
          license={editing.license}
          onClose={()=>setEditing(null)}
          onRefresh={loadFarms}
        />
      )}
    </div>
  );
}

// ── USER LIST ─────────────────────────────────────────────────
function UserList() {
  const [users, setUsers] = useState([]);
  useEffect(()=>{
    supabase.from('profiles').select('*, farm_users(farm_id, role, farms(name))').then(({data})=>setUsers(data||[]));
  },[]);
  return (
    <DataTable columns={[
      { key:'full_name', label:'Name', render:v=><span className="font-medium">{v||'(unnamed)'}</span> },
      { key:'id', label:'Email', render:(_,row)=>row.email||'—' },
      { key:'farm_users', label:'Farm', render:v=>(v?.[0]?.farms?.name)||'No farm' },
      { key:'farm_users2', label:'Role', render:(_,row)=><span className="capitalize badge badge-green">{row.farm_users?.[0]?.role||'—'}</span> },
      { key:'is_super_admin', label:'Admin', render:v=>v?'✅ Super Admin':'—' },
      { key:'created_at', label:'Joined', render:v=>formatDate(v) },
    ]} rows={users.map(u=>({...u,farm_users2:u.farm_users}))} emptyText="No users found."/>
  );
}
