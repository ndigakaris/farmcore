import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../../db/schema.js';
import { useApp } from '../../context/AppContext.jsx';
import { SPECIES, DIAGNOSES } from '../../constants/index.js';
import { Modal, KPICard, StatGrid, PageHeader, DataTable, SectionCard } from '../../components/UI.jsx';
import { formatDate, todayStr, offsetDate } from '../../utils/index.js';
import { Plus, AlertTriangle, ShieldCheck, FileDown } from 'lucide-react';

function TreatmentForm({ onClose }) {
  const [form, setForm] = useState({ animalId:'', date:todayStr(), diagnosis:'', symptoms:'', vet:'Dr. Kamau', treatment:'', cost:'', withdrawal:0, notes:'' });
  const animals = useLiveQuery(() => db.animals.toArray(), []);
  const f = (k,v) => setForm(p=>({...p,[k]:v}));
  const selectedAnimal = animals?.find(a=>a.id===Number(form.animalId));
  const withdrawalEnd  = form.withdrawal > 0 ? offsetDate(parseInt(form.withdrawal)||0) : null;

  const handleSave = async () => {
    if (!form.animalId || !form.diagnosis) return;
    const animalId = Number(form.animalId);
    await db.treatments.add({
      ...form, animalId, cost: parseFloat(form.cost)||0,
      withdrawal: parseInt(form.withdrawal)||0,
      withdrawalEnd, status: 'Active',
      syncStatus: 'pending', updatedAt: new Date()
    });
    // Apply milk withdrawal lock if withdrawal > 0 and animal is cattle/goat
    if (parseInt(form.withdrawal) > 0 && selectedAnimal && ['cattle','goats'].includes(selectedAnimal.species)) {
      await db.animals.update(animalId, {
        milkLock: true, lockExpiry: withdrawalEnd,
        lockReason: `${form.diagnosis} – ${form.treatment}`,
        syncStatus: 'pending', updatedAt: new Date()
      });
    }
    onClose();
  };

  const diagnosesList = selectedAnimal ? (DIAGNOSES[selectedAnimal.species]||[]) : [];

  return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-start gap-2">
        <AlertTriangle size={16} className="text-amber-600 mt-0.5 flex-shrink-0"/>
        <p className="text-xs text-amber-700">All treatment records are <strong>non-deletable</strong> per antibiotic compliance regulations. Withdrawal period automatically applies a milk lock to the animal.</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="form-label">Animal<span className="text-red-500">*</span></label>
          <select className="form-input" value={form.animalId} onChange={e=>f('animalId',e.target.value)}>
            <option value="">Select animal…</option>
            {animals?.map(a=><option key={a.id} value={a.id}>{SPECIES[a.species]?.emoji} {a.name} {a.tag}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Date</label>
          <input className="form-input" type="date" value={form.date} onChange={e=>f('date',e.target.value)}/>
        </div>
        <div>
          <label className="form-label">Veterinarian</label>
          <input className="form-input" value={form.vet} onChange={e=>f('vet',e.target.value)}/>
        </div>
        <div className="col-span-2">
          <label className="form-label">Diagnosis<span className="text-red-500">*</span></label>
          <input className="form-input" list="diagnoses-list" value={form.diagnosis} onChange={e=>f('diagnosis',e.target.value)} placeholder="Type or select…"/>
          <datalist id="diagnoses-list">{diagnosesList.map(d=><option key={d} value={d}/>)}</datalist>
        </div>
        <div className="col-span-2">
          <label className="form-label">Symptoms</label>
          <input className="form-input" value={form.symptoms} onChange={e=>f('symptoms',e.target.value)} placeholder="Observed symptoms…"/>
        </div>
        <div className="col-span-2">
          <label className="form-label">Treatment / Medication</label>
          <textarea className="form-input resize-y min-h-[60px]" value={form.treatment} onChange={e=>f('treatment',e.target.value)} placeholder="Drug name, dose, route, duration…"/>
        </div>
        <div>
          <label className="form-label">Cost (KES)</label>
          <input className="form-input" type="number" value={form.cost} onChange={e=>f('cost',e.target.value)}/>
        </div>
        <div>
          <label className="form-label">Withdrawal Period (days)</label>
          <input className="form-input" type="number" min="0" value={form.withdrawal} onChange={e=>f('withdrawal',e.target.value)}/>
          {withdrawalEnd && <p className="text-xs text-red-600 mt-1">⚠️ Milk lock will be applied until <strong>{withdrawalEnd}</strong></p>}
        </div>
        <div className="col-span-2">
          <label className="form-label">Notes</label>
          <textarea className="form-input resize-y min-h-[50px]" value={form.notes} onChange={e=>f('notes',e.target.value)}/>
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-2 border-t border-[#e8e0d0]">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave}>Save Treatment</button>
      </div>
    </div>
  );
}

function VaccinationForm({ onClose }) {
  const [form, setForm] = useState({ animalId:'', date:todayStr(), vaccine:'', batchNo:'', dose:'', vet:'Dr. Kamau', nextDue:'', notes:'' });
  const animals = useLiveQuery(() => db.animals.toArray(), []);
  const f = (k,v) => setForm(p=>({...p,[k]:v}));

  const handleSave = async () => {
    if (!form.animalId || !form.vaccine) return;
    await db.vaccinations.add({ ...form, animalId:Number(form.animalId), syncStatus:'pending', updatedAt:new Date() });
    onClose();
  };

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="col-span-2">
        <label className="form-label">Animal / Flock</label>
        <select className="form-input" value={form.animalId} onChange={e=>f('animalId',e.target.value)}>
          <option value="">Select…</option>
          {animals?.map(a=><option key={a.id} value={a.id}>{SPECIES[a.species]?.emoji} {a.name} {a.tag}</option>)}
        </select>
      </div>
      <div><label className="form-label">Date</label><input className="form-input" type="date" value={form.date} onChange={e=>f('date',e.target.value)}/></div>
      <div><label className="form-label">Vaccine</label><input className="form-input" value={form.vaccine} onChange={e=>f('vaccine',e.target.value)} placeholder="e.g. FMD, Newcastle"/></div>
      <div><label className="form-label">Batch No.</label><input className="form-input" value={form.batchNo} onChange={e=>f('batchNo',e.target.value)}/></div>
      <div><label className="form-label">Dose</label><input className="form-input" value={form.dose} onChange={e=>f('dose',e.target.value)} placeholder="e.g. 2ml IM"/></div>
      <div><label className="form-label">Veterinarian</label><input className="form-input" value={form.vet} onChange={e=>f('vet',e.target.value)}/></div>
      <div><label className="form-label">Next Due Date</label><input className="form-input" type="date" value={form.nextDue} onChange={e=>f('nextDue',e.target.value)}/></div>
      <div className="col-span-2"><label className="form-label">Notes</label><textarea className="form-input resize-y min-h-[50px]" value={form.notes} onChange={e=>f('notes',e.target.value)}/></div>
      <div className="col-span-2 flex justify-end gap-3 pt-2 border-t border-[#e8e0d0]">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave}>Save Vaccination</button>
      </div>
    </div>
  );
}

export default function Health() {
  const { species } = useApp();
  const [activeTab, setActiveTab] = useState('treatments');
  const [showTreatForm, setShowTreatForm] = useState(false);
  const [showVacForm,   setShowVacForm]   = useState(false);

  const treatments   = useLiveQuery(() => db.treatments.orderBy('date').reverse().toArray(), []);
  const vaccinations = useLiveQuery(() => db.vaccinations.orderBy('date').reverse().toArray(), []);
  const animals      = useLiveQuery(() => db.animals.toArray(), []);
  const mortality    = useLiveQuery(() => db.mortality.orderBy('date').reverse().toArray(), []);

  const lockedAnimals = useMemo(() => (animals||[]).filter(a=>a.milkLock), [animals]);
  const activeCount   = useMemo(() => (treatments||[]).filter(t=>t.status==='Active').length, [treatments]);
  const upcomingVax   = useMemo(() => (vaccinations||[]).filter(v=>{
    if (!v.nextDue) return false;
    const days = Math.floor((new Date(v.nextDue)-new Date())/86400000);
    return days >= 0 && days <= 30;
  }).length, [vaccinations]);

  const treatCols = [
    { key:'animalId', label:'Animal', render:(_,row)=>{ const a=animals?.find(x=>x.id===row.animalId); return a?<div><p className="font-medium">{a.name} {a.tag}</p><p className="text-xs text-gray-400 capitalize">{a.species}</p></div>:'—'; }},
    { key:'date',      label:'Date',   render:v=>formatDate(v) },
    { key:'diagnosis', label:'Diagnosis', render:v=><span className="font-medium">{v}</span> },
    { key:'vet',       label:'Vet' },
    { key:'cost',      label:'Cost',   render:v=>`KES ${v?.toLocaleString()}` },
    { key:'withdrawal',label:'Withdrawal', render:(v,row)=>v>0?<span className="badge badge-red">🔒 {v}d → {row.withdrawalEnd}</span>:<span className="text-gray-400 text-xs">None</span> },
    { key:'status',    label:'Status', render:v=><span className={`badge ${v==='Active'?'badge-red':'badge-green'}`}>{v}</span> },
  ];

  const vacCols = [
    { key:'animalId', label:'Animal', render:(_,row)=>{ const a=animals?.find(x=>x.id===row.animalId); return a?`${a.name} ${a.tag}`:'—'; }},
    { key:'date',    label:'Date',      render:v=>formatDate(v) },
    { key:'vaccine', label:'Vaccine',   render:v=><span className="font-medium">{v}</span> },
    { key:'batchNo', label:'Batch' },
    { key:'dose',    label:'Dose' },
    { key:'vet',     label:'Vet' },
    { key:'nextDue', label:'Next Due',  render:v=>{ if(!v)return'—'; const d=Math.floor((new Date(v)-new Date())/86400000); return <span className={d<7?'text-red-600 font-semibold':d<30?'text-amber-600':''}>In {d}d ({formatDate(v)})</span>; }},
  ];

  return (
    <div className="page-content">
      <PageHeader
        title="Health & Veterinary"
        actions={
          <div className="flex gap-2">
            <button className="btn btn-secondary" onClick={()=>setShowVacForm(true)}><Plus size={15}/>Vaccination</button>
            <button className="btn btn-primary" onClick={()=>setShowTreatForm(true)}><Plus size={15}/>Record Treatment</button>
          </div>
        }
      />

      <StatGrid cols={4}>
        <KPICard label="Active Treatments" value={activeCount} icon="🏥" color={activeCount>0?'#dc2626':undefined}/>
        <KPICard label="Animals Locked" value={lockedAnimals.length} icon="🔒" color={lockedAnimals.length>0?'#dc2626':undefined}/>
        <KPICard label="Vaccines Due (30d)" value={upcomingVax} icon="💉" color={upcomingVax>0?'#d97706':undefined}/>
        <KPICard label="Total Treatments" value={treatments?.length||0} icon="📋"/>
      </StatGrid>

      {lockedAnimals.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={18} className="text-red-600"/>
            <h3 className="font-semibold text-red-700 text-sm">Active Withdrawal Locks ({lockedAnimals.length})</h3>
          </div>
          <div className="space-y-2">
            {lockedAnimals.map(a=>(
              <div key={a.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-red-100">
                <div>
                  <span className="font-medium text-sm">{a.name} {a.tag}</span>
                  <span className="text-xs text-gray-500 ml-2">{a.lockReason}</span>
                </div>
                <span className="text-xs font-semibold text-red-600">Expires: {a.lockExpiry}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2">
          {[['treatments','Treatments'],['vaccinations','Vaccinations'],['mortality','Mortality']].map(([k,l])=>(
            <button key={k} onClick={()=>setActiveTab(k)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${activeTab===k?'bg-[#2D5016] text-white':'bg-white border border-[#e8e0d0] text-[#6B7C3A] hover:bg-[#F5F0E8]'}`}>
              {l}
            </button>
          ))}
        </div>
        <button className="btn btn-secondary text-xs">
          <FileDown size={13}/> Export Audit Log
        </button>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 mb-4 flex items-center gap-2">
        <ShieldCheck size={16} className="text-amber-600"/>
        <p className="text-xs text-amber-700">
          <strong>Antibiotic Compliance:</strong> All records are non-deletable, fully auditable, and exportable per food safety regulations.
        </p>
      </div>

      <div className="card">
        {activeTab === 'treatments' && <DataTable columns={treatCols} rows={treatments||[]} emptyText="No treatment records yet."/>}
        {activeTab === 'vaccinations' && <DataTable columns={vacCols} rows={vaccinations||[]} emptyText="No vaccination records yet."/>}
        {activeTab === 'mortality' && (
          <DataTable columns={[
            { key:'animalId', label:'Animal', render:(_,row)=>{ const a=animals?.find(x=>x.id===row.animalId); return a?`${a.name} ${a.tag}`:'—'; }},
            { key:'date',  label:'Date',  render:v=>formatDate(v) },
            { key:'cause', label:'Cause' },
            { key:'disposal', label:'Disposal' },
          ]} rows={mortality||[]} emptyText="No mortality records."/>
        )}
      </div>

      {showTreatForm && <Modal open title="Record Treatment" subtitle="Non-deletable — antibiotic compliance" onClose={()=>setShowTreatForm(false)} size="lg"><TreatmentForm onClose={()=>setShowTreatForm(false)}/></Modal>}
      {showVacForm   && <Modal open title="Record Vaccination" onClose={()=>setShowVacForm(false)}><VaccinationForm onClose={()=>setShowVacForm(false)}/></Modal>}
    </div>
  );
}
