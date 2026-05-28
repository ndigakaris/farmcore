import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../../db/schema.js';
import { useApp } from '../../context/AppContext.jsx';
import { Modal, KPICard, StatGrid, PageHeader, DataTable, SectionCard } from '../../components/UI.jsx';
import { formatDate, todayStr, getInitials } from '../../utils/index.js';
import { Plus, Check, X, Clock } from 'lucide-react';

function EmployeeForm({ initial = {}, onClose }) {
  const [form, setForm] = useState({
    name:'', role:'worker', phone:'', nationalId:'',
    hireDate:'', resignationDate:'', section:'Cattle',
    salary:'', status:'active', ...initial
  });
  const f = (k,v) => setForm(p=>({...p,[k]:v}));

  const handleSave = async () => {
    if (!form.name) return;
    const rec = {
      ...form,
      salary: parseFloat(form.salary)||0,
      status: form.resignationDate ? 'resigned' : 'active',
      syncStatus: 'pending', updatedAt: new Date()
    };
    if (initial.id) await db.employees.update(initial.id, rec);
    else            await db.employees.add(rec);
    onClose();
  };

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="col-span-2">
        <label className="form-label">Full Name<span className="text-red-500">*</span></label>
        <input className="form-input" value={form.name} onChange={e=>f('name',e.target.value)}/>
      </div>
      <div>
        <label className="form-label">Role</label>
        <select className="form-input" value={form.role} onChange={e=>f('role',e.target.value)}>
          {['manager','worker','vet','admin'].map(r=><option key={r} value={r}>{r}</option>)}
        </select>
      </div>
      <div>
        <label className="form-label">Section</label>
        <select className="form-input" value={form.section} onChange={e=>f('section',e.target.value)}>
          {['All','Cattle','Pigs','Goats','Sheep','Poultry','Crops','Health'].map(s=><option key={s}>{s}</option>)}
        </select>
      </div>
      <div>
        <label className="form-label">Phone</label>
        <input className="form-input" value={form.phone} onChange={e=>f('phone',e.target.value)} placeholder="0712 345 678"/>
      </div>
      <div>
        <label className="form-label">National ID</label>
        <input className="form-input" value={form.nationalId} onChange={e=>f('nationalId',e.target.value)}/>
      </div>
      <div>
        <label className="form-label">Hire Date</label>
        <input className="form-input" type="date" value={form.hireDate} onChange={e=>f('hireDate',e.target.value)}/>
      </div>
      <div>
        <label className="form-label">Monthly Salary (KES)</label>
        <input className="form-input" type="number" value={form.salary} onChange={e=>f('salary',e.target.value)}/>
      </div>
      <div>
        <label className="form-label">Resignation Date <span className="text-gray-400 text-xs">(if resigned)</span></label>
        <input className="form-input" type="date" value={form.resignationDate||''} onChange={e=>f('resignationDate',e.target.value)}/>
        {form.resignationDate && (
          <p className="text-xs text-amber-600 mt-1">⚠️ Employee will be marked as resigned</p>
        )}
      </div>
      <div className="col-span-2 flex justify-end gap-3 pt-2 border-t border-[#e8e0d0]">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave}>{initial.id?'Update':'Add Worker'}</button>
      </div>
    </div>
  );
}

export default function Employees() {
  const { formatCurrency } = useApp();
  const [showForm,    setShowForm]    = useState(false);
  const [editing,     setEditing]     = useState(null);
  const [activeTab,   setActiveTab]   = useState('workers');
  const [filterStatus, setFilterStatus] = useState('active');
  const today = todayStr();

  const employees  = useLiveQuery(() => db.employees.toArray(), []);
  const attendance = useLiveQuery(() => db.attendance.where('date').equals(today).toArray(), [today]);
  const tasks      = useLiveQuery(() => db.tasks.where('dueDate').equals(today).toArray(), [today]);
  const payroll    = useLiveQuery(() => db.payroll.where('month').equals(today.slice(0,7)).toArray(), []);

  const filteredEmployees = useMemo(() =>
    (employees||[]).filter(e => filterStatus === 'all' || (e.status||'active') === filterStatus),
    [employees, filterStatus]);

  const attCounts = useMemo(() => ({
    present: attendance?.filter(a=>a.status==='present').length||0,
    absent:  attendance?.filter(a=>a.status==='absent').length||0,
    leave:   attendance?.filter(a=>a.status==='leave').length||0,
  }), [attendance]);

  const activeCount   = useMemo(() => (employees||[]).filter(e=>(e.status||'active')==='active').length, [employees]);
  const resignedCount = useMemo(() => (employees||[]).filter(e=>e.status==='resigned').length, [employees]);
  const totalPayroll  = useMemo(() => (employees||[]).filter(e=>(e.status||'active')==='active').reduce((s,e)=>s+(e.salary||0),0), [employees]);

  const workerCols = [
    { key:'name', label:'Employee', render:(_,row)=>(
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-[#2D5016] flex items-center justify-center text-white text-[11px] font-semibold flex-shrink-0">
            {getInitials(row.name)}
          </div>
          <div>
            <p className="font-medium text-sm">{row.name}</p>
            <p className="text-xs text-gray-400 capitalize">{row.role}</p>
          </div>
        </div>
      )},
    { key:'section', label:'Section' },
    { key:'phone',   label:'Phone' },
    { key:'hireDate', label:'Hire Date', render:v=>formatDate(v) },
    { key:'resignationDate', label:'Resignation', render:v=>v ? <span className="text-red-600 text-xs font-medium">{formatDate(v)}</span> : <span className="text-gray-400 text-xs">—</span> },
    { key:'salary', label:'Salary', render:v=>formatCurrency(v) },
    { key:'status', label:'Status', render:v=>(
        <span className={`badge ${v==='resigned'?'badge-red':v==='leave'?'badge-amber':'badge-green'}`}>
          {v==='resigned'?'Resigned':v==='leave'?'On Leave':'Active'}
        </span>
      )},
    { key:'id', label:'', render:(_,row)=>(
        <button className="btn btn-secondary py-1 px-2 text-xs" onClick={()=>{setEditing(row);setShowForm(true);}}>Edit</button>
      )},
  ];

  const attendCols = [
    { key:'employeeId', label:'Employee', render:(_,row)=>{ const e=employees?.find(x=>x.id===row.employeeId); return e?e.name:'—'; }},
    { key:'date',   label:'Date',   render:v=>formatDate(v) },
    { key:'status', label:'Status', render:v=>(
        <span className={`badge ${v==='present'?'badge-green':v==='absent'?'badge-red':'badge-amber'}`}>
          {v==='present'?<><Check size={11}/> Present</>:v==='absent'?<><X size={11}/> Absent</>:<><Clock size={11}/> Leave</>}
        </span>
      )},
    { key:'notes', label:'Notes' },
  ];

  const payrollCols = [
    { key:'employeeId2', label:'Employee', render:(_,row)=>{ const e=employees?.find(x=>x.id===row.employeeId); return e?e.name:'—'; }},
    { key:'month',  label:'Month' },
    { key:'basic',  label:'Basic',    render:(_,row)=>{ const e=employees?.find(x=>x.id===row.employeeId); return formatCurrency(e?.salary||0); }},
    { key:'nssf',   label:'NSSF',     render:v=>formatCurrency(v||0) },
    { key:'nhif',   label:'NHIF',     render:v=>formatCurrency(v||0) },
    { key:'net',    label:'Net Pay',  render:v=><span className="font-semibold text-green-700">{formatCurrency(v||0)}</span> },
    { key:'status', label:'Status',   render:v=><span className={`badge ${v==='paid'?'badge-green':'badge-amber'}`}>{v}</span> },
  ];

  return (
    <div className="page-content">
      <PageHeader title="Employee Management"
        actions={<button className="btn btn-primary" onClick={()=>{setEditing(null);setShowForm(true);}}><Plus size={15}/>Add Employee</button>}
      />
      <StatGrid cols={4}>
        <KPICard label="Active Staff"   value={activeCount}  icon="👷"/>
        <KPICard label="Resigned"       value={resignedCount} icon="🚪" color={resignedCount>0?'#d97706':undefined}/>
        <KPICard label="Present Today"  value={attCounts.present} icon="✅"/>
        <KPICard label="Monthly Payroll" value={formatCurrency(totalPayroll)} icon="💰"/>
      </StatGrid>

      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2">
          {[['workers','Workers'],['attendance','Attendance'],['payroll','Payroll']].map(([k,l])=>(
            <button key={k} onClick={()=>setActiveTab(k)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${activeTab===k?'bg-[#2D5016] text-white':'bg-white border border-[#e8e0d0] text-[#6B7C3A] hover:bg-[#F5F0E8]'}`}>
              {l}
            </button>
          ))}
        </div>
        {activeTab==='workers' && (
          <select className="form-input w-36" value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}>
            <option value="active">Active</option>
            <option value="resigned">Resigned</option>
            <option value="all">All Staff</option>
          </select>
        )}
      </div>

      <div className="card">
        {activeTab==='workers'    && <DataTable columns={workerCols}  rows={filteredEmployees} emptyText="No employees yet."/>}
        {activeTab==='attendance' && <DataTable columns={attendCols}  rows={attendance||[]} emptyText="No attendance for today."/>}
        {activeTab==='payroll'    && <DataTable columns={payrollCols} rows={payroll||[]} emptyText="No payroll for this month."/>}
      </div>

      {showForm && (
        <Modal open title={editing?'Edit Employee':'Add Employee'} onClose={()=>setShowForm(false)}>
          <EmployeeForm initial={editing||{}} onClose={()=>setShowForm(false)}/>
        </Modal>
      )}
    </div>
  );
}
