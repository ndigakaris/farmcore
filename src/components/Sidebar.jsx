import { useApp } from '../context/AppContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { SYNC_STATUS } from '../constants/index.js';
import { cn } from '../utils/index.js';
import {
  LayoutDashboard, Beef, Droplets, Stethoscope, Heart, Wheat,
  DollarSign, Users, Calendar, BarChart3, Settings, Package,
  Tractor, FlaskConical, Bell, ChevronLeft, ChevronRight,
  Wifi, WifiOff, UserCog, Calculator, X, LogOut
} from 'lucide-react';

const NAV = [
  { section: 'Main', items: [
    { id:'dashboard',    label:'Dashboard',          icon:LayoutDashboard },
    { id:'animals',      label:'Animal Registry',    icon:Beef },
    { id:'production',   label:'Production',         icon:Droplets },
    { id:'health',       label:'Health & Vets',      icon:Stethoscope },
    { id:'reproduction', label:'Reproduction',       icon:Heart },
    { id:'feed',         label:'Feed & Inventory',   icon:Wheat },
  ]},
  { section: 'Manage', items: [
    { id:'finance',      label:'Financials',         icon:DollarSign },
    { id:'cost',         label:'Cost Calculator',    icon:Calculator },
    { id:'employees',    label:'Employees',          icon:Users },
    { id:'procurement',  label:'Procurement',        icon:Package },
    { id:'assets',       label:'Assets',             icon:Tractor },
    { id:'crops',        label:'Crops & Pasture',    icon:Wheat },
    { id:'calendar',     label:'Farm Calendar',      icon:Calendar },
    { id:'lab',          label:'Laboratory',         icon:FlaskConical },
    { id:'reports',      label:'Reports',            icon:BarChart3 },
  ]},
  { section: 'Account', items: [
    { id:'team',          label:'Team & Roles',      icon:UserCog },
    { id:'notifications', label:'Notifications',     icon:Bell, badge:true },
    { id:'settings',      label:'Settings',          icon:Settings },
  ]},
];

export default function Sidebar({ active, onNav }) {
  const {
    farmName, syncStatus, isOnline, unreadCount,
    sidebarOpen, setSidebarOpen,
    mobileNavOpen, setMobileNavOpen,
  } = useApp();
  const { farm, farmUser, signOut } = useAuth();
  const sync = SYNC_STATUS[syncStatus] || SYNC_STATUS.synced;

  // On mobile the drawer is always full-label width; the collapse toggle
  // only applies to the static desktop (lg+) sidebar.
  const expanded = mobileNavOpen || sidebarOpen;

  return (
    <div
      className={cn(
        'flex flex-col h-full flex-shrink-0 z-40 transition-all duration-200',
        // Mobile: fixed off-canvas drawer
        'fixed inset-y-0 left-0 w-64 transform',
        mobileNavOpen ? 'translate-x-0' : '-translate-x-full',
        // Desktop: static column, width driven by sidebarOpen
        'lg:static lg:translate-x-0',
        sidebarOpen ? 'lg:w-56' : 'lg:w-14'
      )}
      style={{ background:'#2D5016' }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 py-4 border-b border-white/10">
        <span className="text-2xl flex-shrink-0">🌾</span>
        {expanded && (
          <div className="min-w-0 flex-1">
            <h1 style={{fontFamily:'Fraunces,serif'}} className="text-base font-semibold text-white leading-none truncate">FarmCore</h1>
            <p className="text-[10px] text-white/50 truncate mt-0.5">{farm?.name || farmName}</p>
          </div>
        )}
        {/* Mobile close button */}
        <button onClick={()=>setMobileNavOpen(false)}
          className="p-1 rounded hover:bg-white/10 transition-colors flex-shrink-0 lg:hidden">
          <X size={16} className="text-white/70"/>
        </button>
        {/* Desktop collapse toggle */}
        <button onClick={()=>setSidebarOpen(v=>!v)}
          className="p-1 rounded hover:bg-white/10 transition-colors flex-shrink-0 hidden lg:block">
          {sidebarOpen?<ChevronLeft size={14} className="text-white/60"/>:<ChevronRight size={14} className="text-white/60"/>}
        </button>
      </div>

      {/* Nav */}
      <div className="flex-1 overflow-y-auto py-2">
        {NAV.map(section => (
          <div key={section.section}>
            {expanded && (
              <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest px-4 pt-3 pb-1">
                {section.section}
              </p>
            )}
            {section.items.map(item => {
              const Icon = item.icon;
              const isActive = active === item.id;
              return (
                <button key={item.id} onClick={()=>onNav(item.id)}
                  title={!expanded?item.label:undefined}
                  className={cn('w-full flex items-center gap-2.5 px-4 py-2.5 lg:py-2 transition-all duration-150 text-sm border-l-[3px] text-left',
                    isActive?'bg-white/15 text-white border-[#C9A84C]':'text-white/65 border-transparent hover:bg-white/10 hover:text-white')}>
                  <Icon size={16} className="flex-shrink-0"/>
                  {expanded && <span className="truncate flex-1">{item.label}</span>}
                  {expanded && item.badge && unreadCount>0 && (
                    <span className="text-[10px] bg-red-500 text-white rounded-full px-1.5 py-0.5 font-bold">
                      {unreadCount>9?'9+':unreadCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Role + sync */}
      <div className={cn('px-3 py-3 border-t border-white/10', !expanded&&'flex justify-center')}>
        {expanded ? (
          <div className="bg-black/20 rounded-lg px-3 py-2">
            {farmUser?.role && (
              <p className="text-[10px] text-white/40 mb-1 capitalize">Role: <span className="text-white/70">{farmUser.role}</span></p>
            )}
            <div className="flex items-center gap-2">
              {isOnline?<Wifi size={12} className="text-green-400"/>:<WifiOff size={12} className="text-red-400"/>}
              <span className="text-xs text-white/70 flex-1 truncate">{sync.label}</span>
              <span style={{color:sync.color}} className="text-[10px]">●</span>
            </div>
          </div>
        ) : (
          isOnline?<Wifi size={16} className="text-green-400"/>:<WifiOff size={16} className="text-red-400"/>
        )}
      </div>

      {/* Sign out */}
      <div className={cn('px-3 pb-3', !expanded&&'flex justify-center')}>
        <button
          onClick={() => { setMobileNavOpen(false); signOut(); }}
          title={!expanded ? 'Sign out' : undefined}
          className={cn(
            'w-full flex items-center gap-2 rounded-lg text-white/70 hover:bg-white/10 hover:text-white transition-colors',
            expanded ? 'px-3 py-2 text-sm justify-start' : 'p-2 justify-center'
          )}
        >
          <LogOut size={15} className="flex-shrink-0"/>
          {expanded && <span className="truncate">Sign out</span>}
        </button>
      </div>
    </div>
  );
}
