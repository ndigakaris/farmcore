// src/components/admin/AdminProvisionModal.jsx
// ─────────────────────────────────────────────────────────────
// Use this in your admin dashboard to instantly spin up a farm
// for a paying client without them going through the UI.
// Calls admin_provision_farm() RPC directly.
// ─────────────────────────────────────────────────────────────

import { useState } from 'react';
import { supabase } from '../../lib/supabase'; // adjust path

const TIERS = [
  { value: 'trial',        label: 'Trial (14 days free)' },
  { value: 'starter',      label: 'Starter — KES 2,500/mo' },
  { value: 'professional', label: 'Professional — KES 8,000/mo' },
  { value: 'enterprise',   label: 'Enterprise — KES 25,000/mo' },
];

const TIER_DEFAULTS = {
  trial:        { days: 14,  animals: 50,   users: 2,  amount: 0     },
  starter:      { days: 30,  animals: 200,  users: 5,  amount: 2500  },
  professional: { days: 30,  animals: 1000, users: 15, amount: 8000  },
  enterprise:   { days: 365, animals: 9999, users: 50, amount: 25000 },
};

export default function AdminProvisionModal({ onClose, onSuccess }) {
  const [userId,    setUserId]    = useState('');
  const [farmName,  setFarmName]  = useState('');
  const [tier,      setTier]      = useState('trial');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [result,    setResult]    = useState(null);

  const defaults = TIER_DEFAULTS[tier];

  const handleProvision = async () => {
    if (!userId.trim())   { setError('User UUID is required'); return; }
    if (!farmName.trim()) { setError('Farm name is required'); return; }

    setLoading(true);
    setError(null);

    const { data, error: rpcError } = await supabase.rpc('admin_provision_farm', {
      p_user_id:      userId.trim(),
      p_farm_name:    farmName.trim(),
      p_tier:         tier,
      p_days:         defaults.days,
      p_animal_limit: defaults.animals,
      p_user_limit:   defaults.users,
      p_amount_kes:   defaults.amount,
    });

    setLoading(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    setResult(data);
    onSuccess?.(data);
  };

  if (result) {
    return (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl p-6 w-full max-w-sm text-center space-y-4">
          <div className="text-5xl">✅</div>
          <h2 className="text-lg font-semibold text-gray-900">Farm Provisioned!</h2>
          <p className="text-sm text-gray-500">
            <span className="font-medium text-gray-800">{farmName}</span> is live on{' '}
            <span className="capitalize font-medium text-green-700">{tier}</span> plan.
          </p>
          <p className="text-xs text-gray-400 font-mono break-all">{result.farm_id}</p>
          <button
            onClick={onClose}
            className="w-full py-2 bg-green-700 text-white rounded-lg text-sm font-medium"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Provision New Farm</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        {/* User UUID */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Customer's User UUID
          </label>
          <input
            type="text"
            value={userId}
            onChange={e => setUserId(e.target.value)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <p className="text-xs text-gray-400 mt-1">
            Find this in Supabase → Authentication → Users
          </p>
        </div>

        {/* Farm name */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Farm Name</label>
          <input
            type="text"
            value={farmName}
            onChange={e => setFarmName(e.target.value)}
            placeholder="e.g. Kariuki Dairy Farm"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>

        {/* Tier */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">License Plan</label>
          <select
            value={tier}
            onChange={e => setTier(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            {TIERS.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        {/* Summary */}
        <div className="bg-green-50 rounded-lg p-3 text-xs text-green-800 space-y-1">
          <p>📅 <strong>{defaults.days} days</strong> access</p>
          <p>🐄 Up to <strong>{defaults.animals} animals</strong></p>
          <p>👤 Up to <strong>{defaults.users} users</strong></p>
          {defaults.amount > 0 && (
            <p>💰 <strong>KES {defaults.amount.toLocaleString()}</strong></p>
          )}
        </div>

        {error && (
          <p className="text-red-600 text-xs bg-red-50 px-3 py-2 rounded-lg">{error}</p>
        )}

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleProvision}
            disabled={loading}
            className="flex-1 py-2 bg-green-700 hover:bg-green-800 text-white rounded-lg text-sm font-medium disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading ? (
              <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Provisioning…</>
            ) : 'Provision Farm'}
          </button>
        </div>
      </div>
    </div>
  );
}
