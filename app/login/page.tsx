'use client';

import { useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Loader2, Eye, EyeOff, Sun, Moon, ArrowRight } from 'lucide-react';
import { useTheme } from 'next-themes';
import { PublicShell } from '@/app/_public-identity/public-shell';

const emptySubscribe = () => () => {};

export default function LoginPage() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [resetSent, setResetSent] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const cleanEmail = email.trim().toLowerCase();
      const cleanPassword = password.trim();

      const { error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: cleanPassword,
      });

      if (error) throw error;

      router.push('/');
      router.refresh();
    } catch (err) {
      console.error('Login error:', err);
      setError(err instanceof Error && err.message ? err.message : 'Credenciais inválidas. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: `${window.location.origin}/redefinir-senha`,
      });
      if (error) throw error;
      setResetSent(true);
    } catch (err) {
      console.error('Reset password error:', err);
      setError(err instanceof Error && err.message ? err.message : 'Não foi possível enviar o e-mail de redefinição.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PublicShell headerAction={mounted && (
      <button type="button" className="pub-theme" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        aria-label={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}>
        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
      </button>
    )}>
      <div className="pub-form-head">
        <h2>{mode === 'login' ? 'Acesse o painel' : 'Recuperar acesso'}</h2>
        <p>{mode === 'login' ? 'Entre com o e-mail corporativo cadastrado pela administração.' : 'Informe seu e-mail para receber o link de redefinição.'}</p>
      </div>
      {error && <p role="alert" className="pub-alert">{error}</p>}
      {mode === 'forgot' && resetSent && (
        <p role="status" className="pub-notice">
          Se <strong>{email}</strong> estiver cadastrado, você receberá um link para redefinir sua senha.
          Verifique sua caixa de entrada e a pasta de spam.
        </p>
      )}
      <form className="pub-fields" onSubmit={mode === 'login' ? handleLogin : handleForgotPassword}>
        <div className="pub-field">
          <label htmlFor="login-email">E-mail corporativo</label>
          <input id="login-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required
            autoComplete="email" placeholder="seu.email@empresa.com" />
        </div>
        {mode === 'login' && (
          <div className="pub-field">
            <div className="pub-label-row">
              <label htmlFor="login-password">Senha</label>
              <button type="button" className="pub-link" onClick={() => { setMode('forgot'); setError(null); setResetSent(false); }}>
                Esqueci minha senha
              </button>
            </div>
            <div className="pub-password">
              <input id="login-password" type={showPassword ? 'text' : 'password'} value={password}
                onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" placeholder="••••••••" />
              <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
        )}
        <button className="pub-primary" type="submit" disabled={loading}>
          {loading && <Loader2 size={16} className="animate-spin" />}
          {mode === 'login' ? (loading ? 'Entrando...' : 'Entrar') : (loading ? 'Enviando...' : 'Enviar link de redefinição')}
          {!loading && <ArrowRight size={16} />}
        </button>
      </form>
      {mode === 'forgot' && (
        <button type="button" className="pub-back pub-link" onClick={() => { setMode('login'); setError(null); setResetSent(false); }}>
          Voltar para o login
        </button>
      )}
    </PublicShell>
  );
}
