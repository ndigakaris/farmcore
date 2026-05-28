import { useState, useEffect, useMemo, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import db from '../../db/schema.js';
import { useApp } from '../../context/AppContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { SPECIES } from '../../constants/index.js';
import { KPICard, SectionCard, StatGrid, Badge } from '../../components/UI.jsx';
import { formatDate, offsetDate, daysFromNow } from '../../utils/index.js';

// ── AI Farm Brief Component ────────────────────────────────────
function AIFarmBrief({ animals, milkLogs, transactions, treatments, feedInventory, employees, attendance, farm }) {
  const [brief,     setBrief]     = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [expanded,  setExpanded]  = useState(false);
  const [error,     setError]     = useState(null);
  const [lastFetch, setLastFetch] = useState(null);

  const buildContext = useCallback(() => {
    const today = new Date().toISOString().split('T')[0];
    const last7  = offsetDate(-7);
    const last30 = offsetDate(-30);

    // Milk stats
    const recentMilk = (milkLogs||[]).filter(l=>l.date>=last7);
    const totalMilk7d = recentMilk.reduce((s,l)=>s+(l.amount||0),0);
    const avgMilk7d   = (totalMilk7d/7).toFixed(1);
    const todayMilk   = (milkLogs||[]).filter(l=>l.date===today).reduce((s,l)=>s+(l.amount||0),0);

    // Yield drop detection
    const prev14 = (milkLogs||[]).filter(l=>l.date>=offsetDate(-14)&&l.date<last7);
    const prevAvg = prev14.length ? prev14.reduce((s,l)=>s+(l.amount||0),0)/14 : 0;
    const yieldDropPct = prevAvg>0 ? ((prevAvg - totalMilk7d/7)/prevAvg*100).toFixed(0) : 0;

    // Finance
    const income30d  = (transactions||[]).filter(t=>t.type==='income' &&t.date>=last30).reduce((s,t)=>s+t.amount,0);
    const expense30d = (transactions||[]).filter(t=>t.type==='expense'&&t.date>=last30).reduce((s,t)=>s+t.amount,0);
    const profit30d  = income30d - expense30d;

    // Active treatments
    const activeTreatments = (treatments||[]).filter(t=>t.status==='Active').length;

    // Low stock
    const lowStock = (feedInventory||[]).filter(f=>f.minStock>0&&f.quantity<=f.minStock*1.2).map(f=>f.feedType);

    // Attendance
    const presentToday = (attendance||[]).filter(a=>a.status==='present').length;
    const absentToday  = (attendance||[]).filter(a=>a.status==='absent').length;
    const totalActive  = (employees||[]).filter(e=>(e.status||'active')==='active').length;

    // Animals
    const totalAnimals = (animals||[]).length;
    const lockedAnimals = (animals||[]).filter(a=>a.milkLock).length;
    const speciesBreakdown = Object.entries(SPECIES).filter(([k])=>k!=='all').map(([k,v])=>{
      const count = (animals||[]).filter(a=>a.species===k).length;
      return count>0 ? `${v.label}: ${count}` : null;
    }).filter(Boolean).join(', ');

    return {
      farmName: farm?.name||'the farm',
      date: today,
      totalAnimals, speciesBreakdown, lockedAnimals,
      todayMilk: todayMilk.toFixed(1),
      avgMilk7d, totalMilk7d: totalMilk7d.toFixed(1),
      yieldDropPct: Number(yieldDropPct),
      income30d: income30d.toFixed(0), expense30d: expense30d.toFixed(0), profit30d: profit30d.toFixed(0),
      activeTreatments, lowStock: lowStock.join(', ')||'none',
      presentToday, absentToday, totalActive,
    };
  }, [animals, milkLogs, transactions, treatments, feedInventory, employees, attendance, farm]);

  const fetchBrief = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const ctx = buildContext();
      const prompt = `You are FarmCore AI, a farm management assistant for ${ctx.farmName} in Kenya.
Today is ${ctx.date}. Analyze this farm data and give a concise daily brief in 3–4 short paragraphs.

FARM DATA:
- Animals: ${ctx.totalAnimals} total (${ctx.speciesBreakdown})${ctx.lockedAnimals>0?`, ${ctx.lockedAnimals} on milk withdrawal lock`:''}
- Today's milk: ${ctx.todayMilk} liters. 7-day average: ${ctx.avgMilk7d} L/day (total: ${ctx.totalMilk7d}L)
${ctx.yieldDropPct>10?`- ALERT: Milk yield dropped ${ctx.yieldDropPct}% vs previous week`:'- Milk yield is stable'}
- Finance (30 days): Income KES ${Number(ctx.income30d).toLocaleString()}, Expenses KES ${Number(ctx.expense30d).toLocaleString()}, Profit KES ${Number(ctx.profit30d).toLocaleString()}
- Active treatments: ${ctx.activeTreatments}
- Low stock feeds: ${ctx.lowStock}
- Staff today: ${ctx.presentToday}/${ctx.totalActive} present${ctx.absentToday>0?`, ${ctx.absentToday} absent`:''}

Write the brief in a warm, professional tone for a Kenyan farm owner. Include:
1. Overall status summary (1–2 sentences — is the farm doing well or are there concerns?)
2. Production highlights or concerns (milk, eggs if relevant)
3. Financial snapshot — profit/loss trend in plain language
4. Top 2–3 actionable recommendations for today based on the data above
5. One market insight: current milk prices in Kenya typically range KES 40–60/liter at farm gate, cooperative prices KES 38–45/liter. Advise whether to sell to cooperative or direct.

Keep each paragraph to 2–3 sentences. Use plain English. No bullet points — write in flowing paragraphs. End with one encouraging sentence.`;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          messages: [{ role: 'user', content: prompt }]
        })
      });

      const data = await response.json();
      const text = data.content?.find(b=>b.type==='text')?.text||'Unable to generate brief.';
      setBrief(text);
      setLastFetch(new Date());
    } catch (err) {
      setError('Could not load AI brief. Check your connection.');
    } finally { setLoading(false); }
  }, [buildContext]);

  // Auto-fetch on first load
  useEffect(() => {
    if (!brief && !loading && animals) fetchBrief();
  }, [animals]);

  const paragraphs = brief ? brief.split('\n\n').filter(p=>p.trim()) : [];

  return (
    <div className="rounded-2xl overflow-hidden mb-5" style={{background:'linear-gradient(135deg,#1E3A0A,#2D5016)'}}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-[#C9A84C] flex items-center justify-center text-white font-bold text-sm flex-shrink-0">AI</div>
          <div>
            <p className="text-white font-semibold text-sm">FarmCore AI — Daily Farm Brief</p>
            <p className="text-white/50 text-[10px]">{lastFetch ? `Updated ${lastFetch.toLocaleTimeString('en-KE',{hour:'2-digit',minute:'2-digit'})}` : 'Powered by Claude AI'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchBrief} disabled={loading}
            className="text-white/60 hover:text-white text-xs border border-white/20 rounded-lg px-2.5 py-1 transition-all hover:bg-white/10 disabled:opacity-40">
            {loading ? '…' : '↻ Refresh'}
          </button>
          <button onClick={()=>setExpanded(v=>!v)}
            className="text-white/60 hover:text-white text-xs border border-white/20 rounded-lg px-2.5 py-1 transition-all hover:bg-white/10">
            {expanded?'▲ Less':'▼ More'}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="px-5 py-4">
        {loading && (
          <div className="flex items-center gap-3">
            <div className="flex gap-1">
              {[0,1,2].map(i=>(
                <div key={i} className="w-1.5 h-1.5 bg-[#C9A84C] rounded-full animate-bounce" style={{animationDelay:`${i*0.15}s`}}/>
              ))}
            </div>
            <p className="text-white/70 text-sm">Analysing your farm data…</p>
          </div>
        )}

        {error && !loading && (
          <div className="flex items-center gap-3">
            <p className="text-red-300 text-sm">{error}</p>
            <button onClick={fetchBrief} className="text-white/60 hover:text-white text-xs underline">Retry</button>
          </div>
        )}

        {brief && !loading && (
          <>
            {/* First paragraph always shown */}
            {paragraphs[0] && (
              <p className="text-white text-sm leading-relaxed">{paragraphs[0]}</p>
            )}
            {/* Rest shown when expanded */}
            {expanded && paragraphs.slice(1).map((p,i)=>(
              <p key={i} className="text-white/85 text-sm leading-relaxed mt-3">{p}</p>
            ))}
            {!expanded && paragraphs.length > 1 && (
              <button onClick={()=>setExpanded(true)} className="text-[#C9A84C] text-xs mt-2 hover:underline">
                Read full brief ({paragraphs.length-1} more section{paragraphs.length>2?'s':''}) →
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Smart Tip (existing, keep as fallback) ─────────────────────
function SmartTip({ animals, milkLogs, feedInventory, notifications }) {
  const tips = useMemo(() => {
    const results = [];
    if (milkLogs && milkLogs.length > 0) {
      const byAnimal = {};
      milkLogs.forEach(l => { if (!byAnimal[l.animalId]) byAnimal[l.animalId]=[]; byAnimal[l.animalId].push(l); });
      for (const [id, logs] of Object.entries(byAnimal)) {
        const sorted = logs.sort((a,b)=>b.date.localeCompare(a.date));
        const last3  = sorted.slice(0,3).reduce((s,l)=>s+l.amount,0)/3;
        const prev7  = sorted.slice(3,10).reduce((s,l)=>s+l.amount,0)/Math.max(sorted.slice(3,10).length,1);
        if (prev7>0&&(prev7-last3)/prev7>0.15) {
          const animal=animals?.find(a=>a.id===Number(id));
          if (animal) results.push(`🔴 ${animal.name} ${animal.tag} yield dropped ${Math.round((prev7-last3)/prev7*100)}% vs 7-day avg — health check recommended.`);
        }
      }
    }
    if (feedInventory) feedInventory.forEach(f=>{ if(f.quantity<=f.minStock*1.2) results.push(`⚠️ ${f.feedType} is low (${f.quantity}${f.unit}) — reorder now.`); });
    if (notifications) notifications.filter(n=>n.priority==='urgent'&&!n.read).forEach(n=>results.push(`🚨 ${n.body}`));
    if (results.length===0) results.push('✅ All systems normal. Farm is running well today.');
    return results;
  }, [animals, milkLogs, feedInventory, notifications]);

  const [idx, setIdx] = useState(0);
  useEffect(()=>{ const t=setInterval(()=>setIdx(i=>(i+1)%tips.length),8000); return ()=>clearInterval(t); },[tips.length]);

  return (
    <div className="bg-[#eef5dd] border border-[#c8dfa0] rounded-xl px-4 py-3 mb-4 flex items-start gap-3">
      <span className="text-lg flex-shrink-0">💡</span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold text-[#2D5016]/60 uppercase tracking-widest mb-1">Smart Alert</p>
        <p className="text-sm text-[#1a3009] leading-relaxed">{tips[idx]}</p>
        {tips.length>1&&<div className="flex gap-1 mt-2">{tips.map((_,i)=><button key={i} onClick={()=>setIdx(i)} className={`w-1.5 h-1.5 rounded-full ${i===idx?'bg-[#2D5016]':'bg-[#2D5016]/20'}`}/>)}</div>}
      </div>
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────
export default function Dashboard({ onNav }) {
  const { species, formatCurrency } = useApp();
  const { farm } = useAuth();

  const animals      = useLiveQuery(() => db.animals.toArray(), []);
  const milkLogs     = useLiveQuery(() => db.milkLogs.orderBy('date').reverse().limit(200).toArray(), []);
  const eggLogs      = useLiveQuery(() => db.eggLogs.orderBy('date').reverse().limit(30).toArray(), []);
  const transactions = useLiveQuery(() => db.transactions.orderBy('date').reverse().limit(200).toArray(), []);
  const feedInv      = useLiveQuery(() => db.feedInventory.toArray(), []);
  const employees    = useLiveQuery(() => db.employees.toArray(), []);
  const treatments   = useLiveQuery(() => db.treatments.toArray(), []);
  const attendance   = useLiveQuery(() => db.attendance.where('date').equals(new Date().toISOString().split('T')[0]).toArray(), []);
  const alerts       = useLiveQuery(() => db.notifications.orderBy('timestamp').reverse().limit(10).toArray(), []);
  const calEvents    = useLiveQuery(() => db.calendarEvents.where('date').between(new Date().toISOString().split('T')[0], offsetDate(14)).toArray(), []);

  const today = new Date().toISOString().split('T')[0];

  const filteredAnimals = useMemo(()=>animals?.filter(a=>species==='all'||a.species===species)||[],[animals,species]);
  const todayMilk       = useMemo(()=>milkLogs?.filter(l=>l.date===today).reduce((s,l)=>s+l.amount,0)||0,[milkLogs,today]);
  const todayEggs       = useMemo(()=>eggLogs?.find(l=>l.date===today)?.total||0,[eggLogs,today]);
  const todayRevenue    = useMemo(()=>transactions?.filter(t=>t.date===today&&t.type==='income').reduce((s,t)=>s+t.amount,0)||0,[transactions,today]);
  const urgentAlerts    = useMemo(()=>alerts?.filter(a=>a.priority==='urgent'&&!a.read).length||0,[alerts]);

  const milkChart = useMemo(()=>{
    const days=Array.from({length:7},(_,i)=>offsetDate(i-6));
    return days.map(date=>{
      const logs=milkLogs?.filter(l=>l.date===date)||[];
      return { date:date.slice(5), morning:+logs.filter(l=>l.shift==='Morning').reduce((s,l)=>s+l.amount,0).toFixed(1), evening:+logs.filter(l=>l.shift==='Evening').reduce((s,l)=>s+l.amount,0).toFixed(1) };
    });
  },[milkLogs]);

  const plChart = useMemo(()=>{
    const months={};
    transactions?.forEach(t=>{ const m=t.date.slice(0,7); if(!months[m]) months[m]={month:m.slice(5),income:0,expense:0}; if(t.type==='income') months[m].income+=t.amount; if(t.type==='expense') months[m].expense+=t.amount; });
    return Object.values(months).slice(-5).map(m=>({...m,profit:m.income-m.expense}));
  },[transactions]);

  const attCounts = useMemo(()=>({ present:attendance?.filter(a=>a.status==='present').length||0, absent:attendance?.filter(a=>a.status==='absent').length||0, leave:attendance?.filter(a=>a.status==='leave').length||0 }),[attendance]);
  const upcomingEvents = useMemo(()=>(calEvents||[]).sort((a,b)=>a.date.localeCompare(b.date)).slice(0,5),[calEvents]);
  const TOOLTIP_STYLE = { contentStyle:{ fontSize:12, background:'#fff', border:'1px solid #e8e0d0', borderRadius:8 } };

  return (
    <div className="page-content">
      {/* AI Farm Brief */}
      <AIFarmBrief
        animals={animals} milkLogs={milkLogs} transactions={transactions}
        treatments={treatments} feedInventory={feedInv}
        employees={employees} attendance={attendance} farm={farm}
      />

      {/* Smart alerts */}
      <SmartTip animals={animals} milkLogs={milkLogs} feedInventory={feedInv} notifications={alerts}/>

      {/* KPIs */}
      <StatGrid cols={5}>
        <KPICard label="Total Animals"   value={filteredAnimals.length} sub={`${Object.keys(SPECIES).length-1} species`} icon="🐾"/>
        <KPICard label="Today's Milk"    value={`${todayMilk.toFixed(1)}L`}      trend="down" icon="🥛"/>
        <KPICard label="Eggs Today"      value={`${todayEggs} pcs`}              trend="up"   icon="🥚"/>
        <KPICard label="Today's Revenue" value={formatCurrency(todayRevenue)}    trend="up"   icon="💰"/>
        <KPICard label="Active Alerts"   value={urgentAlerts} sub={`${alerts?.length||0} total`} icon="🔔" color={urgentAlerts>0?'#dc2626':undefined}/>
      </StatGrid>

      {/* Row 1 */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <SectionCard title="Daily Milk (L) — Last 7 Days" className="col-span-2">
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={milkChart} barCategoryGap="30%">
              <XAxis dataKey="date" tick={{fontSize:11}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fontSize:11}} axisLine={false} tickLine={false}/>
              <Tooltip {...TOOLTIP_STYLE}/>
              <Legend iconSize={8} iconType="square" wrapperStyle={{fontSize:11}}/>
              <Bar dataKey="morning" name="Morning" fill="#2D5016" radius={[3,3,0,0]}/>
              <Bar dataKey="evening" name="Evening"  fill="#6B7C3A" radius={[3,3,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>
        <SectionCard title={`Alerts (${alerts?.length||0})`} action={<button onClick={()=>onNav('notifications')} className="text-xs text-[#2D5016] hover:underline">View all</button>}>
          {(alerts||[]).length===0
            ? <p className="text-xs text-gray-400 text-center py-6">No alerts</p>
            : (alerts||[]).slice(0,6).map(a=>(
              <div key={a.id} className="flex items-start gap-2 py-2 border-b border-[#F5F0E8] last:border-0">
                <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${a.priority==='urgent'?'bg-red-500':a.priority==='warning'?'bg-amber-400':'bg-blue-400'}`}/>
                <div className="min-w-0">
                  <p className="text-xs leading-snug text-[#1a3009] truncate">{a.body||a.title}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{a.type} · {!a.read?'New':''}</p>
                </div>
              </div>
            ))}
        </SectionCard>
      </div>

      {/* Row 2 */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <SectionCard title="P&L Overview — Monthly" className="col-span-2">
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={plChart}>
              <XAxis dataKey="month" tick={{fontSize:11}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fontSize:11}} axisLine={false} tickLine={false} tickFormatter={v=>`${(v/1000).toFixed(0)}k`}/>
              <Tooltip {...TOOLTIP_STYLE} formatter={v=>`KES ${v.toLocaleString()}`}/>
              <Legend iconSize={8} wrapperStyle={{fontSize:11}}/>
              <Line dataKey="income"  name="Income"   stroke="#2D5016" strokeWidth={2} dot={{r:3}} type="monotone"/>
              <Line dataKey="expense" name="Expenses" stroke="#C9A84C" strokeWidth={2} dot={{r:3}} type="monotone" strokeDasharray="4 4"/>
              <Line dataKey="profit"  name="Profit"   stroke="#3b82f6" strokeWidth={1.5} dot={{r:2}} type="monotone" strokeDasharray="2 2"/>
            </LineChart>
          </ResponsiveContainer>
        </SectionCard>
        <div className="flex flex-col gap-4">
          <SectionCard title="Staff Attendance">
            <div className="flex gap-2 mb-3">
              <span className="badge badge-green">{attCounts.present} present</span>
              <span className="badge badge-red">{attCounts.absent} absent</span>
              <span className="badge badge-amber">{attCounts.leave} leave</span>
            </div>
            {(employees||[]).slice(0,4).map(e=>{
              const att=attendance?.find(a=>a.employeeId===e.id);
              return (
                <div key={e.id} className="flex items-center gap-2 py-1.5 border-b border-[#F5F0E8] last:border-0">
                  <div className="w-7 h-7 rounded-full bg-[#eef5dd] flex items-center justify-center text-[10px] font-bold text-[#2D5016] flex-shrink-0">
                    {e.name.split(' ').map(n=>n[0]).join('')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-[#1a3009] truncate">{e.name}</p>
                    <p className="text-[10px] text-gray-400">{e.section}</p>
                  </div>
                  <span className={`badge text-[9px] ${att?.status==='present'?'badge-green':att?.status==='absent'?'badge-red':'badge-amber'}`}>{att?.status||'?'}</span>
                </div>
              );
            })}
          </SectionCard>
        </div>
      </div>

      {/* Upcoming events */}
      <SectionCard title="📅 Upcoming Events (Next 14 Days)" action={<button onClick={()=>onNav('calendar')} className="text-xs text-[#2D5016] hover:underline">Full calendar</button>}>
        <div className="grid grid-cols-5 gap-2">
          {upcomingEvents.length===0
            ? <p className="text-xs text-gray-400 col-span-5 py-4 text-center">No upcoming events</p>
            : upcomingEvents.map(ev=>{
              const days=daysFromNow(ev.date);
              const urgency=days===0?'border-red-300 bg-red-50':days<=3?'border-amber-300 bg-amber-50':'border-[#e8e0d0] bg-white';
              return (
                <div key={ev.id} className={`rounded-lg border p-2.5 ${urgency}`}>
                  <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">{days===0?'Today':days===1?'Tomorrow':`In ${days}d`}</p>
                  <p className="text-xs font-medium text-[#1a3009] leading-snug">{ev.title}</p>
                  <span className="text-[10px] text-gray-400 capitalize">{ev.type}</span>
                </div>
              );
            })
          }
        </div>
      </SectionCard>
    </div>
  );
}
