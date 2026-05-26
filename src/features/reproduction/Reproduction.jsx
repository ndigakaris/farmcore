import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../../db/schema.js';
import { SPECIES } from '../../constants/index.js';
import { Modal, KPICard, StatGrid, PageHeader, DataTable, SectionCard } from '../../components/UI.jsx';
import { formatDate, todayStr, offsetDate } from '../../utils/index.js';
import { Plus, Heart } from 'lucide-react';

function HeatForm({ onClose }) {
  const [form, setForm] = useState({ animalId:'', date:todayStr(), signs:[], intensity:'Strong', notes:'' });
  const animals = useLiveQuery(() => db.animals.where('sex').equals('F').toArray(), []);
  const f = (k,v) => setForm(p=>({...p,[k]:v}));
  const SIGNS = ['Standing heat','Mucus discharge','Restless','Tail flagging','Mounting others','Swollen vulva','Off feed'];
  const toggleSign = (s) => setForm(p=>({ ...p, signs: p.signs.includes(s)?p.signs.filter(x=>x!==s):[...p.signs,s] }));
  const handleSave = async () => {
    if (!form.animalId) return;
    await db.heatLogs.add({ ...form, animalId:Number(form.animalId), syncStatus:'pending', updatedAt:new Date() });
    // Schedule breeding reminder in 12-18h
    await db.notifications.add({ type:'breeding', priority:'warning', title:'Heat Alert', body:`${animals?.find(a=>a.id===Number(form.animalId))?.name} is in heat. Optimal breeding window: 12–18 hours.`, read:false, timestamp:new Date() });
    onClose();
  };
  return (
    <div className="space-y-4">
      <div><label className="form-label">Animal<span className="text-red-500">*</span></label>
        <select className="form-input" value={form.animalId} onChange={e=>f('animalId',e.target.value)}>
          <option value="">Select female animal…</option>
          {animals?.map(a=><option key={a.id} value={a.id}>{SPECIES[a.species]?.emoji} {a.name} {a.tag}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><label className="form-label">Date</label><input className="form-input" type="date" value={form.date} onChange={e=>f('date',e.target.value)}/></div>
        <div><label className="form-label">Intensity</label>
          <select className="form-input" value={form.intensity} onChange={e=>f('intensity',e.target.value)}>
            <option>Strong</option><option>Moderate</option><option>Mild</option><option>Silent</option>
          </select>
        </div>
      </div>
      <div>
        <label className="form-label">Signs Observed</label>
        <div className="flex flex-wrap gap-2 mt-1">
          {SIGNS.map(s=>(
            <button key={s} type="button" onClick={()=>toggleSign(s)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${form.signs.includes(s)?'bg-[#2D5016] text-white border-[#2D5016]':'bg-white border-[#e8e0d0] text-[#6B7C3A]'}`}>
              {s}
            </button>
          ))}
        </div>
      </div>
      <div><label className="form-label">Notes</label><textarea className="form-input resize-y min-h-[60px]" value={form.notes} onChange={e=>f('notes',e.target.value)}/></div>
      <div className="flex justify-end gap-3 pt-2 border-t border-[#e8e0d0]">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave}>Record Heat</button>
      </div>
    </div>
  );
}

function BreedingForm({ onClose }) {
  const [form, setForm] = useState({ animalId:'', date:todayStr(), method:'AI', sireId:'', strawBatch:'', technician:'', cost:'', notes:'' });
  const animals = useLiveQuery(() => db.animals.where('sex').equals('F').toArray(), []);
  const f = (k,v) => setForm(p=>({...p,[k]:v}));
  const handleSave = async () => {
    if (!form.animalId) return;
    await db.breedingLogs.add({ ...form, animalId:Number(form.animalId), cost:parseFloat(form.cost)||0, syncStatus:'pending', updatedAt:new Date() });
    // Schedule pregnancy check in 21 days
    await db.calendarEvents.add({ date:offsetDate(21), type:'reproduction', title:`PD Check – ${animals?.find(a=>a.id===Number(form.animalId))?.name}`, species:'cattle', relatedId:Number(form.animalId), priority:'warning', syncStatus:'pending' });
    onClose();
  };
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="col-span-2"><label className="form-label">Animal<span className="text-red-500">*</span></label>
        <select className="form-input" value={form.animalId} onChange={e=>f('animalId',e.target.value)}>
          <option value="">Select female…</option>
          {animals?.map(a=><option key={a.id} value={a.id}>{SPECIES[a.species]?.emoji} {a.name} {a.tag}</option>)}
        </select>
      </div>
      <div><label className="form-label">Date</label><input className="form-input" type="date" value={form.date} onChange={e=>f('date',e.target.value)}/></div>
      <div><label className="form-label">Method</label>
        <select className="form-input" value={form.method} onChange={e=>f('method',e.target.value)}>
          <option value="AI">Artificial Insemination (AI)</option>
          <option value="Natural">Natural Service</option>
          <option value="ET">Embryo Transfer (ET)</option>
        </select>
      </div>
      <div><label className="form-label">Sire / Bull</label><input className="form-input" value={form.sireId} onChange={e=>f('sireId',e.target.value)} placeholder="Tag, straw code, or External"/></div>
      <div><label className="form-label">Straw / Batch No.</label><input className="form-input" value={form.strawBatch} onChange={e=>f('strawBatch',e.target.value)}/></div>
      <div><label className="form-label">Technician</label><input className="form-input" value={form.technician} onChange={e=>f('technician',e.target.value)}/></div>
      <div><label className="form-label">Cost (KES)</label><input className="form-input" type="number" value={form.cost} onChange={e=>f('cost',e.target.value)}/></div>
      <div className="col-span-2"><label className="form-label">Notes</label><textarea className="form-input resize-y min-h-[50px]" value={form.notes} onChange={e=>f('notes',e.target.value)}/></div>
      <div className="col-span-2 flex justify-end gap-3 pt-2 border-t border-[#e8e0d0]">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave}>Save Breeding Record</button>
      </div>
    </div>
  );
}

function PDCheckForm({ onClose }) {
  const [form, setForm] = useState({ animalId:'', date:todayStr(), result:'Confirmed', method:'Ultrasound', vet:'Dr. Kamau', expectedDue:'', notes:'' });
  const animals = useLiveQuery(() => db.animals.where('sex').equals('F').toArray(), []);
  const f = (k,v) => setForm(p=>({...p,[k]:v}));
  const handleSave = async () => {
    if (!form.animalId) return;
    await db.pregnancyChecks.add({ ...form, animalId:Number(form.animalId), syncStatus:'pending', updatedAt:new Date() });
    if (form.result==='Confirmed' && form.expectedDue) {
      const anm = animals?.find(a=>a.id===Number(form.animalId));
      await db.calendarEvents.add({ date:form.expectedDue, type:'reproduction', title:`Expected calving – ${anm?.name}`, species:'cattle', relatedId:Number(form.animalId), priority:'high', syncStatus:'pending' });
      await db.animals.update(Number(form.animalId), { stage:'Dry Cow', syncStatus:'pending', updatedAt:new Date() });
    }
    onClose();
  };
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="col-span-2"><label className="form-label">Animal<span className="text-red-500">*</span></label>
        <select className="form-input" value={form.animalId} onChange={e=>f('animalId',e.target.value)}>
          <option value="">Select female…</option>
          {animals?.map(a=><option key={a.id} value={a.id}>{SPECIES[a.species]?.emoji} {a.name} {a.tag}</option>)}
        </select>
      </div>
      <div><label className="form-label">Date</label><input className="form-input" type="date" value={form.date} onChange={e=>f('date',e.target.value)}/></div>
      <div><label className="form-label">Result</label>
        <select className="form-input" value={form.result} onChange={e=>f('result',e.target.value)}>
          <option>Confirmed</option><option>Not Pregnant</option><option>Too Early</option><option>Recheck</option>
        </select>
      </div>
      <div><label className="form-label">Method</label>
        <select className="form-input" value={form.method} onChange={e=>f('method',e.target.value)}>
          <option>Ultrasound</option><option>Manual</option><option>Blood Test</option><option>Milk Test</option>
        </select>
      </div>
      <div><label className="form-label">Veterinarian</label><input className="form-input" value={form.vet} onChange={e=>f('vet',e.target.value)}/></div>
      {form.result==='Confirmed'&&<div className="col-span-2"><label className="form-label">Expected Due Date</label><input className="form-input" type="date" value={form.expectedDue} onChange={e=>f('expectedDue',e.target.value)}/></div>}
      <div className="col-span-2"><label className="form-label">Notes</label><textarea className="form-input resize-y min-h-[50px]" value={form.notes} onChange={e=>f('notes',e.target.value)}/></div>
      <div className="col-span-2 flex justify-end gap-3 pt-2 border-t border-[#e8e0d0]">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave}>Save PD Check</button>
      </div>
    </div>
  );
}

export default function Reproduction() {
  const [tab, setTab]           = useState('heat');
  const [showHeat, setShowHeat] = useState(false);
  const [showBred, setShowBred] = useState(false);
  const [showPD,   setShowPD]   = useState(false);

  const animals  = useLiveQuery(() => db.animals.toArray(), []);
  const heatLogs = useLiveQuery(() => db.heatLogs.orderBy('date').reverse().toArray(), []);
  const breeding = useLiveQuery(() => db.breedingLogs.orderBy('date').reverse().toArray(), []);
  const pdChecks = useLiveQuery(() => db.pregnancyChecks.orderBy('date').reverse().toArray(), []);
  const births   = useLiveQuery(() => db.births.orderBy('date').reverse().toArray(), []);

  const pregnant  = pdChecks?.filter(p=>p.result==='Confirmed').length || 0;
  const heatCount = heatLogs?.filter(h=>{ const d=Math.floor((new Date()-new Date(h.date))/86400000); return d<=7; }).length || 0;

  const heatCols = [
    { key:'animalId', label:'Animal', render:(_,row)=>{ const a=animals?.find(x=>x.id===row.animalId); return a?`${SPECIES[a.species]?.emoji} ${a.name} ${a.tag}`:'—'; }},
    { key:'date',      label:'Date',      render:v=>formatDate(v) },
    { key:'intensity', label:'Intensity', render:v=><span className={`badge ${v==='Strong'?'badge-red':v==='Moderate'?'badge-amber':'badge-gray'}`}>{v}</span> },
    { key:'signs',     label:'Signs',     render:v=>(v||[]).join(', ') || '—' },
    { key:'notes',     label:'Notes' },
  ];
  const bredCols = [
    { key:'animalId',  label:'Animal', render:(_,row)=>{ const a=animals?.find(x=>x.id===row.animalId); return a?`${SPECIES[a.species]?.emoji} ${a.name} ${a.tag}`:'—'; }},
    { key:'date',      label:'Date',      render:v=>formatDate(v) },
    { key:'method',    label:'Method',    render:v=><span className="badge badge-blue">{v}</span> },
    { key:'sireId',    label:'Sire' },
    { key:'technician',label:'Technician' },
    { key:'cost',      label:'Cost',      render:v=>`KES ${v?.toLocaleString()}` },
  ];
  const pdCols = [
    { key:'animalId', label:'Animal', render:(_,row)=>{ const a=animals?.find(x=>x.id===row.animalId); return a?`${SPECIES[a.species]?.emoji} ${a.name} ${a.tag}`:'—'; }},
    { key:'date',      label:'Date',        render:v=>formatDate(v) },
    { key:'result',    label:'Result',      render:v=><span className={`badge ${v==='Confirmed'?'badge-green':v==='Not Pregnant'?'badge-red':'badge-amber'}`}>{v}</span> },
    { key:'method',    label:'Method' },
    { key:'vet',       label:'Vet' },
    { key:'expectedDue',label:'Due Date',   render:v=>formatDate(v) },
  ];

  return (
    <div className="page-content">
      <PageHeader
        title="Reproduction Management"
        actions={
          <div className="flex gap-2">
            <button className="btn btn-secondary" onClick={()=>setShowHeat(true)}>🌡️ Heat</button>
            <button className="btn btn-secondary" onClick={()=>setShowPD(true)}>🔬 PD Check</button>
            <button className="btn btn-primary" onClick={()=>setShowBred(true)}><Heart size={15}/>Record Breeding</button>
          </div>
        }
      />

      <StatGrid cols={4}>
        <KPICard label="Confirmed Pregnant" value={pregnant} icon="🤰" color="#2D5016"/>
        <KPICard label="In Heat (7d)"        value={heatCount} icon="🌡️" color={heatCount>0?'#d97706':undefined}/>
        <KPICard label="Breedings (30d)"     value={(breeding||[]).filter(b=>Math.floor((new Date()-new Date(b.date))/86400000)<=30).length} icon="💚"/>
        <KPICard label="Births (90d)"        value={(births||[]).filter(b=>Math.floor((new Date()-new Date(b.date))/86400000)<=90).length} icon="🐄"/>
      </StatGrid>

      <div className="flex gap-2 mb-4">
        {[['heat','Heat Logs'],['breeding','Breeding'],['pd','Pregnancy Checks'],['births','Births']].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${tab===k?'bg-[#2D5016] text-white':'bg-white border border-[#e8e0d0] text-[#6B7C3A] hover:bg-[#F5F0E8]'}`}>
            {l}
          </button>
        ))}
      </div>

      <div className="card">
        {tab==='heat'    && <DataTable columns={heatCols} rows={heatLogs||[]} emptyText="No heat records yet."/>}
        {tab==='breeding'&& <DataTable columns={bredCols} rows={breeding||[]} emptyText="No breeding records yet."/>}
        {tab==='pd'      && <DataTable columns={pdCols}   rows={pdChecks||[]} emptyText="No PD checks yet."/>}
        {tab==='births'  && <DataTable columns={[
          { key:'damId', label:'Dam', render:(_,row)=>{ const a=animals?.find(x=>x.id===row.damId); return a?`${a.name} ${a.tag}`:'—'; }},
          { key:'date',   label:'Date',    render:v=>formatDate(v) },
          { key:'calves', label:'Offspring', render:v=>`${(v||[]).length} born` },
          { key:'notes',  label:'Notes' },
        ]} rows={births||[]} emptyText="No birth records yet."/>}
      </div>

      {showHeat && <Modal open title="Record Heat Observation" onClose={()=>setShowHeat(false)}><HeatForm onClose={()=>setShowHeat(false)}/></Modal>}
      {showBred && <Modal open title="Record Breeding / AI Service" onClose={()=>setShowBred(false)} size="lg"><BreedingForm onClose={()=>setShowBred(false)}/></Modal>}
      {showPD   && <Modal open title="Pregnancy Diagnosis (PD Check)" onClose={()=>setShowPD(false)}><PDCheckForm onClose={()=>setShowPD(false)}/></Modal>}
    </div>
  );
}
