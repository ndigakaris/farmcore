// Lab module
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../../db/schema.js';
import { SPECIES } from '../../constants/index.js';
import { Modal, PageHeader, DataTable, KPICard, StatGrid } from '../../components/UI.jsx';
import { formatDate, todayStr } from '../../utils/index.js';
import { Plus, FlaskConical } from 'lucide-react';

function LabForm({ onClose }) {
  const [form, setForm] = useState({ animalId:'', testType:'Milk Quality', date:todayStr(), result:'', notes:'' });
  const animals = useLiveQuery(() => db.animals.toArray(), []);
  const f = (k,v) => setForm(p=>({...p,[k]:v}));
  const handleSave = async () => {
    if (!form.testType || !form.result) return;
    await db.labTests.add({ ...form, animalId:Number(form.animalId)||null, syncStatus:'pending' });
    onClose();
  };
  const TEST_TYPES = ['Milk Quality (Fat/Protein/SCC)','CMT (Mastitis Screening)','Water Quality','Aflatoxin Screen','Brucellosis Test','BVD Test','Blood Count','Feed Analysis','Soil Test'];
  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <label className="form-label">Animal / Flock (optional)</label>
        <select className="form-input" value={form.animalId} onChange={e=>f('animalId',e.target.value)}>
          <option value="">Farm-wide (not animal-specific)</option>
          {animals?.map(a=><option key={a.id} value={a.id}>{SPECIES[a.species]?.emoji} {a.name} {a.tag}</option>)}
        </select>
      </div>
      <div>
        <label className="form-label">Test Type<span className="text-red-500">*</span></label>
        <select className="form-input" value={form.testType} onChange={e=>f('testType',e.target.value)}>
          {TEST_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div><label className="form-label">Date</label><input className="form-input" type="date" value={form.date} onChange={e=>f('date',e.target.value)}/></div>
      <div><label className="form-label">Result<span className="text-red-500">*</span></label><input className="form-input" value={form.result} onChange={e=>f('result',e.target.value)} placeholder="e.g. Pass, 3.8%Fat, 180k SCC"/></div>
      <div className="col-span-2"><label className="form-label">Notes</label><textarea className="form-input resize-y min-h-[50px]" value={form.notes} onChange={e=>f('notes',e.target.value)}/></div>
      <div className="col-span-2 flex justify-end gap-3 pt-2 border-t border-[#e8e0d0]">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave}>Save Test Result</button>
      </div>
    </div>
  );
}

export function Lab() {
  const [showForm, setShowForm] = useState(false);
  const labTests = useLiveQuery(() => db.labTests.orderBy('date').reverse().toArray(), []);
  const animals  = useLiveQuery(() => db.animals.toArray(), []);
  const cols = [
    { key:'animalId', label:'Animal', render:(_,row)=>{ const a=animals?.find(x=>x.id===row.animalId); return a?`${SPECIES[a.species]?.emoji} ${a.name} ${a.tag}`:'Farm-wide'; }},
    { key:'testType', label:'Test Type' },
    { key:'date',     label:'Date',   render:v=>formatDate(v) },
    { key:'result',   label:'Result', render:v=><span className="font-medium">{v}</span> },
    { key:'notes',    label:'Notes' },
  ];
  return (
    <div className="page-content">
      <PageHeader title="Laboratory & Testing" actions={<button className="btn btn-primary" onClick={()=>setShowForm(true)}><Plus size={15}/>Log Test Result</button>}/>
      <StatGrid cols={2}>
        <KPICard label="Total Tests" value={labTests?.length||0} icon="🔬"/>
        <KPICard label="Tests This Month" value={(labTests||[]).filter(t=>t.date>=new Date().toISOString().slice(0,7)).length} icon="📋"/>
      </StatGrid>
      <div className="card">
        <DataTable columns={cols} rows={labTests||[]} emptyText="No lab results yet. Start with a milk quality or CMT test."/>
      </div>
      {showForm&&<Modal open title="Log Lab Test Result" onClose={()=>setShowForm(false)}><LabForm onClose={()=>setShowForm(false)}/></Modal>}
    </div>
  );
}

// Reports module
import { useApp } from '../../context/AppContext.jsx';
import { SectionCard } from '../../components/UI.jsx';
import { BarChart3, TrendingUp, Beef, Droplets, DollarSign, Users, FileDown } from 'lucide-react';

export function Reports() {
  const { formatCurrency } = useApp();
  const REPORT_CARDS = [
    { icon:'🥛', title:'Milk Production Report', desc:'Daily, weekly & monthly yields by cow, breed, and shift. Includes SCC trend and fat/protein averages.', period:'Last 30 days', color:'#eef5dd' },
    { icon:'🥚', title:'Egg Collection Report',  desc:'Daily egg totals, lay rate %, grading breakdown, and feed conversion ratio by flock.', period:'Last 30 days', color:'#fef9ec' },
    { icon:'💰', title:'Profit & Loss Statement',desc:'Income vs expenses by species and cost centre. Monthly comparison with variance analysis.', period:'Last 3 months', color:'#eff6ff' },
    { icon:'🐄', title:'Animal Inventory Report', desc:'Full registry with age, stage, production status, and withdrawal lock summary.', period:'Current', color:'#f0fdf4' },
    { icon:'🏥', title:'Antibiotic Usage Audit', desc:'All treatments with drug names, doses, withdrawal periods, and compliance status. Export-ready.', period:'All time', color:'#fff1f2' },
    { icon:'💉', title:'Vaccination Schedule',   desc:'Upcoming vaccinations due in next 30/60/90 days with animal count and cost estimate.', period:'Next 90 days', color:'#f5f3ff' },
    { icon:'👷', title:'Payroll Summary',         desc:'Employee wages, attendance records, and Mpesa payment history by month.', period:'Current month', color:'#fdf4ff' },
    { icon:'📦', title:'Procurement Report',      desc:'Purchase orders, supplier performance, and spend analysis by category.', period:'Last 3 months', color:'#fff7ed' },
  ];
  return (
    <div className="page-content">
      <PageHeader title="Reports & Analytics" subtitle="Tap any card to generate and export"/>
      <div className="grid grid-cols-2 gap-4">
        {REPORT_CARDS.map(r=>(
          <div key={r.title} style={{background:r.color}} className="rounded-xl border border-[#e8e0d0] p-4 cursor-pointer hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-3">
              <span className="text-3xl">{r.icon}</span>
              <div className="flex gap-2">
                <button className="btn btn-secondary py-1 px-2 text-xs"><FileDown size={12}/>PDF</button>
                <button className="btn btn-secondary py-1 px-2 text-xs"><FileDown size={12}/>Excel</button>
              </div>
            </div>
            <h3 style={{fontFamily:'Fraunces,serif'}} className="text-sm font-semibold text-[#1a3009] mb-1">{r.title}</h3>
            <p className="text-xs text-gray-500 leading-relaxed mb-2">{r.desc}</p>
            <span className="text-[10px] font-semibold text-[#6B7C3A] uppercase tracking-wide">Period: {r.period}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Notifications module
export function Notifications() {
  const { setUnreadCount } = useApp();
  const notifications = useLiveQuery(() => db.notifications.orderBy('timestamp').reverse().toArray(), []);
  const markRead = async (id) => {
    await db.notifications.update(id, { read: true });
    const count = await db.notifications.where('read').equals(0).count();
    setUnreadCount(count);
  };
  const markAllRead = async () => {
    await db.notifications.toCollection().modify({ read: true });
    setUnreadCount(0);
  };
  const PRIORITY_COLORS = { urgent:'border-l-red-500 bg-red-50', warning:'border-l-amber-400 bg-amber-50', info:'border-l-blue-400 bg-blue-50' };
  return (
    <div className="page-content">
      <PageHeader title="Notifications" subtitle={`${(notifications||[]).filter(n=>!n.read).length} unread`}
        actions={<button className="btn btn-secondary text-xs" onClick={markAllRead}>Mark all read</button>}/>
      <div className="space-y-2">
        {(notifications||[]).map(n=>(
          <div key={n.id} onClick={()=>markRead(n.id)}
            className={`card cursor-pointer border-l-4 transition-all ${PRIORITY_COLORS[n.priority]||'border-l-gray-300'} ${!n.read?'shadow-sm':''}`}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {!n.read&&<span className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0"/>}
                  <p className="text-sm font-semibold text-[#1a3009]">{n.title}</p>
                  <span className={`badge text-[9px] ${n.priority==='urgent'?'badge-red':n.priority==='warning'?'badge-amber':'badge-blue'}`}>{n.priority}</span>
                </div>
                <p className="text-sm text-gray-600 leading-relaxed">{n.body}</p>
                <p className="text-xs text-gray-400 mt-1">{n.type} · {new Date(n.timestamp).toLocaleString()}</p>
              </div>
            </div>
          </div>
        ))}
        {!notifications?.length&&<div className="empty-state"><div className="text-5xl mb-3">🔔</div><p className="text-sm text-gray-500">No notifications yet.</p></div>}
      </div>
    </div>
  );
}

// Settings module
import { ConfirmDialog } from '../../components/UI.jsx';
import { clearDemoData } from '../../db/seed.js';

export function Settings() {
  const { farmName, setFarmName, currency, setCurrency, activeSpecies, setActiveSpecies, saveSetting } = useApp();
  const [showClear, setShowClear] = useState(false);
  const [saved, setSaved]         = useState(false);

  const toggleSpecies = (s) => {
    setActiveSpecies(prev => prev.includes(s)?prev.filter(x=>x!==s):[...prev,s]);
  };
  const handleSave = async () => {
    await saveSetting('farmName', farmName);
    await saveSetting('currency', currency);
    await saveSetting('activeSpecies', activeSpecies);
    setSaved(true);
    setTimeout(()=>setSaved(false), 2000);
  };
  const handleClearData = async () => {
    await clearDemoData();
    window.location.reload();
  };
  const SPECIES_KEYS = ['cattle','pigs','goats','sheep','poultry'];

  return (
    <div className="page-content">
      <PageHeader title="Settings" subtitle="Farm configuration and preferences"/>
      <div className="max-w-xl space-y-5">
        <SectionCard title="Farm Details">
          <div className="space-y-4">
            <div><label className="form-label">Farm Name</label><input className="form-input" value={farmName} onChange={e=>setFarmName(e.target.value)}/></div>
            <div><label className="form-label">Currency</label>
              <div className="flex gap-2 mt-1">
                {['KES','USD'].map(c=>(
                  <button key={c} onClick={()=>setCurrency(c)}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-all ${currency===c?'bg-[#2D5016] text-white border-[#2D5016]':'bg-white border-[#e8e0d0] text-[#6B7C3A]'}`}>{c}</button>
                ))}
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Active Species">
          <p className="text-xs text-gray-500 mb-3">Choose which species appear in the top navigation tabs.</p>
          <div className="flex flex-wrap gap-2">
            {SPECIES_KEYS.map(s=>(
              <button key={s} onClick={()=>toggleSpecies(s)}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all capitalize ${activeSpecies.includes(s)?'bg-[#2D5016] text-white border-[#2D5016]':'bg-white border-[#e8e0d0] text-[#6B7C3A]'}`}>
                {s}
              </button>
            ))}
          </div>
        </SectionCard>

        <div className="flex gap-3">
          <button className="btn btn-primary flex-1" onClick={handleSave}>
            {saved?'✅ Saved!':'Save Settings'}
          </button>
        </div>

        <SectionCard title="Danger Zone">
          <p className="text-xs text-gray-500 mb-4">Clearing demo data is <strong>permanent and irreversible</strong>. All records including animals, health, finance, employees, and settings will be deleted.</p>
          <button className="btn btn-danger" onClick={()=>setShowClear(true)}>🗑️ Clear All Demo Data</button>
        </SectionCard>
      </div>

      <ConfirmDialog
        open={showClear}
        title="Clear All Data"
        message="This will permanently delete ALL farm data — animals, health records, finances, employees, and settings. This cannot be undone."
        confirmLabel="Delete Everything"
        requireType="DELETE"
        danger
        onConfirm={handleClearData}
        onClose={()=>setShowClear(false)}
      />
    </div>
  );
}
