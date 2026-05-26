import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../../db/schema.js';
import { useApp } from '../../context/AppContext.jsx';
import { SPECIES, STAGES } from '../../constants/index.js';
import { Modal, SearchBar, DataTable, Badge, KPICard, StatGrid, PageHeader, EmptyState, Tabs, SectionCard } from '../../components/UI.jsx';
import { formatDate, daysOnFarm, speciesEmoji, todayStr, cn } from '../../utils/index.js';
import { Plus, Eye, AlertTriangle } from 'lucide-react';

function AnimalForm({ initial = {}, onSave, onClose }) {
  const [form, setForm] = useState({
    species: 'cattle', name: '', tag: '', breed: '', color: '',
    sex: 'F', dob: '', pen: '', origin: 'purchased', dam: '', sire: '', notes: '',
    stage: '', ...initial
  });
  const animals = useLiveQuery(() => db.animals.toArray(), []);
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const potentialDams = useMemo(() =>
    animals?.filter(a => a.species === form.species && a.sex === 'F' && a.id !== initial.id) || [],
    [animals, form.species, initial.id]);

  const handleSave = async () => {
    if (!form.name || !form.tag || !form.species) return;
    const record = { ...form, syncStatus: 'pending', updatedAt: new Date(),
      stage: form.stage || (STAGES[form.species]?.[0] || ''), milkLock: initial.milkLock || false,
      lockExpiry: initial.lockExpiry || null, lockReason: initial.lockReason || '' };
    if (initial.id) await db.animals.update(initial.id, record);
    else            await db.animals.add(record);
    onSave?.();
    onClose();
  };

  return (
    <div className="grid grid-cols-2 gap-4">
      {[
        ['name','Animal Name','text','required'],['tag','Tag / ID','text','required'],
      ].map(([k,l,t,r])=>(
        <div key={k} className="flex flex-col gap-1">
          <label className="form-label">{l}{r&&<span className="text-red-500">*</span>}</label>
          <input className="form-input" type={t} value={form[k]} onChange={e=>f(k,e.target.value)} placeholder={l}/>
        </div>
      ))}
      <div className="flex flex-col gap-1">
        <label className="form-label">Species<span className="text-red-500">*</span></label>
        <select className="form-input" value={form.species} onChange={e=>f('species',e.target.value)}>
          {Object.entries(SPECIES).filter(([k])=>k!=='all').map(([k,v])=>
            <option key={k} value={k}>{v.emoji} {v.label}</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="form-label">Stage</label>
        <select className="form-input" value={form.stage} onChange={e=>f('stage',e.target.value)}>
          <option value="">Auto-assign…</option>
          {(STAGES[form.species]||[]).map(s=><option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="form-label">Breed</label>
        <input className="form-input" value={form.breed} onChange={e=>f('breed',e.target.value)} placeholder="e.g. Friesian"/>
      </div>
      <div className="flex flex-col gap-1">
        <label className="form-label">Color / Markings</label>
        <input className="form-input" value={form.color} onChange={e=>f('color',e.target.value)} placeholder="e.g. Black & White"/>
      </div>
      <div className="flex flex-col gap-1">
        <label className="form-label">Sex</label>
        <select className="form-input" value={form.sex} onChange={e=>f('sex',e.target.value)}>
          <option value="F">Female</option><option value="M">Male</option>
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="form-label">Date of Birth / Arrival</label>
        <input className="form-input" type="date" value={form.dob} onChange={e=>f('dob',e.target.value)}/>
      </div>
      <div className="flex flex-col gap-1">
        <label className="form-label">Pen / Shed / Pasture</label>
        <input className="form-input" value={form.pen} onChange={e=>f('pen',e.target.value)} placeholder="e.g. Barn A"/>
      </div>
      <div className="flex flex-col gap-1">
        <label className="form-label">Origin</label>
        <select className="form-input" value={form.origin} onChange={e=>f('origin',e.target.value)}>
          <option value="purchased">Purchased</option>
          <option value="born">Born on Farm</option>
        </select>
      </div>
      {form.origin === 'born' && <>
        <div className="flex flex-col gap-1">
          <label className="form-label">Dam (Mother)</label>
          <select className="form-input" value={form.dam} onChange={e=>f('dam',e.target.value)}>
            <option value="">Select mother…</option>
            {potentialDams.map(a=><option key={a.id} value={`${a.name} ${a.tag}`}>{a.name} {a.tag}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="form-label">Sire (Father)</label>
          <input className="form-input" value={form.sire} onChange={e=>f('sire',e.target.value)} placeholder="Tag or External AI bull name"/>
        </div>
      </>}
      <div className="col-span-2 flex flex-col gap-1">
        <label className="form-label">Notes (optional)</label>
        <textarea className="form-input resize-y min-h-[72px]" value={form.notes} onChange={e=>f('notes',e.target.value)} placeholder="Observations, special care, behavior traits…"/>
      </div>
      <div className="col-span-2 flex justify-end gap-3 pt-2 border-t border-[#e8e0d0]">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave}>
          {initial.id ? 'Update Animal' : 'Register Animal'}
        </button>
      </div>
    </div>
  );
}

function AnimalProfile({ animal, onClose }) {
  const [tab, setTab] = useState('overview');
  const allAnimals  = useLiveQuery(() => db.animals.toArray(), []);
  const treatments  = useLiveQuery(() => db.treatments.where('animalId').equals(animal.id).toArray(), [animal.id]);
  const milkLogs    = useLiveQuery(() => db.milkLogs.where('animalId').equals(animal.id).reverse().limit(30).toArray(), [animal.id]);
  const weights     = useLiveQuery(() => db.weightLogs.where('animalId').equals(animal.id).toArray(), [animal.id]);
  const vaccins     = useLiveQuery(() => db.vaccinations.where('animalId').equals(animal.id).toArray(), [animal.id]);
  const breeding    = useLiveQuery(() => db.breedingLogs.where('animalId').equals(animal.id).toArray(), [animal.id]);
  const feedLogs    = useLiveQuery(() => db.feedLogs.where('animalId').equals(animal.id).reverse().limit(20).toArray(), [animal.id]);
  const offspring   = useMemo(() =>
    allAnimals?.filter(a => a.dam?.includes(animal.name) && a.species===animal.species && a.id!==animal.id) || [],
    [allAnimals, animal]);

  const TABS = [
    {id:'overview',label:'Overview'},{id:'health',label:'Health'},
    {id:'production',label:'Production'},{id:'reproduction',label:'Reproduction'},
    {id:'feed',label:'Feed & Weight'},{id:'vaccinations',label:'Vaccinations'},
  ];

  return (
    <Modal open title={`${SPECIES[animal.species]?.emoji} ${animal.name} — ${animal.tag}`}
      subtitle={`${animal.breed} · ${animal.stage} · ${animal.pen}`} onClose={onClose} size="lg">
      {animal.milkLock && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">
          <AlertTriangle size={18} className="text-red-600 flex-shrink-0"/>
          <div>
            <p className="text-sm font-semibold text-red-700">🔒 WITHDRAWAL LOCK — No sale until {animal.lockExpiry}</p>
            <p className="text-xs text-red-500">{animal.lockReason}</p>
          </div>
        </div>
      )}
      <Tabs tabs={TABS} active={tab} onChange={setTab}/>
      {tab === 'overview' && (
        <div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 mb-4">
            {[['Species',SPECIES[animal.species]?.label],['Breed',animal.breed],['Sex',animal.sex==='F'?'Female':'Male'],
              ['Color',animal.color],['Pen',animal.pen],['Origin',animal.origin],
              ['Date of Birth',formatDate(animal.dob)],['Days on Farm',daysOnFarm(animal.dob)+'d'],
              ['Stage',animal.stage],['Dam',animal.dam||'—'],['Sire',animal.sire||'—'],
            ].map(([k,v])=>(
              <div key={k}>
                <p className="text-[10px] font-semibold text-gray-400 uppercase">{k}</p>
                <p className="text-sm text-[#1a3009]">{v||'—'}</p>
              </div>
            ))}
          </div>
          {offspring.length > 0 && (
            <div className="bg-[#eef5dd] rounded-lg p-3 mb-4">
              <p className="text-xs font-semibold text-[#2D5016] mb-2">Offspring ({offspring.length})</p>
              {offspring.map(o=>(
                <div key={o.id} className="flex items-center gap-3 py-1 text-xs border-b border-[#d8e8b5] last:border-0">
                  <span className="font-medium">{o.name} {o.tag}</span>
                  <span className="text-gray-500">{o.stage}</span>
                  <span className="text-gray-400">{formatDate(o.dob)}</span>
                </div>
              ))}
            </div>
          )}
          {animal.notes && <div className="bg-[#F5F0E8] rounded-lg p-3 text-sm text-[#1a3009]"><strong>Notes: </strong>{animal.notes}</div>}
        </div>
      )}
      {tab === 'health' && (
        <div className="space-y-3">
          {!treatments?.length && <p className="text-sm text-gray-400 py-8 text-center">No health records yet.</p>}
          {treatments?.map(h=>(
            <div key={h.id} className="bg-[#F5F0E8] rounded-lg p-3">
              <div className="flex items-start justify-between mb-1">
                <p className="text-sm font-semibold">{h.diagnosis}</p>
                <span className={`badge ${h.status==='Active'?'badge-red':'badge-green'}`}>{h.status}</span>
              </div>
              <p className="text-xs text-gray-500">{formatDate(h.date)} · {h.vet} · KES {h.cost?.toLocaleString()}</p>
              <p className="text-xs mt-1">{h.treatment}</p>
              {h.withdrawal > 0 && <p className="text-xs text-red-600 mt-1">⚠️ {h.withdrawal}-day withdrawal · Ends {h.withdrawalEnd}</p>}
            </div>
          ))}
        </div>
      )}
      {tab === 'production' && (
        <div>
          {(milkLogs?.length||0)===0 && (weights?.length||0)===0
            ? <p className="text-sm text-gray-400 py-8 text-center">No production records yet.</p>
            : (milkLogs||[]).map(l=>(
              <div key={l.id} className="flex items-center justify-between py-2 border-b border-[#F5F0E8] text-sm">
                <span className="text-gray-500">{formatDate(l.date)} · {l.shift}</span>
                <span className="font-semibold">{l.amount} {l.unit}</span>
                <span className={`badge ${l.status==='Sold'?'badge-green':'badge-blue'}`}>{l.status}</span>
              </div>
            ))
          }
          {(weights||[]).length>0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold text-gray-500 mb-2">Weight Records</p>
              {weights.map(w=>(
                <div key={w.id} className="flex items-center justify-between py-1.5 border-b border-[#F5F0E8] text-sm">
                  <span className="text-gray-500">{formatDate(w.date)}</span>
                  <span className="font-semibold">{w.weight} {w.unit}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {tab === 'reproduction' && (
        <div>
          {!breeding?.length && <p className="text-sm text-gray-400 py-8 text-center">No breeding records yet.</p>}
          {breeding?.map(b=>(
            <div key={b.id} className="bg-[#F5F0E8] rounded-lg p-3 mb-2">
              <p className="text-sm font-semibold">{b.method} Service</p>
              <p className="text-xs text-gray-500">{formatDate(b.date)} · {b.technician} · KES {b.cost}</p>
              {b.sireId && <p className="text-xs mt-1">Sire: {b.sireId}</p>}
            </div>
          ))}
        </div>
      )}
      {tab === 'feed' && (
        <div>
          {!feedLogs?.length && !weights?.length && <p className="text-sm text-gray-400 py-8 text-center">No feed or weight records yet.</p>}
        </div>
      )}
      {tab === 'vaccinations' && (
        <div className="space-y-2">
          {!vaccins?.length && <p className="text-sm text-gray-400 py-8 text-center">No vaccination records yet.</p>}
          {vaccins?.map(v=>(
            <div key={v.id} className="flex items-center gap-3 py-2 border-b border-[#F5F0E8]">
              <span className="text-xl">💉</span>
              <div className="flex-1">
                <p className="text-sm font-medium">{v.vaccine}</p>
                <p className="text-xs text-gray-400">{formatDate(v.date)} · {v.vet} · Batch: {v.batchNo}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-400">Next due</p>
                <p className="text-xs font-semibold text-[#2D5016]">{formatDate(v.nextDue)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

export default function Animals() {
  const { species } = useApp();
  const [search, setSearch]   = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing]   = useState(null);
  const [viewing, setViewing]   = useState(null);
  const [filterStage, setFilterStage] = useState('');

  const animals = useLiveQuery(() => db.animals.toArray(), []);

  const filtered = useMemo(() => {
    return (animals || []).filter(a => {
      if (species !== 'all' && a.species !== species) return false;
      if (search && !a.name.toLowerCase().includes(search.toLowerCase()) && !a.tag.includes(search)) return false;
      if (filterStage && a.stage !== filterStage) return false;
      return true;
    });
  }, [animals, species, search, filterStage]);

  const counts = useMemo(() => {
    const c = {};
    (animals||[]).forEach(a => { c[a.species] = (c[a.species]||0)+1; });
    return c;
  }, [animals]);

  const lockedAnimals = useMemo(() => (animals||[]).filter(a=>a.milkLock).length, [animals]);

  const cols = [
    { key:'species', label:'',     width:40, render:(_,row)=><span className="text-lg">{SPECIES[row.species]?.emoji}</span> },
    { key:'name',    label:'Animal', render:(_,row)=>(
        <div>
          <p className="font-medium">{row.name}</p>
          <p className="text-xs text-gray-400">{row.breed}</p>
        </div>
      )},
    { key:'tag',   label:'Tag',    render:v=><span className="font-mono text-xs">{v}</span> },
    { key:'stage', label:'Stage',  render:v=><span className="badge badge-green text-[10px]">{v}</span> },
    { key:'pen',   label:'Pen' },
    { key:'dob',   label:'Age',    render:v=><span>{daysOnFarm(v)}d</span> },
    { key:'milkLock', label:'Status', render:(_,row)=>row.milkLock
        ? <span className="badge badge-red">🔒 Withdrawal</span>
        : <span className="badge badge-green">Active</span> },
    { key:'id', label:'', render:(_,row)=>(
        <div className="flex gap-1">
          <button className="btn btn-secondary py-1 px-2 text-xs" onClick={()=>setViewing(row)}><Eye size={12}/></button>
          <button className="btn btn-secondary py-1 px-2 text-xs" onClick={()=>{setEditing(row);setShowForm(true);}}>Edit</button>
        </div>
      )},
  ];

  return (
    <div className="page-content">
      <PageHeader
        title="Animal Registry"
        subtitle={`${filtered.length} animals${species!=='all'?' · '+SPECIES[species]?.label:''}`}
        actions={<button className="btn btn-primary" onClick={()=>{setEditing(null);setShowForm(true);}}><Plus size={15}/>Register Animal</button>}
      />

      {/* Species counts */}
      <StatGrid cols={5}>
        {Object.entries(SPECIES).filter(([k])=>k!=='all').map(([k,v])=>(
          <KPICard key={k} label={v.label} value={counts[k]||0} icon={v.emoji}/>
        ))}
      </StatGrid>

      {lockedAnimals > 0 && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">
          <AlertTriangle size={18} className="text-red-600 flex-shrink-0"/>
          <p className="text-sm text-red-700">
            <strong>{lockedAnimals} animal{lockedAnimals>1?'s':''}</strong> currently under milk withdrawal lock.
          </p>
        </div>
      )}

      <SearchBar
        value={search} onChange={setSearch} placeholder="Search by name or tag…"
        extra={
          <select className="form-input w-40" value={filterStage} onChange={e=>setFilterStage(e.target.value)}>
            <option value="">All stages</option>
            {(STAGES[species==='all'?'cattle':species]||[]).map(s=><option key={s} value={s}>{s}</option>)}
          </select>
        }
      />

      <div className="card">
        <DataTable columns={cols} rows={filtered} emptyText="No animals match your filters."/>
      </div>

      {showForm && (
        <Modal open title={editing?'Edit Animal Record':'Register New Animal'} onClose={()=>setShowForm(false)} size="lg">
          <AnimalForm initial={editing||{}} onClose={()=>setShowForm(false)} onSave={()=>setShowForm(false)}/>
        </Modal>
      )}
      {viewing && <AnimalProfile animal={viewing} onClose={()=>setViewing(null)}/>}
    </div>
  );
}
