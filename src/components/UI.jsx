import { X, ChevronDown, Search, AlertTriangle } from 'lucide-react';
import { cn, getInitials } from '../utils/index.js';

// ── MODAL ─────────────────────────────────────────────────
export function Modal({ open, onClose, title, subtitle, children, footer, size = 'md' }) {
  if (!open) return null;
  const widths = { sm:'max-w-sm', md:'max-w-lg', lg:'max-w-2xl', xl:'max-w-4xl' };
  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={cn('modal', widths[size])}>
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 style={{fontFamily:'Fraunces, serif'}} className="text-lg font-semibold text-green-700">{title}</h2>
            {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 transition-colors ml-4 flex-shrink-0">
            <X size={18} className="text-gray-500" />
          </button>
        </div>
        <div>{children}</div>
        {footer && <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-[#e8e0d0]">{footer}</div>}
      </div>
    </div>
  );
}

// ── WITHDRAWAL LOCK BANNER ────────────────────────────────
export function WithdrawalBanner({ animal }) {
  if (!animal?.milkLock) return null;
  return (
    <div className="lock-banner mb-4">
      <AlertTriangle size={20} className="text-red-600 flex-shrink-0" />
      <div>
        <p className="text-sm font-semibold text-red-700">🔒 WITHDRAWAL LOCK ACTIVE</p>
        <p className="text-xs text-red-600 mt-0.5">
          Milk/meat from <strong>{animal.name}</strong> cannot be sold until <strong>{animal.lockExpiry}</strong>.
          Reason: {animal.lockReason}
        </p>
      </div>
    </div>
  );
}

// ── DATA TABLE ────────────────────────────────────────────
export function DataTable({ columns, rows, emptyText = 'No records found', loading = false }) {
  if (loading) return (
    <div className="py-12 text-center text-gray-400 text-sm">Loading…</div>
  );
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>{columns.map(c => <th key={c.key} className="table-th" style={c.width?{width:c.width}:{}}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0
            ? <tr><td colSpan={columns.length} className="py-12 text-center text-gray-400 text-sm">{emptyText}</td></tr>
            : rows.map((row, i) => (
                <tr key={row.id || i} className="group hover:bg-[#F5F0E8]/60 transition-colors">
                  {columns.map(c => (
                    <td key={c.key} className="table-td">
                      {c.render ? c.render(row[c.key], row) : (row[c.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))
          }
        </tbody>
      </table>
    </div>
  );
}

// ── SEARCH BAR ────────────────────────────────────────────
export function SearchBar({ value, onChange, placeholder = 'Search…', extra }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <div className="flex items-center gap-2 bg-white border border-[#e8e0d0] rounded-lg px-3 py-2 flex-1">
        <Search size={15} className="text-gray-400 flex-shrink-0" />
        <input
          className="bg-transparent outline-none text-sm flex-1 text-[#1a3009] placeholder:text-gray-400"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
        />
      </div>
      {extra}
    </div>
  );
}

// ── FORM COMPONENTS ───────────────────────────────────────
export function FormField({ label, required, children, hint, error }) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="form-label">
          {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      {children}
      {hint  && <p className="text-xs text-gray-400">{hint}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function Input({ label, required, hint, error, className, ...props }) {
  return (
    <FormField label={label} required={required} hint={hint} error={error}>
      <input className={cn('form-input', className, error && 'border-red-400')} {...props} />
    </FormField>
  );
}

export function Select({ label, required, hint, error, options = [], className, ...props }) {
  return (
    <FormField label={label} required={required} hint={hint} error={error}>
      <select className={cn('form-input', className, error && 'border-red-400')} {...props}>
        {options.map(o => (
          <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>
        ))}
      </select>
    </FormField>
  );
}

export function Textarea({ label, required, hint, error, className, ...props }) {
  return (
    <FormField label={label} required={required} hint={hint} error={error}>
      <textarea className={cn('form-input resize-y min-h-[72px]', className)} {...props} />
    </FormField>
  );
}

export function UnitSelector({ units, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {units.map(u => (
        <button
          key={u} type="button"
          onClick={() => onChange(u)}
          className={cn(
            'px-3 py-1 rounded-md text-xs font-medium border transition-all',
            value === u
              ? 'bg-[#2D5016] text-white border-[#2D5016]'
              : 'bg-white text-[#6B7C3A] border-[#e8e0d0] hover:border-[#6B7C3A]'
          )}
        >{u}</button>
      ))}
    </div>
  );
}

// ── KPI CARD ──────────────────────────────────────────────
export function KPICard({ label, value, sub, trend, icon, color }) {
  return (
    <div className="kpi-card">
      <div className="flex items-start justify-between mb-2">
        <p className="text-xs font-semibold text-[#6B7C3A] uppercase tracking-wide">{label}</p>
        {icon && <span className="text-xl">{icon}</span>}
      </div>
      <p className="text-2xl font-semibold" style={{ fontFamily:'Fraunces,serif', color: color || '#1a3009' }}>{value}</p>
      {sub && (
        <p className={cn('text-xs mt-1', trend === 'up' ? 'text-green-600' : trend === 'down' ? 'text-red-600' : 'text-gray-400')}>
          {trend === 'up' && '↑ '}{trend === 'down' && '↓ '}{sub}
        </p>
      )}
    </div>
  );
}

// ── AVATAR ────────────────────────────────────────────────
export function Avatar({ name, size = 8, bg = 'bg-green-100', text = 'text-green-700' }) {
  return (
    <div className={cn('rounded-full flex items-center justify-center font-semibold flex-shrink-0', `w-${size} h-${size}`, bg, text)}
      style={{ fontSize: size < 8 ? '11px' : '13px' }}>
      {getInitials(name)}
    </div>
  );
}

// ── EMPTY STATE ───────────────────────────────────────────
export function EmptyState({ icon = '📋', title = 'No records yet', message, action }) {
  return (
    <div className="empty-state">
      <div className="text-5xl mb-4">{icon}</div>
      <h3 className="text-base font-semibold text-[#2D5016] mb-2">{title}</h3>
      {message && <p className="text-sm text-gray-500 mb-4 max-w-xs">{message}</p>}
      {action}
    </div>
  );
}

// ── PAGE HEADER ───────────────────────────────────────────
export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="flex items-start justify-between mb-5">
      <div>
        <h1 style={{fontFamily:'Fraunces,serif'}} className="text-xl font-semibold text-[#2D5016]">{title}</h1>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

// ── BADGE ─────────────────────────────────────────────────
export function Badge({ variant = 'gray', children }) {
  return <span className={cn('badge', `badge-${variant}`)}>{children}</span>;
}

// ── STAT GRID ─────────────────────────────────────────────
export function StatGrid({ children, cols = 4 }) {
  return (
    <div className={cn('grid gap-3 mb-5', {
      2:'grid-cols-2', 3:'grid-cols-3', 4:'grid-cols-4', 5:'grid-cols-5'
    }[cols])}>
      {children}
    </div>
  );
}

// ── SECTION CARD ──────────────────────────────────────────
export function SectionCard({ title, action, children, className }) {
  return (
    <div className={cn('card', className)}>
      {(title || action) && (
        <div className="flex items-center justify-between mb-4">
          {title && <h2 className="section-title">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

// ── TABS ──────────────────────────────────────────────────
export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="flex gap-1 bg-[#F5F0E8] rounded-lg p-1 mb-5">
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            'flex-1 py-1.5 px-2 rounded-md text-xs font-medium transition-all cursor-pointer text-center',
            active === t.id ? 'bg-white text-[#2D5016] shadow-sm' : 'text-[#6B7C3A] hover:text-[#2D5016]'
          )}
        >{t.label}</button>
      ))}
    </div>
  );
}

// ── CONFIRM DIALOG ────────────────────────────────────────
export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', onConfirm, onClose, danger = false, requireType }) {
  const [typed, setTyped] = useState('');
  if (!open) return null;
  const canConfirm = requireType ? typed === requireType : true;
  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal max-w-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className={cn('w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0', danger ? 'bg-red-100' : 'bg-amber-100')}>
            <AlertTriangle size={20} className={danger ? 'text-red-600' : 'text-amber-600'} />
          </div>
          <h3 style={{fontFamily:'Fraunces,serif'}} className="font-semibold text-[#1a3009]">{title}</h3>
        </div>
        <p className="text-sm text-gray-600 mb-4">{message}</p>
        {requireType && (
          <div className="mb-4">
            <label className="form-label">Type <strong>{requireType}</strong> to confirm</label>
            <input className="form-input" value={typed} onChange={e => setTyped(e.target.value)} placeholder={requireType} />
          </div>
        )}
        <div className="flex justify-end gap-3">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button disabled={!canConfirm} onClick={() => { onConfirm(); onClose(); }}
            className={cn('btn', danger ? 'btn-danger' : 'btn-primary', !canConfirm && 'opacity-40 cursor-not-allowed')}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// Fix: useState missing in ConfirmDialog
import { useState } from 'react';
