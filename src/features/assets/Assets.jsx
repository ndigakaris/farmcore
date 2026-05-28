// Assets module
import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../../db/schema.js';
import { useApp } from '../../context/AppContext.jsx';
import { Modal, KPICard, StatGrid, PageHeader, DataTable } from '../../components/UI.jsx';
import { formatDate, todayStr, daysFromNow } from '../../utils/index.js';
import { Plus, AlertTriangle, Search } from 'lucide-react';

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

// ── Maintenance Form — individual form with asset search/dropdown ──
function MaintenanceForm({ onClose }) {
  const [search, setSearch]   = useState('');
  const [form, setForm]       = useState({
    assetId:'', date:todayStr(), workDone:'', technician:'',
    cost:'', downtimeHours:'', nextService:'', notes:''
  });
  const [saving, setSaving]   = useState(false);
  const assets = useLiveQuery(() => db.assets.toArray(), []);
  const f = (k,v) => setForm(p=>({...p,[k]:v}));

  const filteredAssets = useMemo(()=>
    (assets||[]).filter(a=>
      !search ||
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.type.toLowerCase().includes(search.toLowerCase()) ||
      (a.make||'').toLowerCase().includes(search.toLowerCase())
    ),[assets,search]);

  const selectedAsset = (assets||[]).find(a=>a.id===Number(form.assetId));

  const handleSave = async () => {
    if (!form.assetId || !form.workDone) return;
    setSaving(true);
    try {
      await db.maintenance.add({
        ...form,
        assetId: Number(form.assetId),
        cost: parseFloat(form.cost)||0,
        downtimeHours: parseFloat(form.downtimeHours)||0,
        syncStatus:'pending', updatedAt:new Date()
      });
      // Update asset's next service date and condition
      if (form.nextService || form.cost > 0) {
        await db.assets.update(Number(form.assetId), {
          ...(form.nextService ? { nextService: form.nextService } : {}),
          syncStatus:'pending', updatedAt:new Date()
        });
      }
      // Auto-record as Equipment Maintenance expense in Finance
      if (parseFloat(form.cost) > 0) {
        await db.transactions.add({
          type:'expense', category:'Equipment Maintenance',
          description:`Maintenance: ${selectedAsset?.name} – ${form.workDone}`,
          amount: parseFloat(form.cost),
          date: form.date, species:'overhead',
          paymentMethod:'Cash', source:'maintenance',
          syncStatus:'pending', updatedAt:new Date()
        });
      }
      onClose();
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      {/* Asset search */}
      <div>
        <label className="form-label">Asset<span className="text-red-500">*</span></label>
        <div className="relative mb-2">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
          <input className="form-input pl-8" placeholder="Search by name, type or make…"
            value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        <select className="form-input" value={form.assetId} onChange={e=>f('assetId',e.target.value)}>
          <option value="">Select asset…</option>
          {filteredAssets.map(a=>(
            <option key={a.id} value={a.id}>
              {a.name} · {a.type}{a.make?` (${a.make})`:''}
            </option>
          ))}
        </select>
        {selectedAsset && (
          <div className="mt-2 bg-[#F5F0E8] rounded-lg px-3 py-2 text-xs text-gray-600 flex gap-4">
            <span>Type: <strong>{selectedAsset.type}</strong></span>
            <span>Condition: <strong>{selectedAsset.condition}</strong></span>
            {selectedAsset.nextService && <span>Last service due: <strong>{formatDate(selectedAsset.nextService)}</strong></span>}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div><label className="form-label">Date</label><input className="form-input" type="date" value={form.date} onChange={e=>f('date',e.target.value)}/></div>
        <div><label className="form-label">Technician</label><input className="form-input" value={form.technician} onChange={e=>f('technician',e.target.value)} placeholder="Name or company"/></div>
        <div className="col-span-2">
          <label className="form-label">Work Done<span className="text-red-500">*</span></label>
          <textarea className="form-input resize-y min-h-[60px]" value={form.workDone} onChange={e=>f('workDone',e.target.value)} placeholder="Describe maintenance work performed…"/>
        </div>
        <div>
          <label className="form-label">Cost (KES)</label>
          <input className="form-input" type="number" value={form.cost} onChange={e=>f('cost',e.target.value)}/>
          <p className="text-xs text-green-700 mt-1">💡 Auto-recorded in Finance</p>
        </div>
        <div><label className="form-label">Downtime (hours)</label><input className="form-input" type="number" step="0.5" value={form.downtimeHours} onChange={e=>f('downtimeHours',e.target.value)}/></div>
        <div><label className="form-label">Next Service Date</label><input className="form-input" type="date" value={form.nextService} onChange={e=>f('nextService',e.target.value)}/></div>
        <div><label className="form-label">Notes</label><input className="form-input" value={form.notes} onChange={e=>f('notes',e.target.value)}/></div>
      </div>

      <div className="flex justify-end gap-3 pt-2 border-t border-[#e8e0d0]">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Log Maintenance'}
        </button>
      </div>
    </div>
  );
}

// ── Main Assets Component ─────────────────────────────────────
export function Assets() {
  const { formatCurrency } = useApp();
  const [showAssetForm, setShowAssetForm]   = useState(false);
  const [showMaintForm, setShowMaintForm]   = useState(false);
  const [editing,       setEditing]         = useState(null);
  const [tab,           setTab]             = useState('assets');
  const [maintSearch,   setMaintSearch]     = useState('');

  const assets      = useLiveQuery(() => db.assets.toArray(), []);
  const maintenance = useLiveQuery(() => db.maintenance.orderBy('date').reverse().toArray(), []);

  const overdueService = (assets||[]).filter(a=>a.nextService && daysFromNow(a.nextService)!=null && daysFromNow(a.nextService)<0);
  const totalValue     = (assets||[]).reduce((s,a)=>s+(a.purchaseCost||0),0);

  const filteredMaint = useMemo(()=>
    (maintenance||[]).filter(m=>{
      if (!maintSearch) return true;
      const a = (assets||[]).find(x=>x.id===m.assetId);
      return (a?.name||'').toLowerCase().includes(maintSearch.toLowerCase()) ||
             (m.workDone||'').toLowerCase().includes(maintSearch.toLowerCase()) ||
             (m.technician||'').toLowerCase().includes(maintSearch.toLowerCase());
    }),[maintenance,assets,maintSearch]);

  const cols = [
    { key:'name',        label:'Asset',       render:v=><span className="font-semibold">{v}</span> },
    { key:'type',        label:'Type' },
    { key:'make',        label:'Make' },
    { key:'serial',      label:'Serial' },
    { key:'purchaseCost',label:'Value',        render:v=>formatCurrency(v) },
    { key:'condition',   label:'Condition',   render:v=><span className={`badge ${v==='Excellent'||v==='Good'?'badge-green':v==='Fair'?'badge-amber':'badge-red'}`}>{v}</span> },
    { key:'nextService', label:'Next Service',render:v=>{ if(!v)return'—'; const d=daysFromNow(v); return <span className={d!=null&&d<0?'text-red-600 font-semibold':d!=null&&d<14?'text-amber-600':''}>{d!=null&&d<0?`${Math.abs(d)}d OVERDUE`:formatDate(v)}</span>; }},
    { key:'id', label:'', render:(_,row)=><button className="btn btn-secondary py-1 px-2 text-xs" onClick={()=>{setEditing(row);setShowAssetForm(true);}}>Edit</button> },
  ];

  const maintCols = [
    { key:'assetId',    label:'Asset',       render:(_,row)=>{ const a=(assets||[]).find(x=>x.id===row.assetId); return <span className="font-medium">{a?.name||'—'}</span>; }},
    { key:'date',       label:'Date',        render:v=>formatDate(v) },
    { key:'workDone',   label:'Work Done',   render:v=><span className="text-sm">{v}</span> },
    { key:'technician', label:'Technician' },
    { key:'cost',       label:'Cost',        render:v=>`KES ${(v||0).toLocaleString()}` },
    { key:'downtimeHours', label:'Downtime', render:v=>v?`${v}h`:'—' },
    { key:'nextService', label:'Next Service', render:v=>formatDate(v)||'—' },
  ];

  return (
    <div className="page-content">
      <PageHeader title="Assets & Maintenance"
        actions={
          <div className="flex gap-2">
            <button className="btn btn-secondary" onClick={()=>setShowMaintForm(true)}><Plus size={15}/>Log Maintenance</button>
            <button className="btn btn-primary" onClick={()=>{setEditing(null);setShowAssetForm(true);}}><Plus size={15}/>Add Asset</button>
          </div>
        }
      />
      <StatGrid cols={3}>
        <KPICard label="Total Assets"   value={assets?.length||0} icon="🚜"/>
        <KPICard label="Service Overdue" value={overdueService.length} icon="⚠️" color={overdueService.length>0?'#dc2626':undefined}/>
        <KPICard label="Asset Value"    value={formatCurrency(totalValue)} icon="💰"/>
      </StatGrid>

      {overdueService.length>0&&(
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 flex items-center gap-3">
          <AlertTriangle size={16} className="text-red-600"/>
          <p className="text-sm text-red-700">{overdueService.map(a=>a.name).join(', ')} — service overdue.</p>
        </div>
      )}

      <div className="flex gap-2 mb-4">
        {[['assets','Assets'],['maintenance','Maintenance Log']].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${tab===k?'bg-[#2D5016] text-white':'bg-white border border-[#e8e0d0] text-[#6B7C3A]'}`}>
            {l}
          </button>
        ))}
      </div>

      {/* Maintenance search bar */}
      {tab==='maintenance' && (
        <div className="relative mb-4">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
          <input className="form-input pl-8" placeholder="Search maintenance records by asset, work done or technician…"
            value={maintSearch} onChange={e=>setMaintSearch(e.target.value)}/>
        </div>
      )}

      <div className="card">
        {tab==='assets'      && <DataTable columns={cols}      rows={assets||[]}       emptyText="No assets yet."/>}
        {tab==='maintenance' && <DataTable columns={maintCols} rows={filteredMaint}    emptyText="No maintenance records."/>}
      </div>

      {showAssetForm && <Modal open title={editing?'Edit Asset':'Add Asset'} onClose={()=>setShowAssetForm(false)}><AssetForm initial={editing||{}} onClose={()=>setShowAssetForm(false)}/></Modal>}
      {showMaintForm && <Modal open title="Log Maintenance" subtitle="Cost auto-recorded in Finance" onClose={()=>setShowMaintForm(false)} size="lg"><MaintenanceForm onClose={()=>setShowMaintForm(false)}/></Modal>}
    </div>
  );
}
