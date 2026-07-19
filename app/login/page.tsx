'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Lock, Mail, Loader2, AlertCircle } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      
      // O Middleware detectará o cookie gerado pelo Supabase
      router.push('/');
      router.refresh(); // Força a atualização do servidor para passar no middleware
    } catch (err: any) {
      console.error('Login error:', err);
      setError(err.message || 'Credenciais inválidas. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-surface dark:bg-gray-900 p-4 transition-colors">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-3xl shadow-2xl p-8 border border-brand-border dark:border-gray-700 animate-in zoom-in-95 duration-500">
        
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-brand-yellow rounded-2xl flex items-center justify-center mx-auto mb-4 rotate-3 shadow-lg">
            <Lock className="w-8 h-8 text-brand-charcoal -rotate-3" />
          </div>
          <h1 className="text-3xl font-display font-black text-brand-charcoal dark:text-white">Acesso Restrito</h1>
          <p className="text-sm text-brand-muted dark:text-gray-400 mt-2">
            Insira suas credenciais administrativas para gerenciar o sistema.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-start gap-3 animate-in slide-in-from-top-2">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700 dark:text-red-400 font-medium">{error}</p>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-brand-charcoal dark:text-gray-200 mb-1.5">
              E-mail
            </label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-brand-muted" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="admin@empresa.com"
                className="w-full pl-12 pr-4 py-3.5 bg-gray-50 dark:bg-gray-900 border border-brand-border dark:border-gray-700 rounded-xl text-sm text-brand-charcoal dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-yellow transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-brand-charcoal dark:text-gray-200 mb-1.5">
              Senha
            </label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-brand-muted" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full pl-12 pr-4 py-3.5 bg-gray-50 dark:bg-gray-900 border border-brand-border dark:border-gray-700 rounded-xl text-sm text-brand-charcoal dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-yellow transition-all"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-brand-yellow hover:bg-brand-yellow/90 text-brand-charcoal font-bold rounded-xl mt-4 hover:shadow-level-2 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Autenticando...
              </>
            ) : (
              'Entrar no Sistema'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
