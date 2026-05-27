import { useState, useEffect, useMemo } from 'react';
import supabase from '../../services/supabase.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { TIERS } from '../../services/license.js';
import { KPICard, StatGrid, SectionCard, DataTable, Modal, PageHeader } from '../../components/UI.jsx';
import { formatDate, cn } from '../../utils/index.js';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { RefreshCw, Zap, LogOut, Ban, Eye } from 'lucide-react';

function AdminNav({ page, setPage, signOut }) {
  const NAV = [
    { id:'overview', label:'Overview',   emoji:'📊' },
    { id:'farms',    label:'All Farms',  emoji:'🏡' },
    { id:'licenses', label:'Licenses',   emoji:'🔑' },
    { id:'users',    label:'Users',      emoji:'👥' },
    { id:'revenue',  label:'Revenue',    emoji:'💰' },
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
      <div className="flex-1 py-3 overflow-y-auto">
        {NAV.map(n=>(
          <button key={n.id} onClick={()=>setPage(n.id)}
            className={cn('w-full flex items-center gap-3 px-5 py-2.5 text-sm transition-all border-l-[3px] text-left',
              page===n.id?'bg-white/15 text-white border-[#C9A84C]':'text-white/60 border-transparent hover:bg-white/10 hover:text-white')}>
            <span>{n.emoji}</span>{n.label}
          </button>
        ))}
      </div>
      <div className="p-4 border-t border-white/10">
        <button onClick={signOut} className="flex items-center gap-2 text-white/50 hover:text-white text-xs">
          <LogOut size={14}/>Sign out
        </button>
      </div>
    </div>
  );
}

function LicenseModal({ farm, license, open, onClose, onRefresh }) {
  const { user } = useAuth();
  const [form, setForm] = useState({ tier: license?.tier||'trial', status: license?.status||'active', periodEnd:'', notes:'', amountKes:'' });
  const [loading, setLoading] = useState(false);
  const f = (k,v) => setForm(p=>({...p,[k]:v}));

  const handleSave = async () => {
    setLoading(true);
    try {
      const tierData = TIERS[form.tier] || TIERS.trial;
      await supabase.from('licenses').update({
        tier: form.tier, status: form.status,
        animal_limit: tierData.animalLimit === Infinity ? 999999 : tierData.animalLimit,
        user_limit:   tierData.userLimit   === Infinity ? 999999 : tierData.userLimit,
        notes: form.notes,
        ...(form.periodEnd && { current_period_end: form.periodEnd }),
        ...(form.amountKes && { amount_kes: parseInt(form.amountKes) }),
        updated_at: new Date().toISOString(),
      }).eq('farm_id', farm.id);

      await supabase.from('license_events').insert({
        farm_id: farm.id,
        event_type: form.tier !== license?.tier ? 'upgraded' : 'updated',
        old_tier: license?.tier, new_tier: form.tier,
        amount_kes: parseInt(form.amountKes)||null,
        notes: form.notes, created_by: user?.id,
      }).then(()=>{}).catch(()=>{});

      onRefresh(); onClose();
    } finally { setLoading(false); }
  };

  return (
    <Modal open={open} title={`Manage License — ${farm?.name}`}
      subtitle={`Current: ${license?.tier} · ${license?.status}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">Tier</label>
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
          <label className="form-label">Admin Notes</label>
          <textarea className="form-input resize-y min-h-[60px]" value={form.notes} onChange={e=>f('notes',e.target.value)} placeholder="Payment ref, special terms…"/>
        </div>
        <div className="flex gap-3 pt-2 border-t border-[#e8e0d0]">
          <button onClick={async()=>{ await supabase.from('licenses').update({status:'suspended'}).eq('farm_id',farm.id); onRefresh(); onClose(); }}
            className="btn btn-danger text-xs"><Ban size={13}/>Suspend</button>
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

export default function AdminDashboard() {
  const { signOut } = useAuth();
  const [page,    setPage]    = useState('overview');
  const [farms,   setFarms]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [filter,  setFilter]  = useState('all');

  const loadFarms = async () => {
    setLoading(true);
    try {
      // Use simple join instead of view to avoid timeout
      const { data: farmsData } = await supabase
        .from('farms').select('*').order('created_at', { ascending: false });
      if (!farmsData) { setFarms([]); return; }

      const { data: licenses } = await supabase.from('licenses').select('*');
      const { data: farmUsers } = await supabase.from('farm_users').select('farm_id, user_id');
      const { data: animals }   = await supabase.from('animals').select('farm_id');

      const enriched = farmsData.map(f => {
        const lic = licenses?.find(l=>l.farm_id===f.id) || {};
        const userCount   = farmUsers?.filter(u=>u.farm_id===f.id).length || 0;
        const animalCount = animals?.filter(a=>a.farm_id===f.id).length || 0;
        return { ...f, ...lic, license_status: lic.status, user_count: userCount, animal_count: animalCount };
      });
      setFarms(enriched);
    } catch (err) {
      console.warn('[Admin] loadFarms:', err.message);
      setFarms([]);
    } finally { setLoading(false); }
  };

  useEffect(() => { loadFarms(); }, []);

  const stats = useMemo(() => {
    const paid      = farms.filter(f=>f.tier!=='trial'&&f.license_status==='active');
    const trial     = farms.filter(f=>f.tier==='trial');
    const suspended = farms.filter(f=>f.license_status==='suspended');
    const expiring  = farms.filter(f=>{
      if(!f.current_period_end) return false;
      const d=Math.ceil((new Date(f.current_period_end)-new Date())/86400000);
      return d>=0&&d<=7;
    });
    const mrr = paid.reduce((s,f)=>s+(f.amount_kes||0),0);
    return { total:farms.length, paid:paid.length, trial:trial.length, suspended:suspended.length, expiring:expiring.length, mrr };
  }, [farms]);

  const growthChart = useMemo(() => {
    const months = {};
    farms.forEach(f=>{ const m=(f.created_at||'').slice(0,7); if(!months[m])months[m]={month:m.slice(5),signups:0}; months[m].signups++; });
    return Object.values(months).slice(-6);
  }, [farms]);

  const filteredFarms = useMemo(() => {
    if (filter==='trial')    return farms.filter(f=>f.tier==='trial');
    if (filter==='paid')     return farms.filter(f=>f.tier!=='trial'&&f.license_status==='active');
    if (filter==='suspended')return farms.filter(f=>f.license_status==='suspended');
    if (filter==='expiring') return farms.filter(f=>{ const d=f.current_period_end?Math.ceil((new Date(f.current_period_end)-new Date())/86400000):null; return d!=null&&d>=0&&d<=7; });
    return farms;
  }, [farms, filter]);

  const farmCols = [
    { key:'name',           label:'Farm',     render:v=><span className="font-semibold">{v}</span> },
    { key:'tier',           label:'Plan',     render:v=><span className={cn('badge',v==='enterprise'?'badge-purple':v==='professional'?'badge-blue':v==='starter'?'badge-green':'badge-gray')}>{TIERS[v]?.emoji} {TIERS[v]?.name||v}</span> },
    { key:'license_status', label:'Status',   render:v=><span className={cn('badge',v==='active'?'badge-green':v==='suspended'?'badge-red':'badge-gray')}>{v||'—'}</span> },
    { key:'animal_count',   label:'Animals',  render:v=><span className="font-mono">{v||0}</span> },
    { key:'user_count',     label:'Users',    render:v=><span className="font-mono">{v||0}</span> },
    { key:'current_period_end', label:'Expires', render:v=>{ if(!v)return'—'; const d=Math.ceil((new Date(v)-new Date())/86400000); return <span className={d<7?'text-red-600 font-semibold':d<30?'text-amber-600':''}>{d}d</span>; }},
    { key:'amount_kes',     label:'MRR',      render:v=>v?`KES ${v.toLocaleString()}`:'—' },
    { key:'created_at',     label:'Joined',   render:v=>formatDate(v) },
    { key:'id',             label:'',         render:(_,row)=>(
        <button className="btn btn-primary py-1 px-2 text-xs" onClick={async()=>{
          const { data: lic } = await supabase.from('licenses').select('*').eq('farm_id',row.id).maybeSingle();
          setEditing({ farm:row, license:lic });
        }}><Zap size={12}/>Manage</button>
      )},
  ];

  const TOOLTIP = { contentStyle:{ fontSize:12, borderRadius:8, border:'1px solid #e8e0d0' } };

  return (
    <div className="flex h-screen overflow-hidden bg-[#F5F0E8]">
      <AdminNav page={page} setPage={setPage} signOut={signOut}/>
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="bg-white border-b border-[#e8e0d0] px-5 h-12 flex items-center justify-between flex-shrink-0">
          <p style={{fontFamily:'Fraunces,serif'}} className="font-semibold text-[#2D5016] capitalize">
            {page==='overview'?'📊 Overview':page==='farms'?'🏡 All Farms':page==='licenses'?'🔑 Licenses':page==='revenue'?'💰 Revenue':'👥 Users'}
          </p>
          <button onClick={loadFarms} className="btn btn-secondary py-1 px-3 text-xs">
            <RefreshCw size={13}/>Refresh
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {page==='overview' && (
            <>
              <StatGrid cols={4}>
                <KPICard label="Total Farms"     value={stats.total}   icon="🏡"/>
                <KPICard label="Active Paid"     value={stats.paid}    icon="✅" color="#16a34a"/>
                <KPICard label="On Trial"        value={stats.trial}   icon="🌱"/>
                <KPICard label="Monthly Revenue" value={`KES ${stats.mrr.toLocaleString()}`} icon="💰" color="#2D5016"/>
              </StatGrid>
              <StatGrid cols={3}>
                <KPICard label="Suspended"     value={stats.suspended} icon="🚫" color={stats.suspended>0?'#dc2626':undefined}/>
                <KPICard label="Expiring (7d)" value={stats.expiring}  icon="⏰" color={stats.expiring>0?'#d97706':undefined}/>
                <KPICard label="ARR Estimate"  value={`KES ${(stats.mrr*12).toLocaleString()}`} icon="📈"/>
              </StatGrid>
              <div className="grid grid-cols-2 gap-4 mb-5">
                <SectionCard title="Monthly Signups">
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
                      const count=farms.filter(f=>f.tier===k).length;
                      const pct=farms.length?Math.round(count/farms.length*100):0;
                      return (
                        <div key={k}>
                          <div className="flex justify-between mb-1">
                            <span className="text-xs font-medium">{v.emoji} {v.name}</span>
                            <span className="text-xs text-gray-500">{count} ({pct}%)</span>
                          </div>
                          <div className="w-full bg-[#F5F0E8] rounded-full h-2">
                            <div className="h-2 rounded-full" style={{width:`${pct}%`,background:v.color}}/>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </SectionCard>
              </div>
              {farms.length > 0 && (
                <SectionCard title="Recent Farms">
                  <DataTable columns={farmCols} rows={farms.slice(0,5)} loading={loading}/>
                </SectionCard>
              )}
            </>
          )}

          {(page==='farms'||page==='licenses') && (
            <>
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
                <DataTable columns={farmCols} rows={filteredFarms} loading={loading} emptyText="No farms yet."/>
              </div>
            </>
          )}

          {page==='revenue' && (
            <>
              <StatGrid cols={3}>
                <KPICard label="Current MRR" value={`KES ${stats.mrr.toLocaleString()}`} icon="💰"/>
                <KPICard label="ARR Estimate" value={`KES ${(stats.mrr*12).toLocaleString()}`} icon="📈"/>
                <KPICard label="Paid Clients" value={stats.paid} icon="✅"/>
              </StatGrid>
              <SectionCard title="Revenue by Plan">
                <div className="space-y-4 mt-2">
                  {Object.entries(TIERS).filter(([k])=>k!=='trial').map(([k,v])=>{
                    const pFarms=farms.filter(f=>f.tier===k&&f.license_status==='active');
                    const rev=pFarms.reduce((s,f)=>s+(f.amount_kes||v.priceMonthly||0),0);
                    return (
                      <div key={k} className="flex items-center justify-between p-4 bg-[#F5F0E8] rounded-xl">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{v.emoji}</span>
                          <div>
                            <p className="font-semibold text-sm">{v.name}</p>
                            <p className="text-xs text-gray-400">{pFarms.length} farms</p>
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

          {page==='users' && <AdminUserList/>}
        </div>
      </div>

      {editing && (
        <LicenseModal open={!!editing} farm={editing.farm} license={editing.license}
          onClose={()=>setEditing(null)} onRefresh={loadFarms}/>
      )}
    </div>
  );
}

function AdminUserList() {
  const [users, setUsers] = useState([]);
  useEffect(()=>{
    supabase.from('profiles').select('*, farm_users(farm_id, role, farms(name))').then(({data})=>setUsers(data||[]));
  },[]);
  return (
    <div className="card">
      <DataTable columns={[
        { key:'full_name',   label:'Name',  render:v=><span className="font-medium">{v||'(no name)'}</span> },
        { key:'farm_users',  label:'Farm',  render:v=>v?.[0]?.farms?.name||'—' },
        { key:'farm_users',  label:'Role',  render:v=><span className="capitalize badge badge-green">{v?.[0]?.role||'—'}</span> },
        { key:'is_super_admin', label:'Admin', render:v=>v?'✅ Super Admin':'—' },
        { key:'created_at',  label:'Joined', render:v=>formatDate(v) },
      ]} rows={users} emptyText="No users yet."/>
    </div>
  );
}
