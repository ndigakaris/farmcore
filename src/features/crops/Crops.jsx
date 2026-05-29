import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../../db/schema.js';
import { useApp } from '../../context/AppContext.jsx';
import { Modal, KPICard, StatGrid, PageHeader, DataTable } from '../../components/UI.jsx';
import { formatDate, todayStr } from '../../utils/index.js';
import { Plus, Leaf } from 'lucide-react';

// Safe days-from-now that never crashes
function safeDaysFromNow(dateStr) {
  if (!dateStr) return null;
  try {
    const d = Math.floor((new Date(dateStr) - new Date()) / 86400000);
    return isNaN(d) ? null : d;
  } catch { return null; }
}

function PlotForm({ onClose }) {
  const [form, setForm] = useState({ name:'', size:'', unit:'acres', soilType:'', currentUse:'Pasture', gps:'', notes:'' });
  const f = (k,v) => setForm(p=>({...p,[k]:v}));
  const handleSave = async () => {
    if (!form.name) return;
    await db.plots.add({ ...form, syncStatus:'pending', updatedAt:new Date() });
    onClose();
  };
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="col-span-2">
        <label className="form-label">Plot Name<span className="text-red-500">*</span></label>
        <input className="form-input" value={form.name} onChange={e=>f('name',e.target.value)} placeholder="e.g. North Field"/>
      </div>
      <div>
        <label className="form-label">Size</label>
        <input className="form-input" type="number" value={form.size} onChange={e=>f('size',e.target.value)}/>
      </div>
      <div>
        <label className="form-label">Unit</label>
        <select className="form-input" value={form.unit} onChange={e=>f('unit',e.target.value)}>
          {['acres','hectares','sq metres'].map(u=><option key={u}>{u}</option>)}
        </select>
      </div>
      <div>
        <label className="form-label">Soil Type</label>
        <input className="form-input" value={form.soilType} onChange={e=>f('soilType',e.target.value)} placeholder="e.g. Red Loam"/>
      </div>
      <div>
        <label className="form-label">Current Use</label>
        <select className="form-input" value={form.currentUse} onChange={e=>f('currentUse',e.target.value)}>
          {['Pasture','Fodder','Maize','Napier Grass','Vegetables','Fallow','Other'].map(u=><option key={u}>{u}</option>)}
        </select>
      </div>
      <div className="col-span-2">
        <label className="form-label">GPS Coordinates <span className="text-gray-400 text-xs">(optional)</span></label>
        <input className="form-input" value={form.gps} onChange={e=>f('gps',e.target.value)} placeholder="e.g. -0.2833, 36.0667"/>
      </div>
      <div className="col-span-2">
        <label className="form-label">Notes</label>
        <textarea className="form-input resize-y min-h-[60px]" value={form.notes} onChange={e=>f('notes',e.target.value)}/>
      </div>
      <div className="col-span-2 flex justify-end gap-3 pt-2 border-t border-[#e8e0d0]">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave}>Add Plot</button>
      </div>
    </div>
  );
}

function CropPlanForm({ plots, onClose }) {
  const [form, setForm] = useState({ plotId:'', cropType:'', variety:'', plantingDate:todayStr(), expectedHarvest:'', seedsKg:'', fertilizer:'', notes:'' });
  const f = (k,v) => setForm(p=>({...p,[k]:v}));
  const handleSave = async () => {
    if (!form.plotId || !form.cropType) return;
    await db.cropPlans.add({ ...form, plotId:Number(form.plotId), syncStatus:'pending', updatedAt:new Date() });
    onClose();
  };
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="col-span-2">
        <label className="form-label">Plot<span className="text-red-500">*</span></label>
        <select className="form-input" value={form.plotId} onChange={e=>f('plotId',e.target.value)}>
          <option value="">Select plot…</option>
          {(plots||[]).map(p=><option key={p.id} value={p.id}>{p.name} ({p.size} {p.unit})</option>)}
        </select>
      </div>
      <div>
        <label className="form-label">Crop Type<span className="text-red-500">*</span></label>
        <select className="form-input" value={form.cropType} onChange={e=>f('cropType',e.target.value)}>
          <option value="">Select…</option>
          {['Napier Grass','Maize','Lucerne','Rhodes Grass','Kikuyu Grass','Sweet Potato Vines','Sorghum','Sugar Cane','Beans','Vegetables','Other'].map(c=><option key={c}>{c}</option>)}
        </select>
      </div>
      <div>
        <label className="form-label">Variety</label>
        <input className="form-input" value={form.variety} onChange={e=>f('variety',e.target.value)} placeholder="e.g. KH500"/>
      </div>
      <div>
        <label className="form-label">Planting Date</label>
        <input className="form-input" type="date" value={form.plantingDate} onChange={e=>f('plantingDate',e.target.value)}/>
      </div>
      <div>
        <label className="form-label">Expected Harvest</label>
        <input className="form-input" type="date" value={form.expectedHarvest} onChange={e=>f('expectedHarvest',e.target.value)}/>
      </div>
      <div>
        <label className="form-label">Seeds Used (kg)</label>
        <input className="form-input" type="number" value={form.seedsKg} onChange={e=>f('seedsKg',e.target.value)}/>
      </div>
      <div>
        <label className="form-label">Fertilizer Applied</label>
        <input className="form-input" value={form.fertilizer} onChange={e=>f('fertilizer',e.target.value)} placeholder="e.g. CAN 50kg"/>
      </div>
      <div className="col-span-2">
        <label className="form-label">Notes</label>
        <textarea className="form-input resize-y min-h-[50px]" value={form.notes} onChange={e=>f('notes',e.target.value)}/>
      </div>
      <div className="col-span-2 flex justify-end gap-3 pt-2 border-t border-[#e8e0d0]">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave}>Save Crop Plan</button>
      </div>
    </div>
  );
}

export default function Crops() {
  const { formatCurrency } = useApp();
  const [tab,      setTab]      = useState('plots');
  const [showPlot, setShowPlot] = useState(false);
  const [showPlan, setShowPlan] = useState(false);

  const plots    = useLiveQuery(() => db.plots.toArray(),    []);
  const plans    = useLiveQuery(() => db.cropPlans.toArray(),[]);
  const harvests = useLiveQuery(() => db.harvests.toArray(), []);

  const totalArea = (plots||[]).reduce((s,p)=>s+(parseFloat(p.size)||0),0);
  const upcoming  = (plans||[]).filter(p=>{
    const d = safeDaysFromNow(p.expectedHarvest);
    return d !== null && d >= 0 && d <= 30;
  }).length;

  const plotCols = [
    { key:'name',       label:'Plot Name',  render:v=><span className="font-semibold">{v}</span> },
    { key:'size',       label:'Size',       render:(v,row)=>`${v||'—'} ${row.unit||''}` },
    { key:'soilType',   label:'Soil Type',  render:v=>v||'—' },
    { key:'currentUse', label:'Current Use',render:v=>v||'—' },
    { key:'gps',        label:'GPS',        render:v=>v||'—' },
  ];

  const planCols = [
    { key:'plotId',          label:'Plot',     render:(_,row)=>(plots||[]).find(p=>p.id===row.plotId)?.name||'—' },
    { key:'cropType',        label:'Crop',     render:v=>v||'—' },
    { key:'variety',         label:'Variety',  render:v=>v||'—' },
    { key:'plantingDate',    label:'Planted',  render:v=>v?formatDate(v):'—' },
    { key:'expectedHarvest', label:'Expected', render:v=>{
        const d = safeDaysFromNow(v);
        if (!v) return '—';
        return <span className={d!==null&&d<=7&&d>=0?'text-amber-600 font-semibold':d<0?'text-red-600':''}>
          {formatDate(v)}{d!==null&&d>=0?` (${d}d)`:d!==null&&d<0?' (overdue)':''}
        </span>;
      }},
  ];

  const harvestCols = [
    { key:'plotId',       label:'Plot',  render:(_,row)=>(plots||[]).find(p=>p.id===row.plotId)?.name||'—' },
    { key:'date',         label:'Date',  render:v=>v?formatDate(v):'—' },
    { key:'crop',         label:'Crop',  render:v=>v||'—' },
    { key:'quantity',     label:'Yield', render:(v,row)=>`${v||0} ${row.unit||''}` },
    { key:'qualityGrade', label:'Grade', render:v=>v?<span className={`badge ${v==='A'?'badge-green':v==='B'?'badge-blue':'badge-gray'}`}>{v}</span>:'—' },
  ];

  return (
    <div className="page-content">
      <PageHeader title="Crops & Pasture"
        actions={
          <div className="flex gap-2">
            <button className="btn btn-secondary" onClick={()=>setShowPlot(true)}><Plus size={14}/>Add Plot</button>
            <button className="btn btn-primary"   onClick={()=>setShowPlan(true)}><Leaf size={15}/>New Crop Plan</button>
          </div>
        }
      />

      <StatGrid cols={3}>
        <KPICard label="Total Plots"       value={plots?.length||0}                icon="🌿"/>
        <KPICard label="Total Area"        value={`${totalArea.toFixed(1)} acres`} icon="📏"/>
        <KPICard label="Harvest Due (30d)" value={upcoming}                        icon="🌾" color={upcoming>0?'#d97706':undefined}/>
      </StatGrid>

      <div className="flex gap-2 mb-4">
        {[['plots','Plots'],['plans','Crop Plans'],['harvests','Harvests']].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${tab===k?'bg-[#2D5016] text-white':'bg-white border border-[#e8e0d0] text-[#6B7C3A]'}`}>
            {l}
          </button>
        ))}
      </div>

      <div className="card">
        {tab==='plots'    && <DataTable columns={plotCols}    rows={plots||[]}    emptyText="No plots yet. Click 'Add Plot' to register your first field or pasture."/>}
        {tab==='plans'    && <DataTable columns={planCols}    rows={plans||[]}    emptyText="No crop plans yet. Click 'New Crop Plan' to start planning."/>}
        {tab==='harvests' && <DataTable columns={harvestCols} rows={harvests||[]} emptyText="No harvest records yet."/>}
      </div>

      {showPlot && <Modal open title="Add Plot / Field" onClose={()=>setShowPlot(false)}><PlotForm onClose={()=>setShowPlot(false)}/></Modal>}
      {showPlan && <Modal open title="New Crop Plan" onClose={()=>setShowPlan(false)} size="lg"><CropPlanForm plots={plots} onClose={()=>setShowPlan(false)}/></Modal>}
    </div>
  );
}
