// src/features/cost/CostCalculator.jsx
// Cost of Production Calculator — Deep Per-Animal Drill-Down
// Species overview → individual animal card → full cost breakdown per cow/animal

import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie, Legend, ReferenceLine
} from 'recharts';
import db from '../../db/schema.js';
import { useApp } from '../../context/AppContext.jsx';
import { todayStr } from '../../utils/index.js';

// ── Constants ─────────────────────────────────────────────────
const SPECIES_CONFIG = {
  cattle:  { label:'Cattle (Dairy)', emoji:'🐄', unit:'liter',  unitLabel:'Liter of Milk',     color:'#2D5016' },
  poultry: { label:'Poultry (Layers)',emoji:'🐔', unit:'tray',   unitLabel:'Egg Tray (30 eggs)', color:'#C9A84C' },
  pigs:    { label:'Pigs',           emoji:'🐖', unit:'kg',     unitLabel:'Kg Live Weight',     color:'#d97706' },
  goats:   { label:'Goats',          emoji:'🐐', unit:'liter',  unitLabel:'Liter of Milk',      color:'#6B7C3A' },
  sheep:   { label:'Sheep',          emoji:'🐑', unit:'kg',     unitLabel:'Kg Live Weight',     color:'#4e8628' },
};

const COST_COLORS = {
  feed:'#2D5016', labour:'#C9A84C', veterinary:'#dc2626',
  breeding:'#8B6340', depreciation:'#6B7C3A', overhead:'#9ca3af',
};

const PERIODS = [
  { id:'week',   label:'This Week',  days:7  },
  { id:'month',  label:'This Month', days:30 },
  { id:'quarter',label:'Quarter',    days:90 },
];

const daysAgoStr = (days) => {
  const d = new Date(); d.setDate(d.getDate()-days);
  return d.toISOString().split('T')[0];
};

const monthsAgoStr = (n) => {
  const d = new Date(); d.setMonth(d.getMonth()-n);
  return d.toISOString().slice(0,7);
};

// ── Profitability badge ───────────────────────────────────────
function ProfitBadge({ profit, unit }) {
  if (profit > 0)
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700">+KES {profit.toFixed(2)}/{unit} ✅</span>;
  if (profit < 0)
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">-KES {Math.abs(profit).toFixed(2)}/{unit} ❌</span>;
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-500">No price set</span>;
}

// ── Species-level cost hook ───────────────────────────────────
function useSpeciesCost(species, days) {
  const startDate = daysAgoStr(days);
  const feedInventory = useLiveQuery(()=>db.feedInventory.toArray(),[]);
  const treatments    = useLiveQuery(()=>db.treatments.toArray(),[]);
  const breedingLogs  = useLiveQuery(()=>db.breedingLogs.toArray(),[]);
  const employees     = useLiveQuery(()=>db.employees.toArray(),[]);
  const assets        = useLiveQuery(()=>db.assets.toArray(),[]);
  const milkLogs      = useLiveQuery(()=>db.milkLogs.toArray(),[]);
  const eggLogs       = useLiveQuery(()=>db.eggLogs.toArray(),[]);
  const transactions  = useLiveQuery(()=>db.transactions.toArray(),[]);
  const animals       = useLiveQuery(()=>db.animals.where('species').equals(species==='all'?'cattle':species).toArray(),[species]);

  return useMemo(()=>{
    if (!transactions||!animals) return null;
    const periodFactor = days/30;

    // Feed cost
    const feedExp = (transactions||[]).filter(t=>t.type==='expense'&&t.category==='Feed'&&t.date>=startDate&&(t.species===species||!t.species));
    const feedCost = feedExp.reduce((s,t)=>s+t.amount,0)||
      (feedInventory||[]).filter(f=>f.species===species||f.species==='all').reduce((s,f)=>s+(f.costPerUnit*(f.quantity*0.3)*periodFactor),0);

    // Labour cost (section match)
    const labourExp = (transactions||[]).filter(t=>t.type==='expense'&&t.category==='Labour'&&t.date>=startDate);
    const sectionWorkers = (employees||[]).filter(e=>(e.status||'active')==='active'&&(e.section?.toLowerCase()===species||e.section==='All'));
    const labourCost = labourExp.length>0 ? labourExp.reduce((s,t)=>s+t.amount,0)/Math.max(1,Object.keys(SPECIES_CONFIG).length)
      : sectionWorkers.reduce((s,e)=>s+(e.salary||0),0)*periodFactor;

    // Vet & medicine
    const vetExp = (transactions||[]).filter(t=>t.type==='expense'&&(t.category==='Veterinary'||t.category==='Medicine')&&t.date>=startDate&&(t.species===species||!t.species));
    const vetCost = vetExp.reduce((s,t)=>s+t.amount,0)||
      (treatments||[]).filter(t=>t.date>=startDate).filter(t=>{
        const a=(animals||[]).find(a=>a.id===t.animalId); return a?.species===species;
      }).reduce((s,t)=>s+(t.cost||0),0);

    // Breeding cost
    const bredExp = (breedingLogs||[]).filter(b=>b.date>=startDate).filter(b=>{
      const a=(animals||[]).find(a=>a.id===b.animalId); return a?.species===species;
    });
    const breedingCost = bredExp.reduce((s,b)=>s+(b.cost||0),0);

    // Depreciation
    const depreciation = (assets||[]).reduce((s,a)=>s+((a.purchaseCost||0)/10/12)*periodFactor,0)/Math.max(1,Object.keys(SPECIES_CONFIG).length);

    // Overhead
    const ohExp = (transactions||[]).filter(t=>t.type==='expense'&&['Equipment Maintenance','Fuel','Utilities','Other Expense'].includes(t.category)&&t.date>=startDate);
    const overhead = ohExp.reduce((s,t)=>s+t.amount,0)/Math.max(1,Object.keys(SPECIES_CONFIG).length);

    const totalCost = feedCost+labourCost+vetCost+breedingCost+depreciation+overhead;

    // Production units
    let totalUnits=0, sellingPrice=0;
    if (species==='cattle'||species==='goats') {
      const logs = (milkLogs||[]).filter(l=>l.date>=startDate);
      // filter to this species' animals
      const animalIds = new Set((animals||[]).map(a=>a.id));
      const speciesLogs = logs.filter(l=>animalIds.has(l.animalId));
      totalUnits = speciesLogs.reduce((s,l)=>s+(l.amount||0),0);
      const sold = speciesLogs.filter(l=>l.status==='Sold'&&(l.pricePerLiter||0)>0);
      sellingPrice = sold.length ? sold.reduce((s,l)=>s+(l.pricePerLiter||0),0)/sold.length : 0;
    } else if (species==='poultry') {
      const logs = (eggLogs||[]).filter(l=>l.date>=startDate);
      totalUnits = Math.floor(logs.reduce((s,l)=>s+(l.total||0),0)/30);
      const eggIncome=(transactions||[]).filter(t=>t.type==='income'&&t.category==='Egg Sales'&&t.date>=startDate);
      const rev=eggIncome.reduce((s,t)=>s+t.amount,0);
      sellingPrice = totalUnits>0?rev/totalUnits:0;
    }

    const costPerUnit   = totalUnits>0 ? totalCost/totalUnits : 0;
    const profitPerUnit = sellingPrice>0 ? sellingPrice-costPerUnit : 0;
    const totalRevenue  = (transactions||[]).filter(t=>t.type==='income'&&(t.species===species||!t.species)&&t.date>=startDate).reduce((s,t)=>s+t.amount,0);

    const breakdown = { feed:feedCost, labour:labourCost, veterinary:vetCost, breeding:breedingCost, depreciation, overhead };

    // 6-month trend
    const trend = Array.from({length:6},(_,i)=>{
      const m = monthsAgoStr(5-i);
      const mLogs = species==='cattle'||species==='goats'
        ? (milkLogs||[]).filter(l=>l.date?.startsWith(m)&&new Set((animals||[]).map(a=>a.id)).has(l.animalId))
        : [];
      const mUnits = mLogs.reduce((s,l)=>s+(l.amount||0),0);
      const mExp   = (transactions||[]).filter(t=>t.date?.startsWith(m)&&t.type==='expense').reduce((s,t)=>s+t.amount,0)/Math.max(1,Object.keys(SPECIES_CONFIG).length);
      const mCPU   = mUnits>0 ? mExp/mUnits : 0;
      const mSold  = mLogs.filter(l=>l.status==='Sold'&&(l.pricePerLiter||0)>0);
      const mSP    = mSold.length ? mSold.reduce((s,l)=>s+(l.pricePerLiter||0),0)/mSold.length : 0;
      return { month:m.slice(5), costPerUnit:+mCPU.toFixed(2), sellingPrice:+mSP.toFixed(2) };
    });

    return { totalCost, totalRevenue, totalUnits, costPerUnit, sellingPrice, profitPerUnit,
             breakdown, trend, animals, milkLogs, treatments, breedingLogs, startDate,
             isBelow: sellingPrice>0&&sellingPrice<costPerUnit,
             isDanger: sellingPrice>0&&!isNaN(profitPerUnit)&&profitPerUnit>0&&profitPerUnit/sellingPrice<0.1 };
  },[feedInventory,treatments,breedingLogs,employees,assets,milkLogs,eggLogs,transactions,animals,days,startDate,species]);
}

// ── Per-animal cost engine ─────────────────────────────────────
function useAnimalCost(animal, speciesData, days) {
  const startDate = daysAgoStr(days);
  return useMemo(()=>{
    if (!animal||!speciesData) return null;
    const { milkLogs, treatments, breedingLogs, animals } = speciesData;
    const totalAnimals = Math.max(1,(animals||[]).length);

    // 1. Milk this animal produced
    const myMilk = (milkLogs||[]).filter(l=>l.animalId===animal.id&&l.date>=startDate);
    const totalLiters     = myMilk.reduce((s,l)=>s+(l.amount||0),0);
    const soldLiters      = myMilk.filter(l=>l.status==='Sold').reduce((s,l)=>s+(l.amount||0),0);
    const avgSellingPrice = myMilk.filter(l=>(l.pricePerLiter||0)>0).length>0
      ? myMilk.filter(l=>(l.pricePerLiter||0)>0).reduce((s,l)=>s+(l.pricePerLiter||0),0)/myMilk.filter(l=>(l.pricePerLiter||0)>0).length
      : 0;
    const revenue = myMilk.filter(l=>l.status==='Sold').reduce((s,l)=>s+((l.amount||0)*(l.pricePerLiter||avgSellingPrice)),0);

    // 2. Shifts breakdown
    const byShift = ['Morning','Afternoon','Evening'].map(shift=>({
      shift,
      liters: myMilk.filter(l=>l.shift===shift).reduce((s,l)=>s+(l.amount||0),0),
      sessions: myMilk.filter(l=>l.shift===shift).length,
    }));

    // Daily average
    const dailyAvgLiters = totalLiters / Math.max(1,days);
    const dailyRevenue   = revenue / Math.max(1,days);

    // 3. Feed cost — allocated equally per animal in herd
    const myFeedCost = speciesData.breakdown.feed / totalAnimals;

    // 4. Labour — allocated equally
    const myLabourCost = speciesData.breakdown.labour / totalAnimals;

    // 5. Vet cost — direct (this animal's actual treatments)
    const myTreatments = (treatments||[]).filter(t=>t.animalId===animal.id&&t.date>=startDate);
    const myVetCost    = myTreatments.reduce((s,t)=>s+(t.cost||0),0);

    // 6. Breeding cost — direct (this animal's actual breeding events)
    const myBreeding   = (breedingLogs||[]).filter(b=>b.animalId===animal.id&&b.date>=startDate);
    const myBreedCost  = myBreeding.reduce((s,b)=>s+(b.cost||0),0);

    // 7. Depreciation & overhead shared
    const myDepr  = speciesData.breakdown.depreciation / totalAnimals;
    const myOh    = speciesData.breakdown.overhead / totalAnimals;

    const totalCost = myFeedCost + myLabourCost + myVetCost + myBreedCost + myDepr + myOh;
    const costPerLiter   = totalLiters>0 ? totalCost/totalLiters : 0;
    const profitPerLiter = avgSellingPrice>0 ? avgSellingPrice - costPerLiter : 0;
    const grossMargin    = revenue - totalCost;
    const roi            = totalCost>0 ? ((grossMargin/totalCost)*100) : 0;

    // Per-day cost
    const costPerDay = totalCost / Math.max(1,days);

    // Break-even liters per day (how many liters needed to cover costs)
    const breakEvenLitersPerDay = avgSellingPrice>0 ? costPerDay/avgSellingPrice : 0;

    const breakdown = {
      feed: myFeedCost, labour: myLabourCost,
      veterinary: myVetCost, breeding: myBreedCost,
      depreciation: myDepr, overhead: myOh,
    };

    // Daily production history (last 14 days)
    const dailyHistory = Array.from({length:Math.min(14,days)},(_,i)=>{
      const d = daysAgoStr(days-1-i);
      const day = new Date(); day.setDate(day.getDate()-(days-1-i));
      const dayStr = day.toISOString().split('T')[0];
      const liters = myMilk.filter(l=>l.date===dayStr).reduce((s,l)=>s+(l.amount||0),0);
      return { day: dayStr.slice(5), liters: +liters.toFixed(1) };
    }).filter(d=>d.liters>0||days<=14);

    return {
      animal, totalLiters, soldLiters, dailyAvgLiters,
      revenue, dailyRevenue, avgSellingPrice,
      totalCost, costPerLiter, profitPerLiter, grossMargin, roi,
      costPerDay, breakEvenLitersPerDay,
      breakdown, myTreatments, myBreeding, byShift, dailyHistory,
      isBelow: avgSellingPrice>0 && avgSellingPrice < costPerLiter,
      isDanger: avgSellingPrice>0 && profitPerLiter>0 && profitPerLiter/avgSellingPrice<0.1,
    };
  },[animal, speciesData, days, startDate]);
}

// ── Animal Cost Card (in the grid) ────────────────────────────
function AnimalCostCard({ animal, speciesData, days, sellingPriceOverride, onClick }) {
  const data = useAnimalCost(animal, speciesData, days);
  if (!data) return null;
  const sp = sellingPriceOverride||data.avgSellingPrice;
  const profit = sp>0 ? sp - data.costPerLiter : 0;
  const isBelow = sp>0 && sp < data.costPerLiter;
  const isDanger = sp>0 && profit>0 && profit/sp<0.1;

  return (
    <button onClick={onClick}
      className={`w-full text-left rounded-2xl border-2 p-4 transition-all hover:shadow-md ${
        isBelow ? 'border-red-300 bg-red-50' :
        isDanger ? 'border-amber-300 bg-amber-50' :
        data.totalLiters>0 ? 'border-green-200 bg-green-50 hover:border-green-400' :
        'border-[#e8e0d0] bg-white hover:border-[#2D5016]'
      }`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg">{SPECIES_CONFIG[animal.species]?.emoji}</span>
            <div>
              <p className="font-bold text-[#1a3009] text-sm">{animal.name}</p>
              <p className="text-xs text-gray-400 font-mono">{animal.animalCode||animal.tag}</p>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-1">{animal.breed} · {animal.stage}</p>
        </div>
        <div className="text-right">
          {isBelow && <span className="text-xs font-bold text-red-600">🔴 LOSS</span>}
          {isDanger && !isBelow && <span className="text-xs font-bold text-amber-600">🟡 TIGHT</span>}
          {!isBelow && !isDanger && data.totalLiters>0 && <span className="text-xs font-bold text-green-600">🟢 OK</span>}
        </div>
      </div>

      {/* Key numbers */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-white rounded-xl p-2.5 text-center border border-[#e8e0d0]">
          <p className="text-xs text-gray-400 mb-0.5">Production</p>
          <p className="text-lg font-bold text-[#2D5016]">{data.totalLiters.toFixed(1)}<span className="text-xs font-normal text-gray-400"> L</span></p>
          <p className="text-[10px] text-gray-400">{data.dailyAvgLiters.toFixed(1)} L/day avg</p>
        </div>
        <div className={`rounded-xl p-2.5 text-center border ${isBelow?'bg-red-100 border-red-200':isDanger?'bg-amber-100 border-amber-200':'bg-white border-[#e8e0d0]'}`}>
          <p className="text-xs text-gray-400 mb-0.5">Cost/Liter</p>
          <p className={`text-lg font-bold ${isBelow?'text-red-700':isDanger?'text-amber-700':'text-[#1a3009]'}`}>
            KES {data.costPerLiter.toFixed(2)}
          </p>
          <p className="text-[10px] text-gray-400">KES {data.costPerDay.toFixed(0)}/day</p>
        </div>
      </div>

      {/* Cost breakdown mini bar */}
      <div className="space-y-1 mb-3">
        {Object.entries(data.breakdown).filter(([,v])=>v>0).sort(([,a],[,b])=>b-a).slice(0,3).map(([k,v])=>{
          const total = Object.values(data.breakdown).reduce((s,x)=>s+x,0)||1;
          return (
            <div key={k} className="flex items-center gap-2">
              <span className="text-[10px] text-gray-400 w-16 capitalize truncate">{k}</span>
              <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                <div className="h-1.5 rounded-full" style={{width:`${(v/total*100).toFixed(0)}%`,backgroundColor:COST_COLORS[k]}}/>
              </div>
              <span className="text-[10px] text-gray-500 w-12 text-right">KES {v.toFixed(0)}</span>
            </div>
          );
        })}
      </div>

      {/* Profit / loss row */}
      <div className="flex items-center justify-between pt-2 border-t border-[#e8e0d0]">
        <span className="text-xs text-gray-500">
          Revenue: <strong className="text-[#2D5016]">KES {data.revenue.toFixed(0)}</strong>
        </span>
        {sp > 0 && (
          <span className={`text-xs font-bold ${isBelow?'text-red-600':isDanger?'text-amber-600':'text-green-700'}`}>
            {profit>=0?'+':''}{profit.toFixed(2)}/L
          </span>
        )}
      </div>

      <p className="text-[10px] text-[#2D5016] mt-2 font-medium">Tap to drill down →</p>
    </button>
  );
}

// ── Animal Detail Modal ───────────────────────────────────────
function AnimalDetailView({ animal, speciesData, days, sellingPriceOverride, onClose }) {
  const data = useAnimalCost(animal, speciesData, days);
  const [tab, setTab] = useState('overview');
  const { formatCurrency } = useApp();
  if (!data) return null;

  const sp = sellingPriceOverride||data.avgSellingPrice;
  const profit = sp>0 ? sp - data.costPerLiter : 0;
  const isBelow = sp>0 && sp < data.costPerLiter;
  const isDanger = sp>0 && profit>0 && profit/sp<0.1;
  const pieData = Object.entries(data.breakdown).filter(([,v])=>v>0)
    .map(([k,v])=>({name:k, value:+v.toFixed(0), color:COST_COLORS[k]}));
  const totalBreakdown = Object.values(data.breakdown).reduce((s,v)=>s+v,0)||1;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">

        {/* Modal header */}
        <div className={`sticky top-0 z-10 px-5 py-4 rounded-t-2xl flex items-center justify-between ${
          isBelow?'bg-red-700':isDanger?'bg-amber-600':'bg-[#2D5016]'}`}>
          <div className="flex items-center gap-3">
            <span className="text-3xl">{SPECIES_CONFIG[animal.species]?.emoji}</span>
            <div>
              <h2 className="text-white font-bold text-lg">{animal.name}</h2>
              <p className="text-white/70 text-xs">{animal.animalCode||animal.tag} · {animal.breed} · {animal.stage}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white text-2xl font-light">×</button>
        </div>

        <div className="p-5">
          {/* Alert banners */}
          {isBelow && (
            <div className="bg-red-50 border-2 border-red-400 rounded-xl p-4 mb-4 flex gap-3">
              <span className="text-2xl">🚨</span>
              <div>
                <p className="font-bold text-red-700 text-sm">SELLING BELOW COST</p>
                <p className="text-xs text-red-600 mt-1">
                  Cost to produce 1 liter from <strong>{animal.name}</strong> is{' '}
                  <strong>KES {data.costPerLiter.toFixed(2)}</strong>, but selling at{' '}
                  <strong>KES {sp.toFixed(2)}</strong>.{' '}
                  Loss of <strong>KES {Math.abs(profit).toFixed(2)}</strong> per liter.
                  {data.totalLiters>0 && ` Total loss this period: KES ${(Math.abs(profit)*data.totalLiters).toFixed(0)}.`}
                </p>
              </div>
            </div>
          )}

          {/* Break-even insight */}
          {sp>0 && (
            <div className={`rounded-xl p-4 mb-4 flex items-center justify-between ${isBelow?'bg-red-50 border border-red-200':isDanger?'bg-amber-50 border border-amber-200':'bg-green-50 border border-green-200'}`}>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Break-Even Production</p>
                <p className={`text-xl font-bold ${isBelow?'text-red-700':isDanger?'text-amber-700':'text-green-700'}`}>
                  {data.breakEvenLitersPerDay.toFixed(1)} L/day needed
                </p>
                <p className="text-xs text-gray-500 mt-0.5">to cover all costs at KES {sp.toFixed(2)}/L</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500 mb-1">Actual production</p>
                <p className={`text-xl font-bold ${data.dailyAvgLiters >= data.breakEvenLitersPerDay?'text-green-700':'text-red-700'}`}>
                  {data.dailyAvgLiters.toFixed(1)} L/day
                </p>
                <p className={`text-xs font-medium ${data.dailyAvgLiters >= data.breakEvenLitersPerDay?'text-green-600':'text-red-600'}`}>
                  {data.dailyAvgLiters >= data.breakEvenLitersPerDay
                    ? `✅ ${(data.dailyAvgLiters - data.breakEvenLitersPerDay).toFixed(1)} L surplus`
                    : `❌ ${(data.breakEvenLitersPerDay - data.dailyAvgLiters).toFixed(1)} L short`}
                </p>
              </div>
            </div>
          )}

          {/* KPI grid */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            {[
              { label:'Total Production',    value:`${data.totalLiters.toFixed(1)} L`,        sub:`${data.dailyAvgLiters.toFixed(1)} L/day avg` },
              { label:'Cost per Liter',      value:`KES ${data.costPerLiter.toFixed(2)}`,     sub:`KES ${data.costPerDay.toFixed(0)}/day`, alert:isBelow },
              { label:`Selling Price`,       value: sp>0?`KES ${sp.toFixed(2)}`:'Not set',    sub:'per liter', good:!isBelow&&sp>0 },
              { label:'Profit / Loss',       value: sp>0?`${profit>=0?'+':''}KES ${profit.toFixed(2)}`:'—', sub:'per liter', alert:isBelow, good:profit>0&&!isDanger },
              { label:'Total Revenue',       value:`KES ${data.revenue.toFixed(0)}`,          sub:'this period', good:data.revenue>data.totalCost },
              { label:'Total Cost',          value:`KES ${data.totalCost.toFixed(0)}`,        sub:'this period' },
            ].map((c,i)=>(
              <div key={i} className={`rounded-xl p-3 border ${c.alert?'bg-red-50 border-red-200':c.good?'bg-green-50 border-green-200':'bg-[#F5F0E8] border-[#e8e0d0]'}`}>
                <p className="text-[10px] text-gray-400 uppercase font-semibold mb-1">{c.label}</p>
                <p className={`text-base font-bold ${c.alert?'text-red-700':c.good?'text-green-700':'text-[#1a3009]'}`}>{c.value}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">{c.sub}</p>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mb-4 overflow-x-auto">
            {[['overview','Cost Breakdown'],['shifts','By Shift'],['history','Daily History'],['treatments','Treatments'],['breeding','Breeding']].map(([k,l])=>(
              <button key={k} onClick={()=>setTab(k)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${tab===k?'bg-[#2D5016] text-white':'bg-white border border-[#e8e0d0] text-gray-600'}`}>
                {l}
              </button>
            ))}
          </div>

          {/* Cost Breakdown tab */}
          {tab==='overview' && (
            <div className="space-y-4">
              {/* Drill-down table */}
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-[#eef5dd]">
                    <th className="px-3 py-2 text-left text-xs font-bold text-[#2D5016]">Cost Category</th>
                    <th className="px-3 py-2 text-right text-xs font-bold text-[#2D5016]">Total (KES)</th>
                    <th className="px-3 py-2 text-right text-xs font-bold text-[#2D5016]">% of Cost</th>
                    <th className="px-3 py-2 text-right text-xs font-bold text-[#2D5016]">Per Liter</th>
                    <th className="px-3 py-2 text-right text-xs font-bold text-[#2D5016]">Per Day</th>
                    <th className="px-3 py-2 text-left text-xs font-bold text-[#2D5016]">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(data.breakdown).map(([cat,val])=>{
                    const pct   = (val/totalBreakdown*100).toFixed(1);
                    const perL  = data.totalLiters>0?(val/data.totalLiters).toFixed(2):'—';
                    const perD  = (val/days).toFixed(0);
                    const note  = cat==='feed'?'Shared equally across herd':
                                  cat==='labour'?'Section workers allocated per head':
                                  cat==='veterinary'?'Direct treatment costs for this animal':
                                  cat==='breeding'?'Direct AI/service costs for this animal':
                                  cat==='depreciation'?'Equipment depreciation shared across herd':'Shared overhead';
                    return (
                      <tr key={cat} className="border-b border-[#F5F0E8] hover:bg-[#F5F0E8]/40">
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full" style={{backgroundColor:COST_COLORS[cat]}}/>
                            <span className="capitalize font-medium text-xs">{cat}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-xs">KES {val.toFixed(0)}</td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <div className="w-10 bg-gray-100 rounded-full h-1.5">
                              <div className="h-1.5 rounded-full" style={{width:`${pct}%`,backgroundColor:COST_COLORS[cat]}}/>
                            </div>
                            <span className="text-xs">{pct}%</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right text-xs font-medium text-[#2D5016]">{typeof perL==='string'?perL:`${perL}`}</td>
                        <td className="px-3 py-2 text-right text-xs text-gray-500">{perD}</td>
                        <td className="px-3 py-2 text-xs text-gray-400 max-w-[140px] truncate" title={note}>{note}</td>
                      </tr>
                    );
                  })}
                  <tr className="bg-[#eef5dd] font-bold text-xs">
                    <td className="px-3 py-2">TOTAL</td>
                    <td className="px-3 py-2 text-right">KES {data.totalCost.toFixed(0)}</td>
                    <td className="px-3 py-2 text-right">100%</td>
                    <td className="px-3 py-2 text-right text-[#2D5016]">KES {data.costPerLiter.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right">KES {data.costPerDay.toFixed(0)}</td>
                    <td className="px-3 py-2"/>
                  </tr>
                </tbody>
              </table>

              {/* Pie chart */}
              {pieData.length>0 && (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name"
                      cx="50%" cy="50%" outerRadius={75}
                      label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`}
                      labelLine={false}>
                      {pieData.map((e,i)=><Cell key={i} fill={e.color}/>)}
                    </Pie>
                    <Tooltip formatter={v=>`KES ${v.toLocaleString()}`}/>
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          )}

          {/* Shifts tab */}
          {tab==='shifts' && (
            <div className="space-y-3">
              <p className="text-xs text-gray-500 mb-3">Production breakdown by milking shift for the selected period.</p>
              {data.byShift.map(s=>(
                <div key={s.shift} className="bg-[#F5F0E8] rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="font-semibold text-sm text-[#1a3009]">{s.shift}</p>
                      <p className="text-xs text-gray-400">{s.sessions} sessions recorded</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold text-[#2D5016]">{s.liters.toFixed(1)} L</p>
                      <p className="text-xs text-gray-400">{s.sessions>0?(s.liters/s.sessions).toFixed(1):0} L/session avg</p>
                    </div>
                  </div>
                  {data.totalLiters>0 && (
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div className="h-2 rounded-full bg-[#2D5016] transition-all"
                        style={{width:`${(s.liters/data.totalLiters*100).toFixed(0)}%`}}/>
                    </div>
                  )}
                </div>
              ))}
              {data.byShift.every(s=>s.liters===0) && (
                <p className="text-sm text-gray-400 text-center py-8">No milk logs recorded for this period.</p>
              )}
            </div>
          )}

          {/* Daily History tab */}
          {tab==='history' && (
            <div>
              {data.dailyHistory.length>0 ? (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs text-gray-500">Daily production — last {Math.min(14,days)} days</p>
                    <p className="text-xs font-medium text-[#2D5016]">Avg: {data.dailyAvgLiters.toFixed(1)} L/day</p>
                  </div>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={data.dailyHistory} margin={{top:5,right:10,left:0,bottom:5}}>
                      <XAxis dataKey="day" tick={{fontSize:10}}/>
                      <YAxis tick={{fontSize:10}} tickFormatter={v=>`${v}L`}/>
                      <Tooltip formatter={v=>[`${v} L`,'Production']}/>
                      <ReferenceLine y={data.breakEvenLitersPerDay} stroke="#dc2626" strokeDasharray="4 4"
                        label={{value:'Break-even',position:'insideTopRight',fontSize:10,fill:'#dc2626'}}/>
                      <Bar dataKey="liters" radius={[4,4,0,0]}>
                        {data.dailyHistory.map((e,i)=>(
                          <Cell key={i} fill={e.liters>=data.breakEvenLitersPerDay?'#2D5016':'#dc2626'}/>
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <p className="text-xs text-gray-400 text-center mt-2">
                    🟢 Green bars = above break-even · 🔴 Red bars = below break-even
                  </p>
                </>
              ) : (
                <p className="text-sm text-gray-400 text-center py-8">No daily production data available.</p>
              )}
            </div>
          )}

          {/* Treatments tab */}
          {tab==='treatments' && (
            <div className="space-y-2">
              {data.myTreatments.length===0 && <p className="text-sm text-gray-400 text-center py-8">No treatments recorded for this animal in this period.</p>}
              {data.myTreatments.map(t=>(
                <div key={t.id} className="bg-[#F5F0E8] rounded-xl p-3">
                  <div className="flex items-start justify-between mb-1">
                    <p className="text-sm font-semibold text-[#1a3009]">{t.diagnosis}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${t.status==='Active'?'bg-red-100 text-red-700':'bg-green-100 text-green-700'}`}>{t.status}</span>
                  </div>
                  <p className="text-xs text-gray-500">{t.date} · {t.vet}</p>
                  <p className="text-xs text-gray-600 mt-1">{t.treatment}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-red-600 font-medium">Cost: KES {(t.cost||0).toLocaleString()}</span>
                    {t.withdrawal>0 && <span className="text-xs text-red-500">⚠️ {t.withdrawal}d withdrawal</span>}
                  </div>
                </div>
              ))}
              {data.myTreatments.length>0 && (
                <div className="bg-red-50 rounded-xl p-3 flex items-center justify-between">
                  <span className="text-sm font-semibold text-red-700">Total Vet Cost</span>
                  <span className="text-sm font-bold text-red-700">KES {data.breakdown.veterinary.toLocaleString()}</span>
                </div>
              )}
            </div>
          )}

          {/* Breeding tab */}
          {tab==='breeding' && (
            <div className="space-y-2">
              {data.myBreeding.length===0 && <p className="text-sm text-gray-400 text-center py-8">No breeding events recorded for this animal in this period.</p>}
              {data.myBreeding.map(b=>(
                <div key={b.id} className="bg-[#F5F0E8] rounded-xl p-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-semibold text-[#1a3009]">{b.method} Service</p>
                    <span className="text-xs font-medium text-[#2D5016]">KES {(b.cost||0).toLocaleString()}</span>
                  </div>
                  <p className="text-xs text-gray-500">{b.date} · {b.technician||'—'}</p>
                  {b.sireId && <p className="text-xs text-gray-500 mt-1">Sire: {b.sireId}</p>}
                </div>
              ))}
              {data.myBreeding.length>0 && (
                <div className="bg-[#eef5dd] rounded-xl p-3 flex items-center justify-between">
                  <span className="text-sm font-semibold text-[#2D5016]">Total Breeding Cost</span>
                  <span className="text-sm font-bold text-[#2D5016]">KES {data.breakdown.breeding.toLocaleString()}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Herd Ranking Table ────────────────────────────────────────
function HerdRankingTable({ animals, speciesData, days, sellingPrice, onSelect }) {
  const rankings = useMemo(()=>{
    if (!speciesData||!animals) return [];
    const startDate = daysAgoStr(days);
    const { milkLogs, treatments, breedingLogs } = speciesData;
    const totalAnimals = Math.max(1, animals.length);
    const feedShare = speciesData.breakdown.feed/totalAnimals;
    const labShare  = speciesData.breakdown.labour/totalAnimals;
    const deprShare = speciesData.breakdown.depreciation/totalAnimals;
    const ohShare   = speciesData.breakdown.overhead/totalAnimals;

    return animals.map(animal=>{
      const myMilk   = (milkLogs||[]).filter(l=>l.animalId===animal.id&&l.date>=startDate);
      const liters   = myMilk.reduce((s,l)=>s+(l.amount||0),0);
      const revenue  = myMilk.filter(l=>l.status==='Sold').reduce((s,l)=>s+((l.amount||0)*(l.pricePerLiter||sellingPrice||0)),0);
      const vetCost  = (treatments||[]).filter(t=>t.animalId===animal.id&&t.date>=startDate).reduce((s,t)=>s+(t.cost||0),0);
      const bredCost = (breedingLogs||[]).filter(b=>b.animalId===animal.id&&b.date>=startDate).reduce((s,b)=>s+(b.cost||0),0);
      const total    = feedShare+labShare+vetCost+bredCost+deprShare+ohShare;
      const cpu      = liters>0?total/liters:0;
      const sp       = sellingPrice||myMilk.filter(l=>(l.pricePerLiter||0)>0).reduce((s,l,_,a)=>s+(l.pricePerLiter||0)/a.length,0);
      const profit   = sp>0?sp-cpu:0;
      return { animal, liters, revenue, totalCost:total, cpu, profit, sp };
    }).sort((a,b)=>b.profit-a.profit);
  },[animals, speciesData, days, sellingPrice]);

  if (!rankings.length) return <p className="text-sm text-gray-400 text-center py-8">No animals found for this species.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-[#2D5016]">
            {['Rank','Animal','ID','Production','Revenue','Total Cost','Cost/L','Sell Price','Profit/L',''].map(h=>(
              <th key={h} className="px-3 py-2 text-left text-white font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rankings.map((r,i)=>{
            const isBelow = r.sp>0&&r.sp<r.cpu;
            const isDanger = r.sp>0&&r.profit>0&&r.profit/r.sp<0.1;
            return (
              <tr key={r.animal.id}
                className={`border-b border-[#F5F0E8] cursor-pointer hover:bg-[#F5F0E8]/60 ${isBelow?'bg-red-50':isDanger?'bg-amber-50':i===0?'bg-green-50':''}`}
                onClick={()=>onSelect(r.animal)}>
                <td className="px-3 py-2 font-bold text-[#2D5016]">
                  {i===0?'🏆':i===1?'🥈':i===2?'🥉':`#${i+1}`}
                </td>
                <td className="px-3 py-2 font-medium">{r.animal.name}</td>
                <td className="px-3 py-2 font-mono text-gray-400">{r.animal.animalCode||r.animal.tag}</td>
                <td className="px-3 py-2 font-semibold text-[#2D5016]">{r.liters.toFixed(1)} L</td>
                <td className="px-3 py-2">KES {r.revenue.toFixed(0)}</td>
                <td className="px-3 py-2">KES {r.totalCost.toFixed(0)}</td>
                <td className="px-3 py-2 font-semibold">{r.cpu>0?`KES ${r.cpu.toFixed(2)}`:'—'}</td>
                <td className="px-3 py-2">{r.sp>0?`KES ${r.sp.toFixed(2)}`:'—'}</td>
                <td className={`px-3 py-2 font-bold ${isBelow?'text-red-600':isDanger?'text-amber-600':'text-green-700'}`}>
                  {r.sp>0?`${r.profit>=0?'+':''}KES ${r.profit.toFixed(2)}`:'—'}
                </td>
                <td className="px-3 py-2">
                  <span className="text-[#2D5016] underline text-xs">Drill down →</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════
export default function CostCalculator() {
  const { formatCurrency } = useApp();
  const [species,      setSpecies]      = useState('cattle');
  const [period,       setPeriod]       = useState('month');
  const [manualPrice,  setManualPrice]  = useState(0);
  const [view,         setView]         = useState('overview'); // overview | herd | ranking
  const [selectedAnimal, setSelectedAnimal] = useState(null);

  const days       = PERIODS.find(p=>p.id===period)?.days||30;
  const cfg        = SPECIES_CONFIG[species];
  const speciesData = useSpeciesCost(species, days);

  const animals = speciesData?.animals||[];
  const sp      = manualPrice>0 ? manualPrice : (speciesData?.sellingPrice||0);

  const isBelowSpecies = sp>0 && sp < (speciesData?.costPerUnit||0);
  const isDangerSpecies = sp>0 && !isBelowSpecies && speciesData?.costPerUnit>0 && (sp-speciesData.costPerUnit)/sp<0.1;

  return (
    <div className="page-content">
      {/* Header */}
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#1a3009]" style={{fontFamily:'Georgia,serif'}}>
            📊 Cost of Production
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Species overview → per-animal drill-down → break-even per cow</p>
        </div>
        <div className="flex gap-2 flex-wrap">
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
          <button key={k} onClick={()=>{ setSpecies(k); setView('overview'); setSelectedAnimal(null); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all border-2 ${
              species===k ? 'border-[#2D5016] bg-[#2D5016] text-white' : 'border-[#e8e0d0] bg-white text-gray-600 hover:border-[#6B7C3A]'
            }`}>
            <span>{v.emoji}</span>{v.label}
          </button>
        ))}
      </div>

      {/* Alert banners */}
      {isBelowSpecies && (
        <div className="bg-red-50 border-2 border-red-400 rounded-2xl px-5 py-4 mb-4 flex items-start gap-4">
          <span className="text-3xl">🚨</span>
          <div>
            <p className="font-bold text-red-700">ALERT: Herd selling below cost of production</p>
            <p className="text-sm text-red-600 mt-1">
              Average selling price <strong>KES {sp.toFixed(2)}/liter</strong> vs cost <strong>KES {speciesData?.costPerUnit?.toFixed(2)}/liter</strong>.
              You are losing <strong>KES {Math.abs(sp-speciesData?.costPerUnit).toFixed(2)} on every liter</strong>.
              Drill into individual cows below to find which animals are costing the most.
            </p>
          </div>
        </div>
      )}

      {/* Species summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[
          { label:`${cfg.unitLabel}s Produced`, value:`${(speciesData?.totalUnits||0).toFixed(1)} ${cfg.unit}s`, sub:`${((speciesData?.totalUnits||0)/days).toFixed(1)} ${cfg.unit}s/day` },
          { label:'Herd Cost per Liter', value:`KES ${(speciesData?.costPerUnit||0).toFixed(2)}`, sub:'average across herd', alert:isBelowSpecies },
          { label:'Selling Price', value:sp>0?`KES ${sp.toFixed(2)}`:'Set below', sub:'per liter', good:!isBelowSpecies&&sp>0 },
          { label:'Herd Profit/Loss per L', value:sp>0?`${speciesData?.profitPerUnit>=0?'+':''}KES ${(sp-(speciesData?.costPerUnit||0)).toFixed(2)}`:'—', sub:`${animals.length} animals in herd`, alert:isBelowSpecies, good:(speciesData?.profitPerUnit||0)>0&&!isDangerSpecies },
        ].map((c,i)=>(
          <div key={i} className={`rounded-2xl border p-3.5 ${c.alert?'bg-red-50 border-red-200':c.good?'bg-green-50 border-green-200':'bg-white border-[#e8e0d0]'}`}>
            <p className="text-[10px] text-gray-400 uppercase font-semibold mb-1">{c.label}</p>
            <p className={`text-xl font-bold ${c.alert?'text-red-700':c.good?'text-green-700':'text-[#1a3009]'}`}>{c.value}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">{c.sub}</p>
          </div>
        ))}
      </div>

      {/* Selling price input */}
      <div className="bg-[#F5F0E8] rounded-xl px-4 py-3 mb-5 flex items-center gap-4">
        <span className="text-2xl">{cfg.emoji}</span>
        <div className="flex-1">
          <p className="text-xs font-semibold text-gray-500 uppercase">Set Selling Price (applies to all views)</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm text-gray-500">KES</span>
            <input type="number" step="0.5" min="0" value={manualPrice||sp||''}
              onChange={e=>setManualPrice(parseFloat(e.target.value)||0)}
              placeholder="e.g. 55"
              className="w-24 bg-white border border-[#e8e0d0] rounded-lg px-2 py-1 text-sm font-bold text-[#2D5016] focus:outline-none focus:ring-2 focus:ring-[#2D5016]"/>
            <span className="text-sm text-gray-400">per {cfg.unit}</span>
            {manualPrice>0&&<button onClick={()=>setManualPrice(0)} className="text-xs text-gray-400 underline">reset</button>}
          </div>
        </div>
      </div>

      {/* View toggle */}
      <div className="flex gap-2 mb-5">
        {[['overview','Species Overview'],['herd',`${cfg.emoji} Per Animal (${animals.length})`],['ranking','🏆 Herd Ranking']].map(([k,l])=>(
          <button key={k} onClick={()=>setView(k)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${view===k?'bg-[#2D5016] text-white':'bg-white border border-[#e8e0d0] text-[#6B7C3A]'}`}>
            {l}
          </button>
        ))}
      </div>

      {/* OVERVIEW TAB */}
      {view==='overview' && speciesData && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Cost breakdown bars */}
            <div className="card">
              <h3 className="text-sm font-semibold text-[#1a3009] mb-4">Herd Cost Breakdown</h3>
              <div className="space-y-2">
                {Object.entries(speciesData.breakdown).filter(([,v])=>v>0).sort(([,a],[,b])=>b-a).map(([k,v])=>{
                  const total=Object.values(speciesData.breakdown).reduce((s,x)=>s+x,0)||1;
                  const pct=(v/total*100).toFixed(1);
                  return (
                    <div key={k}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium capitalize text-gray-600">{k}</span>
                        <span className="text-xs text-gray-500">KES {v.toLocaleString()} · {pct}%</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div className="h-2 rounded-full" style={{width:`${pct}%`,backgroundColor:COST_COLORS[k]}}/>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            {/* 6-month trend */}
            <div className="card">
              <h3 className="text-sm font-semibold text-[#1a3009] mb-2">Cost vs Price Trend (6 months)</h3>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={speciesData.trend||[]} margin={{top:5,right:10,left:0,bottom:5}}>
                  <XAxis dataKey="month" tick={{fontSize:10}}/>
                  <YAxis tick={{fontSize:10}} tickFormatter={v=>`${v}`}/>
                  <Tooltip formatter={(v,n)=>[`KES ${v}`,n==='costPerUnit'?'Cost/unit':'Selling price']}/>
                  <Line type="monotone" dataKey="costPerUnit" stroke="#dc2626" strokeWidth={2} dot={{r:3}} name="costPerUnit"/>
                  <Line type="monotone" dataKey="sellingPrice" stroke="#2D5016" strokeWidth={2} dot={{r:3}} strokeDasharray="5 5" name="sellingPrice"/>
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="bg-[#eef5dd] border border-[#c8dfa0] rounded-xl px-4 py-3 flex items-start gap-3">
            <span className="text-xl">💡</span>
            <p className="text-sm text-[#2D5016] font-medium">
              Click <strong>Per Animal</strong> tab above to see the true cost of production for every individual cow in your herd — including which cows are profitable and which are costing you money.
            </p>
          </div>
        </div>
      )}

      {/* PER ANIMAL TAB */}
      {view==='herd' && (
        <div>
          {animals.length===0 ? (
            <div className="card text-center py-16">
              <p className="text-4xl mb-3">{cfg.emoji}</p>
              <p className="text-gray-500 text-sm">No {cfg.label} animals registered yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {animals.map(a=>(
                <AnimalCostCard
                  key={a.id}
                  animal={a}
                  speciesData={speciesData}
                  days={days}
                  sellingPriceOverride={sp>0?sp:0}
                  onClick={()=>setSelectedAnimal(a)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* RANKING TAB */}
      {view==='ranking' && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-[#1a3009]">Herd Profitability Ranking — Most to Least Profitable</h3>
            <span className="text-xs text-gray-400">{animals.length} animals</span>
          </div>
          <HerdRankingTable
            animals={animals}
            speciesData={speciesData}
            days={days}
            sellingPrice={sp>0?sp:0}
            onSelect={a=>{ setSelectedAnimal(a); }}
          />
          <p className="text-xs text-gray-400 mt-3 text-center">Click any row to see full cost drill-down for that animal</p>
        </div>
      )}

      {/* Per-animal detail modal */}
      {selectedAnimal && (
        <AnimalDetailView
          animal={selectedAnimal}
          speciesData={speciesData}
          days={days}
          sellingPriceOverride={sp>0?sp:0}
          onClose={()=>setSelectedAnimal(null)}
        />
      )}
    </div>
  );
}
