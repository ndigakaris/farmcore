// src/features/cost/CostCalculator.jsx
// Cost of Production Calculator — FarmCore FMIS
// Aggregates costs from all modules, calculates cost per unit,
// shows break-even alerts, cost breakdown, smart tips.

import { useState, useMemo, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
         ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts';
import db from '../../db/schema.js';
import { useApp } from '../../context/AppContext.jsx';
import { todayStr } from '../../utils/index.js';

// ── Constants ─────────────────────────────────────────────────
const SPECIES_CONFIG = {
  cattle:  { label:'Cattle (Dairy)', emoji:'🐄', unit:'liter',  unitLabel:'Liter of Milk',    color:'#2D5016' },
  poultry: { label:'Poultry (Layers)',emoji:'🐔', unit:'tray',   unitLabel:'Egg Tray (30 eggs)',color:'#C9A84C' },
  broiler: { label:'Poultry (Broilers)',emoji:'🍗',unit:'kg',    unitLabel:'Kg Live Weight',   color:'#8B6340' },
  pigs:    { label:'Pigs',           emoji:'🐖', unit:'kg',     unitLabel:'Kg Live Weight',   color:'#d97706' },
  goats:   { label:'Goats',          emoji:'🐐', unit:'liter',  unitLabel:'Liter of Milk',    color:'#6B7C3A' },
  sheep:   { label:'Sheep',          emoji:'🐑', unit:'kg',     unitLabel:'Kg Live Weight',   color:'#4e8628' },
};

const COST_COLORS = {
  feed:        '#2D5016',
  labour:      '#C9A84C',
  veterinary:  '#8B6340',
  depreciation:'#6B7C3A',
  utilities:   '#d97706',
  overhead:    '#9ca3af',
};

const PERIODS = [
  { id:'week',   label:'This Week',  days:7  },
  { id:'month',  label:'This Month', days:30 },
  { id:'quarter',label:'Quarter',    days:90 },
  { id:'year',   label:'This Year',  days:365},
];

// ── Date helpers ──────────────────────────────────────────────
const daysAgoStr = (days) => {
  const d = new Date(); d.setDate(d.getDate()-days);
  return d.toISOString().split('T')[0];
};

const monthsAgo = (n) => {
  const d = new Date(); d.setMonth(d.getMonth()-n);
  return d.toISOString().slice(0,7);
};

// ── Smart tip generator ───────────────────────────────────────
function getSmartTip(breakdown, profitPerUnit, unit) {
  const total = Object.values(breakdown).reduce((s,v)=>s+v,0)||1;
  const feedPct = (breakdown.feed/total)*100;
  const labourPct = (breakdown.labour/total)*100;
  const vetPct   = (breakdown.veterinary/total)*100;

  if (profitPerUnit < 0) return { icon:'🔴', text:`You are selling BELOW cost. Raise your price or urgently reduce feed costs.` };
  if (feedPct > 70)      return { icon:'🌾', text:`Feed is ${feedPct.toFixed(0)}% of costs — industry average is 65%. Review your ration mix with a nutritionist.` };
  if (labourPct > 25)    return { icon:'👷', text:`Labour is ${labourPct.toFixed(0)}% of costs. Automating milking or feeding routines could improve margins.` };
  if (vetPct > 10)       return { icon:'💊', text:`Vet costs are high this period. Review biosecurity and vaccination protocols to prevent recurring treatments.` };
  if (profitPerUnit < 5) return { icon:'🟡', text:`Margin is very thin (KES ${profitPerUnit.toFixed(2)}/${unit}). A small feed price rise could push you into loss.` };
  return { icon:'✅', text:`Good cost control! Your margin is KES ${profitPerUnit.toFixed(2)}/${unit}. Keep feed costs below 65% to stay profitable.` };
}

// ── Main Calculator Hook ──────────────────────────────────────
function useCostOfProduction(species, days) {
  const startDate = daysAgoStr(days);

  // Pull data from all modules
  const feedInventory = useLiveQuery(()=>db.feedInventory.toArray(),[]);
  const treatments    = useLiveQuery(()=>db.treatments.toArray(),[]);
  const employees     = useLiveQuery(()=>db.employees.toArray(),[]);
  const payroll       = useLiveQuery(()=>db.payroll.toArray(),[]);
  const assets        = useLiveQuery(()=>db.assets.toArray(),[]);
  const maintenance   = useLiveQuery(()=>db.maintenance.toArray(),[]);
  const milkLogs      = useLiveQuery(()=>db.milkLogs.toArray(),[]);
  const eggLogs       = useLiveQuery(()=>db.eggLogs.toArray(),[]);
  const transactions  = useLiveQuery(()=>db.transactions.toArray(),[]);

  return useMemo(() => {
    if (!feedInventory||!treatments||!employees||!assets||!transactions) {
      return null;
    }

    const sp = species === 'broiler' ? 'poultry' : species;
    const periodFactor = days / 30; // scale monthly costs to period

    // ── 1. Feed Cost ─────────────────────────────────────────
    const feedItems = (feedInventory||[]).filter(f=>f.species===sp||f.species==='all');
    const feedExpenses = (transactions||[]).filter(t=>
      t.type==='expense' && t.category==='Feed' &&
      (t.species===sp||t.species==='all') && t.date>=startDate
    );
    const feedCost = feedExpenses.reduce((s,t)=>s+t.amount,0) ||
      feedItems.reduce((s,f)=>s+(f.costPerUnit*(f.quantity*0.3)*periodFactor),0);

    // ── 2. Labour Cost ───────────────────────────────────────
    const activeEmployees = (employees||[]).filter(e=>(e.status||'active')==='active' && (e.section===sp||e.section==='All'||e.section?.toLowerCase()===sp));
    const labourExpenses = (transactions||[]).filter(t=>
      t.type==='expense' && t.category==='Labour' && t.date>=startDate
    );
    const labourCost = labourExpenses.reduce((s,t)=>s+t.amount,0) ||
      activeEmployees.reduce((s,e)=>s+(e.salary||0),0) * periodFactor;

    // ── 3. Veterinary & Medicine Cost ───────────────────────
    const vetExpenses = (transactions||[]).filter(t=>
      t.type==='expense' && (t.category==='Veterinary'||t.category==='Medicine') &&
      (t.species===sp||!t.species) && t.date>=startDate
    );
    const vetCost = vetExpenses.reduce((s,t)=>s+t.amount,0) ||
      (treatments||[]).filter(t=>t.date>=startDate).reduce((s,t)=>s+(t.cost||0),0)*0.4;

    // ── 4. Equipment Depreciation ────────────────────────────
    const farmAssets = (assets||[]).filter(a=>a.status!=='disposed');
    const depreciation = farmAssets.reduce((s,a)=>{
      const cost = a.purchaseCost||0;
      const life = 10; // assume 10yr useful life
      return s + (cost/life/12)*periodFactor;
    },0);

    // ── 5. Utilities ─────────────────────────────────────────
    const utilExpenses = (transactions||[]).filter(t=>
      t.type==='expense' && (t.category==='Fuel'||t.category==='Utilities') && t.date>=startDate
    );
    const utilities = utilExpenses.reduce((s,t)=>s+t.amount,0);

    // ── 6. Overhead ──────────────────────────────────────────
    const overheadExpenses = (transactions||[]).filter(t=>
      t.type==='expense' &&
      ['Equipment Maintenance','Other Expense','Seeds/Agrochemicals'].includes(t.category) &&
      t.date>=startDate
    );
    const overhead = overheadExpenses.reduce((s,t)=>s+t.amount,0);

    const totalCost = feedCost + labourCost + vetCost + depreciation + utilities + overhead;

    // ── Units Produced ───────────────────────────────────────
    let totalUnits = 0;
    let sellingPrice = 0;

    if (species==='cattle'||species==='goats') {
      const logs = (milkLogs||[]).filter(l=>l.date>=startDate && (species==='cattle'?true:true));
      totalUnits = logs.reduce((s,l)=>s+(l.amount||0),0);
      const sold = logs.filter(l=>l.status==='Sold'&&l.pricePerLiter>0);
      sellingPrice = sold.length ? sold.reduce((s,l)=>s+(l.pricePerLiter||0),0)/sold.length : 0;
    } else if (species==='poultry') {
      const logs = (eggLogs||[]).filter(l=>l.date>=startDate);
      const totalEggs = logs.reduce((s,l)=>s+(l.total||0),0);
      totalUnits = Math.floor(totalEggs/30); // trays of 30
      const eggIncome = (transactions||[]).filter(t=>t.type==='income'&&t.category==='Egg Sales'&&t.date>=startDate);
      const eggRev = eggIncome.reduce((s,t)=>s+t.amount,0);
      sellingPrice = totalUnits > 0 ? eggRev/totalUnits : 0;
    } else {
      // For pigs/sheep/broilers — derive from animal sales
      const animalSales = (transactions||[]).filter(t=>
        t.type==='income'&&t.category==='Animal Sales'&&(t.species===sp||!t.species)&&t.date>=startDate
      );
      totalUnits = animalSales.reduce((s,t)=>s+t.amount,0)/6500||0; // estimate kg
      sellingPrice = 6500;
    }

    const costPerUnit   = totalUnits > 0 ? totalCost/totalUnits : totalCost/Math.max(1,days);
    const profitPerUnit = sellingPrice > 0 ? sellingPrice - costPerUnit : 0;
    const totalRevenue  = (transactions||[])
      .filter(t=>t.type==='income'&&(t.species===sp||!t.species)&&t.date>=startDate)
      .reduce((s,t)=>s+t.amount,0);

    const breakdown = { feed:feedCost, labour:labourCost, veterinary:vetCost, depreciation, utilities, overhead };
    const tip = getSmartTip(breakdown, profitPerUnit, SPECIES_CONFIG[species]?.unit||'unit');

    // ── 12-month trend ───────────────────────────────────────
    const trend = Array.from({length:6},(_,i)=>{
      const m = monthsAgo(5-i);
      const mTx = (transactions||[]).filter(t=>t.date?.startsWith(m));
      const mCost = mTx.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
      const mRev  = mTx.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
      const mMilk = (milkLogs||[]).filter(l=>l.date?.startsWith(m)).reduce((s,l)=>s+(l.amount||0),0);
      const mCostPerUnit = mMilk>0 ? mCost/mMilk : 0;
      const mSell = mMilk>0 ? mRev/mMilk : 0;
      return { month: m.slice(5), costPerUnit:+mCostPerUnit.toFixed(2), sellingPrice:+mSell.toFixed(2) };
    });

    return {
      costPerUnit, sellingPrice, profitPerUnit,
      breakEvenPrice: costPerUnit,
      totalCost, totalRevenue, totalUnits,
      breakdown, tip, trend,
      isSellingBelowCost: sellingPrice > 0 && sellingPrice < costPerUnit,
      isDangerZone: sellingPrice > 0 && sellingPrice > costPerUnit && (sellingPrice-costPerUnit)/costPerUnit < 0.1,
    };
  }, [feedInventory,treatments,employees,payroll,assets,maintenance,
      milkLogs,eggLogs,transactions,species,days,startDate]);
}

// ── Stat Card ─────────────────────────────────────────────────
function StatCard({ label, value, sub, alert, warn, good }) {
  const bg = alert ? 'bg-red-50 border-red-200' : warn ? 'bg-amber-50 border-amber-200' : good ? 'bg-green-50 border-green-200' : 'bg-white border-[#e8e0d0]';
  const txt = alert ? 'text-red-700' : warn ? 'text-amber-700' : good ? 'text-green-700' : 'text-[#1a3009]';
  return (
    <div className={`rounded-2xl border p-4 ${bg}`}>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-bold ${txt}`}>{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Cost Breakdown Bar ────────────────────────────────────────
function CostBreakdownBar({ breakdown }) {
  const total = Object.values(breakdown).reduce((s,v)=>s+v,0)||1;
  const items = Object.entries(breakdown).filter(([,v])=>v>0).sort(([,a],[,b])=>b-a);
  return (
    <div className="space-y-2">
      {items.map(([key, val])=>{
        const pct = (val/total*100).toFixed(1);
        return (
          <div key={key}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium capitalize text-gray-600">{key}</span>
              <span className="text-xs text-gray-500">KES {val.toLocaleString()} · {pct}%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div className="h-2 rounded-full transition-all duration-700"
                style={{ width:`${pct}%`, backgroundColor:COST_COLORS[key]||'#9ca3af' }}/>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Selling Price Input ───────────────────────────────────────
function SellingPriceInput({ species, value, onChange }) {
  const cfg = SPECIES_CONFIG[species];
  return (
    <div className="flex items-center gap-3 bg-[#F5F0E8] rounded-xl px-4 py-3">
      <span className="text-2xl">{cfg?.emoji}</span>
      <div className="flex-1">
        <p className="text-xs font-semibold text-gray-500 uppercase">Your Selling Price</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-sm text-gray-500">KES</span>
          <input
            type="number" step="0.5" min="0"
            value={value}
            onChange={e=>onChange(parseFloat(e.target.value)||0)}
            className="w-24 bg-white border border-[#e8e0d0] rounded-lg px-2 py-1 text-sm font-bold text-[#2D5016] focus:outline-none focus:ring-2 focus:ring-[#2D5016]"
          />
          <span className="text-sm text-gray-400">per {cfg?.unit}</span>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────
export default function CostCalculator() {
  const { formatCurrency } = useApp();
  const [species, setSpecies]   = useState('cattle');
  const [period,  setPeriod]    = useState('month');
  const [manualPrice, setManualPrice] = useState(0);
  const [tab,     setTab]       = useState('overview');

  const periodDays = PERIODS.find(p=>p.id===period)?.days||30;
  const data = useCostOfProduction(species, periodDays);
  const cfg  = SPECIES_CONFIG[species];

  const sellingPrice  = manualPrice > 0 ? manualPrice : (data?.sellingPrice||0);
  const profitPerUnit = sellingPrice > 0 ? sellingPrice - (data?.costPerUnit||0) : 0;
  const isBelowCost   = sellingPrice > 0 && sellingPrice < (data?.costPerUnit||0);
  const isDanger      = sellingPrice > 0 && !isBelowCost && profitPerUnit/(sellingPrice||1) < 0.1;

  const pieData = data ? Object.entries(data.breakdown)
    .filter(([,v])=>v>0)
    .map(([k,v])=>({ name:k, value:+v.toFixed(0), color:COST_COLORS[k] })) : [];

  return (
    <div className="page-content">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1a3009]" style={{fontFamily:'Georgia,serif'}}>
            📊 Cost of Production
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">True cost per unit · Break-even analysis · Profit margin</p>
        </div>
        <div className="flex gap-2">
          {PERIODS.map(p=>(
            <button key={p.id} onClick={()=>setPeriod(p.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${period===p.id?'bg-[#2D5016] text-white':'bg-white border border-[#e8e0d0] text-gray-600'}`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Species tabs */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
        {Object.entries(SPECIES_CONFIG).map(([k,v])=>(
          <button key={k} onClick={()=>setSpecies(k)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all border-2 ${
              species===k
                ? 'border-[#2D5016] bg-[#2D5016] text-white'
                : 'border-[#e8e0d0] bg-white text-gray-600 hover:border-[#6B7C3A]'
            }`}>
            <span className="text-base">{v.emoji}</span>{v.label}
          </button>
        ))}
      </div>

      {/* Break-even alert */}
      {isBelowCost && (
        <div className="bg-red-50 border-2 border-red-400 rounded-2xl px-5 py-4 mb-5 flex items-start gap-4">
          <span className="text-3xl flex-shrink-0">🚨</span>
          <div>
            <p className="font-bold text-red-700 text-base">ALERT: Selling Below Cost of Production</p>
            <p className="text-sm text-red-600 mt-1">
              You are selling at <strong>KES {sellingPrice.toFixed(2)}/{cfg?.unit}</strong> but your cost is{' '}
              <strong>KES {data?.costPerUnit?.toFixed(2)}/{cfg?.unit}</strong>.{' '}
              You are <strong>losing KES {Math.abs(profitPerUnit).toFixed(2)} on every {cfg?.unit}</strong> sold.
              Raise your price immediately or reduce costs.
            </p>
          </div>
        </div>
      )}
      {isDanger && !isBelowCost && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl px-5 py-4 mb-5 flex items-start gap-4">
          <span className="text-3xl flex-shrink-0">⚠️</span>
          <div>
            <p className="font-bold text-amber-700 text-base">WARNING: Danger Zone — Thin Margin</p>
            <p className="text-sm text-amber-600 mt-1">
              Your margin is only <strong>KES {profitPerUnit.toFixed(2)}/{cfg?.unit}</strong> ({((profitPerUnit/sellingPrice)*100).toFixed(0)}%).
              A small rise in feed costs could push you into loss.
            </p>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
        <StatCard
          label={`Cost per ${cfg?.unit}`}
          value={`KES ${data?.costPerUnit?.toFixed(2)||'0.00'}`}
          sub={`per ${cfg?.unitLabel}`}
        />
        <StatCard
          label="Selling Price"
          value={sellingPrice > 0 ? `KES ${sellingPrice.toFixed(2)}` : 'Not set'}
          sub="per unit (set below)"
          warn={isDanger} good={!isBelowCost&&!isDanger&&sellingPrice>0}
        />
        <StatCard
          label="Profit / Loss per Unit"
          value={sellingPrice > 0 ? `KES ${profitPerUnit > 0 ? '+' : ''}${profitPerUnit.toFixed(2)}` : '—'}
          sub={profitPerUnit > 0 ? 'Profitable ✅' : profitPerUnit < 0 ? 'Losing money ❌' : 'Set selling price'}
          alert={isBelowCost} good={profitPerUnit>0&&!isDanger}
        />
        <StatCard
          label="Break-Even Price"
          value={`KES ${data?.costPerUnit?.toFixed(2)||'0.00'}`}
          sub="minimum selling price"
        />
        <StatCard
          label="Total Production Cost"
          value={formatCurrency(data?.totalCost||0)}
          sub={`this ${period}`}
        />
        <StatCard
          label="Total Revenue"
          value={formatCurrency(data?.totalRevenue||0)}
          sub={`this ${period}`}
          good={(data?.totalRevenue||0)>(data?.totalCost||0)}
        />
      </div>

      {/* Selling price input */}
      <div className="mb-5">
        <SellingPriceInput species={species} value={manualPrice||sellingPrice} onChange={setManualPrice}/>
      </div>

      {/* Smart tip */}
      {data?.tip && (
        <div className="bg-[#eef5dd] border border-[#c8dfa0] rounded-xl px-4 py-3 mb-5 flex items-start gap-3">
          <span className="text-xl flex-shrink-0">{data.tip.icon}</span>
          <p className="text-sm text-[#2D5016] font-medium">{data.tip.text}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {[['overview','Overview'],['breakdown','Cost Breakdown'],['trend','Trend (6 months)']].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${tab===k?'bg-[#2D5016] text-white':'bg-white border border-[#e8e0d0] text-[#6B7C3A]'}`}>
            {l}
          </button>
        ))}
      </div>

      {/* Overview tab */}
      {tab==='overview' && data && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Cost breakdown bars */}
          <div className="card">
            <h3 className="text-sm font-semibold text-[#1a3009] mb-4">Cost Breakdown</h3>
            <CostBreakdownBar breakdown={data.breakdown}/>
          </div>
          {/* Pie chart */}
          <div className="card">
            <h3 className="text-sm font-semibold text-[#1a3009] mb-2">Cost Composition</h3>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name"
                    cx="50%" cy="50%" outerRadius={80} label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`}>
                    {pieData.map((entry,i)=><Cell key={i} fill={entry.color}/>)}
                  </Pie>
                  <Tooltip formatter={v=>`KES ${v.toLocaleString()}`}/>
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
                No cost data yet. Add expenses in Finance, Health, and Feed modules.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Breakdown tab — drill-down table */}
      {tab==='breakdown' && data && (
        <div className="card">
          <h3 className="text-sm font-semibold text-[#1a3009] mb-4">Cost Drill-Down — {cfg?.label} · {PERIODS.find(p=>p.id===period)?.label}</h3>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-[#eef5dd]">
                <th className="table-th text-left">Cost Category</th>
                <th className="table-th text-right">Total (KES)</th>
                <th className="table-th text-right">% of Total</th>
                <th className="table-th text-right">Per {cfg?.unit} (KES)</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(data.breakdown).map(([cat,val])=>{
                const total = Object.values(data.breakdown).reduce((s,v)=>s+v,0)||1;
                const pct   = (val/total*100).toFixed(1);
                const perUnit = data.totalUnits > 0 ? (val/data.totalUnits).toFixed(2) : '—';
                return (
                  <tr key={cat} className="border-b border-[#F5F0E8] hover:bg-[#F5F0E8]/40">
                    <td className="table-td">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{backgroundColor:COST_COLORS[cat]}}/>
                        <span className="font-medium capitalize">{cat}</span>
                      </div>
                    </td>
                    <td className="table-td text-right font-semibold">KES {val.toLocaleString('en-KE',{maximumFractionDigits:0})}</td>
                    <td className="table-td text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 bg-gray-100 rounded-full h-1.5">
                          <div className="h-1.5 rounded-full" style={{width:`${pct}%`,backgroundColor:COST_COLORS[cat]}}/>
                        </div>
                        <span>{pct}%</span>
                      </div>
                    </td>
                    <td className="table-td text-right text-[#2D5016] font-medium">
                      {typeof perUnit === 'string' ? perUnit : `${perUnit}`}
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-[#eef5dd] font-bold">
                <td className="table-td">TOTAL</td>
                <td className="table-td text-right">KES {Object.values(data.breakdown).reduce((s,v)=>s+v,0).toLocaleString('en-KE',{maximumFractionDigits:0})}</td>
                <td className="table-td text-right">100%</td>
                <td className="table-td text-right text-[#2D5016]">KES {data.costPerUnit.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
          {data.totalUnits > 0 && (
            <div className="mt-4 bg-[#F5F0E8] rounded-xl p-3 text-sm">
              <span className="text-gray-500">Total {cfg?.unitLabel}s produced: </span>
              <strong className="text-[#2D5016]">{data.totalUnits.toFixed(1)} {cfg?.unit}s</strong>
              <span className="text-gray-400 ml-3">·</span>
              <span className="text-gray-500 ml-3">Period: </span>
              <strong>{PERIODS.find(p=>p.id===period)?.label}</strong>
            </div>
          )}
        </div>
      )}

      {/* Trend tab */}
      {tab==='trend' && data && (
        <div className="card">
          <h3 className="text-sm font-semibold text-[#1a3009] mb-4">6-Month Cost vs Selling Price Trend</h3>
          {data.trend.some(t=>t.costPerUnit>0||t.sellingPrice>0) ? (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={data.trend} margin={{top:5,right:20,left:0,bottom:5}}>
                <XAxis dataKey="month" tick={{fontSize:11}}/>
                <YAxis tick={{fontSize:11}} tickFormatter={v=>`KES ${v}`}/>
                <Tooltip formatter={(v,name)=>[`KES ${v}`,name==='costPerUnit'?'Cost/unit':'Selling price']}/>
                <Legend formatter={v=>v==='costPerUnit'?'Cost per unit':'Selling price'}/>
                <Line type="monotone" dataKey="costPerUnit" stroke="#dc2626" strokeWidth={2.5} dot={{r:4}} name="costPerUnit"/>
                <Line type="monotone" dataKey="sellingPrice" stroke="#2D5016" strokeWidth={2.5} dot={{r:4}} strokeDasharray="5 5" name="sellingPrice"/>
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400">
              <p className="text-4xl mb-3">📈</p>
              <p className="text-sm">Trend data builds up as you record milk logs and expenses.</p>
              <p className="text-xs text-gray-300 mt-1">Log production and finance entries to see your trends.</p>
            </div>
          )}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="bg-red-50 rounded-xl p-3 text-center">
              <p className="text-xs text-gray-500 mb-1">Cost per {cfg?.unit}</p>
              <p className="text-lg font-bold text-red-700">KES {data.costPerUnit.toFixed(2)}</p>
            </div>
            <div className={`${isBelowCost?'bg-red-50':isDanger?'bg-amber-50':'bg-green-50'} rounded-xl p-3 text-center`}>
              <p className="text-xs text-gray-500 mb-1">Profit per {cfg?.unit}</p>
              <p className={`text-lg font-bold ${isBelowCost?'text-red-700':isDanger?'text-amber-700':'text-green-700'}`}>
                {sellingPrice > 0 ? `KES ${profitPerUnit > 0 ? '+' : ''}${profitPerUnit.toFixed(2)}` : 'Set selling price ↑'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!data && (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <p className="text-5xl mb-4">📊</p>
          <p className="text-lg font-semibold text-[#1a3009] mb-2">Loading cost data…</p>
          <p className="text-sm text-gray-400">Make sure you have recorded feed inventory, expenses in Finance, and production logs.</p>
        </div>
      )}
    </div>
  );
}
