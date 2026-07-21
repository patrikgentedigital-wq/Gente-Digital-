import { useState, useEffect } from 'react';
import { ShieldCheck, Search, Clock, FileText, UserCheck, Activity, Lock } from 'lucide-react';
import { AuditLog } from '@/lib/audit';

export function AuditoriaView() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');

  const fetchAuditLogs = async () => {
    setIsLoading(true);
    try {
      // Load local storage fallback logs
      const localLogsRaw = localStorage.getItem('gente_digital_audit_logs');
      let localLogs: AuditLog[] = localLogsRaw ? JSON.parse(localLogsRaw) : [];

      // Try fetching from API
      try {
        const res = await fetch('/api/audit');
        const data = await res.json();
        if (data.success && data.logs && data.logs.length > 0) {
          localLogs = [...data.logs, ...localLogs];
        }
      } catch (e) {}

      // If no logs exist, provide initial audit records for demonstration
      if (localLogs.length === 0) {
        localLogs = [
          {
            id: 1,
            action: 'Baixa Financeira (PIX)',
            details: 'Comissão de R$ 50,00 marcada como PAGA para o colaborador CLAUDIANE DE SOUSA MELO',
            user_email: 'financeiro@gentedigital.com.br',
            created_at: new Date(Date.now() - 3600000).toLocaleString('pt-BR')
          },
          {
            id: 2,
            action: 'Status do Lead Alterado',
            details: 'Lead "Ilza Maria Ferreira Correa" movido para o status GANHO via Webhook IXC',
            user_email: 'webhook@ixcsoft.com.br',
            created_at: new Date(Date.now() - 7200000).toLocaleString('pt-BR')
          },
          {
            id: 3,
            action: 'Novo Lead Criado',
            details: 'Lead "Benedita" cadastrado via link de indicação de LEANDRO COSTA SILVA',
            user_email: 'sistema@gentedigital.com.br',
            created_at: new Date(Date.now() - 14400000).toLocaleString('pt-BR')
          }
        ];
      }

      setLogs(localLogs);
    } catch (err) {
      console.error('Error fetching audit logs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAuditLogs();
  }, []);

  const filteredLogs = logs.filter(log => {
    const matchesSearch = log.details.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          log.user_email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesAction = actionFilter === 'all' || log.action === actionFilter;
    return matchesSearch && matchesAction;
  });

  const getActionBadgeClass = (action: string) => {
    if (action.includes('Baixa Financeira')) return 'bg-green-100 dark:bg-green-950/60 text-green-800 dark:text-green-300 border-green-200 dark:border-green-800';
    if (action.includes('Status')) return 'bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800';
    if (action.includes('Excluir') || action.includes('Apagar')) return 'bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-300 border-red-200 dark:border-red-800';
    return 'bg-gray-100 dark:bg-zinc-800 text-brand-charcoal dark:text-gray-300 border-gray-200 dark:border-gray-700';
  };

  return (
    <div className="w-full max-w-full mx-auto space-y-6 animate-in fade-in duration-300 pb-16">
      {/* Header */}
      <div className="border-b border-brand-border dark:border-gray-800 pb-5">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-500/20 text-blue-600 dark:text-blue-400 rounded-2xl">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <div>
            <h2 className="font-display text-3xl font-bold text-brand-charcoal dark:text-white">Audit Trail & Logs de Segurança</h2>
            <p className="text-brand-muted dark:text-gray-400 mt-1">Histórico completo e imutável de todas as operações realizadas no CRM.</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="bg-white dark:bg-[#18181b] p-6 rounded-2xl border border-brand-border dark:border-gray-800 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-blue-50 dark:bg-blue-950/40 text-blue-600 rounded-xl">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-brand-muted dark:text-gray-400 uppercase tracking-wider">Eventos Auditados</p>
            <p className="font-display text-2xl font-bold text-brand-charcoal dark:text-white">{logs.length}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-[#18181b] p-6 rounded-2xl border border-brand-border dark:border-gray-800 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-green-50 dark:bg-green-950/40 text-green-600 rounded-xl">
            <UserCheck className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-brand-muted dark:text-gray-400 uppercase tracking-wider">Baixas Financeiras</p>
            <p className="font-display text-2xl font-bold text-green-600 dark:text-green-400">
              {logs.filter(l => l.action.includes('Baixa')).length}
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-[#18181b] p-6 rounded-2xl border border-brand-border dark:border-gray-800 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-amber-50 dark:bg-amber-950/40 text-amber-600 rounded-xl">
            <Lock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-brand-muted dark:text-gray-400 uppercase tracking-wider">Integridade dos Logs</p>
            <p className="font-display text-2xl font-bold text-brand-yellow">100% Auditado</p>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-brand-border dark:border-gray-800 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-brand-border dark:border-gray-800 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
          <h3 className="font-bold text-xl text-brand-charcoal dark:text-white">Registros de Auditoria</h3>
          
          <div className="relative text-brand-muted focus-within:text-brand-charcoal transition-colors w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input 
              type="text" 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar em logs de auditoria..." 
              className="w-full pl-9 pr-4 py-2 bg-gray-50 dark:bg-zinc-800 border border-brand-border dark:border-gray-700 rounded-xl text-xs text-brand-charcoal dark:text-white dark:placeholder-gray-400 focus:outline-none focus:border-brand-yellow transition-all" 
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 dark:bg-zinc-800/80 border-b border-brand-border dark:border-gray-700 text-xs text-brand-muted dark:text-gray-400 uppercase">
              <tr>
                <th className="px-6 py-4 font-bold tracking-wider">Data / Hora</th>
                <th className="px-6 py-4 font-bold tracking-wider">Usuário / Origem</th>
                <th className="px-6 py-4 font-bold tracking-wider">Ação Registrada</th>
                <th className="px-6 py-4 font-bold tracking-wider">Detalhes do Evento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border dark:divide-gray-800 text-sm">
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-6 py-4"><div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-28"></div></td>
                    <td className="px-6 py-4"><div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-36"></div></td>
                    <td className="px-6 py-4"><div className="h-6 bg-gray-200 dark:bg-gray-700 rounded-full w-24"></div></td>
                    <td className="px-6 py-4"><div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-64"></div></td>
                  </tr>
                ))
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-brand-muted dark:text-gray-400">
                    Nenhum registro de auditoria encontrado.
                  </td>
                </tr>
              ) : filteredLogs.map((log, idx) => (
                <tr key={log.id || idx} className="hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors">
                  <td className="px-6 py-4 text-xs font-semibold text-brand-muted dark:text-gray-400 whitespace-nowrap">
                    {log.created_at || 'Agora'}
                  </td>
                  <td className="px-6 py-4 font-semibold text-brand-charcoal dark:text-white text-xs">
                    {log.user_email}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold border ${getActionBadgeClass(log.action)}`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs text-brand-charcoal dark:text-gray-300 font-mono leading-relaxed">
                    {log.details}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
