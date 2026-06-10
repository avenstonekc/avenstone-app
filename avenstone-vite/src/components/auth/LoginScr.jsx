import { useState } from 'react';
import { sb } from '../../lib/supabase';
import logo from '../../assets/logo.png';

export default function LoginScr() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [mode, setMode] = useState('password'); // "password" | "magic" | "forgot"
  const [magicSent, setMagicSent] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const signIn = async () => {
    if (!email.trim() || !password.trim()) { setErr('Email and password are required.'); return; }
    setLoading(true); setErr('');
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
    if (error) setErr(error.message);
    setLoading(false);
  };

  const sendMagic = async () => {
    if (!email.trim()) { setErr('Email is required.'); return; }
    setLoading(true); setErr('');
    const { error } = await sb.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false } });
    if (error) setErr(error.message);
    else setMagicSent(true);
    setLoading(false);
  };

  const sendReset = async () => {
    if (!email.trim()) { setErr('Email is required.'); return; }
    setLoading(true); setErr('');
    const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: 'https://avenstone-app.vercel.app' });
    if (error) setErr(error.message);
    else setResetSent(true);
    setLoading(false);
  };

  if (magicSent || resetSent) return (
    <div className="auth-wrap">
      <div className="auth-wrap-inner">
        <div className="auth-logo"><img src={logo} alt="Avenstone" /></div>
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <div className="auth-card-body">
            <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22, color: 'var(--navy-900)', marginBottom: 12 }}>Check your email</div>
            <div style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: 20 }}>
              {resetSent ? 'We sent a password reset link to ' : 'We sent a sign-in link to '}
              <strong>{email}</strong>.
              {resetSent ? ' Click it to set a new password.' : ' Click it to access your project portal.'}
            </div>
            <button className="auth-link" onClick={() => { setMagicSent(false); setResetSent(false); setMode('password'); setErr(''); }}>Back to sign in</button>
          </div>
        </div>
      </div>
    </div>
  );

  if (mode === 'forgot') return (
    <div className="auth-wrap">
      <div className="auth-wrap-inner">
        <div className="auth-logo"><img src={logo} alt="Avenstone" /></div>
        <div className="auth-card">
          <div className="auth-card-body">
            <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22, color: 'var(--navy-900)', marginBottom: 4, textAlign: 'center' }}>Reset Password</div>
            <div style={{ fontSize: 13, color: 'var(--text-subtle)', textAlign: 'center', marginBottom: 28 }}>Enter your email and we'll send a reset link</div>
            {err && <div className="auth-err">{err}</div>}
            <div className="fg">
              <label className="flbl">Email</label>
              <input className="finp" type="email" value={email} onChange={e => { setEmail(e.target.value); setErr(''); }} placeholder="you@company.com" onKeyDown={e => e.key === 'Enter' && sendReset()} autoFocus />
            </div>
            <button className="btn btn-navy" style={{ width: '100%', padding: '12px', fontSize: 13 }} onClick={sendReset} disabled={loading}>{loading ? 'Sending...' : 'Send Reset Link'}</button>
            <div style={{ marginTop: 16, textAlign: 'center' }}>
              <button className="auth-link" onClick={() => { setMode('password'); setErr(''); }}>Back to sign in</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="auth-wrap">
      <div className="auth-wrap-inner">
        <div className="auth-logo"><img src={logo} alt="Avenstone" /></div>
        <div className="auth-card">
          <div className="auth-card-body">
            <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22, color: 'var(--navy-900)', marginBottom: 4, textAlign: 'center' }}>Sign in</div>
            <div style={{ fontSize: 13, color: 'var(--text-subtle)', textAlign: 'center', marginBottom: 28 }}>Avenstone Group</div>
            {err && <div className="auth-err">{err}</div>}
            <div className="fg">
              <label className="flbl">Email</label>
              <input className="finp" type="email" value={email} onChange={e => { setEmail(e.target.value); setErr(''); }} placeholder="you@company.com" onKeyDown={e => e.key === 'Enter' && (mode === 'password' ? signIn() : sendMagic())} autoFocus />
            </div>
            {mode === 'password' && (
              <div className="fg">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label className="flbl" style={{ margin: 0 }}>Password</label>
                  <button className="auth-link" style={{ fontSize: 11, padding: 0 }} onClick={() => { setMode('forgot'); setErr(''); }}>Forgot password?</button>
                </div>
                <input className="finp" type="password" value={password} onChange={e => { setPassword(e.target.value); setErr(''); }} placeholder="••••••••" onKeyDown={e => e.key === 'Enter' && signIn()} />
              </div>
            )}
            <button className="btn btn-navy" style={{ width: '100%', padding: '12px', fontSize: 13 }} onClick={mode === 'password' ? signIn : sendMagic} disabled={loading}>
              {loading ? (mode === 'password' ? 'Signing in...' : 'Sending...') : (mode === 'password' ? 'Sign In' : 'Send Magic Link')}
            </button>
            <div className="auth-divider">or</div>
            {mode === 'password'
              ? <button className="auth-link" style={{ width: '100%', textAlign: 'center', display: 'block' }} onClick={() => { setMode('magic'); setErr(''); }}>Sign in with a magic link</button>
              : <button className="auth-link" style={{ width: '100%', textAlign: 'center', display: 'block' }} onClick={() => { setMode('password'); setErr(''); }}>Sign in with a password instead</button>
            }
            <div className="auth-foot">Invite only — contact your administrator</div>
          </div>
        </div>
      </div>
    </div>
  );
}
