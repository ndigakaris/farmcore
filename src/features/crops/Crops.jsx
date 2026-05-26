import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../../db/schema.js';
import { useApp } from '../../context/AppContext.jsx';
import { Modal, KPICard, StatGrid, PageHeader, DataTable } from '../../components/UI.jsx';
import { formatDate, todayStr, daysFromNow } from '../../utils/index.js';
import { Plus, Leaf } from 'lucide-react';

export default function Crops() {
  const { formatCurrency } = useApp();
  const [tab, setTab]         = useState('plots');
  const [showPlot, setShowPlot]= useState(false);
  const [showPlan, setShowPlan]= useState(false);

  const plots    = useLiveQuery(() => db.plots.toArray(), []);
  const plans    = useLiveQuery(() => db.cropPlans.orderBy('plantingDate').reverse().toArray(), []);
  const harvests = useLiveQuery(() => db.harvests.orderBy('date').reverse().toArray(), []);

  const totalArea = (plots||[]).reduce((s,p)=>s+(parseFloat(p.size)||0),0);
  const upcoming  = (plans||[]).filter(p=>{ const d=daysFromNow(p.expectedHarvest); return d!=null&&d>=0&&d<=30; }).length;

  const plotCols = [
    { key:'name',       label:'Plot Name',  render:v=><span className="font-semibold">{v}</span> },
    { key:'size',       label:'Size',       render:(v,row)=>`${v} ${row.unit}` },
    { key:'soilType',   label:'Soil Type' },
    { key:'currentUse', label:'Current Use'},
    { key:'gps',        label:'GPS' },
  ];
  const planCols = [
    { key:'plotId',          label:'Plot',     render:(_,row)=>plots?.find(p=>p.id===row.plotId)?.name||'—' },
    { key:'cropType',        label:'Crop' },
    { key:'variety',         label:'Variety' },
    { key:'plantingDate',    label:'Planted',  render:v=>formatDate(v) },
    { key:'expectedHarvest', label:'Expected', render:v=>{ const d=daysFromNow(v); return <span className={d!=null&&d<=7?'text-amber-600 font-semibold':''}>{formatDate(v)} {d!=null&&d>=0?`(${d}d)`:''}</span>; }},
  ];
  const harvestCols = [
    { key:'plotId',       label:'Plot',     render:(_,row)=>plots?.find(p=>p.id===row.plotId)?.name||'—' },
    { key:'date',         label:'Date',     render:v=>formatDate(v) },
    { key:'crop',         label:'Crop' },
    { key:'quantity',     label:'Yield',    render:(v,row)=>`${v} ${row.unit}` },
    { key:'qualityGrade', label:'Grade',    render:v=><span className={`badge ${v==='A'?'badge-green':v==='B'?'badge-blue':'badge-gray'}`}>{v}</span> },
  ];

  return (
    <div className="page-content">
      <PageHeader title="Crops & Pasture" actions={
        <div className="flex gap-2">
          <button className="btn btn-secondary" onClick={()=>setShowPlot(true)}><Plus size={14}/>Add Plot</button>
          <button className="btn btn-primary" onClick={()=>setShowPlan(true)}><Leaf size={15}/>New Crop Plan</button>
        </div>
      }/>
      <StatGrid cols={3}>
        <KPICard label="Total Plots" value={plots?.length||0} icon="🌿"/>
        <KPICard label="Total Area" value={`${totalArea.toFixed(1)} acres`} icon="📏"/>
        <KPICard label="Harvest Due (30d)" value={upcoming} icon="🌾" color={upcoming>0?'#d97706':undefined}/>
      </StatGrid>
      <div className="flex gap-2 mb-4">
        {[['plots','Plots'],['plans','Crop Plans'],['harvests','Harvests']].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${tab===k?'bg-[#2D5016] text-white':'bg-white border border-[#e8e0d0] text-[#6B7C3A]'}`}>{l}</button>
        ))}
      </div>
      <div className="card">
        {tab==='plots'    && <DataTable columns={plotCols}    rows={plots||[]}    emptyText="No plots registered."/>}
        {tab==='plans'    && <DataTable columns={planCols}    rows={plans||[]}    emptyText="No crop plans yet."/>}
        {tab==='harvests' && <DataTable columns={harvestCols} rows={harvests||[]} emptyText="No harvest records yet."/>}
      </div>
    </div>
  );
}
