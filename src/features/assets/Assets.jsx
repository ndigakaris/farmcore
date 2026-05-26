// Assets module
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../../db/schema.js';
import { useApp } from '../../context/AppContext.jsx';
import { Modal, KPICard, StatGrid, PageHeader, DataTable } from '../../components/UI.jsx';
import { formatDate, todayStr, daysFromNow } from '../../utils/index.js';
import { Plus, AlertTriangle } from 'lucide-react';

function AssetForm({ initial={}, onClose }) {
  const [form, setForm] = useState({ name:'', type:'Equipment', make:'', serial:'', purchaseDate:'', purchaseCost:'', condition:'Good', nextService:'', status:'active', notes:'', ...initial });
  const f = (k,v) => setForm(p=>({...p,[k]:v}));
  const handleSave = async () => {
    if (!form.name) return;
    const rec = { ...form, purchaseCost:parseFloat(form.purchaseCost)||0, syncStatus:'pending', updatedAt:new Date() };
    if (initial.id) await db.assets.update(initial.id, rec);
    else            await db.assets.add(rec);
    onClose();
  };
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="col-span-2"><label className="form-label">Asset Name<span className="text-red-500">*</span></label><input className="form-input" value={form.name} onChange={e=>f('name',e.target.value)} placeholder="e.g. Milk Cooling Tank 2000L"/></div>
      <div><label className="form-label">Type</label>
        <select className="form-input" value={form.type} onChange={e=>f('type',e.target.value)}>
          {['Equipment','Vehicle','Infrastructure','Tool','Land'].map(t=><option key={t}>{t}</option>)}
        </select>
      </div>
      <div><label className="form-label">Make / Brand</label><input className="form-input" value={form.make} onChange={e=>f('make',e.target.value)}/></div>
      <div><label className="form-label">Serial No.</label><input className="form-input" value={form.serial} onChange={e=>f('serial',e.target.value)}/></div>
      <div><label className="form-label">Purchase Date</label><input className="form-input" type="date" value={form.purchaseDate} onChange={e=>f('purchaseDate',e.target.value)}/></div>
      <div><label className="form-label">Purchase Cost (KES)</label><input className="form-input" type="number" value={form.purchaseCost} onChange={e=>f('purchaseCost',e.target.value)}/></div>
      <div><label className="form-label">Condition</label>
        <select className="form-input" value={form.condition} onChange={e=>f('condition',e.target.value)}>
          {['Excellent','Good','Fair','Poor'].map(c=><option key={c}>{c}</option>)}
        </select>
      </div>
      <div><label className="form-label">Next Service Date</label><input className="form-input" type="date" value={form.nextService} onChange={e=>f('nextService',e.target.value)}/></div>
      <div className="col-span-2 flex justify-end gap-3 pt-2 border-t border-[#e8e0d0]">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave}>{initial.id?'Update Asset':'Add Asset'}</button>
      </div>
    </div>
  );
}

export function Assets() {
  const { formatCurrency } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing]   = useState(null);
  const [tab, setTab]           = useState('assets');

  const assets      = useLiveQuery(() => db.assets.toArray(), []);
  const maintenance = useLiveQuery(() => db.maintenance.orderBy('date').reverse().toArray(), []);

  const overdueService = (assets||[]).filter(a=>a.nextService && daysFromNow(a.nextService)!=null && daysFromNow(a.nextService)<0);
  const totalValue     = (assets||[]).reduce((s,a)=>s+(a.purchaseCost||0),0);

  const cols = [
    { key:'name',       label:'Asset',       render:v=><span className="font-semibold">{v}</span> },
    { key:'type',       label:'Type' },
    { key:'make',       label:'Make' },
    { key:'serial',     label:'Serial' },
    { key:'purchaseCost',label:'Value',      render:v=>formatCurrency(v) },
    { key:'condition',  label:'Condition',   render:v=><span className={`badge ${v==='Excellent'||v==='Good'?'badge-green':v==='Fair'?'badge-amber':'badge-red'}`}>{v}</span> },
    { key:'nextService',label:'Next Service',render:v=>{ if(!v)return'—'; const d=daysFromNow(v); return <span className={d!=null&&d<0?'text-red-600 font-semibold':d!=null&&d<14?'text-amber-600':''}>{d!=null&&d<0?`${Math.abs(d)}d OVERDUE`:formatDate(v)}</span>; }},
    { key:'id', label:'', render:(_,row)=>(
        <button className="btn btn-secondary py-1 px-2 text-xs" onClick={()=>{setEditing(row);setShowForm(true);}}>Edit</button>
      )},
  ];

  const maintCols = [
    { key:'assetId',    label:'Asset',       render:(_,row)=>{ const a=assets?.find(x=>x.id===row.assetId); return a?.name||'—'; }},
    { key:'date',       label:'Date',        render:v=>formatDate(v) },
    { key:'workDone',   label:'Work Done',   render:v=><span className="text-sm">{v}</span> },
    { key:'technician', label:'Technician' },
    { key:'cost',       label:'Cost',        render:v=>`KES ${v?.toLocaleString()}` },
    { key:'downtimeHours', label:'Downtime', render:v=>v?`${v}h`:'—' },
  ];

  return (
    <div className="page-content">
      <PageHeader title="Assets & Maintenance" actions={<button className="btn btn-primary" onClick={()=>{setEditing(null);setShowForm(true);}}><Plus size={15}/>Add Asset</button>}/>
      <StatGrid cols={3}>
        <KPICard label="Total Assets" value={assets?.length||0} icon="🚜"/>
        <KPICard label="Service Overdue" value={overdueService.length} icon="⚠️" color={overdueService.length>0?'#dc2626':undefined}/>
        <KPICard label="Asset Value" value={formatCurrency(totalValue)} icon="💰"/>
      </StatGrid>
      {overdueService.length>0&&<div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 flex items-center gap-3"><AlertTriangle size={16} className="text-red-600"/><p className="text-sm text-red-700">{overdueService.map(a=>a.name).join(', ')} — service overdue. Please schedule maintenance.</p></div>}
      <div className="flex gap-2 mb-4">
        {[['assets','Assets'],['maintenance','Maintenance Log']].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${tab===k?'bg-[#2D5016] text-white':'bg-white border border-[#e8e0d0] text-[#6B7C3A]'}`}>{l}</button>
        ))}
      </div>
      <div className="card">
        {tab==='assets'      && <DataTable columns={cols}      rows={assets||[]}      emptyText="No assets yet."/>}
        {tab==='maintenance' && <DataTable columns={maintCols} rows={maintenance||[]} emptyText="No maintenance records."/>}
      </div>
      {showForm&&<Modal open title={editing?'Edit Asset':'Add Asset'} onClose={()=>setShowForm(false)}><AssetForm initial={editing||{}} onClose={()=>setShowForm(false)}/></Modal>}
    </div>
  );
}
