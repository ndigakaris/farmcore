import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../../db/schema.js';
import { useApp } from '../../context/AppContext.jsx';
import { Modal, KPICard, StatGrid, PageHeader, DataTable } from '../../components/UI.jsx';
import { formatDate, todayStr, getInitials } from '../../utils/index.js';
import { Plus, Check, X, Clock } from 'lucide-react';

const MONTHS = Array.from({length:12},(_,i)=>{
  const d = new Date(); d.setMonth(d.getMonth()-i);
  return d.toISOString().slice(0,7);
});

// ── Employee Form ─────────────────────────────────────────────
function EmployeeForm({ initial={}, onClose }) {
  const [form, setForm] = useState({
    name:'', role:'worker', phone:'', nationalId:'',
    hireDate:'', resignationDate:'', section:'Cattle',
    salary:'', status:'active', ...initial
  });
  const f = (k,v) => setForm(p=>({...p,[k]:v}));
  const handleSave = async () => {
    if (!form.name) return;
    const rec = { ...form, salary:parseFloat(form.salary)||0,
      status: form.resignationDate ? 'resigned' : 'active',
      syncStatus:'pending', updatedAt:new Date() };
    if (initial.id) await db.employees.update(initial.id, rec);
    else            await db.employees.add(rec);
    onClose();
  };
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="col-span-2"><label className="form-label">Full Name<span className="text-red-500">*</span></label><input className="form-input" value={form.name} onChange={e=>f('name',e.target.value)}/></div>
      <div><label className="form-label">Role</label>
        <select className="form-input" value={form.role} onChange={e=>f('role',e.target.value)}>
          {['manager','worker','vet','admin'].map(r=><option key={r} value={r}>{r}</option>)}
        </select>
      </div>
      <div><label className="form-label">Section</label>
        <select className="form-input" value={form.section} onChange={e=>f('section',e.target.value)}>
          {['All','Cattle','Pigs','Goats','Sheep','Poultry','Crops','Health'].map(s=><option key={s}>{s}</option>)}
        </select>
      </div>
      <div><label className="form-label">Phone</label><input className="form-input" value={form.phone} onChange={e=>f('phone',e.target.value)} placeholder="0712 345 678"/></div>
      <div><label className="form-label">National ID</label><input className="form-input" value={form.nationalId} onChange={e=>f('nationalId',e.target.value)}/></div>
      <div><label className="form-label">Hire Date</label><input className="form-input" type="date" value={form.hireDate} onChange={e=>f('hireDate',e.target.value)}/></div>
      <div><label className="form-label">Monthly Salary (KES)</label><input className="form-input" type="number" value={form.salary} onChange={e=>f('salary',e.target.value)}/></div>
      <div><label className="form-label">Resignation Date <span className="text-gray-400 text-xs">(if resigned)</span></label>
        <input className="form-input" type="date" value={form.resignationDate||''} onChange={e=>f('resignationDate',e.target.value)}/>
        {form.resignationDate && <p className="text-xs text-amber-600 mt-1">⚠️ Will be marked as resigned</p>}
      </div>
      <div className="col-span-2 flex justify-end gap-3 pt-2 border-t border-[#e8e0d0]">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave}>{initial.id?'Update':'Add Worker'}</button>
      </div>
    </div>
  );
}

// ── Attendance Form ───────────────────────────────────────────
function AttendanceForm({ onClose }) {
  const [date, setDate] = useState(todayStr());
  const employees = useLiveQuery(() => db.employees.where('status').equals('active').toArray(), []);
  const [records, setRecords] = useState({});
  const [notes,   setNotes]   = useState({});
  const setStatus  = (id,v) => setRecords(p=>({...p,[id]:v}));
  const setNote    = (id,v) => setNotes(p=>({...p,[id]:v}));

  const handleSave = async () => {
    const existing = await db.attendance.where('date').equals(date).toArray();
    const existIds = new Set(existing.map(a=>a.employeeId));
    const rows = (employees||[]).map(e => ({
      employeeId: e.id, date,
      status: records[e.id] || 'present',
      notes:  notes[e.id]   || '',
      syncStatus:'pending', updatedAt:new Date()
    }));
    for (const r of rows) {
      if (existIds.has(r.employeeId)) {
        const ex = existing.find(a=>a.employeeId===r.employeeId);
        await db.attendance.update(ex.id, r);
      } else {
        await db.attendance.add(r);
      }
    }
    onClose();
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="form-label">Date</label>
        <input className="form-input" type="date" value={date} onChange={e=>setDate(e.target.value)}/>
      </div>
      <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
        {(employees||[]).length === 0 && <p className="text-sm text-gray-400 text-center py-4">No active employees found.</p>}
        {(employees||[]).map(e=>(
          <div key={e.id} className="flex items-center gap-3 bg-[#F5F0E8] rounded-xl px-3 py-2.5">
            <div className="w-8 h-8 rounded-full bg-[#2D5016] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {getInitials(e.name)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{e.name}</p>
              <p className="text-xs text-gray-400 capitalize">{e.role} · {e.section}</p>
            </div>
            <div className="flex gap-1">
              {[['present','✅','badge-green'],['absent','❌','badge-red'],['leave','🏖️','badge-amber']].map(([s,em,cls])=>(
                <button key={s} onClick={()=>setStatus(e.id,s)}
                  className={`px-2 py-1 rounded-lg text-xs font-medium border transition-all ${
                    (records[e.id]||'present')===s
                      ? 'bg-[#2D5016] text-white border-[#2D5016]'
                      : 'bg-white border-[#e8e0d0] text-gray-600'
                  }`}>
                  {em} {s.charAt(0).toUpperCase()+s.slice(1)}
                </button>
              ))}
            </div>
            {(records[e.id]||'present') !== 'present' && (
              <input className="form-input w-32 py-1 text-xs" value={notes[e.id]||''} onChange={ev=>setNote(e.id,ev.target.value)} placeholder="Reason…"/>
            )}
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-3 pt-2 border-t border-[#e8e0d0]">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave}>Save Attendance</button>
      </div>
    </div>
  );
}

// ── Payroll Form ──────────────────────────────────────────────
function PayrollForm({ onClose }) {
  const [month,   setMonth]   = useState(todayStr().slice(0,7));
  const [saving,  setSaving]  = useState(false);
  const employees = useLiveQuery(() => db.employees.where('status').equals('active').toArray(), []);
  const [overrides, setOverrides] = useState({});
  const setOv = (id,k,v) => setOverrides(p=>({...p,[id]:{...p[id],[k]:v}}));

  const NSSF_RATE = 0.06; const NHIF_RATE = 0.015;

  const handleSave = async () => {
    setSaving(true);
    try {
      const existing = await db.payroll.where('month').equals(month).toArray();
      const existIds = new Set(existing.map(p=>p.employeeId));
      for (const e of (employees||[])) {
        const basic   = parseFloat(overrides[e.id]?.basic ?? e.salary) || 0;
        const nssf    = parseFloat(overrides[e.id]?.nssf  ?? (basic*NSSF_RATE).toFixed(0)) || 0;
        const nhif    = parseFloat(overrides[e.id]?.nhif  ?? (basic*NHIF_RATE).toFixed(0)) || 0;
        const net     = basic - nssf - nhif;
        const rec = { employeeId:e.id, month, basic, nssf, nhif, net, status:'pending', syncStatus:'pending', updatedAt:new Date() };
        if (existIds.has(e.id)) {
          const ex = existing.find(p=>p.employeeId===e.id);
          await db.payroll.update(ex.id, rec);
        } else {
          await db.payroll.add(rec);
          // Auto-record as Labour expense in Finance
          await db.transactions.add({
            type:'expense', category:'Labour',
            description:`Payroll ${month} – ${e.name}`,
            amount: net, date: month+'-28',
            species:'overhead', paymentMethod:'Bank Transfer',
            source:'payroll', syncStatus:'pending', updatedAt:new Date()
          });
        }
      }
      onClose();
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="form-label">Payroll Month</label>
        <input className="form-input" type="month" value={month} onChange={e=>setMonth(e.target.value)}/>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-[#eef5dd]">
              <th className="table-th text-left">Employee</th>
              <th className="table-th text-right">Basic (KES)</th>
              <th className="table-th text-right">NSSF</th>
              <th className="table-th text-right">NHIF</th>
              <th className="table-th text-right font-bold">Net Pay</th>
            </tr>
          </thead>
          <tbody>
            {(employees||[]).map(e=>{
              const basic = parseFloat(overrides[e.id]?.basic ?? e.salary)||0;
              const nssf  = parseFloat(overrides[e.id]?.nssf  ?? (basic*NSSF_RATE).toFixed(0))||0;
              const nhif  = parseFloat(overrides[e.id]?.nhif  ?? (basic*NHIF_RATE).toFixed(0))||0;
              const net   = basic - nssf - nhif;
              return (
                <tr key={e.id} className="border-b border-[#F5F0E8]">
                  <td className="table-td font-medium">{e.name}</td>
                  <td className="table-td text-right">
                    <input className="form-input py-0.5 text-right w-24 text-xs"
                      value={overrides[e.id]?.basic ?? e.salary}
                      onChange={ev=>setOv(e.id,'basic',ev.target.value)}/>
                  </td>
                  <td className="table-td text-right">
                    <input className="form-input py-0.5 text-right w-20 text-xs"
                      value={overrides[e.id]?.nssf ?? (basic*NSSF_RATE).toFixed(0)}
                      onChange={ev=>setOv(e.id,'nssf',ev.target.value)}/>
                  </td>
                  <td className="table-td text-right">
                    <input className="form-input py-0.5 text-right w-20 text-xs"
                      value={overrides[e.id]?.nhif ?? (basic*NHIF_RATE).toFixed(0)}
                      onChange={ev=>setOv(e.id,'nhif',ev.target.value)}/>
                  </td>
                  <td className="table-td text-right font-bold text-green-700">
                    KES {net.toLocaleString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-[#eef5dd] font-bold text-sm">
              <td className="table-td">Total</td>
              <td className="table-td text-right" colSpan={3}></td>
              <td className="table-td text-right text-green-800">
                KES {(employees||[]).reduce((s,e)=>{
                  const basic=parseFloat(overrides[e.id]?.basic??e.salary)||0;
                  const nssf=parseFloat(overrides[e.id]?.nssf??(basic*NSSF_RATE).toFixed(0))||0;
                  const nhif=parseFloat(overrides[e.id]?.nhif??(basic*NHIF_RATE).toFixed(0))||0;
                  return s+(basic-nssf-nhif);
                },0).toLocaleString()}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-xs text-green-700">💡 Payroll will be auto-recorded as Labour expense in Finance</p>
      <div className="flex justify-end gap-3 pt-2 border-t border-[#e8e0d0]">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save Payroll'}
        </button>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────
export default function Employees() {
  const { formatCurrency } = useApp();
  const [showForm,     setShowForm]     = useState(false);
  const [showAttend,   setShowAttend]   = useState(false);
  const [showPayroll,  setShowPayroll]  = useState(false);
  const [editing,      setEditing]      = useState(null);
  const [activeTab,    setActiveTab]    = useState('workers');
  const [filterStatus, setFilterStatus] = useState('active');
  const today = todayStr();

  const employees  = useLiveQuery(() => db.employees.toArray(), []);
  const attendance = useLiveQuery(() => db.attendance.where('date').equals(today).toArray(), [today]);
  const payroll    = useLiveQuery(() => db.payroll.where('month').equals(today.slice(0,7)).toArray(), []);

  const filtered = useMemo(()=>(employees||[]).filter(e=>filterStatus==='all'||(e.status||'active')===filterStatus),[employees,filterStatus]);
  const activeCount   = useMemo(()=>(employees||[]).filter(e=>(e.status||'active')==='active').length,[employees]);
  const resignedCount = useMemo(()=>(employees||[]).filter(e=>e.status==='resigned').length,[employees]);
  const totalPayroll  = useMemo(()=>(employees||[]).filter(e=>(e.status||'active')==='active').reduce((s,e)=>s+(e.salary||0),0),[employees]);

  const attCounts = useMemo(()=>({
    present:(attendance||[]).filter(a=>a.status==='present').length,
    absent: (attendance||[]).filter(a=>a.status==='absent').length,
    leave:  (attendance||[]).filter(a=>a.status==='leave').length,
  }),[attendance]);

  const workerCols = [
    { key:'name', label:'Employee', render:(_,row)=>(
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-[#2D5016] flex items-center justify-center text-white text-[11px] font-semibold flex-shrink-0">{getInitials(row.name)}</div>
          <div><p className="font-medium text-sm">{row.name}</p><p className="text-xs text-gray-400 capitalize">{row.role}</p></div>
        </div>)},
    { key:'section', label:'Section' },
    { key:'phone',   label:'Phone' },
    { key:'hireDate', label:'Hire Date', render:v=>formatDate(v) },
    { key:'resignationDate', label:'Resignation', render:v=>v?<span className="text-red-600 text-xs font-medium">{formatDate(v)}</span>:<span className="text-gray-400 text-xs">—</span> },
    { key:'salary',  label:'Salary', render:v=>formatCurrency(v) },
    { key:'status',  label:'Status', render:v=><span className={`badge ${v==='resigned'?'badge-red':v==='leave'?'badge-amber':'badge-green'}`}>{v==='resigned'?'Resigned':v==='leave'?'On Leave':'Active'}</span> },
    { key:'id', label:'', render:(_,row)=><button className="btn btn-secondary py-1 px-2 text-xs" onClick={()=>{setEditing(row);setShowForm(true);}}>Edit</button> },
  ];

  const attendCols = [
    { key:'employeeId', label:'Employee', render:(_,row)=>{ const e=(employees||[]).find(x=>x.id===row.employeeId); return e?.name||'—'; }},
    { key:'date',   label:'Date',   render:v=>formatDate(v) },
    { key:'status', label:'Status', render:v=><span className={`badge ${v==='present'?'badge-green':v==='absent'?'badge-red':'badge-amber'}`}>{v==='present'?<><Check size={11}/> Present</>:v==='absent'?<><X size={11}/> Absent</>:<><Clock size={11}/> Leave</>}</span> },
    { key:'notes', label:'Notes' },
  ];

  const payrollCols = [
    { key:'employeeId', label:'Employee', render:(_,row)=>{ const e=(employees||[]).find(x=>x.id===row.employeeId); return e?.name||'—'; }},
    { key:'month',  label:'Month' },
    { key:'basic',  label:'Basic',    render:v=>formatCurrency(v||0) },
    { key:'nssf',   label:'NSSF',     render:v=>formatCurrency(v||0) },
    { key:'nhif',   label:'NHIF',     render:v=>formatCurrency(v||0) },
    { key:'net',    label:'Net Pay',  render:v=><span className="font-semibold text-green-700">{formatCurrency(v||0)}</span> },
    { key:'status', label:'Status',   render:v=><span className={`badge ${v==='paid'?'badge-green':'badge-amber'}`}>{v}</span> },
  ];

  return (
    <div className="page-content">
      <PageHeader title="Employee Management"
        actions={
          <div className="flex gap-2">
            <button className="btn btn-secondary" onClick={()=>setShowAttend(true)}><Check size={14}/>Record Attendance</button>
            <button className="btn btn-secondary" onClick={()=>setShowPayroll(true)}>💰 Run Payroll</button>
            <button className="btn btn-primary" onClick={()=>{setEditing(null);setShowForm(true);}}><Plus size={15}/>Add Employee</button>
          </div>
        }
      />

      <StatGrid cols={5}>
        <KPICard label="Active Staff"    value={activeCount}       icon="👷"/>
        <KPICard label="Resigned"        value={resignedCount}     icon="🚪" color={resignedCount>0?'#d97706':undefined}/>
        <KPICard label="Present Today"   value={attCounts.present} icon="✅"/>
        <KPICard label="Absent Today"    value={attCounts.absent}  icon="❌" color={attCounts.absent>0?'#dc2626':undefined}/>
        <KPICard label="Monthly Payroll" value={formatCurrency(totalPayroll)} icon="💰"/>
      </StatGrid>

      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2">
          {[['workers','Workers'],['attendance','Attendance'],['payroll','Payroll']].map(([k,l])=>(
            <button key={k} onClick={()=>setActiveTab(k)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${activeTab===k?'bg-[#2D5016] text-white':'bg-white border border-[#e8e0d0] text-[#6B7C3A]'}`}>
              {l}
            </button>
          ))}
        </div>
        {activeTab==='workers'&&(
          <select className="form-input w-36" value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}>
            <option value="active">Active</option>
            <option value="resigned">Resigned</option>
            <option value="all">All Staff</option>
          </select>
        )}
      </div>

      <div className="card">
        {activeTab==='workers'    && <DataTable columns={workerCols}  rows={filtered}       emptyText="No employees yet."/>}
        {activeTab==='attendance' && <DataTable columns={attendCols}  rows={attendance||[]} emptyText="No attendance for today. Click 'Record Attendance' above."/>}
        {activeTab==='payroll'    && <DataTable columns={payrollCols} rows={payroll||[]}    emptyText="No payroll this month. Click 'Run Payroll' above."/>}
      </div>

      {showForm    && <Modal open title={editing?'Edit Employee':'Add Employee'} onClose={()=>setShowForm(false)}><EmployeeForm initial={editing||{}} onClose={()=>setShowForm(false)}/></Modal>}
      {showAttend  && <Modal open title="Record Daily Attendance" onClose={()=>setShowAttend(false)} size="lg"><AttendanceForm onClose={()=>setShowAttend(false)}/></Modal>}
      {showPayroll && <Modal open title="Run Monthly Payroll" onClose={()=>setShowPayroll(false)} size="lg"><PayrollForm onClose={()=>setShowPayroll(false)}/></Modal>}
    </div>
  );
}
