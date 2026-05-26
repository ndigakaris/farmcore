import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../../db/schema.js';
import { useApp } from '../../context/AppContext.jsx';
import { Modal, KPICard, StatGrid, PageHeader, DataTable, SectionCard } from '../../components/UI.jsx';
import { formatDate, todayStr, offsetDate } from '../../utils/index.js';
import { Plus, Package, CheckCircle } from 'lucide-react';

function POForm({ suppliers, onClose }) {
  const [items, setItems]   = useState([{ name:'', qty:'', unit:'bags', unitCost:'' }]);
  const [form, setForm]     = useState({ supplierId:'', date:todayStr(), deliveryDate:'', notes:'', raisedBy:'James Mwangi' });
  const f = (k,v) => setForm(p=>({...p,[k]:v}));
  const updateItem = (i,k,v) => setItems(prev => prev.map((it,idx)=>idx===i?{...it,[k]:v}:it));
  const addItem  = () => setItems(p=>[...p,{name:'',qty:'',unit:'bags',unitCost:''}]);
  const total    = items.reduce((s,it)=>s+(parseFloat(it.qty)||0)*(parseFloat(it.unitCost)||0),0);
  const handleSave = async () => {
    if (!form.supplierId || !items[0].name) return;
    const poNum = 'PO-'+new Date().getFullYear()+'-'+String(Math.floor(Math.random()*900)+100);
    await db.purchaseOrders.add({ ...form, supplierId:Number(form.supplierId), poNumber:poNum, items, totalCost:total, status:'pending', approvedBy:'', syncStatus:'pending', updatedAt:new Date() });
    onClose();
  };
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2"><label className="form-label">Supplier<span className="text-red-500">*</span></label>
          <select className="form-input" value={form.supplierId} onChange={e=>f('supplierId',e.target.value)}>
            <option value="">Select supplier…</option>
            {suppliers?.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div><label className="form-label">Order Date</label><input className="form-input" type="date" value={form.date} onChange={e=>f('date',e.target.value)}/></div>
        <div><label className="form-label">Expected Delivery</label><input className="form-input" type="date" value={form.deliveryDate} onChange={e=>f('deliveryDate',e.target.value)}/></div>
        <div><label className="form-label">Raised By</label><input className="form-input" value={form.raisedBy} onChange={e=>f('raisedBy',e.target.value)}/></div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="form-label mb-0">Line Items</label>
          <button type="button" onClick={addItem} className="text-xs text-[#2D5016] hover:underline">+ Add item</button>
        </div>
        {items.map((it,i)=>(
          <div key={i} className="grid grid-cols-4 gap-2 mb-2">
            <input className="form-input col-span-2" placeholder="Item name" value={it.name} onChange={e=>updateItem(i,'name',e.target.value)}/>
            <input className="form-input" type="number" placeholder="Qty" value={it.qty} onChange={e=>updateItem(i,'qty',e.target.value)}/>
            <input className="form-input" type="number" placeholder="Unit cost" value={it.unitCost} onChange={e=>updateItem(i,'unitCost',e.target.value)}/>
          </div>
        ))}
        <p className="text-xs font-semibold text-right text-[#2D5016]">Total: KES {total.toLocaleString()}</p>
      </div>
      <div><label className="form-label">Notes</label><textarea className="form-input resize-y min-h-[50px]" value={form.notes} onChange={e=>f('notes',e.target.value)}/></div>
      <div className="flex justify-end gap-3 pt-2 border-t border-[#e8e0d0]">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave}>Create Purchase Order</button>
      </div>
    </div>
  );
}

function SupplierForm({ initial={}, onClose }) {
  const [form, setForm] = useState({ name:'', contact:'', location:'', terms:'Net 30', mpesa:'', notes:'', ...initial });
  const f = (k,v) => setForm(p=>({...p,[k]:v}));
  const handleSave = async () => {
    if (!form.name) return;
    const rec = { ...form, syncStatus:'pending', updatedAt:new Date() };
    if (initial.id) await db.suppliers.update(initial.id, rec);
    else            await db.suppliers.add(rec);
    onClose();
  };
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="col-span-2"><label className="form-label">Supplier Name<span className="text-red-500">*</span></label><input className="form-input" value={form.name} onChange={e=>f('name',e.target.value)}/></div>
      <div><label className="form-label">Contact / Phone</label><input className="form-input" value={form.contact} onChange={e=>f('contact',e.target.value)}/></div>
      <div><label className="form-label">Location</label><input className="form-input" value={form.location} onChange={e=>f('location',e.target.value)}/></div>
      <div><label className="form-label">Payment Terms</label>
        <select className="form-input" value={form.terms} onChange={e=>f('terms',e.target.value)}>
          <option>Immediate</option><option>Net 7</option><option>Net 14</option><option>Net 30</option>
        </select>
      </div>
      <div><label className="form-label">Mpesa Paybill / Till</label><input className="form-input" value={form.mpesa} onChange={e=>f('mpesa',e.target.value)}/></div>
      <div className="col-span-2"><label className="form-label">Notes</label><textarea className="form-input resize-y min-h-[50px]" value={form.notes} onChange={e=>f('notes',e.target.value)}/></div>
      <div className="col-span-2 flex justify-end gap-3 pt-2 border-t border-[#e8e0d0]">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave}>{initial.id?'Update':'Add Supplier'}</button>
      </div>
    </div>
  );
}

export default function Procurement() {
  const { formatCurrency } = useApp();
  const [tab, setTab]       = useState('pos');
  const [showPO, setShowPO] = useState(false);
  const [showSup,setShowSup]= useState(false);
  const [editSup,setEditSup]= useState(null);

  const suppliers = useLiveQuery(() => db.suppliers.toArray(), []);
  const pos       = useLiveQuery(() => db.purchaseOrders.orderBy('date').reverse().toArray(), []);
  const grns      = useLiveQuery(() => db.grns.orderBy('date').reverse().toArray(), []);

  const pendingPOs   = (pos||[]).filter(p=>p.status==='pending').length;
  const totalSpend   = (pos||[]).reduce((s,p)=>s+(p.totalCost||0),0);

  const approvePO = async (id) => {
    await db.purchaseOrders.update(id, { status:'approved', approvedBy:'James Mwangi', updatedAt:new Date() });
  };

  const poCols = [
    { key:'poNumber', label:'PO No.',    render:v=><span className="font-mono font-semibold text-xs">{v}</span> },
    { key:'supplierId', label:'Supplier', render:(_,row)=>{ const s=suppliers?.find(x=>x.id===row.supplierId); return s?.name||'—'; }},
    { key:'date',   label:'Raised',     render:v=>formatDate(v) },
    { key:'deliveryDate', label:'Delivery', render:v=>formatDate(v) },
    { key:'totalCost', label:'Value',   render:v=>formatCurrency(v) },
    { key:'raisedBy',  label:'By' },
    { key:'status',    label:'Status',  render:v=><span className={`badge ${v==='received'?'badge-green':v==='approved'?'badge-blue':v==='pending'?'badge-amber':'badge-gray'}`}>{v}</span> },
    { key:'id', label:'', render:(_,row)=>row.status==='pending'
        ? <button className="btn btn-primary py-1 px-2 text-xs" onClick={()=>approvePO(row.id)}><CheckCircle size={12}/>Approve</button>
        : <span className="text-xs text-gray-400">{row.approvedBy||'—'}</span> },
  ];

  const supCols = [
    { key:'name',     label:'Supplier',  render:v=><span className="font-semibold">{v}</span> },
    { key:'contact',  label:'Contact' },
    { key:'location', label:'Location' },
    { key:'terms',    label:'Terms' },
    { key:'mpesa',    label:'Mpesa' },
    { key:'id', label:'', render:(_,row)=>(
        <button className="btn btn-secondary py-1 px-2 text-xs" onClick={()=>{setEditSup(row);setShowSup(true);}}>Edit</button>
      )},
  ];

  return (
    <div className="page-content">
      <PageHeader title="Procurement" actions={
        <div className="flex gap-2">
          <button className="btn btn-secondary" onClick={()=>{setEditSup(null);setShowSup(true);}}><Plus size={14}/>Supplier</button>
          <button className="btn btn-primary" onClick={()=>setShowPO(true)}><Package size={15}/>New Purchase Order</button>
        </div>
      }/>

      <StatGrid cols={3}>
        <KPICard label="Suppliers" value={suppliers?.length||0} icon="🏭"/>
        <KPICard label="Pending POs" value={pendingPOs} icon="⏳" color={pendingPOs>0?'#d97706':undefined}/>
        <KPICard label="Total Spend (All POs)" value={formatCurrency(totalSpend)} icon="💳"/>
      </StatGrid>

      <div className="flex gap-2 mb-4">
        {[['pos','Purchase Orders'],['grns','Goods Received'],['suppliers','Suppliers']].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${tab===k?'bg-[#2D5016] text-white':'bg-white border border-[#e8e0d0] text-[#6B7C3A] hover:bg-[#F5F0E8]'}`}>
            {l}
          </button>
        ))}
      </div>

      <div className="card">
        {tab==='pos'       && <DataTable columns={poCols} rows={pos||[]} emptyText="No purchase orders yet."/>}
        {tab==='suppliers' && <DataTable columns={supCols} rows={suppliers||[]} emptyText="No suppliers yet."/>}
        {tab==='grns'      && <DataTable columns={[
          { key:'poId',   label:'PO',     render:(_,row)=>{ const po=pos?.find(p=>p.id===row.poId); return po?.poNumber||'—'; }},
          { key:'date',   label:'Date',   render:v=>formatDate(v) },
          { key:'receivedBy', label:'Received By' },
          { key:'notes',  label:'Notes' },
        ]} rows={grns||[]} emptyText="No GRNs yet."/>}
      </div>

      {showPO  && <Modal open title="Create Purchase Order" size="lg" onClose={()=>setShowPO(false)}><POForm suppliers={suppliers} onClose={()=>setShowPO(false)}/></Modal>}
      {showSup && <Modal open title={editSup?'Edit Supplier':'Add Supplier'} onClose={()=>setShowSup(false)}><SupplierForm initial={editSup||{}} onClose={()=>setShowSup(false)}/></Modal>}
    </div>
  );
}
