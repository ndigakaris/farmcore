import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import db from '../../db/schema.js';
import { useApp } from '../../context/AppContext.jsx';
import { SPECIES } from '../../constants/index.js';
import { Modal, KPICard, StatGrid, SectionCard, PageHeader, DataTable } from '../../components/UI.jsx';
import { formatDate, todayStr } from '../../utils/index.js';
import { Plus, TrendingUp, TrendingDown, FileDown } from 'lucide-react';

const INCOME_CATS  = ['Milk Sales','Egg Sales','Animal Sales','Goat Milk Sales','Wool Sales','Crop Sales','Other Income'];
const EXPENSE_CATS = ['Feed','Veterinary','Labour','Medicine','Fuel','Equipment Maintenance','Seeds/Agrochemicals','Utilities','Other Expense'];
const PAYMENT_METHODS = ['Mpesa','Cash','Bank Transfer','Cheque'];
const PIE_COLORS = ['#2D5016','#C9A84C','#6B7C3A','#8B6340','#4e8628','#d97706'];

function TransactionForm({ onClose, type = 'income' }) {
  const [form, setForm] = useState({ type, date:todayStr(), category:'', description:'', species:'cattle', amount:'', paymentMethod:'Mpesa' });
  const f = (k,v) => setForm(p=>({...p,[k]:v}));
  const handleSave = async () => {
    if (!form.amount || !form.category) return;
    await db.transactions.add({ ...form, amount:parseFloat(form.amount), syncStatus:'pending', updatedAt:new Date() });
    onClose();
  };
  const cats = form.type==='income' ? INCOME_CATS : EXPENSE_CATS;

  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <label className="form-label">Type</label>
        <select className="form-input" value={form.type} onChange={e=>f('type',e.target.value)}>
          <option value="income">Income</option><option value="expense">Expense</option>
        </select>
      </div>
      <div><label className="form-label">Date</label><input className="form-input" type="date" value={form.date} onChange={e=>f('date',e.target.value)}/></div>
      <div>
        <label className="form-label">Category</label>
        <select className="form-input" value={form.category} onChange={e=>f('category',e.target.value)}>
          <option value="">Select…</option>
          {cats.map(c=><option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div>
        <label className="form-label">Species / Cost Centre</label>
        <select className="form-input" value={form.species} onChange={e=>f('species',e.target.value)}>
          {Object.entries(SPECIES).filter(([k])=>k!=='all').map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
          <option value="overhead">Overhead</option><option value="crops">Crops</option>
        </select>
      </div>
      <div className="col-span-2">
        <label className="form-label">Description</label>
        <input className="form-input" value={form.description} onChange={e=>f('description',e.target.value)} placeholder="e.g. Brookside Dairy – daily milk collection"/>
      </div>
      <div>
        <label className="form-label">Amount (KES)<span className="text-red-500">*</span></label>
        <input className="form-input" type="number" value={form.amount} onChange={e=>f('amount',e.target.value)} placeholder="0"/>
      </div>
      <div>
        <label className="form-label">Payment Method</label>
        <select className="form-input" value={form.paymentMethod} onChange={e=>f('paymentMethod',e.target.value)}>
          {PAYMENT_METHODS.map(m=><option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      <div className="col-span-2 flex justify-end gap-3 pt-2 border-t border-[#e8e0d0]">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave}>Save Transaction</button>
      </div>
    </div>
  );
}

export default function Finance() {
  const { formatCurrency, species } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState('income');
  const [activeTab, setActiveTab] = useState('ledger');
  const [filterType, setFilterType] = useState('all');

  const transactions = useLiveQuery(() => db.transactions.orderBy('date').reverse().toArray(), []);

  const filtered = useMemo(() => {
    let rows = transactions || [];
    if (species !== 'all') rows = rows.filter(t => t.species === species);
    if (filterType !== 'all') rows = rows.filter(t => t.type === filterType);
    return rows;
  }, [transactions, species, filterType]);

  const totals = useMemo(() => {
    const income  = filtered.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
    const expense = filtered.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
    return { income, expense, profit: income - expense };
  }, [filtered]);

  const monthlyPL = useMemo(() => {
    const months = {};
    (transactions||[]).forEach(t => {
      const m = t.date.slice(0,7);
      if (!months[m]) months[m] = { month:m.slice(5), income:0, expense:0 };
      if (t.type==='income')  months[m].income  += t.amount;
      if (t.type==='expense') months[m].expense += t.amount;
    });
    return Object.values(months).slice(-6);
  }, [transactions]);

  const speciesBreakdown = useMemo(() => {
    const bySpecies = {};
    (transactions||[]).filter(t=>t.type==='income').forEach(t => {
      bySpecies[t.species] = (bySpecies[t.species]||0) + t.amount;
    });
    return Object.entries(bySpecies).map(([name,value])=>({ name: SPECIES[name]?.label||name, value: Math.round(value) }));
  }, [transactions]);

  const cols = [
    { key:'type', label:'', width:30, render:v=>v==='income'?<TrendingUp size={14} className="text-green-600"/>:<TrendingDown size={14} className="text-red-500"/> },
    { key:'date',     label:'Date',     render:v=>formatDate(v) },
    { key:'category', label:'Category', render:v=><span className="font-medium">{v}</span> },
    { key:'description', label:'Description', render:v=><span className="text-gray-500">{v}</span> },
    { key:'species',  label:'Species',  render:v=><span className="capitalize text-gray-500">{SPECIES[v]?.emoji} {v}</span> },
    { key:'paymentMethod', label:'Payment' },
    { key:'amount',   label:'Amount',   render:(v,row)=>(
        <span className={`font-semibold ${row.type==='income'?'text-green-700':'text-red-600'}`}>
          {row.type==='income'?'+':'-'} KES {v?.toLocaleString()}
        </span>
      )},
  ];

  const TOOLTIP = { contentStyle:{ fontSize:12, background:'#fff', border:'1px solid #e8e0d0', borderRadius:8 }, formatter:v=>`KES ${v.toLocaleString()}` };

  return (
    <div className="page-content">
      <PageHeader
        title="Financials & Analytics"
        actions={
          <div className="flex gap-2">
            <button className="btn btn-secondary"><FileDown size={14}/>Export PDF</button>
            <button className="btn btn-secondary" onClick={()=>{setFormType('expense');setShowForm(true);}}>+ Expense</button>
            <button className="btn btn-primary" onClick={()=>{setFormType('income');setShowForm(true);}}>+ Income</button>
          </div>
        }
      />

      <StatGrid cols={3}>
        <KPICard label="Total Income" value={formatCurrency(totals.income)} sub="All time" trend="up" icon="💚"/>
        <KPICard label="Total Expenses" value={formatCurrency(totals.expense)} sub="All time" trend="down" icon="🔴"/>
        <KPICard label="Net Profit" value={formatCurrency(totals.profit)} sub={`${totals.income>0?((totals.profit/totals.income)*100).toFixed(0):0}% margin`} trend={totals.profit>0?'up':'down'} icon="💰" color={totals.profit>0?'#16a34a':'#dc2626'}/>
      </StatGrid>

      <div className="grid grid-cols-3 gap-4 mb-5">
        <SectionCard title="Monthly P&L (KES)" className="col-span-2">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={monthlyPL} barCategoryGap="25%">
              <XAxis dataKey="month" tick={{fontSize:11}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fontSize:11}} axisLine={false} tickLine={false} tickFormatter={v=>`${(v/1000).toFixed(0)}k`}/>
              <Tooltip {...TOOLTIP}/>
              <Legend iconSize={8} iconType="square" wrapperStyle={{fontSize:11}}/>
              <Bar dataKey="income"  name="Income"   fill="#2D5016" radius={[3,3,0,0]}/>
              <Bar dataKey="expense" name="Expenses" fill="#C9A84C" radius={[3,3,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>
        <SectionCard title="Income by Species">
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={speciesBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} innerRadius={35} paddingAngle={3}>
                {speciesBreakdown.map((_,i)=><Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]}/>)}
              </Pie>
              <Tooltip formatter={v=>`KES ${v.toLocaleString()}`} contentStyle={{fontSize:12,borderRadius:8}}/>
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-2 mt-1">
            {speciesBreakdown.map((s,i)=>(
              <span key={s.name} className="flex items-center gap-1 text-[10px] text-gray-500">
                <span className="w-2 h-2 rounded-sm inline-block" style={{background:PIE_COLORS[i%PIE_COLORS.length]}}/>
                {s.name}
              </span>
            ))}
          </div>
        </SectionCard>
      </div>

      {/* Ledger */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex gap-1 bg-[#F5F0E8] rounded-lg p-1">
          {[['all','All'],['income','Income'],['expense','Expenses']].map(([k,l])=>(
            <button key={k} onClick={()=>setFilterType(k)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${filterType===k?'bg-white text-[#2D5016] shadow-sm':'text-[#6B7C3A]'}`}>
              {l}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-400">{filtered.length} transactions</span>
      </div>

      <div className="card">
        <DataTable columns={cols} rows={filtered} emptyText="No transactions yet."/>
      </div>

      {showForm && (
        <Modal open title={`Add ${formType==='income'?'Income':'Expense'}`} onClose={()=>setShowForm(false)}>
          <TransactionForm type={formType} onClose={()=>setShowForm(false)}/>
        </Modal>
      )}
    </div>
  );
}
