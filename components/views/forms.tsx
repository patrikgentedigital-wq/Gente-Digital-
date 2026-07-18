'use client';

import { useState, useEffect } from 'react';
import { initAuth, googleSignIn, getAccessToken, logout } from '@/lib/auth';
import { FileText, LogIn, LogOut, Search, ExternalLink, Loader2 } from 'lucide-react';
import { User } from 'firebase/auth';

export function FormsView() {
  const [needsAuth, setNeedsAuth] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  // Actually we need to query Google Drive API to get files with mimeType='application/vnd.google-apps.form'
  const [forms, setForms] = useState<any[]>([]);

  const fetchForms = async (accessToken: string) => {
    try {
      setIsLoading(true);
      // We query the Drive API for forms to list them for the user
      const res = await fetch('https://www.googleapis.com/drive/v3/files?q=mimeType=\'application/vnd.google-apps.form\'&fields=files(id,name,webViewLink,createdTime)', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      if (data.files) {
        setForms(data.files);
      }
    } catch (err) {
      console.error('Failed to fetch forms', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = initAuth(
      (user, t) => {
        setUser(user);
        setToken(t);
        setNeedsAuth(false);
        fetchForms(t);
      },
      () => setNeedsAuth(true)
    );
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    try {
      const result = await googleSignIn();
      if (result) {
        setToken(result.accessToken);
        setUser(result.user);
        setNeedsAuth(false);
        fetchForms(result.accessToken);
      }
    } catch (err) {
      console.error('Login failed:', err);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setUser(null);
    setToken(null);
    setForms([]);
  };

  if (needsAuth || !user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] bg-white rounded-2xl shadow-sm border border-brand-border p-8 text-center">
        <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-6">
          <FileText className="w-8 h-8 text-blue-600" />
        </div>
        <h2 className="text-2xl font-bold text-brand-charcoal mb-2">Conectar ao Google Forms</h2>
        <p className="text-brand-muted mb-8 max-w-md">
          Para visualizar e gerenciar seus formulários do Google Forms diretamente pela plataforma, você precisa conectar sua conta do Google.
        </p>
        
        <button 
          onClick={handleLogin}
          disabled={isLoggingIn}
          className="gsi-material-button relative border border-[#dadce0] bg-white rounded flex items-center h-10 px-3 cursor-pointer hover:bg-[#f8f9fa] transition-colors"
        >
          {isLoggingIn ? (
            <Loader2 className="w-5 h-5 animate-spin mx-auto text-gray-500" />
          ) : (
            <div className="flex items-center gap-3">
              <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-5 h-5">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                <path fill="none" d="M0 0h48v48H0z"></path>
              </svg>
              <span className="text-[14px] font-medium text-[#3c4043] font-sans">Sign in with Google</span>
            </div>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-brand-charcoal">Meus Formulários</h2>
          <p className="text-brand-muted text-sm mt-1">Conectado como {user.email}</p>
        </div>
        
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            onClick={() => fetchForms(token!)}
            className="px-4 py-2 bg-white border border-brand-border rounded-lg text-sm font-medium hover:bg-gray-50 flex items-center gap-2"
          >
            Atualizar
          </button>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-white border border-brand-border rounded-lg text-sm font-medium hover:bg-gray-50 text-red-600 flex items-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            Desconectar
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-brand-border overflow-hidden">
        <div className="p-4 border-b border-brand-border">
          <div className="relative">
            <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar formulários..."
              className="w-full pl-10 pr-4 py-2 border border-brand-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-yellow/50"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex flex-col justify-center items-center h-64 text-brand-muted">
            <Loader2 className="w-8 h-8 animate-spin text-brand-yellow mb-4" />
            <p>Carregando formulários...</p>
          </div>
        ) : forms.length > 0 ? (
          <div className="divide-y divide-brand-border">
            {forms.map((form) => (
              <div key={form.id} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-[#F2E7FE] flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-[#7248B9]" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-brand-charcoal text-sm">{form.name}</h3>
                    <p className="text-xs text-brand-muted mt-1">
                      Criado em: {new Date(form.createdTime).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                </div>
                
                <a
                  href={form.webViewLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 text-gray-400 hover:text-brand-charcoal hover:bg-gray-100 rounded-lg transition-colors"
                  title="Abrir no Google Forms"
                >
                  <ExternalLink className="w-5 h-5" />
                </a>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col justify-center items-center h-64 text-brand-muted">
            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
              <FileText className="w-6 h-6 text-gray-400" />
            </div>
            <p className="font-medium text-brand-charcoal">Nenhum formulário encontrado</p>
            <p className="text-sm mt-1">Crie um formulário no Google Drive para vê-lo aqui.</p>
          </div>
        )}
      </div>
    </div>
  );
}
