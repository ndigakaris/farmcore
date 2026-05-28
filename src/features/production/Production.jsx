import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import db from '../../db/schema.js';
import { useApp } from '../../context/AppContext.jsx';
import { Modal, KPICard, StatGrid, SectionCard, PageHeader, DataTable, UnitSelector } from '../../components/UI.jsx';
import { formatDate, offsetDate, todayStr } from '../../utils/index.js';
import { Plus, AlertTriangle, Lock } from 'lucide-react';

const SHIFTS = ['Morning', 'Afternoon', 'Evening'];


function MilkLogForm({ onClose }) {
  const [form, setForm] = useState({
    animalId:'', shift:'Morning', amount:'', pricePerLiter:'',
    unit:'liters', status:'Sold', fat:'', protein:'', scc:'', date: todayStr()
  });
  const animals = useLiveQuery(() => db.animals.where('species').equals('cattle').and(a=>a.sex==='F').toArray(), []);
  const f = (k,v) => setForm(p=>({...p,[k]:v}));
  const selectedAnimal = animals?.find(a=>a.id===Number(form.animalId));
  const isLocked = selectedAnimal?.milkLock && form.status === 'Sold';
  const revenue = parseFloat(form.amount||0) * parseFloat(form.pricePerLiter||0);

  const handleSave = async () => {
    if (!form.animalId || !form.amount) return;
    if (isLocked) { alert('🔒 WITHDRAWAL LOCK: Cannot log this milk as Sold. Change status to "Used on Farm" or wait until lock expires.'); return; }
    const liters = parseFloat(form.amount)||0;
    const price  = parseFloat(form.pricePerLiter)||0;
    await db.milkLogs.add({
      ...form,
      animalId: Number(form.animalId),
      amount: liters,
      pricePerLiter: price,
      revenue: liters * price,
      fat: parseFloat(form.fat)||null,
      protein: parseFloat(form.protein)||null,
      scc: parseInt(form.scc)||null,
      syncStatus:'pending', updatedAt:new Date()
    });
    if (form.status === 'Sold' && liters > 0 && price > 0) {
      await db.transactions.add({
        type:'income', category:'Milk Sales',
        description:`Milk – ${selectedAnimal?.name} ${selectedAnimal?.tag} (${form.shift})`,
        amount: liters * price, date: form.date,
        species:'cattle', paymentMethod:'Mpesa', source:'production',
        syncStatus:'pending', updatedAt:new Date()
      });
    }
    onClose();
  };

  return (
    <div className="space-y-4">
      {isLocked && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-300 rounded-lg px-4 py-3">
          <Lock size={18} className="text-red-600 flex-shrink-0"/>
          <div>
            <p className="text-sm font-semibold text-red-700">🔒 WITHDRAWAL LOCK ACTIVE</p>
            <p className="text-xs text-red-500">Milk from <strong>{selectedAnimal?.name}</strong> cannot be sold until {selectedAnimal?.lockExpiry}. Change status to "Used on Farm".</p>
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="form-label">Animal<span className="text-red-500">*</span></label>
          <select className="form-input" value={form.animalId} onChange={e=>f('animalId',e.target.value)}>
            <option value="">Select cow…</option>
            {animals?.map(a=><option key={a.id} value={a.id}>{a.name} {a.tag} {a.milkLock?'🔒':''}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Date</label>
          <input className="form-input" type="date" value={form.date} onChange={e=>f('date',e.target.value)}/>
        </div>
        <div>
          <label className="form-label">Shift</label>
          <select className="form-input" value={form.shift} onChange={e=>f('shift',e.target.value)}>
            {SHIFTS.map(s=><option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Total Liters<span className="text-red-500">*</span></label>
          <input className="form-input" type="number" step="0.1" value={form.amount} onChange={e=>f('amount',e.target.value)} placeholder="e.g. 8.5"/>
        </div>
        <div>
          <label className="form-label">Price per Liter (KES)</label>
          <input className="form-input" type="number" step="0.5" value={form.pricePerLiter} onChange={e=>f('pricePerLiter',e.target.value)} placeholder="e.g. 55"/>
        </div>
        {revenue > 0 && (
          <div className="col-span-2 bg-green-50 border border-green-200 rounded-lg px-4 py-2 flex items-center justify-between">
            <span className="text-sm text-green-700">💰 Revenue Preview</span>
            <span className="font-bold text-green-800">KES {revenue.toLocaleString()}</span>
          </div>
        )}
        <div>
          <label className="form-label">Status</label>
          <select className="form-input" value={form.status} onChange={e=>f('status',e.target.value)}>
            <option>Sold</option><option>Used on Farm</option><option>Rejected</option>
          </select>
        </div>
        <div>
          <label className="form-label">Fat %</label>
          <input className="form-input" type="number" step="0.1" value={form.fat} onChange={e=>f('fat',e.target.value)} placeholder="e.g. 3.8"/>
        </div>
        <div>
          <label className="form-label">Protein %</label>
          <input className="form-input" type="number" step="0.1" value={form.protein} onChange={e=>f('protein',e.target.value)} placeholder="e.g. 3.2"/>
        </div>
        <div>
          <label className="form-label">SCC (×1000)</label>
          <input className="form-input" type="number" value={form.scc} onChange={e=>f('scc',e.target.value)} placeholder="e.g. 200"/>
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-2 border-t border-[#e8e0d0]">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave}>Save Entry</button>
      </div>
    </div>
  );
}

function EggLogForm({ onClose }) {
  const [form, setForm] = useState({ flockId:'', date:todayStr(), total:'', cracked:'', gradeA:'', gradeB:'', feedIntake:'', feedUnit:'kg' });
  const flocks = useLiveQuery(() => db.animals.where('species').equals('poultry').toArray(), []);
  const f = (k,v) => setForm(p=>({...p,[k]:v}));

  const handleSave = async () => {
    if (!form.flockId || !form.total) return;
    await db.eggLogs.add({ ...form, flockId:Number(form.flockId), total:parseInt(form.total), cracked:parseInt(form.cracked)||0, gradeA:parseInt(form.gradeA)||0, gradeB:parseInt(form.gradeB)||0, feedIntake:parseFloat(form.feedIntake)||null, syncStatus:'pending', updatedAt:new Date() });
    onClose();
  };

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="col-span-2">
        <label className="form-label">Flock</label>
        <select className="form-input" value={form.flockId} onChange={e=>f('flockId',e.target.value)}>
          <option value="">Select flock…</option>
          {flocks?.map(a=><option key={a.id} value={a.id}>{a.name} {a.tag}</option>)}
        </select>
      </div>
      <div><label className="form-label">Date</label><input className="form-input" type="date" value={form.date} onChange={e=>f('date',e.target.value)}/></div>
      <div><label className="form-label">Total Eggs</label><input className="form-input" type="number" value={form.total} onChange={e=>f('total',e.target.value)}/></div>
      <div><label className="form-label">Cracked</label><input className="form-input" type="number" value={form.cracked} onChange={e=>f('cracked',e.target.value)}/></div>
      <div><label className="form-label">Grade A</label><input className="form-input" type="number" value={form.gradeA} onChange={e=>f('gradeA',e.target.value)}/></div>
      <div><label className="form-label">Grade B</label><input className="form-input" type="number" value={form.gradeB} onChange={e=>f('gradeB',e.target.value)}/></div>
      <div><label className="form-label">Feed Intake</label><input className="form-input" type="number" step="0.1" value={form.feedIntake} onChange={e=>f('feedIntake',e.target.value)} placeholder="kg"/></div>
      <div className="col-span-2 flex justify-end gap-3 pt-2 border-t border-[#e8e0d0]">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave}>Save Egg Log</button>
      </div>
    </div>
  );
}

export default function Production() {
  const { species, formatCurrency } = useApp();
  const [activeTab, setActiveTab] = useState('milk');
  const [showForm, setShowForm] = useState(false);
  const today = todayStr();

  const milkLogs  = useLiveQuery(() => db.milkLogs.orderBy('date').reverse().limit(100).toArray(), []);
  const eggLogs   = useLiveQuery(() => db.eggLogs.orderBy('date').reverse().limit(60).toArray(), []);
  const animals   = useLiveQuery(() => db.animals.toArray(), []);
  const weightLogs= useLiveQuery(() => db.weightLogs.orderBy('date').reverse().limit(50).toArray(), []);

  const todayMilk = useMemo(() => (milkLogs||[]).filter(l=>l.date===today).reduce((s,l)=>s+l.amount,0), [milkLogs,today]);
  const todayEggs = useMemo(() => (eggLogs||[]).find(l=>l.date===today)?.total||0, [eggLogs,today]);
  const todayMilkKES = todayMilk * 50;

  const milkChart = useMemo(() => {
    const days = Array.from({length:7},(_,i)=>offsetDate(i-6));
    return days.map(date => {
      const logs = (milkLogs||[]).filter(l=>l.date===date);
      return { date:date.slice(5), total:+logs.reduce((s,l)=>s+l.amount,0).toFixed(1) };
    });
  }, [milkLogs]);

  const eggChart = useMemo(() => {
    const days = Array.from({length:7},(_,i)=>offsetDate(i-6));
    return days.map(date => {
      const log = (eggLogs||[]).find(l=>l.date===date);
      return { date:date.slice(5), eggs:log?.total||0, cracked:log?.cracked||0 };
    });
  }, [eggLogs]);

  const milkCols = [
    { key:'animalId', label:'Animal', render:(_,row)=>{ const a=animals?.find(x=>x.id===row.animalId); return <div><p className="font-medium">{a?.name}</p><p className="text-xs text-gray-400">{a?.tag}</p></div>; }},
    { key:'date',   label:'Date',   render:v=>formatDate(v) },
    { key:'shift',  label:'Shift' },
    { key:'amount', label:'Amount', render:(v,row)=><span className="font-semibold">{v} {row.unit}</span> },
    { key:'fat',    label:'Fat %',  render:v=>v?`${v}%`:'—' },
    { key:'scc',    label:'SCC',    render:v=>v?`${v}k`:'—' },
    { key:'status', label:'Status', render:v=><span className={`badge ${v==='Sold'?'badge-green':v==='Rejected'?'badge-red':'badge-blue'}`}>{v}</span> },
  ];

  const eggCols = [
    { key:'flockId', label:'Flock', render:(_,row)=>{ const a=animals?.find(x=>x.id===row.flockId); return a?.name||'—'; }},
    { key:'date',    label:'Date',  render:v=>formatDate(v) },
    { key:'total',   label:'Total', render:v=><span className="font-semibold">{v} pcs</span> },
    { key:'cracked', label:'Cracked' },
    { key:'gradeA',  label:'Grade A' },
    { key:'feedIntake', label:'Feed', render:(v,row)=>v?`${v}${row.feedUnit}`:'—' },
  ];

  const TOOLTIP = { contentStyle:{ fontSize:12, background:'#fff', border:'1px solid #e8e0d0', borderRadius:8 } };

  return (
    <div className="page-content">
      <PageHeader
        title="Production Log"
        actions={<button className="btn btn-primary" onClick={()=>setShowForm(true)}><Plus size={15}/>Log Production</button>}
      />

      <StatGrid cols={4}>
        <KPICard label="Today's Milk" value={`${todayMilk.toFixed(1)}L`} sub="3 cows milked" trend="down" icon="🥛"/>
        <KPICard label="Today's Eggs" value={`${todayEggs}`} sub="Layer House A" trend="up" icon="🥚"/>
        <KPICard label="Milk Revenue" value={formatCurrency(todayMilkKES)} sub="@ KES 50/L" icon="💰"/>
        <KPICard label="Animals Locked" value={(animals||[]).filter(a=>a.milkLock).length} sub="Withdrawal lock" icon="🔒" color="#dc2626"/>
      </StatGrid>

      {/* Tab selector */}
      <div className="flex gap-2 mb-4">
        {[['milk','🥛 Milk'],['eggs','🥚 Eggs'],['weight','⚖️ Weight']].map(([k,l])=>(
          <button key={k} onClick={()=>setActiveTab(k)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab===k?'bg-[#2D5016] text-white':'bg-white border border-[#e8e0d0] text-[#6B7C3A] hover:bg-[#F5F0E8]'}`}>
            {l}
          </button>
        ))}
      </div>

      {activeTab === 'milk' && (
        <>
          <SectionCard title="7-Day Milk Trend" className="mb-4">
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={milkChart} barCategoryGap="35%">
                <XAxis dataKey="date" tick={{fontSize:11}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fontSize:11}} axisLine={false} tickLine={false} unit="L"/>
                <Tooltip {...TOOLTIP}/>
                <Bar dataKey="total" name="Total (L)" fill="#2D5016" radius={[4,4,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </SectionCard>
          <div className="card"><DataTable columns={milkCols} rows={milkLogs||[]} emptyText="No milk records yet."/></div>
        </>
      )}
      {activeTab === 'eggs' && (
        <>
          <SectionCard title="7-Day Egg Production" className="mb-4">
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={eggChart} barCategoryGap="35%">
                <XAxis dataKey="date" tick={{fontSize:11}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fontSize:11}} axisLine={false} tickLine={false}/>
                <Tooltip {...TOOLTIP}/>
                <Bar dataKey="eggs" name="Total" fill="#C9A84C" radius={[4,4,0,0]}/>
                <Bar dataKey="cracked" name="Cracked" fill="#fca5a5" radius={[4,4,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </SectionCard>
          <div className="card"><DataTable columns={eggCols} rows={eggLogs||[]} emptyText="No egg logs yet."/></div>
        </>
      )}
      {activeTab === 'weight' && (
        <div className="card"><DataTable columns={[
          { key:'animalId', label:'Animal', render:(_,row)=>{ const a=animals?.find(x=>x.id===row.animalId); return a?`${a.name} ${a.tag}`:'—'; }},
          { key:'date',   label:'Date',   render:v=>formatDate(v) },
          { key:'weight', label:'Weight', render:(v,row)=><span className="font-semibold">{v} {row.unit}</span> },
        ]} rows={weightLogs||[]} emptyText="No weight records yet."/>
        </div>
      )}

      {showForm && (
        <Modal open title={activeTab==='eggs'?'Log Egg Collection':'Log Milk Production'} onClose={()=>setShowForm(false)}>
          {activeTab==='eggs' ? <EggLogForm onClose={()=>setShowForm(false)}/> : <MilkLogForm onClose={()=>setShowForm(false)}/>}
        </Modal>
      )}
    </div>
  );
}
