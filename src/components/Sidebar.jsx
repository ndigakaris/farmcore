import { useApp } from '../context/AppContext.jsx';
import { SYNC_STATUS } from '../constants/index.js';
import { cn } from '../utils/index.js';
import {
  LayoutDashboard, Beef, Droplets, Stethoscope, Heart, Wheat,
  DollarSign, Users, Calendar, BarChart3, Settings, Package,
  Tractor, FlaskConical, Bell, ChevronLeft, ChevronRight,
  Wifi, WifiOff, AlertCircle
} from 'lucide-react';

const NAV = [
  { section: 'Main', items: [
    { id:'dashboard',    label:'Dashboard',       icon:LayoutDashboard },
    { id:'animals',      label:'Animal Registry', icon:Beef },
    { id:'production',   label:'Production',      icon:Droplets },
    { id:'health',       label:'Health & Vets',   icon:Stethoscope },
    { id:'reproduction', label:'Reproduction',    icon:Heart },
    { id:'feed',         label:'Feed & Inventory',icon:Wheat },
  ]},
  { section: 'Manage', items: [
    { id:'finance',      label:'Financials',      icon:DollarSign },
    { id:'employees',    label:'Employees',       icon:Users },
    { id:'procurement',  label:'Procurement',     icon:Package },
    { id:'assets',       label:'Assets',          icon:Tractor },
    { id:'crops',        label:'Crops & Pasture', icon:Wheat },
    { id:'calendar',     label:'Farm Calendar',   icon:Calendar },
    { id:'lab',          label:'Laboratory',      icon:FlaskConical },
    { id:'reports',      label:'Reports',         icon:BarChart3 },
    { id:'settings',     label:'Settings',        icon:Settings },
  ]},
];

export default function Sidebar({ active, onNav }) {
  const { farmName, syncStatus, isOnline, unreadCount, sidebarOpen, setSidebarOpen } = useApp();
  const sync = SYNC_STATUS[syncStatus] || SYNC_STATUS.synced;

  return (
    <div className={cn(
      'flex flex-col h-full transition-all duration-200 flex-shrink-0',
      sidebarOpen ? 'w-56' : 'w-14'
    )} style={{ background:'#2D5016', color:'#fff' }}>
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 py-4 border-b border-white/10">
        <span className="text-2xl flex-shrink-0">🌾</span>
        {sidebarOpen && (
          <div className="min-w-0">
            <h1 style={{fontFamily:'Fraunces,serif'}} className="text-lg font-semibold text-white leading-none">FarmCore</h1>
            <p className="text-[10px] text-white/50 truncate mt-0.5">{farmName}</p>
          </div>
        )}
        <button
          onClick={() => setSidebarOpen(v => !v)}
          className="ml-auto p-1 rounded hover:bg-white/10 transition-colors flex-shrink-0"
        >
          {sidebarOpen ? <ChevronLeft size={14} className="text-white/60"/> : <ChevronRight size={14} className="text-white/60"/>}
        </button>
      </div>

      {/* Nav */}
      <div className="flex-1 overflow-y-auto py-2">
        {NAV.map(section => (
          <div key={section.section}>
            {sidebarOpen && (
              <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest px-4 pt-3 pb-1">
                {section.section}
              </p>
            )}
            {section.items.map(item => {
              const Icon = item.icon;
              const isActive = active === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onNav(item.id)}
                  title={!sidebarOpen ? item.label : undefined}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-4 py-2 transition-all duration-150 text-sm border-l-[3px] text-left',
                    isActive
                      ? 'bg-white/15 text-white border-[#C9A84C]'
                      : 'text-white/65 border-transparent hover:bg-white/8 hover:text-white'
                  )}
                >
                  <Icon size={16} className="flex-shrink-0" />
                  {sidebarOpen && <span className="truncate">{item.label}</span>}
                  {sidebarOpen && item.id === 'notifications' && unreadCount > 0 && (
                    <span className="ml-auto text-[10px] bg-red-500 text-white rounded-full px-1.5 py-0.5 font-bold">{unreadCount}</span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Sync status */}
      <div className={cn('px-3 py-3 border-t border-white/10', !sidebarOpen && 'flex justify-center')}>
        {sidebarOpen ? (
          <div className="bg-black/20 rounded-lg px-3 py-2">
            <div className="flex items-center gap-2">
              {isOnline ? <Wifi size={12} className="text-green-400"/> : <WifiOff size={12} className="text-red-400"/>}
              <span className="text-xs text-white/70 flex-1 truncate">{sync.label}</span>
              <span style={{ color: sync.color }} className="text-[10px]">●</span>
            </div>
          </div>
        ) : (
          isOnline
            ? <Wifi size={16} className="text-green-400"/>
            : <WifiOff size={16} className="text-red-400"/>
        )}
      </div>
    </div>
  );
}
