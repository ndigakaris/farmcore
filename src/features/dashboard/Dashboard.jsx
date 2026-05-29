import { useState, useEffect, useMemo, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import db from '../../db/schema.js';
import { useApp } from '../../context/AppContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { SPECIES } from '../../constants/index.js';
import { KPICard, SectionCard, StatGrid } from '../../components/UI.jsx';
import { formatDate, offsetDate, daysFromNow } from '../../utils/index.js';

// ── AI Farm Brief ──────────────────────────────────────────────
// Calls /api/farm-brief (Vercel serverless function) so the API key
// is never exposed in the browser. See api/farm-brief.js
function AIFarmBrief({ animals, milkLogs, transactions, treatments, feedInventory, employees, attendance, farm }) {
  const [brief,     setBrief]     = useState('');
  const [loading,   setLoading]   = useState(false);
  const [expanded,  setExpanded]  = useState(false);
  const [error,     setError]     = useState('');
  const [lastFetch, setLastFetch] = useState(null);
  const [fetched,   setFetched]   = useState(false);

  const today  = new Date().toISOString().split('T')[0];
  const last7  = offsetDate(-7);
  const last30 = offsetDate(-30);

  const buildPrompt = useCallback(() => {
    const milk7d      = (milkLogs||[]).filter(l=>l.date>=last7);
    const totalMilk7d = milk7d.reduce((s,l)=>s+(l.amount||0),0);
    const todayMilk   = (milkLogs||[]).filter(l=>l.date===today).reduce((s,l)=>s+(l.amount||0),0);
    const income30d   = (transactions||[]).filter(t=>t.type==='income' &&t.date>=last30).reduce((s,t)=>s+t.amount,0);
    const expense30d  = (transactions||[]).filter(t=>t.type==='expense'&&t.date>=last30).reduce((s,t)=>s+t.amount,0);
    const activeTx    = (treatments||[]).filter(t=>t.status==='Active').length;
    const lowStock    = (feedInventory||[]).filter(f=>f.minStock>0&&f.quantity<=f.minStock*1.2).map(f=>f.feedType);
    const presentToday= (attendance||[]).filter(a=>a.status==='present').length;
    const totalStaff  = (employees||[]).filter(e=>(e.status||'active')==='active').length;
    const speciesBreak= Object.entries(SPECIES).filter(([k])=>k!=='all')
      .map(([k,v])=>{ const c=(animals||[]).filter(a=>a.species===k).length; return c>0?`${v.label}:${c}`:null; })
      .filter(Boolean).join(', ');
    const locked = (animals||[]).filter(a=>a.milkLock).length;

    return `You are FarmCore AI, a farm advisor for ${farm?.name||'a Kenyan farm'}.
Today: ${today}. Analyse this data and write a concise farm brief in 4 short paragraphs.

FARM DATA:
- Animals: ${(animals||[]).length} total (${speciesBreak||'none'})${locked>0?`, ${locked} on milk withdrawal lock`:''}
- Today milk: ${todayMilk.toFixed(1)}L | 7-day total: ${totalMilk7d.toFixed(1)}L (avg ${(totalMilk7d/7).toFixed(1)}L/day)
- Finance 30 days: Income KES ${income30d.toFixed(0)}, Expenses KES ${expense30d.toFixed(0)}, Profit KES ${(income30d-expense30d).toFixed(0)}
- Active health treatments: ${activeTx}
- Low stock feeds: ${lowStock.join(', ')||'none'}
- Staff: ${presentToday}/${totalStaff} present today

Write in warm professional English for a Kenyan farmer. 4 paragraphs:
1. Overall status (1-2 sentences — doing well or concerns?)
2. Production & health highlights or issues
3. Financial snapshot in plain language
4. Top 2 actionable recommendations + one Kenya market insight (milk farm gate KES 40-60/L, cooperative KES 38-45/L)

Keep it concise. No bullet points. End with an encouraging line.`;
  }, [animals, milkLogs, transactions, treatments, feedInventory, employees, attendance, farm, today, last7, last30]);

  const fetchBrief = useCallback(async () => {
    // AI brief only works on Vercel — skip silently on localhost
    const isLocal = window.location.hostname === 'localhost' ||
                    window.location.hostname === '127.0.0.1';
    if (isLocal) {
      setError('local');
      setFetched(true);
      return;
    }
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/farm-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: buildPrompt() }),
      });
      // Guard: response might be HTML (404 page) not JSON
      const contentType = res.headers.get('content-type')||'';
      if (!contentType.includes('application/json')) {
        throw new Error('API route not available. Deploy to Vercel to activate AI brief.');
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error||'Server error');
      setBrief(data.brief||'');
      setLastFetch(new Date());
      setFetched(true);
    } catch(err) {
      setError(err.message);
    } finally { setLoading(false); }
  }, [buildPrompt]);

  // Auto-fetch once animals data is ready, but only once per session
  useEffect(()=>{
    if (!fetched && !loading && animals && animals.length >= 0 && farm?.id) {
      fetchBrief();
    }
  },[farm?.id]); // eslint-disable-line

  const paragraphs = brief ? brief.split('\n\n').filter(p=>p.trim()) : [];
  const firstPara  = paragraphs[0] || '';
  const rest       = paragraphs.slice(1);

  return (
    <div className="rounded-2xl overflow-hidden mb-5" style={{background:'linear-gradient(135deg,#1E3A0A 0%,#2D5016 60%,#4e8628 100%)'}}>
      {/* Header row */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center font-bold text-sm flex-shrink-0"
            style={{background:'#C9A84C', color:'#1E3A0A'}}>AI</div>
          <div>
            <p className="text-white font-semibold text-sm">FarmCore AI — Daily Brief</p>
            <p className="text-white/50 text-[10px]">
              {lastFetch
                ? `Last updated ${lastFetch.toLocaleTimeString('en-KE',{hour:'2-digit',minute:'2-digit'})}`
                : 'Powered by Claude AI · Kenya market insights'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchBrief} disabled={loading}
            className="text-white/60 hover:text-white text-xs border border-white/20 rounded-lg px-2.5 py-1 hover:bg-white/10 disabled:opacity-40 transition-all">
            {loading ? '…' : '↻ Refresh'}
          </button>
          {brief && (
            <button onClick={()=>setExpanded(v=>!v)}
              className="text-white/60 hover:text-white text-xs border border-white/20 rounded-lg px-2.5 py-1 hover:bg-white/10 transition-all">
              {expanded ? '▲ Less' : '▼ Full brief'}
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="px-5 py-4 min-h-[56px]">
        {loading && (
          <div className="flex items-center gap-3">
            <div className="flex gap-1">
              {[0,1,2].map(i=>(
                <div key={i} className="w-2 h-2 bg-[#C9A84C] rounded-full animate-bounce"
                  style={{animationDelay:`${i*0.18}s`}}/>
              ))}
            </div>
            <p className="text-white/70 text-sm">Analysing your farm data…</p>
          </div>
        )}

        {error==='local' && (
          <div className="flex items-center gap-3">
            <span className="text-2xl">🚀</span>
            <div>
              <p className="text-white/80 text-sm font-medium">AI Brief activates after deployment</p>
              <p className="text-white/50 text-xs mt-0.5">Push to GitHub → Vercel deploys → AI brief goes live automatically. Add <strong className="text-white/70">GEMINI_API_KEY</strong> in Vercel environment variables.</p>
            </div>
          </div>
        )}
        {error && error!=='local' && !loading && (
          <div className="flex items-start gap-3">
            <span className="text-amber-300 text-lg">⚠️</span>
            <div>
              <p className="text-white/80 text-sm">{error}</p>
              <button onClick={fetchBrief} className="text-[#C9A84C] text-xs underline mt-1">Try again</button>
            </div>
          </div>
        )}

        {!loading && !error && brief && (
          <>
            <p className="text-white text-sm leading-relaxed">{firstPara}</p>
            {expanded && rest.map((p,i)=>(
              <p key={i} className="text-white/85 text-sm leading-relaxed mt-3">{p}</p>
            ))}
            {!expanded && rest.length > 0 && (
              <button onClick={()=>setExpanded(true)}
                className="text-[#C9A84C] text-xs mt-2 hover:underline font-medium">
                Read full brief ({rest.length} more section{rest.length>1?'s':''}) →
              </button>
            )}
          </>
        )}

        {!loading && !error && !brief && !fetched && (
          <p className="text-white/50 text-sm">Click ↻ to generate today's farm brief.</p>
        )}
      </div>
    </div>
  );
}

// ── Smart alert ticker (local, no API) ─────────────────────────
function SmartTip({ animals, milkLogs, feedInventory, notifications }) {
  const tips = useMemo(() => {
    const results = [];
    if (milkLogs && milkLogs.length > 0) {
      const byAnimal = {};
      milkLogs.forEach(l=>{ if (!byAnimal[l.animalId]) byAnimal[l.animalId]=[]; byAnimal[l.animalId].push(l); });
      for (const [id, logs] of Object.entries(byAnimal)) {
        const sorted = logs.sort((a,b)=>b.date.localeCompare(a.date));
        const last3  = sorted.slice(0,3).reduce((s,l)=>s+l.amount,0)/3;
        const prev7  = sorted.slice(3,10).reduce((s,l)=>s+l.amount,0)/Math.max(sorted.slice(3,10).length,1);
        if (prev7 > 0 && (prev7-last3)/prev7 > 0.15) {
          const animal = animals?.find(a=>a.id===Number(id));
          if (animal) results.push(`🔴 ${animal.name} yield dropped ${Math.round((prev7-last3)/prev7*100)}% vs 7-day average — check health.`);
        }
      }
    }
    (feedInventory||[]).forEach(f=>{ if (f.minStock>0&&f.quantity<=f.minStock*1.2) results.push(`⚠️ ${f.feedType} low (${f.quantity}${f.unit}) — reorder now.`); });
    (notifications||[]).filter(n=>n.priority==='urgent'&&!n.read).forEach(n=>results.push(`🚨 ${n.body}`));
    if (results.length === 0) results.push('✅ All systems normal. Farm is running well today.');
    return results;
  }, [animals, milkLogs, feedInventory, notifications]);

  const [idx, setIdx] = useState(0);
  useEffect(()=>{ const t=setInterval(()=>setIdx(i=>(i+1)%tips.length),8000); return ()=>clearInterval(t); },[tips.length]);

  return (
    <div className="bg-[#eef5dd] border border-[#c8dfa0] rounded-xl px-4 py-3 mb-4 flex items-start gap-3">
      <span className="text-lg flex-shrink-0">💡</span>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold text-[#2D5016]/60 uppercase tracking-widest mb-1">Live Alert</p>
        <p className="text-sm text-[#1a3009] leading-relaxed">{tips[idx]}</p>
        {tips.length > 1 && (
          <div className="flex gap-1 mt-2">
            {tips.map((_,i)=>(
              <button key={i} onClick={()=>setIdx(i)} className={`w-1.5 h-1.5 rounded-full transition-all ${i===idx?'bg-[#2D5016]':'bg-[#2D5016]/20'}`}/>
            ))}
          </div>
        )}
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
    const days = Array.from({length:7},(_,i)=>offsetDate(i-6));
    return days.map(date=>{
      const logs = milkLogs?.filter(l=>l.date===date)||[];
      return { date:date.slice(5), morning:+logs.filter(l=>l.shift==='Morning').reduce((s,l)=>s+l.amount,0).toFixed(1), evening:+logs.filter(l=>l.shift==='Evening').reduce((s,l)=>s+l.amount,0).toFixed(1) };
    });
  },[milkLogs]);

  const plChart = useMemo(()=>{
    const months = {};
    (transactions||[]).forEach(t=>{ const m=t.date?.slice(0,7); if (!m) return; if (!months[m]) months[m]={month:m.slice(5),income:0,expense:0}; if (t.type==='income') months[m].income+=t.amount; else if (t.type==='expense') months[m].expense+=t.amount; });
    return Object.values(months).slice(-5).map(m=>({...m,profit:m.income-m.expense}));
  },[transactions]);

  const attCounts = useMemo(()=>({
    present:(attendance||[]).filter(a=>a.status==='present').length,
    absent: (attendance||[]).filter(a=>a.status==='absent').length,
    leave:  (attendance||[]).filter(a=>a.status==='leave').length,
  }),[attendance]);

  const upcomingEvents = useMemo(()=>(calEvents||[]).sort((a,b)=>a.date.localeCompare(b.date)).slice(0,5),[calEvents]);
  const TT = { contentStyle:{ fontSize:12, background:'#fff', border:'1px solid #e8e0d0', borderRadius:8 } };

  return (
    <div className="page-content">

      {/* ① AI BRIEF — top of dashboard */}
      <AIFarmBrief
        animals={animals} milkLogs={milkLogs} transactions={transactions}
        treatments={treatments} feedInventory={feedInv}
        employees={employees} attendance={attendance} farm={farm}
      />

      {/* ② Smart local alerts */}
      <SmartTip animals={animals} milkLogs={milkLogs} feedInventory={feedInv} notifications={alerts}/>

      {/* ③ KPIs */}
      <StatGrid cols={5}>
        <KPICard label="Total Animals"   value={filteredAnimals.length} sub={`${Object.keys(SPECIES).length-1} species`} icon="🐾"/>
        <KPICard label="Today's Milk"    value={`${todayMilk.toFixed(1)}L`}    trend="down" icon="🥛"/>
        <KPICard label="Eggs Today"      value={`${todayEggs} pcs`}            trend="up"   icon="🥚"/>
        <KPICard label="Today's Revenue" value={formatCurrency(todayRevenue)}  trend="up"   icon="💰"/>
        <KPICard label="Active Alerts"   value={urgentAlerts} sub={`${alerts?.length||0} total`} icon="🔔" color={urgentAlerts>0?'#dc2626':undefined}/>
      </StatGrid>

      {/* ④ Row 1: Milk chart + Alerts */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <SectionCard title="Daily Milk (L) — Last 7 Days" className="col-span-2">
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={milkChart} barCategoryGap="30%">
              <XAxis dataKey="date" tick={{fontSize:11}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fontSize:11}} axisLine={false} tickLine={false}/>
              <Tooltip {...TT}/>
              <Legend iconSize={8} iconType="square" wrapperStyle={{fontSize:11}}/>
              <Bar dataKey="morning" name="Morning" fill="#2D5016" radius={[3,3,0,0]}/>
              <Bar dataKey="evening" name="Evening"  fill="#6B7C3A" radius={[3,3,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>

        <SectionCard title={`Alerts (${alerts?.length||0})`}
          action={<button onClick={()=>onNav?.('notifications')} className="text-xs text-[#2D5016] hover:underline">View all</button>}>
          {!(alerts?.length)
            ? <p className="text-xs text-gray-400 text-center py-6">No alerts</p>
            : (alerts||[]).slice(0,6).map(a=>(
              <div key={a.id} className="flex items-start gap-2 py-2 border-b border-[#F5F0E8] last:border-0">
                <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${a.priority==='urgent'?'bg-red-500':a.priority==='warning'?'bg-amber-400':'bg-blue-400'}`}/>
                <div className="min-w-0">
                  <p className="text-xs leading-snug text-[#1a3009] truncate">{a.body||a.title}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{!a.read?'New':''}</p>
                </div>
              </div>
            ))}
        </SectionCard>
      </div>

      {/* ⑤ Row 2: P&L + Staff */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <SectionCard title="P&L Overview — Monthly" className="col-span-2">
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={plChart}>
              <XAxis dataKey="month" tick={{fontSize:11}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fontSize:11}} axisLine={false} tickLine={false} tickFormatter={v=>`${(v/1000).toFixed(0)}k`}/>
              <Tooltip {...TT} formatter={v=>`KES ${v.toLocaleString()}`}/>
              <Legend iconSize={8} wrapperStyle={{fontSize:11}}/>
              <Line dataKey="income"  name="Income"   stroke="#2D5016" strokeWidth={2} dot={{r:3}} type="monotone"/>
              <Line dataKey="expense" name="Expenses" stroke="#C9A84C" strokeWidth={2} dot={{r:3}} type="monotone" strokeDasharray="4 4"/>
              <Line dataKey="profit"  name="Profit"   stroke="#3b82f6" strokeWidth={1.5} dot={{r:2}} type="monotone" strokeDasharray="2 2"/>
            </LineChart>
          </ResponsiveContainer>
        </SectionCard>

        <SectionCard title="Staff Today">
          <div className="flex gap-2 mb-3">
            <span className="badge badge-green">{attCounts.present} present</span>
            <span className="badge badge-red">{attCounts.absent} absent</span>
            <span className="badge badge-amber">{attCounts.leave} leave</span>
          </div>
          {(employees||[]).filter(e=>(e.status||'active')==='active').slice(0,4).map(e=>{
            const att = attendance?.find(a=>a.employeeId===e.id);
            return (
              <div key={e.id} className="flex items-center gap-2 py-1.5 border-b border-[#F5F0E8] last:border-0">
                <div className="w-7 h-7 rounded-full bg-[#eef5dd] flex items-center justify-center text-[10px] font-bold text-[#2D5016] flex-shrink-0">
                  {e.name.split(' ').map(n=>n[0]).join('').slice(0,2)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-[#1a3009] truncate">{e.name}</p>
                  <p className="text-[10px] text-gray-400">{e.section}</p>
                </div>
                <span className={`badge text-[9px] ${att?.status==='present'?'badge-green':att?.status==='absent'?'badge-red':'badge-amber'}`}>
                  {att?.status||'?'}
                </span>
              </div>
            );
          })}
          {!(employees||[]).length && <p className="text-xs text-gray-400 text-center py-4">No employees added yet</p>}
        </SectionCard>
      </div>

      {/* ⑥ Upcoming events */}
      <SectionCard title="📅 Upcoming Events — Next 14 Days"
        action={<button onClick={()=>onNav?.('calendar')} className="text-xs text-[#2D5016] hover:underline">Full calendar</button>}>
        <div className="grid grid-cols-5 gap-2">
          {!upcomingEvents.length
            ? <p className="text-xs text-gray-400 col-span-5 py-4 text-center">No upcoming events</p>
            : upcomingEvents.map(ev=>{
              const days = daysFromNow(ev.date);
              const cls  = days===0?'border-red-300 bg-red-50':days<=3?'border-amber-300 bg-amber-50':'border-[#e8e0d0] bg-white';
              return (
                <div key={ev.id} className={`rounded-lg border p-2.5 ${cls}`}>
                  <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">
                    {days===0?'Today':days===1?'Tomorrow':`In ${days}d`}
                  </p>
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
