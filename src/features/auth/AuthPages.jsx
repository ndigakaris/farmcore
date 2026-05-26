import { useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { SPECIES } from '../../constants/index.js';
import { cn } from '../../utils/index.js';
import { Eye, EyeOff, Loader, ChevronRight, Check } from 'lucide-react';

// ── LOGIN ─────────────────────────────────────────────────────
function Login({ onSwitch }) {
  const { signIn } = useAuth();
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [showPw,  setShowPw]  = useState(false);
  const f = (k,v) => setForm(p=>({...p,[k]:v}));

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signIn({ email: form.email, password: form.password });
    } catch (err) {
      setError(err.message || 'Login failed. Check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2 style={{fontFamily:'Fraunces,serif'}} className="text-2xl font-semibold text-[#2D5016] mb-1">Welcome back</h2>
      <p className="text-sm text-gray-500 mb-6">Sign in to your FarmCore account</p>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4 text-sm text-red-700">{error}</div>
      )}

      <form onSubmit={handleLogin} className="space-y-4">
        <div>
          <label className="form-label">Email address</label>
          <input className="form-input" type="email" required value={form.email}
            onChange={e=>f('email',e.target.value)} placeholder="you@example.com" autoFocus/>
        </div>
        <div>
          <label className="form-label">Password</label>
          <div className="relative">
            <input className="form-input pr-10" type={showPw?'text':'password'} required
              value={form.password} onChange={e=>f('password',e.target.value)} placeholder="••••••••"/>
            <button type="button" onClick={()=>setShowPw(v=>!v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              {showPw?<EyeOff size={16}/>:<Eye size={16}/>}
            </button>
          </div>
        </div>

        <button type="submit" disabled={loading}
          className="btn btn-primary w-full justify-center py-2.5 text-base">
          {loading ? <><Loader size={16} className="animate-spin"/>Signing in…</> : 'Sign in'}
        </button>
      </form>

      <p className="text-sm text-center text-gray-500 mt-5">
        Don't have an account?{' '}
        <button onClick={onSwitch} className="text-[#2D5016] font-semibold hover:underline">Create one free</button>
      </p>
    </div>
  );
}

// ── REGISTER ──────────────────────────────────────────────────
function Register({ onSwitch }) {
  const { signUp } = useAuth();
  const [form, setForm] = useState({ fullName: '', email: '', password: '', confirm: '' });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [done,    setDone]    = useState(false);
  const [showPw,  setShowPw]  = useState(false);
  const f = (k,v) => setForm(p=>({...p,[k]:v}));

  const handleRegister = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirm) { setError('Passwords do not match.'); return; }
    if (form.password.length < 8)       { setError('Password must be at least 8 characters.'); return; }
    setError(''); setLoading(true);
    try {
      await signUp({ email: form.email, password: form.password, fullName: form.fullName });
      setDone(true);
    } catch (err) {
      setError(err.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  if (done) return (
    <div className="text-center py-4">
      <div className="text-5xl mb-4">📧</div>
      <h2 style={{fontFamily:'Fraunces,serif'}} className="text-xl font-semibold text-[#2D5016] mb-2">Check your email</h2>
      <p className="text-sm text-gray-500 mb-4">We sent a confirmation link to <strong>{form.email}</strong>. Click it to activate your account, then sign in here.</p>
      <button onClick={onSwitch} className="btn btn-primary justify-center w-full">Back to sign in</button>
    </div>
  );

  return (
    <div>
      <h2 style={{fontFamily:'Fraunces,serif'}} className="text-2xl font-semibold text-[#2D5016] mb-1">Start your free trial</h2>
      <p className="text-sm text-gray-500 mb-6">14 days free · No credit card required</p>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4 text-sm text-red-700">{error}</div>}

      <form onSubmit={handleRegister} className="space-y-4">
        <div>
          <label className="form-label">Full Name</label>
          <input className="form-input" required value={form.fullName}
            onChange={e=>f('fullName',e.target.value)} placeholder="James Mwangi"/>
        </div>
        <div>
          <label className="form-label">Email address</label>
          <input className="form-input" type="email" required value={form.email}
            onChange={e=>f('email',e.target.value)} placeholder="you@example.com"/>
        </div>
        <div>
          <label className="form-label">Password</label>
          <div className="relative">
            <input className="form-input pr-10" type={showPw?'text':'password'} required
              value={form.password} onChange={e=>f('password',e.target.value)} placeholder="Min 8 characters"/>
            <button type="button" onClick={()=>setShowPw(v=>!v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
              {showPw?<EyeOff size={16}/>:<Eye size={16}/>}
            </button>
          </div>
        </div>
        <div>
          <label className="form-label">Confirm Password</label>
          <input className="form-input" type="password" required
            value={form.confirm} onChange={e=>f('confirm',e.target.value)} placeholder="Repeat password"/>
        </div>
        <button type="submit" disabled={loading}
          className="btn btn-primary w-full justify-center py-2.5 text-base">
          {loading?<><Loader size={16} className="animate-spin"/>Creating account…</>:'Create free account'}
        </button>
      </form>
      <p className="text-xs text-center text-gray-400 mt-4">
        By registering you agree to our Terms of Service and Privacy Policy.
      </p>
      <p className="text-sm text-center text-gray-500 mt-2">
        Already have an account?{' '}
        <button onClick={onSwitch} className="text-[#2D5016] font-semibold hover:underline">Sign in</button>
      </p>
    </div>
  );
}

// ── FARM SETUP WIZARD ─────────────────────────────────────────
export function FarmSetup() {
  const { createFarm, user } = useAuth();
  const [step, setStep]         = useState(1);
  const [loading, setLoading]   = useState(false);
  const [error,   setError]     = useState('');
  const [form, setForm]         = useState({
    name: '', county: '', currency: 'KES',
    activeSpecies: ['cattle', 'pigs', 'goats', 'sheep', 'poultry'],
  });
  const f = (k,v) => setForm(p=>({...p,[k]:v}));

  const toggleSpecies = (s) => setForm(p => ({
    ...p,
    activeSpecies: p.activeSpecies.includes(s)
      ? p.activeSpecies.filter(x=>x!==s)
      : [...p.activeSpecies, s]
  }));

  const handleCreate = async () => {
    if (!form.name) { setError('Farm name is required.'); return; }
    setError(''); setLoading(true);
    try {
      await createFarm(form);
    } catch (err) {
      setError(err.message || 'Failed to create farm.');
      setLoading(false);
    }
  };

  const COUNTIES = ['Nairobi','Kiambu','Nakuru','Uasin Gishu','Meru','Laikipia','Nyandarua','Nyeri','Muranga','Kirinyaga','Embu','Tharaka-Nithi','Isiolo','Marsabit','Trans Nzoia','Bungoma','Other'];

  return (
    <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
        {/* Steps indicator */}
        <div className="flex items-center gap-2 mb-8">
          {[1,2,3].map(s=>(
            <div key={s} className={cn('flex items-center gap-1', s<3&&'flex-1')}>
              <div className={cn('w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all',
                step>s?'bg-[#2D5016] text-white':step===s?'bg-[#2D5016] text-white':'bg-[#F5F0E8] text-gray-400')}>
                {step>s?<Check size={14}/>:s}
              </div>
              {s<3&&<div className={cn('flex-1 h-0.5',step>s?'bg-[#2D5016]':'bg-[#e8e0d0]')}/>}
            </div>
          ))}
        </div>

        {error && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4 text-sm text-red-700">{error}</div>}

        {step === 1 && (
          <div>
            <div className="text-4xl mb-3">🌾</div>
            <h2 style={{fontFamily:'Fraunces,serif'}} className="text-xl font-semibold text-[#2D5016] mb-1">Let's set up your farm</h2>
            <p className="text-sm text-gray-500 mb-6">Hi {user?.user_metadata?.full_name?.split(' ')[0] || 'there'}! What's your farm called?</p>
            <div className="space-y-4">
              <div>
                <label className="form-label">Farm Name<span className="text-red-500">*</span></label>
                <input className="form-input" value={form.name} onChange={e=>f('name',e.target.value)} placeholder="e.g. Kilima Fresh Farms" autoFocus/>
              </div>
              <div>
                <label className="form-label">County / Region</label>
                <select className="form-input" value={form.county} onChange={e=>f('county',e.target.value)}>
                  <option value="">Select county…</option>
                  {COUNTIES.map(c=><option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Currency</label>
                <div className="flex gap-2">
                  {['KES','USD','UGX','TZS','ETB'].map(c=>(
                    <button key={c} type="button" onClick={()=>f('currency',c)}
                      className={cn('px-3 py-1.5 rounded-lg text-sm font-semibold border transition-all',
                        form.currency===c?'bg-[#2D5016] text-white border-[#2D5016]':'bg-white border-[#e8e0d0] text-[#6B7C3A]')}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <button onClick={()=>{ if(!form.name){setError('Farm name is required.');return;} setError(''); setStep(2); }}
              className="btn btn-primary w-full justify-center mt-6">
              Continue <ChevronRight size={16}/>
            </button>
          </div>
        )}

        {step === 2 && (
          <div>
            <div className="text-4xl mb-3">🐾</div>
            <h2 style={{fontFamily:'Fraunces,serif'}} className="text-xl font-semibold text-[#2D5016] mb-1">What livestock do you keep?</h2>
            <p className="text-sm text-gray-500 mb-6">Select all species on your farm. You can change this later.</p>
            <div className="grid grid-cols-2 gap-3 mb-6">
              {Object.entries(SPECIES).filter(([k])=>k!=='all').map(([k,v])=>{
                const active = form.activeSpecies.includes(k);
                return (
                  <button key={k} type="button" onClick={()=>toggleSpecies(k)}
                    className={cn('flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left',
                      active?'border-[#2D5016] bg-[#eef5dd]':'border-[#e8e0d0] bg-white hover:border-[#6B7C3A]')}>
                    <span className="text-2xl">{v.emoji}</span>
                    <div>
                      <p className={cn('text-sm font-semibold',active?'text-[#2D5016]':'text-gray-600')}>{v.label}</p>
                      {active&&<p className="text-[10px] text-[#6B7C3A]">✓ Selected</p>}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="flex gap-3">
              <button onClick={()=>setStep(1)} className="btn btn-secondary flex-1 justify-center">Back</button>
              <button onClick={()=>setStep(3)} className="btn btn-primary flex-1 justify-center">Continue <ChevronRight size={16}/></button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <div className="text-4xl mb-3">🎉</div>
            <h2 style={{fontFamily:'Fraunces,serif'}} className="text-xl font-semibold text-[#2D5016] mb-1">You're all set!</h2>
            <p className="text-sm text-gray-500 mb-6">Here's a summary of your farm setup. Your <strong>14-day free trial</strong> starts now.</p>
            <div className="bg-[#F5F0E8] rounded-xl p-4 space-y-3 mb-6">
              {[
                ['Farm', form.name],
                ['County', form.county || 'Not specified'],
                ['Currency', form.currency],
                ['Livestock', form.activeSpecies.map(s=>SPECIES[s]?.emoji).join(' ')],
                ['Trial', '14 days free · Up to 50 animals'],
              ].map(([k,v])=>(
                <div key={k} className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-500 uppercase">{k}</span>
                  <span className="text-sm font-medium text-[#1a3009]">{v}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={()=>setStep(2)} className="btn btn-secondary flex-1 justify-center">Back</button>
              <button onClick={handleCreate} disabled={loading} className="btn btn-primary flex-1 justify-center">
                {loading?<><Loader size={16} className="animate-spin"/>Creating…</>:'Launch FarmCore 🚀'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── AUTH PAGE WRAPPER ─────────────────────────────────────────
export default function AuthPage() {
  const [mode, setMode] = useState('login');

  return (
    <div className="min-h-screen bg-[#F5F0E8] flex">
      {/* Left — brand panel */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12"
        style={{background:'linear-gradient(160deg,#1a3009,#2D5016,#4e8628)'}}>
        <div>
          <div className="flex items-center gap-3 mb-12">
            <span className="text-4xl">🌾</span>
            <div>
              <h1 style={{fontFamily:'Fraunces,serif'}} className="text-2xl font-semibold text-white">FarmCore FMIS</h1>
              <p className="text-white/50 text-sm">Your Entire Farm. One System.</p>
            </div>
          </div>
          <h2 style={{fontFamily:'Fraunces,serif'}} className="text-4xl font-light text-white mb-6 leading-snug">
            Built for the modern<br/><em>African farm.</em>
          </h2>
          <p className="text-white/70 text-lg leading-relaxed mb-8">
            From dairy herds to poultry flocks — manage every animal, every litre of milk, every shilling. Offline-ready. Mpesa-integrated. Vet-approved.
          </p>
          <div className="space-y-4">
            {[
              ['🐄','Multi-species livestock management'],
              ['🥛','Milk & egg production with withdrawal locks'],
              ['💰','Income & expense tracking in KES/USD'],
              ['📲','Works offline — syncs when you\'re back online'],
              ['👥','Multi-user farm teams with role-based access'],
            ].map(([emoji, text])=>(
              <div key={text} className="flex items-center gap-3">
                <span className="text-xl">{emoji}</span>
                <p className="text-white/80 text-sm">{text}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white/10 rounded-xl p-5">
          <p className="text-white/90 text-sm italic leading-relaxed mb-3">
            "FarmCore replaced three different spreadsheets and a notebook. Our vet now gets treatment reports instantly."
          </p>
          <p className="text-white/60 text-xs">— James M., Dairy Farm Manager, Nakuru</p>
        </div>
      </div>

      {/* Right — auth form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <span className="text-3xl">🌾</span>
            <h1 style={{fontFamily:'Fraunces,serif'}} className="text-xl font-semibold text-[#2D5016]">FarmCore FMIS</h1>
          </div>
          {mode === 'login'
            ? <Login    onSwitch={()=>setMode('register')}/>
            : <Register onSwitch={()=>setMode('login')}/>
          }
        </div>
      </div>
    </div>
  );
}
