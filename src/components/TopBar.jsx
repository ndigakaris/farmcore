import { Bell, Moon, Sun, Globe, DollarSign } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import { SPECIES } from '../constants/index.js';
import { cn, getInitials } from '../utils/index.js';

export default function TopBar({ onNav }) {
  const { species, setSpecies, currency, setCurrency, theme, setTheme,
          currentUser, unreadCount, activeSpecies } = useApp();

  const visibleSpecies = ['all', ...activeSpecies];

  return (
    <div className="bg-white border-b border-[#e8e0d0] px-5 h-12 flex items-center gap-3 flex-shrink-0">
      {/* Species tabs */}
      <div className="flex gap-1 bg-[#F5F0E8] rounded-lg p-0.5 flex-1 overflow-x-auto">
        {visibleSpecies.map(s => {
          const sp = SPECIES[s];
          if (!sp) return null;
          return (
            <button
              key={s}
              onClick={() => setSpecies(s)}
              className={cn(
                'species-tab whitespace-nowrap',
                species === s && 'active'
              )}
            >
              {sp.emoji} <span className="hidden sm:inline">{sp.label}</span>
            </button>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={() => setCurrency(c => c === 'KES' ? 'USD' : 'KES')}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#F5F0E8] text-[#2D5016] hover:bg-[#e8e0d0] transition-colors"
        >
          <DollarSign size={12}/>{currency}
        </button>

        <button
          onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}
          className="p-1.5 rounded-lg hover:bg-[#F5F0E8] transition-colors text-gray-600"
        >
          {theme === 'light' ? <Moon size={15}/> : <Sun size={15}/>}
        </button>

        <button
          onClick={() => onNav('notifications')}
          className="relative p-1.5 rounded-lg hover:bg-[#F5F0E8] transition-colors text-gray-600"
        >
          <Bell size={15}/>
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        <div className="flex items-center gap-2 pl-2 border-l border-[#e8e0d0]">
          <div className="w-7 h-7 rounded-full bg-[#2D5016] flex items-center justify-center text-white text-[11px] font-semibold">
            {getInitials(currentUser?.name)}
          </div>
          <div className="hidden md:block">
            <p className="text-xs font-medium text-[#1a3009] leading-none">{currentUser?.name?.split(' ')[0]}</p>
            <p className="text-[10px] text-gray-400 capitalize">{currentUser?.role}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
