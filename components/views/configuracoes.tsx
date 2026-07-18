'use client';

import { useState, useEffect } from 'react';
import { Save, CheckCircle2, Moon, Sun, Monitor, Building2, Shield, Bell } from 'lucide-react';
import { useTheme } from 'next-themes';

export function ConfiguracoesView() {
  const [saved, setSaved] = useState(false);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-300 pb-12">
      <div>
        <h2 className="font-display text-3xl font-bold text-brand-charcoal dark:text-white tracking-tight">Configurações</h2>
        <p className="text-brand-muted dark:text-gray-400 mt-2 text-sm">Gerencie suas preferências, aparência e dados da empresa em um só lugar.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        <div className="lg:col-span-2 space-y-6">
          
          <div className="bg-white dark:bg-[#18181b] rounded-2xl border border-brand-border dark:border-gray-800 shadow-sm overflow-hidden transition-colors">
            <div className="p-6 border-b border-brand-border dark:border-gray-800 flex items-center gap-3">
               <div className="w-10 h-10 rounded-full bg-brand-yellow/20 flex items-center justify-center text-brand-charcoal dark:text-brand-yellow">
                 <Building2 className="w-5 h-5" />
               </div>
               <div>
                 <h3 className="font-bold text-lg text-brand-charcoal dark:text-white">Dados da Empresa</h3>
                 <p className="text-sm text-brand-muted dark:text-gray-400">Informações públicas e administrativas.</p>
               </div>
            </div>
            <div className="p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-brand-charcoal dark:text-gray-200">Nome da Empresa</label>
                  <input type="text" defaultValue="Minha Empresa Telecom" className="w-full px-4 py-2.5 bg-gray-50 dark:bg-[#27272a] border border-brand-border dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:border-brand-yellow focus:ring-1 focus:ring-brand-yellow transition-all dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-brand-charcoal dark:text-gray-200">E-mail Administrativo</label>
                  <input type="email" defaultValue="admin@empresa.com" className="w-full px-4 py-2.5 bg-gray-50 dark:bg-[#27272a] border border-brand-border dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:border-brand-yellow focus:ring-1 focus:ring-brand-yellow transition-all dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500" />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-[#18181b] rounded-2xl border border-brand-border dark:border-gray-800 shadow-sm overflow-hidden transition-colors">
             <div className="p-6 border-b border-brand-border dark:border-gray-800 flex items-center gap-3">
               <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
                 <Monitor className="w-5 h-5" />
               </div>
               <div>
                 <h3 className="font-bold text-lg text-brand-charcoal dark:text-white">Aparência</h3>
                 <p className="text-sm text-brand-muted dark:text-gray-400">Personalize o tema da plataforma.</p>
               </div>
            </div>
            
            <div className="p-6">
              {mounted ? (
                <div className="flex flex-col sm:flex-row gap-4">
                  <button
                    onClick={() => setTheme('light')}
                    className={`flex-1 flex flex-col items-center justify-center gap-3 p-5 rounded-xl border-2 transition-all ${theme === 'light' ? 'border-brand-yellow bg-brand-yellow/5' : 'border-brand-border dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'}`}
                  >
                    <Sun className={`w-8 h-8 ${theme === 'light' ? 'text-brand-yellow' : 'text-brand-muted dark:text-gray-500'}`} />
                    <span className={`font-semibold text-sm ${theme === 'light' ? 'text-brand-charcoal dark:text-white' : 'text-brand-muted dark:text-gray-400'}`}>Claro</span>
                  </button>
                  <button
                    onClick={() => setTheme('dark')}
                    className={`flex-1 flex flex-col items-center justify-center gap-3 p-5 rounded-xl border-2 transition-all ${theme === 'dark' ? 'border-brand-yellow bg-brand-yellow/5' : 'border-brand-border dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'}`}
                  >
                    <Moon className={`w-8 h-8 ${theme === 'dark' ? 'text-brand-yellow' : 'text-brand-muted dark:text-gray-500'}`} />
                    <span className={`font-semibold text-sm ${theme === 'dark' ? 'text-brand-charcoal dark:text-white' : 'text-brand-muted dark:text-gray-400'}`}>Escuro</span>
                  </button>
                  <button
                    onClick={() => setTheme('system')}
                    className={`flex-1 flex flex-col items-center justify-center gap-3 p-5 rounded-xl border-2 transition-all ${theme === 'system' ? 'border-brand-yellow bg-brand-yellow/5' : 'border-brand-border dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'}`}
                  >
                    <Monitor className={`w-8 h-8 ${theme === 'system' ? 'text-brand-yellow' : 'text-brand-muted dark:text-gray-500'}`} />
                    <span className={`font-semibold text-sm ${theme === 'system' ? 'text-brand-charcoal dark:text-white' : 'text-brand-muted dark:text-gray-400'}`}>Sistema</span>
                  </button>
                </div>
              ) : (
                <div className="h-32 bg-gray-50 dark:bg-[#27272a] rounded-xl animate-pulse"></div>
              )}
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button 
              onClick={() => {
                setSaved(false);
                setTimeout(() => setSaved(true), 800);
              }}
              className="px-8 py-3 bg-brand-charcoal dark:bg-white text-white dark:text-brand-charcoal font-bold text-sm rounded-xl hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center justify-center gap-2"
            >
              {saved ? (
                <>
                  <CheckCircle2 className="w-5 h-5 text-green-400 dark:text-green-600" />
                  Salvo com sucesso
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  Salvar Alterações
                </>
              )}
            </button>
          </div>
        </div>

        <div className="space-y-6">
           <div className="bg-gradient-to-br from-brand-charcoal to-[#2a2a2a] dark:from-[#27272a] dark:to-[#18181b] rounded-2xl p-6 text-white shadow-md relative overflow-hidden transition-colors">
              <div className="absolute -top-4 -right-4 p-4 opacity-10">
                <Shield className="w-32 h-32" />
              </div>
              <h3 className="font-bold text-lg mb-2 relative z-10">Segurança da Conta</h3>
              <p className="text-gray-300 text-sm mb-6 relative z-10">Sua conta está protegida com as melhores práticas de segurança.</p>
              
              <div className="space-y-3 relative z-10">
                <div className="flex items-center justify-between text-sm bg-white/10 px-3 py-2.5 rounded-lg border border-white/5">
                  <span className="text-gray-200">2 Fatores</span>
                  <span className="text-green-400 font-semibold text-xs bg-green-400/10 px-2.5 py-1 rounded-full border border-green-400/20">Ativo</span>
                </div>
                <div className="flex items-center justify-between text-sm bg-white/10 px-3 py-2.5 rounded-lg border border-white/5">
                  <span className="text-gray-200">Último Acesso</span>
                  <span className="text-gray-400 font-medium text-xs">Hoje, 12:45</span>
                </div>
              </div>
           </div>

           <div className="bg-white dark:bg-[#18181b] rounded-2xl border border-brand-border dark:border-gray-800 p-6 shadow-sm transition-colors">
             <div className="flex items-center gap-3 mb-4">
               <div className="w-10 h-10 rounded-full bg-brand-surface dark:bg-[#27272a] flex items-center justify-center transition-colors">
                 <Bell className="w-5 h-5 text-brand-muted dark:text-gray-400" />
               </div>
               <h3 className="font-bold text-brand-charcoal dark:text-white">Notificações</h3>
             </div>
             <p className="text-sm text-brand-muted dark:text-gray-400 mb-5 leading-relaxed">
               Deseja receber alertas sobre novos leads no seu e-mail administrativo?
             </p>
             <label className="flex items-center gap-3 cursor-pointer group">
               <div className="relative">
                 <input type="checkbox" className="sr-only peer" defaultChecked />
                 <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-yellow/20 dark:peer-focus:ring-brand-yellow/10 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-brand-yellow"></div>
               </div>
               <span className="text-sm font-medium text-brand-charcoal dark:text-gray-300 group-hover:text-brand-yellow dark:group-hover:text-brand-yellow transition-colors">Ativar alertas de e-mail</span>
             </label>
           </div>
        </div>

      </div>
    </div>
  );
}
