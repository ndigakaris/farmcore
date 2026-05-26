import { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import db from '../../db/schema.js';
import { useApp } from '../../context/AppContext.jsx';
import { SPECIES } from '../../constants/index.js';
import { KPICard, SectionCard, StatGrid, Badge } from '../../components/UI.jsx';
import { formatDate, offsetDate, speciesEmoji, daysFromNow } from '../../utils/index.js';

function SmartTip({ animals, milkLogs, feedInventory, notifications }) {
  const tips = useMemo(() => {
    const results = [];
    // Yield drop detection
    if (milkLogs && milkLogs.length > 0) {
      const byAnimal = {};
      milkLogs.forEach(l => { if (!byAnimal[l.animalId]) byAnimal[l.animalId] = []; byAnimal[l.animalId].push(l); });
      for (const [id, logs] of Object.entries(byAnimal)) {
        const sorted = logs.sort((a,b) => b.date.localeCompare(a.date));
        const last3  = sorted.slice(0,3).reduce((s,l)=>s+l.amount,0)/3;
        const prev7  = sorted.slice(3,10).reduce((s,l)=>s+l.amount,0)/Math.max(sorted.slice(3,10).length,1);
        if (prev7 > 0 && (prev7-last3)/prev7 > 0.15) {
          const animal = animals?.find(a => a.id === Number(id));
          if (animal) results.push(`🔴 ${animal.name} ${animal.tag} yield dropped ${Math.round((prev7-last3)/prev7*100)}% vs 7-day avg — health check recommended.`);
        }
      }
    }
    // Low feed stock
    if (feedInventory) {
      feedInventory.forEach(f => { if (f.quantity <= f.minStock * 1.2) results.push(`⚠️ ${f.feedType} is low (${f.quantity}${f.unit}) — running below 7-day minimum. Reorder now.`); });
    }
    // Unread urgent alerts
    if (notifications) {
      notifications.filter(n=>n.priority==='urgent'&&!n.read).forEach(n => results.push(`🚨 ${n.body}`));
    }
    if (results.length === 0) results.push('✅ All systems normal. Farm is running well today. Keep up the great work!');
    return results;
  }, [animals, milkLogs, feedInventory, notifications]);

  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i+1) % tips.length), 8000);
    return () => clearInterval(t);
  }, [tips.length]);

  return (
    <div style={{background:'linear-gradient(135deg,#2D5016,#4e8628)'}} className="rounded-xl px-5 py-4 mb-5 flex items-start gap-3">
      <span className="text-2xl flex-shrink-0 mt-0.5">💡</span>
      <div className="min-w-0">
        <p className="text-[10px] font-bold text-white/50 uppercase tracking-widest mb-1">FarmCore Smart Tip · Today</p>
        <p className="text-sm text-white leading-relaxed">{tips[idx]}</p>
        {tips.length > 1 && (
          <div className="flex gap-1 mt-2">
            {tips.map((_,i) => (
              <button key={i} onClick={() => setIdx(i)}
                className={`w-1.5 h-1.5 rounded-full transition-all ${i===idx?'bg-white':'bg-white/30'}`}/>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Dashboard({ onNav }) {
  const { species, formatCurrency } = useApp();

  const animals      = useLiveQuery(() => db.animals.toArray(), []);
  const milkLogs     = useLiveQuery(() => db.milkLogs.orderBy('date').reverse().limit(200).toArray(), []);
  const eggLogs      = useLiveQuery(() => db.eggLogs.orderBy('date').reverse().limit(30).toArray(), []);
  const transactions = useLiveQuery(() => db.transactions.orderBy('date').reverse().limit(200).toArray(), []);
  const feedInv      = useLiveQuery(() => db.feedInventory.toArray(), []);
  const employees    = useLiveQuery(() => db.employees.toArray(), []);
  const attendance   = useLiveQuery(() => db.attendance.where('date').equals(new Date().toISOString().split('T')[0]).toArray(), []);
  const alerts       = useLiveQuery(() => db.notifications.orderBy('timestamp').reverse().limit(10).toArray(), []);
  const calEvents    = useLiveQuery(() => db.calendarEvents.where('date').between(new Date().toISOString().split('T')[0], offsetDate(14)).toArray(), []);

  const today = new Date().toISOString().split('T')[0];

  // KPIs
  const filteredAnimals = useMemo(() =>
    animals?.filter(a => species === 'all' || a.species === species) || [], [animals, species]);

  const todayMilk = useMemo(() =>
    milkLogs?.filter(l => l.date === today).reduce((s,l) => s + l.amount, 0) || 0, [milkLogs, today]);

  const todayEggs = useMemo(() =>
    eggLogs?.find(l => l.date === today)?.total || 0, [eggLogs, today]);

  const todayRevenue = useMemo(() =>
    transactions?.filter(t => t.date === today && t.type === 'income').reduce((s,t) => s+t.amount, 0) || 0,
    [transactions, today]);

  const urgentAlerts = useMemo(() =>
    alerts?.filter(a => a.priority === 'urgent' && !a.read).length || 0, [alerts]);

  // 7-day milk chart
  const milkChart = useMemo(() => {
    const days = Array.from({length:7},(_,i)=>offsetDate(i-6));
    return days.map(date => {
      const logs = milkLogs?.filter(l=>l.date===date) || [];
      const morning = logs.filter(l=>l.shift==='Morning').reduce((s,l)=>s+l.amount,0);
      const evening = logs.filter(l=>l.shift==='Evening').reduce((s,l)=>s+l.amount,0);
      return { date: date.slice(5), morning: +morning.toFixed(1), evening: +evening.toFixed(1) };
    });
  }, [milkLogs]);

  // 30-day P&L chart
  const plChart = useMemo(() => {
    const months = {};
    transactions?.forEach(t => {
      const m = t.date.slice(0,7);
      if (!months[m]) months[m] = { month: m.slice(5), income:0, expense:0 };
      if (t.type==='income')  months[m].income  += t.amount;
      if (t.type==='expense') months[m].expense += t.amount;
    });
    return Object.values(months).slice(-5).map(m => ({ ...m, profit: m.income - m.expense }));
  }, [transactions]);

  // Attendance counts
  const attCounts = useMemo(() => {
    const present = attendance?.filter(a=>a.status==='present').length || 0;
    const absent  = attendance?.filter(a=>a.status==='absent').length || 0;
    const leave   = attendance?.filter(a=>a.status==='leave').length || 0;
    return { present, absent, leave };
  }, [attendance]);

  // Upcoming calendar events
  const upcomingEvents = useMemo(() =>
    (calEvents || []).sort((a,b) => a.date.localeCompare(b.date)).slice(0,5), [calEvents]);

  const TOOLTIP_STYLE = { contentStyle:{ fontSize:12, background:'#fff', border:'1px solid #e8e0d0', borderRadius:8 } };

  return (
    <div className="page-content">
      <SmartTip animals={animals} milkLogs={milkLogs} feedInventory={feedInv} notifications={alerts}/>

      {/* KPIs */}
      <StatGrid cols={5}>
        <KPICard label="Total Animals" value={filteredAnimals.length} sub={`${Object.keys(SPECIES).length-1} species`} icon="🐾"/>
        <KPICard label="Today's Milk" value={`${todayMilk.toFixed(1)}L`} sub="3 cows logged" trend="down" icon="🥛"/>
        <KPICard label="Eggs Today" value={`${todayEggs} pcs`} sub="86% lay rate" trend="up" icon="🥚"/>
        <KPICard label="Today's Revenue" value={formatCurrency(todayRevenue)} sub="Milk + eggs" trend="up" icon="💰"/>
        <KPICard label="Active Alerts" value={urgentAlerts} sub={`${alerts?.length||0} total`} icon="🔔" color={urgentAlerts>0?'#dc2626':undefined}/>
      </StatGrid>

      {/* Row 1 */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        {/* Milk chart */}
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

        {/* Alerts */}
        <SectionCard title={`Alerts (${alerts?.length||0})`} action={<button onClick={()=>onNav('notifications')} className="text-xs text-[#2D5016] hover:underline">View all</button>}>
          {(alerts||[]).slice(0,6).map(a => (
            <div key={a.id} className="flex items-start gap-2 py-2 border-b border-[#F5F0E8] last:border-0">
              <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${a.priority==='urgent'?'bg-red-500':a.priority==='warning'?'bg-amber-400':'bg-blue-400'}`}/>
              <div className="min-w-0">
                <p className="text-xs leading-snug text-[#1a3009] truncate">{a.body || a.title}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">{a.type} · {!a.read?'New':''}</p>
              </div>
            </div>
          ))}
        </SectionCard>
      </div>

      {/* Row 2 */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        {/* P&L Chart */}
        <SectionCard title="P&L Overview — Monthly" className="col-span-2">
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={plChart}>
              <XAxis dataKey="month" tick={{fontSize:11}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fontSize:11}} axisLine={false} tickLine={false} tickFormatter={v=>`${(v/1000).toFixed(0)}k`}/>
              <Tooltip {...TOOLTIP_STYLE} formatter={v=>`KES ${v.toLocaleString()}`}/>
              <Legend iconSize={8} wrapperStyle={{fontSize:11}}/>
              <Line dataKey="income"  name="Income"  stroke="#2D5016" strokeWidth={2} dot={{r:3}} type="monotone"/>
              <Line dataKey="expense" name="Expenses" stroke="#C9A84C" strokeWidth={2} dot={{r:3}} type="monotone" strokeDasharray="4 4"/>
              <Line dataKey="profit"  name="Profit"   stroke="#3b82f6" strokeWidth={1.5} dot={{r:2}} type="monotone" strokeDasharray="2 2"/>
            </LineChart>
          </ResponsiveContainer>
        </SectionCard>

        {/* Staff & Upcoming */}
        <div className="flex flex-col gap-4">
          <SectionCard title="Staff Attendance">
            <div className="flex gap-2 mb-3">
              <span className="badge badge-green">{attCounts.present} present</span>
              <span className="badge badge-red">{attCounts.absent} absent</span>
              <span className="badge badge-amber">{attCounts.leave} leave</span>
            </div>
            {(employees||[]).slice(0,4).map(e => {
              const att = attendance?.find(a=>a.employeeId===e.id);
              return (
                <div key={e.id} className="flex items-center gap-2 py-1.5 border-b border-[#F5F0E8] last:border-0">
                  <div className="w-7 h-7 rounded-full bg-[#eef5dd] flex items-center justify-center text-[10px] font-bold text-[#2D5016] flex-shrink-0">
                    {e.name.split(' ').map(n=>n[0]).join('')}
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
          </SectionCard>
        </div>
      </div>

      {/* Upcoming calendar */}
      <SectionCard title="📅 Upcoming Events (Next 14 Days)" action={<button onClick={()=>onNav('calendar')} className="text-xs text-[#2D5016] hover:underline">Full calendar</button>}>
        <div className="grid grid-cols-5 gap-2">
          {upcomingEvents.length===0
            ? <p className="text-xs text-gray-400 col-span-5 py-4 text-center">No upcoming events</p>
            : upcomingEvents.map(ev => {
              const days = daysFromNow(ev.date);
              const urgency = days===0?'border-red-300 bg-red-50':days<=3?'border-amber-300 bg-amber-50':'border-[#e8e0d0] bg-white';
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
