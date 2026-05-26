import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../../db/schema.js';
import { useApp } from '../../context/AppContext.jsx';
import { Modal, KPICard, StatGrid, PageHeader, DataTable, SectionCard } from '../../components/UI.jsx';
import { formatDate, todayStr, getInitials } from '../../utils/index.js';
import { Plus, Check, X, Clock } from 'lucide-react';

function EmployeeForm({ initial = {}, onClose }) {
  const [form, setForm] = useState({ name:'', role:'worker', phone:'', nationalId:'', hireDate:'', section:'Cattle', salary:'', ...initial });
  const f = (k,v) => setForm(p=>({...p,[k]:v}));
  const handleSave = async () => {
    if (!form.name) return;
    const rec = { ...form, salary:parseFloat(form.salary)||0, status:'active', syncStatus:'pending', updatedAt:new Date() };
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
      <div className="col-span-2 flex justify-end gap-3 pt-2 border-t border-[#e8e0d0]">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave}>{initial.id?'Update':'Add Worker'}</button>
      </div>
    </div>
  );
}

export default function Employees() {
  const { formatCurrency } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing]   = useState(null);
  const [activeTab, setActiveTab] = useState('workers');
  const today = todayStr();

  const employees  = useLiveQuery(() => db.employees.toArray(), []);
  const attendance = useLiveQuery(() => db.attendance.where('date').equals(today).toArray(), [today]);
  const tasks      = useLiveQuery(() => db.tasks.where('dueDate').equals(today).toArray(), [today]);
  const payroll    = useLiveQuery(() => db.payroll.where('month').equals(today.slice(0,7)).toArray(), []);

  const attCounts = useMemo(() => ({
    present: attendance?.filter(a=>a.status==='present').length||0,
    absent:  attendance?.filter(a=>a.status==='absent').length||0,
    leave:   attendance?.filter(a=>a.status==='leave').length||0,
  }), [attendance]);

  const markAttendance = async (empId, status) => {
    const existing = attendance?.find(a=>a.employeeId===empId);
    if (existing) await db.attendance.update(existing.id, { status, updatedAt:new Date() });
    else await db.attendance.add({ employeeId:empId, date:today, status, clockIn:'06:30', clockOut:'16:30', syncStatus:'pending' });
  };

  const toggleTask = async (task) => {
    await db.tasks.update(task.id, { status: task.status==='done'?'pending':'done' });
  };

  const empCols = [
    { key:'name', label:'Employee', render:(_,row)=>(
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-[#eef5dd] flex items-center justify-center text-[11px] font-bold text-[#2D5016]">{getInitials(row.name)}</div>
          <div><p className="font-medium">{row.name}</p><p className="text-xs text-gray-400">{row.phone}</p></div>
        </div>)},
    { key:'role',    label:'Role',    render:v=><span className="capitalize">{v}</span> },
    { key:'section', label:'Section' },
    { key:'salary',  label:'Salary',  render:v=>`KES ${v?.toLocaleString()}` },
    { key:'id', label:'Today', render:(_,row)=>{
        const att=attendance?.find(a=>a.employeeId===row.id);
        return(
          <div className="flex gap-1">
            {[['present','✓'],['absent','✗'],['leave','L']].map(([s,l])=>(
              <button key={s} onClick={()=>markAttendance(row.id,s)}
                className={`w-7 h-7 rounded-full text-xs font-bold transition-all ${att?.status===s?(s==='present'?'bg-green-500 text-white':s==='absent'?'bg-red-500 text-white':'bg-amber-400 text-white'):'bg-[#F5F0E8] text-gray-400 hover:bg-gray-200'}`}>
                {l}
              </button>
            ))}
          </div>
        );
      }},
    { key:'id2', label:'', render:(_,row)=>(
        <button className="btn btn-secondary py-1 px-2 text-xs" onClick={()=>{setEditing(row);setShowForm(true);}}>Edit</button>
      )},
  ];

  return (
    <div className="page-content">
      <PageHeader title="Employee Management" actions={<button className="btn btn-primary" onClick={()=>{setEditing(null);setShowForm(true);}}><Plus size={15}/>Add Worker</button>}/>

      <StatGrid cols={4}>
        <KPICard label="Total Staff" value={employees?.length||0} icon="👷"/>
        <KPICard label="Present Today" value={attCounts.present} icon="✅" color="#16a34a"/>
        <KPICard label="Absent Today"  value={attCounts.absent}  icon="❌" color={attCounts.absent>0?'#dc2626':undefined}/>
        <KPICard label="On Leave"      value={attCounts.leave}   icon="🏖️"/>
      </StatGrid>

      <div className="flex gap-2 mb-4">
        {[['workers','Team'],['tasks','Today\'s Tasks'],['payroll','Payroll']].map(([k,l])=>(
          <button key={k} onClick={()=>setActiveTab(k)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${activeTab===k?'bg-[#2D5016] text-white':'bg-white border border-[#e8e0d0] text-[#6B7C3A] hover:bg-[#F5F0E8]'}`}>
            {l}
          </button>
        ))}
      </div>

      {activeTab === 'workers' && (
        <div className="card">
          <DataTable columns={empCols} rows={(employees||[]).map(e=>({...e,id2:e.id}))} emptyText="No employees yet."/>
        </div>
      )}

      {activeTab === 'tasks' && (
        <div className="card">
          <div className="space-y-2">
            {!tasks?.length && <p className="text-sm text-gray-400 py-8 text-center">No tasks for today.</p>}
            {(tasks||[]).sort((a,b)=>(a.status==='done'?1:-1)).map(t=>{
              const emp = employees?.find(e=>e.id===t.assignedTo);
              return (
                <div key={t.id} className={`flex items-start gap-3 p-3 rounded-lg border transition-all ${t.status==='done'?'bg-[#F5F0E8] border-[#e8e0d0] opacity-60':'bg-white border-[#e8e0d0]'}`}>
                  <button onClick={()=>toggleTask(t)} className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${t.status==='done'?'bg-green-500 border-green-500':'border-[#e8e0d0]'}`}>
                    {t.status==='done'&&<Check size={12} className="text-white"/>}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${t.status==='done'?'line-through text-gray-400':'text-[#1a3009]'}`}>{t.title}</p>
                    <p className="text-xs text-gray-400">{emp?.name} · {t.dueTime} · <span className="capitalize">{t.priority}</span></p>
                  </div>
                  <span className={`badge text-[10px] ${t.priority==='high'?'badge-red':t.priority==='medium'?'badge-amber':'badge-gray'}`}>{t.priority}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'payroll' && (
        <div className="card">
          <DataTable columns={[
            { key:'employeeId', label:'Employee', render:(_,row)=>{ const e=employees?.find(x=>x.id===row.employeeId); return e?.name||'—'; }},
            { key:'month', label:'Month' },
            { key:'employeeId2', label:'Salary', render:(_,row)=>{ const e=employees?.find(x=>x.id===row.employeeId); return formatCurrency(e?.salary||0); }},
            { key:'status', label:'Status', render:v=><span className={`badge ${v==='paid'?'badge-green':'badge-amber'}`}>{v}</span> },
            { key:'paidDate', label:'Paid Date', render:v=>formatDate(v) },
            { key:'mpesaRef', label:'Mpesa Ref', render:v=>v||'—' },
            { key:'id', label:'', render:(_,row)=>(
                <button onClick={async()=>{
                  await db.payroll.update(row.id,{status:'paid',paidDate:todayStr(),mpesaRef:'MP'+Math.random().toString(36).slice(2,10).toUpperCase()});
                }} className="btn btn-primary py-1 px-2 text-xs" disabled={row.status==='paid'}>
                  {row.status==='paid'?'Paid':'Mark Paid'}
                </button>
              )},
          ]} rows={(payroll||[]).map(p=>({...p,employeeId2:p.employeeId}))} emptyText="No payroll records."/>
        </div>
      )}

      {showForm && (
        <Modal open title={editing?'Edit Employee':'Add Team Member'} onClose={()=>setShowForm(false)}>
          <EmployeeForm initial={editing||{}} onClose={()=>setShowForm(false)}/>
        </Modal>
      )}
    </div>
  );
}
