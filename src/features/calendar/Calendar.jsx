import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../../db/schema.js';
import { PageHeader, KPICard, StatGrid, SectionCard } from '../../components/UI.jsx';
import { formatDate, daysFromNow, offsetDate } from '../../utils/index.js';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

const TYPE_COLORS = {
  health:'bg-red-100 text-red-700 border-red-200',
  reproduction:'bg-purple-100 text-purple-700 border-purple-200',
  task:'bg-blue-100 text-blue-700 border-blue-200',
  procurement:'bg-amber-100 text-amber-700 border-amber-200',
  crops:'bg-green-100 text-green-700 border-green-200',
  asset:'bg-orange-100 text-orange-700 border-orange-200',
  feed:'bg-cyan-100 text-cyan-700 border-cyan-200',
};

export default function Calendar() {
  const today = new Date();
  const [view, setView] = useState({ year:today.getFullYear(), month:today.getMonth() });

  const allEvents = useLiveQuery(() => db.calendarEvents.toArray(), []);

  const evByDate = useMemo(() => {
    const map = {};
    (allEvents||[]).forEach(ev => {
      if (!map[ev.date]) map[ev.date] = [];
      map[ev.date].push(ev);
    });
    return map;
  }, [allEvents]);

  const calDays = useMemo(() => {
    const first = new Date(view.year, view.month, 1);
    const last  = new Date(view.year, view.month+1, 0);
    const days  = [];
    for (let i=0; i<first.getDay(); i++) days.push(null);
    for (let d=1; d<=last.getDate(); d++) {
      const dateStr = `${view.year}-${String(view.month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      days.push({ d, dateStr, isToday:dateStr===today.toISOString().split('T')[0] });
    }
    return days;
  }, [view]);

  const prevMonth = () => setView(v => v.month===0?{year:v.year-1,month:11}:{...v,month:v.month-1});
  const nextMonth = () => setView(v => v.month===11?{year:v.year+1,month:0}:{...v,month:v.month+1});

  // Next 14 days upcoming
  const upcoming = useMemo(() => {
    const from = today.toISOString().split('T')[0];
    const to   = offsetDate(14);
    return (allEvents||[]).filter(ev=>ev.date>=from&&ev.date<=to).sort((a,b)=>a.date.localeCompare(b.date));
  }, [allEvents]);

  return (
    <div className="page-content">
      <PageHeader title="Farm Calendar" subtitle="Unified view of all scheduled events"/>

      <div className="grid grid-cols-3 gap-5">
        {/* Calendar grid */}
        <div className="col-span-2 card">
          <div className="flex items-center justify-between mb-4">
            <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-[#F5F0E8]"><ChevronLeft size={18}/></button>
            <h2 style={{fontFamily:'Fraunces,serif'}} className="text-lg font-semibold text-[#2D5016]">
              {MONTHS[view.month]} {view.year}
            </h2>
            <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-[#F5F0E8]"><ChevronRight size={18}/></button>
          </div>
          <div className="grid grid-cols-7 gap-1 mb-2">
            {DAYS.map(d=><p key={d} className="text-[10px] font-bold text-gray-400 text-center py-1">{d}</p>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {calDays.map((day,i)=>{
              if (!day) return <div key={i}/>;
              const evs = evByDate[day.dateStr]||[];
              return (
                <div key={day.dateStr} className={`min-h-[60px] rounded-lg p-1 border transition-all ${day.isToday?'border-[#2D5016] bg-[#eef5dd]':'border-transparent hover:border-[#e8e0d0] hover:bg-[#F5F0E8]'}`}>
                  <p className={`text-xs font-semibold mb-1 ${day.isToday?'text-[#2D5016]':'text-gray-600'}`}>{day.d}</p>
                  {evs.slice(0,2).map(ev=>(
                    <div key={ev.id} title={ev.title} className={`text-[9px] rounded px-1 py-0.5 mb-0.5 truncate border ${TYPE_COLORS[ev.type]||'bg-gray-100 text-gray-600 border-gray-200'}`}>
                      {ev.title}
                    </div>
                  ))}
                  {evs.length>2&&<p className="text-[9px] text-gray-400">+{evs.length-2} more</p>}
                </div>
              );
            })}
          </div>
          {/* Legend */}
          <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-[#F5F0E8]">
            {Object.entries(TYPE_COLORS).map(([k,v])=>(
              <span key={k} className={`text-[10px] px-2 py-0.5 rounded-full border capitalize ${v}`}>{k}</span>
            ))}
          </div>
        </div>

        {/* Upcoming sidebar */}
        <div className="card">
          <h3 style={{fontFamily:'Fraunces,serif'}} className="text-sm font-semibold text-[#2D5016] mb-4">Upcoming Events (14d)</h3>
          {upcoming.length===0
            ? <p className="text-xs text-gray-400 py-8 text-center">No upcoming events</p>
            : upcoming.map(ev=>{
                const days = daysFromNow(ev.date);
                return (
                  <div key={ev.id} className="flex items-start gap-3 py-2.5 border-b border-[#F5F0E8] last:border-0">
                    <div className={`w-10 h-10 rounded-lg flex flex-col items-center justify-center flex-shrink-0 text-[10px] font-bold ${days===0?'bg-red-100 text-red-700':days===1?'bg-amber-100 text-amber-700':'bg-[#eef5dd] text-[#2D5016]'}`}>
                      <span>{ev.date.slice(8)}</span>
                      <span className="font-normal">{MONTHS[parseInt(ev.date.slice(5,7))-1]?.slice(0,3)}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-[#1a3009] leading-snug">{ev.title}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5 capitalize">{ev.type} · {days===0?'Today':days===1?'Tomorrow':`In ${days}d`}</p>
                    </div>
                  </div>
                );
              })
          }
        </div>
      </div>
    </div>
  );
}
