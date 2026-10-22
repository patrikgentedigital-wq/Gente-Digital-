'use client';

import { useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Lock, Mail, Loader2, AlertCircle, Eye, EyeOff, Sun, Moon, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTheme } from 'next-themes';
import { BrandMark } from '@/components/brand-mark';
import { CableArt } from '@/components/cable-art';

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

      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: cleanPassword,
      });

      if (error) throw error;

      router.push('/');
      router.refresh();
    } catch (err: any) {
      console.error('Login error:', err);
      setError(err.message || 'Credenciais inválidas. Tente novamente.');
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
    } catch (err: any) {
      console.error('Reset password error:', err);
      setError(err.message || 'Não foi possível enviar o e-mail de redefinição.');
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'w-full rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel)] py-3.5 text-sm font-semibold text-[var(--app-ink)] placeholder:text-[var(--app-muted)] transition-colors focus:border-[var(--app-ink)] focus:outline-none focus:ring-4 focus:ring-[#ffe300]/60';

  return (
    <div className="relative grid min-h-screen bg-[var(--app-canvas)] text-[var(--app-ink)] lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      {/* Theme Toggle Button */}
      {mounted && (
        <button
          type="button"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="absolute right-4 top-4 z-20 rounded-full border border-[#0e1b2c]/40 bg-[var(--app-panel)] p-2.5 text-[var(--app-muted)] transition-colors hover:border-[var(--app-ink)] hover:text-[var(--app-ink)] sm:right-6 sm:top-6"
          title="Alternar tema"
          aria-label={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      )}

      {/* Placa da marca */}
      <section className="relative flex flex-col justify-between overflow-hidden rounded-b-[44px] bg-[#ffe300] px-6 pb-10 pt-8 text-[#0e1b2c] sm:px-10 lg:min-h-screen lg:rounded-b-none lg:rounded-r-[56px] lg:px-14 lg:py-12">
        <div className="flex items-center justify-between gap-4">
          <BrandMark tone="onYellow" />
          <div className="fiber-leds" aria-hidden="true">
            {Array.from({ length: 12 }, (_, index) => <i key={index} />)}
          </div>
        </div>
        <div className="relative mt-10 max-w-xl lg:mt-0">
          <p className="font-display text-5xl font-extrabold leading-[1.02] tracking-tight sm:text-6xl lg:text-[4.25rem]">
            Cada indicação vira cliente na rede.
          </p>
          <p className="mt-5 max-w-md text-lg font-semibold leading-relaxed text-[#0e1b2c]/80">
            Aqui você acompanha os leads, os colaboradores e as comissões do Indique e Ganhe.
          </p>
        </div>
        <CableArt className="pointer-events-none -mx-6 mt-6 hidden h-auto w-[calc(100%+3rem)] max-w-none sm:block lg:mx-0 lg:w-full" />
        <a
          href="/indicar"
          className="mt-6 inline-flex w-fit items-center gap-2 rounded-full border-2 border-[#0e1b2c] px-4 py-2 text-sm font-bold transition-colors hover:bg-[#0e1b2c] hover:text-[#ffe300]"
        >
          Conheça o programa Indique e Ganhe
          <ArrowRight className="h-4 w-4" />
        </a>
      </section>

      {/* Formulário */}
      <main className="flex items-center justify-center px-6 py-12 sm:px-10">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-sm"
        >
          <h1 className="font-display text-4xl font-bold leading-tight tracking-tight">
            {mode === 'login' ? 'Que bom te ver por aqui' : 'Vamos criar uma nova senha'}
          </h1>
          <p className="mt-2 text-sm text-[var(--app-muted)]">
            {mode === 'login'
              ? 'Entre com o e-mail corporativo cadastrado pela administração.'
              : 'Informe seu e-mail e enviaremos um link para criar uma nova senha.'}
          </p>

          {mode === 'forgot' && resetSent ? (
            <div
              className="mt-6 flex items-start gap-3 rounded-md border border-emerald-300 bg-emerald-50 p-4 text-sm font-medium text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
              role="status"
            >
              <Mail className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Se <strong>{email}</strong> estiver cadastrado, você receberá um link para redefinir sua senha. Verifique sua caixa de entrada e a pasta de spam.
              </p>
            </div>
          ) : (
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-6 flex items-start gap-3 overflow-hidden rounded-md border border-red-300 bg-red-50 p-4 text-sm font-medium text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
                  role="alert"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>{error}</p>
                </motion.div>
              )}
            </AnimatePresence>
          )}

          <form onSubmit={mode === 'login' ? handleLogin : handleForgotPassword} className="mt-6 space-y-4">
            <div>
              <label htmlFor="login-email" className="mb-1.5 block text-sm font-semibold">
                E-mail corporativo
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--app-muted)]" />
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="seu.email@empresa.com"
                  className={`${inputClass} pl-10 pr-4`}
                />
              </div>
            </div>

            {mode === 'login' && (
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label htmlFor="login-password" className="block text-sm font-semibold">
                    Senha
                  </label>
                  <button
                    type="button"
                    onClick={() => { setMode('forgot'); setError(null); setResetSent(false); }}
                    className="text-sm font-semibold text-[var(--app-muted)] underline-offset-4 transition-colors hover:text-[var(--app-ink)] hover:underline"
                  >
                    Esqueci minha senha
                  </button>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--app-muted)]" />
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className={`${inputClass} pl-10 pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--app-muted)] transition-colors hover:text-[var(--app-ink)]"
                    title={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="gd-button gd-button--primary mt-2 w-full disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{mode === 'login' ? 'Entrando...' : 'Enviando...'}</span>
                </>
              ) : (
                <>
                  <span>{mode === 'login' ? 'Entrar' : 'Enviar link de redefinição'}</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          {mode === 'forgot' && (
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => { setMode('login'); setError(null); setResetSent(false); }}
                className="text-sm font-semibold text-[var(--app-muted)] underline-offset-4 transition-colors hover:text-[var(--app-ink)] hover:underline"
              >
                Voltar para o login
              </button>
            </div>
          )}

          <p className="mt-10 text-xs text-[var(--app-muted)]">
            Gente Digital &copy; {new Date().getFullYear()}
          </p>
        </motion.div>
      </main>
    </div>
  );
}
