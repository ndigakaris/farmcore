import { useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { canAccessFeature, validateLicense, getDaysRemaining, TIERS } from '../../services/license.js';
import { Lock, Zap, AlertTriangle, X } from 'lucide-react';
import { cn } from '../../utils/index.js';

// ── TRIAL EXPIRY BANNER ───────────────────────────────────────
export function TrialBanner() {
  const { license } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  if (!license || license.tier !== 'trial' || dismissed) return null;

  const daysLeft = getDaysRemaining(license);
  if (daysLeft > 7) return null;

  const urgent = daysLeft <= 2;

  return (
    <div className={cn(
      'flex items-center gap-3 px-5 py-2.5 text-sm border-b',
      urgent ? 'bg-red-600 text-white border-red-700' : 'bg-amber-50 text-amber-800 border-amber-200'
    )}>
      <AlertTriangle size={15} className="flex-shrink-0"/>
      <p className="flex-1">
        {daysLeft === 0
          ? '⚠️ Your trial expires today. Upgrade now to keep access to all your farm data.'
          : `🕐 ${daysLeft} day${daysLeft>1?'s':''} left in your free trial.`}
      </p>
      <a href="#settings" className={cn(
        'px-3 py-1 rounded-lg text-xs font-bold border transition-all',
        urgent ? 'bg-white text-red-600 border-white hover:bg-red-50' : 'bg-amber-600 text-white border-transparent hover:bg-amber-700'
      )}>Upgrade →</a>
      <button onClick={()=>setDismissed(true)} className="p-1 hover:opacity-70">
        <X size={14}/>
      </button>
    </div>
  );
}

// ── EXPIRED SCREEN ────────────────────────────────────────────
export function ExpiredScreen({ onUpgrade }) {
  const { license, signOut } = useAuth();
  const validation = validateLicense(license);

  return (
    <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
        <div className="text-6xl mb-4">⏰</div>
        <h2 style={{fontFamily:'Fraunces,serif'}} className="text-2xl font-semibold text-[#2D5016] mb-2">
          {license?.tier === 'trial' ? 'Trial Expired' : 'Subscription Expired'}
        </h2>
        <p className="text-gray-500 text-sm mb-6 leading-relaxed">{validation.reason}</p>
        <p className="text-sm text-gray-600 mb-6">
          All your farm data is <strong>safe and preserved</strong>. Upgrade to regain instant access.
        </p>
        <button onClick={onUpgrade} className="btn btn-primary w-full justify-center mb-3 py-3 text-base">
          <Zap size={16}/>Upgrade Now — from KES 2,500/month
        </button>
        <button onClick={signOut} className="text-sm text-gray-400 hover:underline">Sign out</button>
      </div>
    </div>
  );
}

// ── LICENSE GATE — wraps locked features ──────────────────────
export function LicenseGate({ feature, children, fallback }) {
  const { license } = useAuth();

  if (canAccessFeature(license, feature)) return children;

  if (fallback) return fallback;

  const tierNeeded = Object.entries(TIERS).find(([, t]) => t.features?.[feature])?.[0] || 'professional';
  const tier = TIERS[tierNeeded];

  return (
    <div className="page-content flex items-center justify-center">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 bg-[#F5F0E8] rounded-full flex items-center justify-center mx-auto mb-4">
          <Lock size={28} className="text-[#6B7C3A]"/>
        </div>
        <h3 style={{fontFamily:'Fraunces,serif'}} className="text-lg font-semibold text-[#2D5016] mb-2">
          {tier?.emoji} {tier?.name} Feature
        </h3>
        <p className="text-sm text-gray-500 mb-6 leading-relaxed">
          This module is available on the <strong>{tier?.name}</strong> plan and above.
          Upgrade to unlock {feature.charAt(0).toUpperCase() + feature.slice(1)} and all other Pro features.
        </p>
        <PricingModal/>
      </div>
    </div>
  );
}

// ── PRICING MODAL ─────────────────────────────────────────────
export function PricingModal() {
  const [open, setOpen] = useState(false);
  const { license } = useAuth();

  const plans = [
    {
      id: 'starter',
      ...TIERS.starter,
      highlights: ['Up to 50 animals','2 farm users','All core modules','PDF/Excel exports','Email support'],
    },
    {
      id: 'professional',
      ...TIERS.professional,
      highlights: ['Up to 500 animals','10 farm users','ALL 16 modules','Reproduction & Lab','Procurement & Assets','Priority support'],
      popular: true,
    },
    {
      id: 'enterprise',
      ...TIERS.enterprise,
      highlights: ['Unlimited animals','Unlimited users','White-label option','API access','Multi-farm management','Dedicated support line'],
    },
  ];

  return (
    <>
      <button onClick={()=>setOpen(true)} className="btn btn-primary justify-center px-6 py-2.5">
        <Zap size={15}/>View Pricing & Upgrade
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-auto">
          <div className="bg-white rounded-2xl p-8 w-full max-w-4xl relative">
            <button onClick={()=>setOpen(false)}
              className="absolute top-4 right-4 p-2 rounded-lg hover:bg-[#F5F0E8]">
              <X size={18} className="text-gray-500"/>
            </button>

            <div className="text-center mb-8">
              <h2 style={{fontFamily:'Fraunces,serif'}} className="text-2xl font-semibold text-[#2D5016] mb-2">
                Choose your FarmCore plan
              </h2>
              <p className="text-gray-500 text-sm">All prices in Kenya Shillings. Annual billing saves 17%.</p>
            </div>

            <div className="grid grid-cols-3 gap-4">
              {plans.map(plan=>(
                <div key={plan.id} className={cn(
                  'rounded-xl border-2 p-5 relative transition-all',
                  plan.popular ? 'border-[#C9A84C] shadow-lg' : 'border-[#e8e0d0]',
                  license?.tier === plan.id ? 'ring-2 ring-[#2D5016]' : ''
                )}>
                  {plan.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#C9A84C] text-white text-[10px] font-bold px-3 py-1 rounded-full">
                      MOST POPULAR
                    </div>
                  )}
                  {license?.tier === plan.id && (
                    <div className="absolute -top-3 right-4 bg-[#2D5016] text-white text-[10px] font-bold px-3 py-1 rounded-full">
                      CURRENT PLAN
                    </div>
                  )}

                  <div className="text-2xl mb-2">{plan.emoji}</div>
                  <h3 style={{fontFamily:'Fraunces,serif'}} className="text-lg font-semibold text-[#1a3009] mb-1">{plan.name}</h3>
                  <div className="mb-4">
                    <span className="text-2xl font-bold text-[#2D5016]">KES {plan.priceMonthly?.toLocaleString()}</span>
                    <span className="text-gray-400 text-sm">/month</span>
                  </div>
                  <ul className="space-y-2 mb-5">
                    {plan.highlights.map(h=>(
                      <li key={h} className="flex items-start gap-2 text-xs text-gray-600">
                        <span className="text-[#2D5016] font-bold mt-0.5">✓</span>{h}
                      </li>
                    ))}
                  </ul>
                  <a
                    href={`mailto:sales@farmcore.africa?subject=FarmCore ${plan.name} License Request&body=Farm: ${license?.farm_id || ''}`}
                    className={cn(
                      'btn justify-center w-full text-sm',
                      plan.popular ? 'btn-primary' : 'btn-secondary'
                    )}
                  >
                    {license?.tier === plan.id ? 'Current Plan' : `Get ${plan.name}`}
                  </a>
                </div>
              ))}
            </div>

            <p className="text-center text-xs text-gray-400 mt-6">
              📧 Contact <strong>sales@farmcore.africa</strong> or WhatsApp <strong>+254 700 FARMCORE</strong> to activate your license instantly.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
