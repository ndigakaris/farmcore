import { SPECIES } from '../constants/index.js';

export const daysAgo = (dateStr) => {
  if (!dateStr) return 0;
  return Math.floor((new Date() - new Date(dateStr)) / 86400000);
};

export const daysFromNow = (dateStr) => {
  if (!dateStr) return null;
  return Math.floor((new Date(dateStr) - new Date()) / 86400000);
};

export const daysOnFarm = (dob) => daysAgo(dob);

export const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-KE', { day:'2-digit', month:'short', year:'numeric' });
};

export const formatDateShort = (dateStr) => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-KE', { day:'2-digit', month:'short' });
};

export const todayStr = () => new Date().toISOString().split('T')[0];

export const offsetDate = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
};

export const speciesEmoji = (s) => SPECIES[s]?.emoji || '🐾';
export const speciesLabel = (s) => SPECIES[s]?.label || s;

export const calcAdg = (weights) => {
  if (!weights || weights.length < 2) return null;
  const sorted = [...weights].sort((a,b) => new Date(a.date)-new Date(b.date));
  const first = sorted[0], last = sorted[sorted.length-1];
  const days = daysAgo(first.date) - daysAgo(last.date);
  if (days <= 0) return null;
  return ((last.weight - first.weight) / days).toFixed(3);
};

export const rollingAvg = (values, days=7) => {
  if (!values || values.length < days) return null;
  const slice = values.slice(-days);
  return slice.reduce((s,v)=>s+v,0) / slice.length;
};

export const pctChange = (current, previous) => {
  if (!previous || previous === 0) return null;
  return (((current - previous) / previous) * 100).toFixed(1);
};

export const cn = (...classes) => classes.filter(Boolean).join(' ');

export const pluralize = (count, singular, plural) =>
  `${count} ${count === 1 ? singular : (plural || singular + 's')}`;

export const getInitials = (name='') =>
  name.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2);

export const statusColor = (status) => {
  const map = {
    present:'badge-green', absent:'badge-red', leave:'badge-amber',
    active:'badge-green', resolved:'badge-gray', pending:'badge-amber',
    done:'badge-green', approved:'badge-blue', received:'badge-green',
    synced:'badge-green', offline:'badge-red', conflict:'badge-amber',
  };
  return map[status?.toLowerCase()] || 'badge-gray';
};
