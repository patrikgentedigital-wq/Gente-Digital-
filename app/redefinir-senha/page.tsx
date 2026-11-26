'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Loader2, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { PublicBackLink, PublicShell } from '@/app/_public-identity/public-shell';

export default function RedefinirSenhaPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    supabase.auth.getUser()
      .then(({ data: { user } }) => {
        // Sem sessão válida: trata como não-logado e exibe o formulário
        if (!user) setChecking(false);
      })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setSuccess(true);
      setTimeout(() => {
        router.push('/');
        router.refresh();
      }, 1500);
    } catch (err) {
      console.error('Update password error:', err);
      setError(err instanceof Error && err.message ? err.message : 'Não foi possível redefinir a senha. Solicite um novo link.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PublicShell headerAction={<PublicBackLink href="/login">Voltar ao acesso</PublicBackLink>}>
      <div className="pub-form-head">
        <h2>Redefinir senha</h2>
        <p>Defina uma nova senha de acesso ao painel.</p>
      </div>
      {checking ? (
        <p className="pub-notice" role="status">Validando seu link de redefinição...</p>
      ) : success ? (
        <p className="pub-notice" role="status">Senha redefinida com sucesso! Redirecionando para o painel...</p>
      ) : (
        <>
          {error && <p role="alert" className="pub-alert">{error}</p>}
          <form onSubmit={handleSubmit} className="pub-fields">
            <div className="pub-field">
              <label htmlFor="nova-senha">Nova senha</label>
              <div className="pub-password">
                <input id="nova-senha" type={showPassword ? 'text' : 'password'} required minLength={6} value={password}
                  onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" placeholder="Pelo menos 6 caracteres" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <div className="pub-field">
              <label htmlFor="confirmar-senha">Confirmar nova senha</label>
              <input id="confirmar-senha" type={showPassword ? 'text' : 'password'} value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" required minLength={6} placeholder="Repita sua nova senha" />
            </div>
            <button type="submit" className="pub-primary" disabled={loading}>
              {loading && <Loader2 className="animate-spin" size={16} />}
              {loading ? 'Salvando...' : 'Redefinir senha'} {!loading && <ArrowRight size={16} />}
            </button>
          </form>
        </>
      )}
    </PublicShell>
  );
}
