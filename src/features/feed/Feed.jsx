import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../../db/schema.js';
import { useApp } from '../../context/AppContext.jsx';
import { SPECIES } from '../../constants/index.js';
import { Modal, KPICard, StatGrid, PageHeader, DataTable, UnitSelector } from '../../components/UI.jsx';
import { formatDate, todayStr } from '../../utils/index.js';
import { Plus, AlertTriangle, Package } from 'lucide-react';

// Common feed types per species
const COMMON_FEEDS = {
  cattle:  ['Dairy Meal','Maize Germ','Grass Hay','Lucerne','Napier Grass','Silage','Cotton Seed Cake','Sunflower Cake','Minerals & Vitamins','Salt Lick'],
  pigs:    ['Pig Starter','Pig Grower','Pig Finisher','Maize Flour','Soya Meal','Fish Meal','Premix','Omena'],
  goats:   ['Goat Pellets','Grass Hay','Lucerne','Maize Germ','Browse Leaves','Minerals'],
  sheep:   ['Sheep Pellets','Grass Hay','Lucerne','Maize Germ','Molasses','Minerals'],
  poultry: ['Chick Mash','Growers Mash','Layers Mash','Broiler Starter','Broiler Finisher','Kienyeji Mash','Maize Grit','Omena','Premix'],
};

function StockUpdateModal({ feed, onClose }) {
  const [qty, setQty] = useState('');
  const [action, setAction] = useState('add');
  const handleSave = async () => {
    const amount = parseFloat(qty)||0;
    if (!amount) return;
    const newQty = action === 'add'
      ? feed.quantity + amount
      : Math.max(0, feed.quantity - amount);
    await db.feedInventory.update(feed.id, {
      quantity: newQty, lastRestocked: todayStr(),
      syncStatus: 'pending', updatedAt: new Date()
    });
    onClose();
  };
  return (
    <div className="space-y-4">
      <div className="bg-[#F5F0E8] rounded-lg p-3 flex items-center gap-3">
        <Package size={20} className="text-[#2D5016]"/>
        <div>
          <p className="font-semibold text-sm">{feed.feedType}</p>
          <p className="text-xs text-gray-500">Current: <strong>{feed.quantity} {feed.unit}</strong> · Min: {feed.minStock} {feed.unit}</p>
        </div>
      </div>
      {/* Inventory level bar */}
      <div>
        <p className="text-xs font-medium text-gray-600 mb-1">Stock Level</p>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div
            className={`h-3 rounded-full transition-all ${
              feed.minStock > 0 && feed.quantity <= feed.minStock ? 'bg-red-500' :
              feed.minStock > 0 && feed.quantity <= feed.minStock * 2 ? 'bg-amber-500' : 'bg-green-600'
            }`}
            style={{ width: `${Math.min(100, feed.minStock > 0 ? (feed.quantity/feed.minStock*50) : 100)}%` }}
          />
        </div>
        <p className="text-xs text-gray-400 mt-1">
          {feed.minStock > 0
            ? `${((feed.quantity/feed.minStock)*100).toFixed(0)}% of minimum stock level`
            : 'No minimum set'}
        </p>
      </div>
      <div>
        <label className="form-label">Action</label>
        <select className="form-input" value={action} onChange={e=>setAction(e.target.value)}>
          <option value="add">➕ Add Stock</option>
          <option value="remove">➖ Remove / Use</option>
        </select>
      </div>
      <div>
        <label className="form-label">Quantity ({feed.unit})</label>
        <input className="form-input" type="number" step="0.1" min="0.1"
          value={qty} onChange={e=>setQty(e.target.value)}
          placeholder={`e.g. 1, 2, 3 bags or kg`}/>
        <div className="flex gap-2 mt-2">
          {[1,2,3,5,10].map(n=>(
            <button key={n} onClick={()=>setQty(String(n))}
              className={`px-3 py-1 text-xs rounded-lg border transition-all ${qty===String(n)?'bg-[#2D5016] text-white border-[#2D5016]':'bg-white border-[#e8e0d0] text-gray-600 hover:bg-[#F5F0E8]'}`}>
              {n}
            </button>
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-2 border-t border-[#e8e0d0]">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave}>Update Stock</button>
      </div>
    </div>
  );
}

function FeedForm({ initial = {}, onClose }) {
  const [form, setForm] = useState({
    feedType:'', supplier:'', quantity:'', unit:'kg',
    minStock:'', costPerUnit:'', species:'cattle', notes:'', ...initial
  });
  const [useCommon, setUseCommon] = useState(!initial.id);
  const f = (k,v) => setForm(p=>({...p,[k]:v}));
  const commonOptions = COMMON_FEEDS[form.species] || [];

  const handleSave = async () => {
    if (!form.feedType) return;
    const rec = {
      ...form,
      quantity: parseFloat(form.quantity)||0,
      minStock: parseFloat(form.minStock)||0,
      costPerUnit: parseFloat(form.costPerUnit)||0,
      lastRestocked: todayStr(), syncStatus:'pending', updatedAt:new Date()
    };
    if (initial.id) await db.feedInventory.update(initial.id, rec);
    else            await db.feedInventory.add(rec);
    onClose();
  };

  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <label className="form-label">Species</label>
        <select className="form-input" value={form.species} onChange={e=>f('species',e.target.value)}>
          {Object.entries(SPECIES).filter(([k])=>k!=='all').map(([k,v])=><option key={k} value={k}>{v.emoji} {v.label}</option>)}
        </select>
      </div>
      <div>
        <label className="form-label">Feed Type<span className="text-red-500">*</span></label>
        {useCommon ? (
          <div className="flex gap-2">
            <select className="form-input flex-1" value={form.feedType} onChange={e=>f('feedType',e.target.value)}>
              <option value="">Select common feed…</option>
              {commonOptions.map(o=><option key={o} value={o}>{o}</option>)}
              <option value="__custom">Other (type custom)…</option>
            </select>
            {form.feedType==='__custom' && (
              <input className="form-input flex-1" value={form.feedType==='__custom'?'':form.feedType}
                onChange={e=>f('feedType',e.target.value)} placeholder="Custom feed name"/>
            )}
          </div>
        ) : (
          <input className="form-input" value={form.feedType} onChange={e=>f('feedType',e.target.value)} placeholder="e.g. Dairy Meal"/>
        )}
        <button className="text-xs text-[#2D5016] underline mt-1" onClick={()=>setUseCommon(!useCommon)}>
          {useCommon ? 'Type custom name' : 'Pick from common feeds'}
        </button>
      </div>
      <div><label className="form-label">Supplier</label><input className="form-input" value={form.supplier} onChange={e=>f('supplier',e.target.value)}/></div>
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
  const [showForm,   setShowForm]   = useState(false);
  const [editing,    setEditing]    = useState(null);
  const [stockItem,  setStockItem]  = useState(null);

  const feedInv = useLiveQuery(() => db.feedInventory.toArray(), []);
  const filtered = (feedInv||[]).filter(f => species==='all'||f.species===species);
  const lowStock   = filtered.filter(f=>f.minStock>0&&f.quantity<=f.minStock*1.2);
  const totalValue = filtered.reduce((s,f)=>s+(f.quantity*f.costPerUnit),0);

  const cols = [
    { key:'feedType', label:'Feed Type', render:v=><span className="font-semibold">{v}</span> },
    { key:'species',  label:'Species',   render:v=><span className="capitalize">{SPECIES[v]?.emoji} {v}</span> },
    { key:'supplier', label:'Supplier' },
    { key:'quantity', label:'In Stock',  render:(v,row)=>{
        const pct = row.minStock>0?(v/row.minStock*100):100;
        const color = pct<100?'text-red-600 font-semibold':pct<200?'text-amber-600':'text-green-700';
        return (
          <div>
            <span className={color}>{v} {row.unit}</span>
            {row.minStock>0&&(
              <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                <div className={`h-1.5 rounded-full ${pct<100?'bg-red-500':pct<200?'bg-amber-500':'bg-green-600'}`}
                  style={{width:`${Math.min(100,pct/2)}%`}}/>
              </div>
            )}
          </div>
        );
      }},
    { key:'minStock',    label:'Min Stock',  render:(v,row)=>`${v} ${row.unit}` },
    { key:'costPerUnit', label:'Cost/Unit',  render:(v,row)=>`KES ${v}/${row.unit}` },
    { key:'lastRestocked', label:'Restocked', render:v=>formatDate(v) },
    { key:'id', label:'', render:(_,row)=>(
        <div className="flex gap-1">
          <button className="btn btn-primary py-1 px-2 text-xs" onClick={()=>setStockItem(row)}>+/- Stock</button>
          <button className="btn btn-secondary py-1 px-2 text-xs" onClick={()=>{setEditing(row);setShowForm(true);}}>Edit</button>
        </div>
      )},
  ];

  return (
    <div className="page-content">
      <PageHeader title="Feed & Inventory" actions={<button className="btn btn-primary" onClick={()=>{setEditing(null);setShowForm(true);}}><Plus size={15}/>Add Feed Item</button>}/>
      <StatGrid cols={3}>
        <KPICard label="Total Feed Items" value={filtered.length} icon="🌾"/>
        <KPICard label="Low Stock Alerts" value={lowStock.length} icon="⚠️" color={lowStock.length>0?'#dc2626':undefined}/>
        <KPICard label="Inventory Value"  value={formatCurrency(totalValue)} icon="💰"/>
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
              <button className="btn btn-primary py-0.5 px-2 text-xs" onClick={()=>setStockItem(f)}>Restock</button>
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
      {stockItem && (
        <Modal open title="Update Stock Level" onClose={()=>setStockItem(null)}>
          <StockUpdateModal feed={stockItem} onClose={()=>setStockItem(null)}/>
        </Modal>
      )}
    </div>
  );
}
