import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../../db/schema.js';
import { useApp } from '../../context/AppContext.jsx';
import { SPECIES } from '../../constants/index.js';
import { Modal, KPICard, StatGrid, PageHeader, DataTable, UnitSelector, SectionCard } from '../../components/UI.jsx';
import { formatDate, todayStr } from '../../utils/index.js';
import { Plus, AlertTriangle } from 'lucide-react';

function FeedForm({ initial = {}, onClose }) {
  const [form, setForm] = useState({ feedType:'', supplier:'', quantity:'', unit:'kg', minStock:'', costPerUnit:'', species:'cattle', notes:'', ...initial });
  const f = (k,v) => setForm(p=>({...p,[k]:v}));
  const handleSave = async () => {
    if (!form.feedType) return;
    const rec = { ...form, quantity:parseFloat(form.quantity)||0, minStock:parseFloat(form.minStock)||0, costPerUnit:parseFloat(form.costPerUnit)||0, lastRestocked:todayStr(), syncStatus:'pending', updatedAt:new Date() };
    if (initial.id) await db.feedInventory.update(initial.id, rec);
    else            await db.feedInventory.add(rec);
    onClose();
  };
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="col-span-2"><label className="form-label">Feed Type<span className="text-red-500">*</span></label><input className="form-input" value={form.feedType} onChange={e=>f('feedType',e.target.value)} placeholder="e.g. Dairy Meal, Layer Mash"/></div>
      <div><label className="form-label">Supplier</label><input className="form-input" value={form.supplier} onChange={e=>f('supplier',e.target.value)}/></div>
      <div>
        <label className="form-label">Species</label>
        <select className="form-input" value={form.species} onChange={e=>f('species',e.target.value)}>
          {Object.entries(SPECIES).filter(([k])=>k!=='all').map(([k,v])=><option key={k} value={k}>{v.emoji} {v.label}</option>)}
        </select>
      </div>
      <div><label className="form-label">Current Stock<span className="text-red-500">*</span></label><input className="form-input" type="number" value={form.quantity} onChange={e=>f('quantity',e.target.value)}/></div>
      <div><label className="form-label">Unit</label><UnitSelector units={['kg','g','bags','bales','tonnes']} value={form.unit} onChange={v=>f('unit',v)}/></div>
      <div><label className="form-label">Min Stock (reorder point)</label><input className="form-input" type="number" value={form.minStock} onChange={e=>f('minStock',e.target.value)}/></div>
      <div><label className="form-label">Cost per Unit (KES)</label><input className="form-input" type="number" value={form.costPerUnit} onChange={e=>f('costPerUnit',e.target.value)}/></div>
      <div className="col-span-2 flex justify-end gap-3 pt-2 border-t border-[#e8e0d0]">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave}>{initial.id?'Update':'Add Feed'}</button>
      </div>
    </div>
  );
}

export default function Feed() {
  const { species, formatCurrency } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing]   = useState(null);
  const feedInv = useLiveQuery(() => db.feedInventory.toArray(), []);

  const filtered = (feedInv||[]).filter(f => species==='all'||f.species===species);
  const lowStock  = filtered.filter(f=>f.quantity<=f.minStock*1.2);
  const totalValue = filtered.reduce((s,f)=>s+(f.quantity*f.costPerUnit),0);

  const cols = [
    { key:'feedType', label:'Feed Type', render:v=><span className="font-semibold">{v}</span> },
    { key:'species',  label:'Species',   render:v=><span className="capitalize">{SPECIES[v]?.emoji} {v}</span> },
    { key:'supplier', label:'Supplier' },
    { key:'quantity', label:'In Stock',  render:(v,row)=>{
        const pct = row.minStock>0?(v/row.minStock*100):100;
        const color = pct<120?'text-red-600 font-semibold':pct<200?'text-amber-600':'text-green-700';
        return <span className={color}>{v} {row.unit}</span>;
      }},
    { key:'minStock',    label:'Min Stock',  render:(v,row)=>`${v} ${row.unit}` },
    { key:'costPerUnit', label:'Cost/Unit',  render:(v,row)=>`KES ${v}/${row.unit}` },
    { key:'lastRestocked', label:'Restocked', render:v=>formatDate(v) },
    { key:'id', label:'', render:(_,row)=>(
        <button className="btn btn-secondary py-1 px-2 text-xs" onClick={()=>{setEditing(row);setShowForm(true);}}>Edit</button>
      )},
  ];

  return (
    <div className="page-content">
      <PageHeader title="Feed & Inventory" actions={<button className="btn btn-primary" onClick={()=>{setEditing(null);setShowForm(true);}}><Plus size={15}/>Add Feed Item</button>}/>

      <StatGrid cols={3}>
        <KPICard label="Total Feed Items" value={filtered.length} icon="🌾"/>
        <KPICard label="Low Stock Alerts" value={lowStock.length} icon="⚠️" color={lowStock.length>0?'#dc2626':undefined}/>
        <KPICard label="Inventory Value" value={formatCurrency(totalValue)} icon="💰"/>
      </StatGrid>

      {lowStock.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={16} className="text-amber-600"/>
            <p className="text-sm font-semibold text-amber-700">Low Stock — {lowStock.length} items below reorder point</p>
          </div>
          {lowStock.map(f=>(
            <div key={f.id} className="flex items-center justify-between bg-white rounded px-3 py-2 mb-1 text-sm border border-amber-100">
              <span className="font-medium">{f.feedType}</span>
              <span className="text-red-600 font-semibold">{f.quantity} {f.unit} (min: {f.minStock})</span>
              <button className="btn btn-primary py-0.5 px-2 text-xs">Reorder</button>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <DataTable columns={cols} rows={filtered} emptyText="No feed items in inventory."/>
      </div>

      {showForm && (
        <Modal open title={editing?'Edit Feed Item':'Add Feed Item'} onClose={()=>setShowForm(false)}>
          <FeedForm initial={editing||{}} onClose={()=>setShowForm(false)}/>
        </Modal>
      )}
    </div>
  );
}
