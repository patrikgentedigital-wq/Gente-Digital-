'use client';

import { useState } from 'react';
import { 
  Trophy, 
  Award, 
  Gift, 
  Sparkles, 
  CheckCircle2, 
  Lock, 
  Zap, 
  ShoppingBag, 
  History, 
  Send, 
  X, 
  Clock, 
  TrendingUp,
  Star,
  Flame,
  ShieldCheck,
  Coffee,
  Ticket,
  Calendar,
  DollarSign
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useToast } from '@/components/providers/toast-context';

interface Badge {
  id: string;
  title: string;
  description: string;
  icon: any;
  unlocked: boolean;
  progress: number; // 0 to 100
  maxCount: number;
  currentCount: number;
  color: string;
  bgGradient: string;
}

interface RewardItem {
  id: string;
  title: string;
  category: 'pix' | 'voucher' | 'beneficio' | 'brinde';
  points: number;
  description: string;
  imageIcon: any;
  popular?: boolean;
  stock?: number;
}

interface ResgateHistory {
  id: string;
  rewardTitle: string;
  pointsUsed: number;
  date: string;
  status: 'Pendente' | 'Aprovado' | 'Concluído';
  pixKeyOrDetail?: string;
}

export function GamificacaoView() {
  const { success: toastSuccess, error: toastError } = useToast();

  // User Points State
  const [userPoints, setUserPoints] = useState<number>(1450);
  const [totalEarned, setTotalEarned] = useState<number>(2250);

  // Selected reward for modal
  const [selectedReward, setSelectedReward] = useState<RewardItem | null>(null);
  const [pixKey, setPixKey] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [filterCategory, setFilterCategory] = useState<string>('todos');

  // Resgates History State
  const [resgates, setResgates] = useState<ResgateHistory[]>([
    {
      id: 'RES-001',
      rewardTitle: 'R$ 50,00 PIX na Conta',
      pointsUsed: 500,
      date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toLocaleDateString('pt-BR'),
      status: 'Concluído',
      pixKeyOrDetail: 'chavetestepix@email.com'
    },
    {
      id: 'RES-002',
      rewardTitle: 'Par de Ingressos de Cinema',
      pointsUsed: 800,
      date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toLocaleDateString('pt-BR'),
      status: 'Concluído',
      pixKeyOrDetail: 'Código: CINEMA-9821'
    }
  ]);

  // Badges Data
  const badges: Badge[] = [
    {
      id: 'first-sale',
      title: 'Primeira Indicação',
      description: 'Concluiu a primeira indicação convertida com sucesso.',
      icon: Star,
      unlocked: true,
      progress: 100,
      currentCount: 1,
      maxCount: 1,
      color: 'from-amber-400 to-yellow-500',
      bgGradient: 'bg-amber-500/10 border-amber-500/30'
    },
    {
      id: 'club-10',
      title: 'Clube das 10 Vendas',
      description: 'Atingiu 10 indicações convertidas no sistema.',
      icon: Trophy,
      unlocked: true,
      progress: 100,
      currentCount: 10,
      maxCount: 10,
      color: 'from-blue-400 to-indigo-500',
      bgGradient: 'bg-blue-500/10 border-blue-500/30'
    },
    {
      id: 'top-month',
      title: 'Top Indicador do Mês',
      description: 'Ficou em 1º lugar no ranking comercial mensal.',
      icon: Flame,
      unlocked: true,
      progress: 100,
      currentCount: 1,
      maxCount: 1,
      color: 'from-orange-500 to-rose-500',
      bgGradient: 'bg-orange-500/10 border-orange-500/30'
    },
    {
      id: 'high-conversion',
      title: 'Lenda da Conversão',
      description: 'Mantenha taxa de conversão superior a 50%.',
      icon: ShieldCheck,
      unlocked: false,
      progress: 75,
      currentCount: 3,
      maxCount: 4,
      color: 'from-emerald-400 to-teal-500',
      bgGradient: 'bg-emerald-500/10 border-emerald-500/30'
    },
    {
      id: 'super-seller',
      title: 'Mestre das Indicações',
      description: 'Atinja o total de 25 indicações convertidas.',
      icon: Zap,
      unlocked: false,
      progress: 48,
      currentCount: 12,
      maxCount: 25,
      color: 'from-purple-400 to-pink-500',
      bgGradient: 'bg-purple-500/10 border-purple-500/30'
    }
  ];

  // Rewards Store Items
  const rewards: RewardItem[] = [
    {
      id: 'pix-50',
      title: 'R$ 50,00 PIX Direto na Conta',
      category: 'pix',
      points: 500,
      description: 'Transferência PIX imediata para a sua chave cadastrada.',
      imageIcon: DollarSign,
      popular: true,
      stock: 99
    },
    {
      id: 'pix-100',
      title: 'R$ 100,00 PIX Direto na Conta',
      category: 'pix',
      points: 1000,
      description: 'Transferência PIX no valor de R$ 100 para sua conta bancária.',
      imageIcon: DollarSign,
      popular: true,
      stock: 50
    },
    {
      id: 'cinema-tickets',
      title: 'Par de Ingressos de Cinema',
      category: 'voucher',
      points: 800,
      description: 'Voucher digital válido para qualquer cinema Cinemark ou Kinoplex.',
      imageIcon: Ticket,
      stock: 15
    },
    {
      id: 'vale-alimentacao',
      title: 'Vale iFood / Alimentação R$ 150',
      category: 'voucher',
      points: 1500,
      description: 'Cupom de R$ 150 para gastar como quiser em entregas no iFood.',
      imageIcon: Coffee,
      popular: true,
      stock: 20
    },
    {
      id: 'folga-aniversario',
      title: 'Dia de Folga no Aniversário',
      category: 'beneficio',
      points: 2000,
      description: 'Ganhe 1 dia de folga remunerada no mês do seu aniversário.',
      imageIcon: Calendar,
      stock: 10
    },
    {
      id: 'saida-antecipada',
      title: 'Saída 2 Horas Mais Cedo',
      category: 'beneficio',
      points: 1200,
      description: 'Voucher para encerrar o expediente 2 horas mais cedo em um dia à escolha.',
      imageIcon: Clock,
      stock: 30
    },
    {
      id: 'kit-brindes',
      title: 'Kit Exclusivo Gente Digital',
      category: 'brinde',
      points: 1000,
      description: 'Camisa polo premium + Caneca térmica exclusiva da empresa.',
      imageIcon: Gift,
      stock: 8
    }
  ];

  const filteredRewards = rewards.filter(item => {
    if (filterCategory === 'todos') return true;
    return item.category === filterCategory;
  });

  const handleRedeem = (reward: RewardItem) => {
    if (userPoints < reward.points) {
      toastError(
        'Saldo Insuficiente',
        `Você precisa de mais ${reward.points - userPoints} pontos para resgatar este prêmio.`
      );
      return;
    }
    setSelectedReward(reward);
    setPixKey('');
  };

  const confirmRedeem = async () => {
    if (!selectedReward) return;

    if (selectedReward.category === 'pix' && !pixKey.trim()) {
      toastError('Chave PIX Obrigatória', 'Informe a sua chave PIX para envio do valor.');
      return;
    }

    setIsSubmitting(true);

    try {
      // Dedeuct points
      const newPoints = userPoints - selectedReward.points;
      setUserPoints(newPoints);

      // Add to Resgates list
      const newResgate: ResgateHistory = {
        id: `RES-${String(Math.floor(Math.random() * 9000) + 1000)}`,
        rewardTitle: selectedReward.title,
        pointsUsed: selectedReward.points,
        date: new Date().toLocaleDateString('pt-BR'),
        status: 'Pendente',
        pixKeyOrDetail: selectedReward.category === 'pix' ? `Chave PIX: ${pixKey}` : 'Aguardando liberação'
      };

      setResgates(prev => [newResgate, ...prev]);

      toastSuccess(
        'Resgate Solicitado com Sucesso! 🎉',
        `Seu pedido de "${selectedReward.title}" foi enviado para processamento.`
      );

      setSelectedReward(null);
      setPixKey('');
    } catch (e: any) {
      toastError('Erro no Resgate', 'Não foi possível concluir a solicitação.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-300">
      
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 p-8 text-slate-950 shadow-xl">
        <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 opacity-20 pointer-events-none">
          <Trophy className="w-96 h-96 text-white" />
        </div>

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="max-w-2xl space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-950/20 text-slate-950 text-xs font-bold uppercase tracking-wider backdrop-blur-sm">
              <Sparkles className="w-4 h-4" /> Gamificação & Reconhecimento
            </div>
            <h2 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight">
              Loja de Prêmios & Conquistas
            </h2>
            <p className="text-slate-900/80 text-sm sm:text-base font-medium">
              Transforme suas indicações convertidas em recompensas reais. Acumule pontos a cada nova venda e troque por PIX, folgas e brindes!
            </p>
          </div>

          {/* User Score Card */}
          <div className="bg-slate-950/90 text-white rounded-2xl p-6 border border-amber-400/30 backdrop-blur-md shrink-0 shadow-2xl flex flex-col justify-between min-w-[240px]">
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">Saldo de Pontos</span>
              <div className="w-8 h-8 rounded-xl bg-amber-400/20 flex items-center justify-center">
                <Gift className="w-4 h-4 text-amber-400" />
              </div>
            </div>
            <div className="mt-3">
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-extrabold font-display text-transparent bg-clip-text bg-gradient-to-r from-amber-300 to-yellow-400">
                  {userPoints.toLocaleString('pt-BR')}
                </span>
                <span className="text-xs font-bold text-slate-400 uppercase">pts</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Total acumulado na carreira: <strong className="text-slate-200">{totalEarned.toLocaleString('pt-BR')} pts</strong>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Badges & Conquistas Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Award className="w-6 h-6 text-amber-500" />
            <h3 className="font-display font-bold text-2xl text-slate-900 dark:text-white">
              Sua Coleção de Badges & Conquistas
            </h3>
          </div>
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            {badges.filter(b => b.unlocked).length} de {badges.length} desbloqueados
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {badges.map(badge => {
            const IconComponent = badge.icon;
            return (
              <motion.div
                key={badge.id}
                whileHover={{ y: -4, scale: 1.02 }}
                className={`relative rounded-2xl p-5 border transition-all flex flex-col justify-between ${
                  badge.unlocked 
                    ? `${badge.bgGradient} bg-white dark:bg-zinc-900 shadow-md` 
                    : 'bg-slate-100/70 dark:bg-zinc-900/40 border-slate-200 dark:border-zinc-800 opacity-60'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg ${
                      badge.unlocked 
                        ? `bg-gradient-to-br ${badge.color} text-slate-950` 
                        : 'bg-slate-300 dark:bg-zinc-800 text-slate-500'
                    }`}>
                      <IconComponent className="w-6 h-6" />
                    </div>
                    {badge.unlocked ? (
                      <span className="p-1 rounded-full bg-emerald-500/20 text-emerald-500" title="Desbloqueado">
                        <CheckCircle2 className="w-4 h-4" />
                      </span>
                    ) : (
                      <span className="p-1 rounded-full bg-slate-300 dark:bg-zinc-800 text-slate-400" title="Bloqueado">
                        <Lock className="w-4 h-4" />
                      </span>
                    )}
                  </div>

                  <h4 className="font-bold text-sm text-slate-900 dark:text-white leading-tight">
                    {badge.title}
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                    {badge.description}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-200/60 dark:border-zinc-800">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                    <span>Progresso</span>
                    <span>{badge.currentCount}/{badge.maxCount}</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        badge.unlocked ? 'bg-gradient-to-r from-amber-400 to-amber-500' : 'bg-slate-400'
                      }`}
                      style={{ width: `${badge.progress}%` }}
                    />
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Loja de Prêmios */}
      <div className="space-y-6 pt-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-6 h-6 text-amber-500" />
            <h3 className="font-display font-bold text-2xl text-slate-900 dark:text-white">
              Catálogo de Prêmios Disponíveis
            </h3>
          </div>

          {/* Categorias Filter */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {[
              { id: 'todos', label: 'Todos' },
              { id: 'pix', label: '💸 PIX Na Hora' },
              { id: 'voucher', label: '🎟️ Vouchers' },
              { id: 'beneficio', label: '🏖️ Benefícios' },
              { id: 'brinde', label: '🎁 Brindes' }
            ].map(cat => (
              <button
                key={cat.id}
                onClick={() => setFilterCategory(cat.id)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                  filterCategory === cat.id
                    ? 'bg-amber-400 text-slate-950 shadow-sm'
                    : 'bg-white dark:bg-zinc-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-800'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Grid de Prêmios */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredRewards.map(reward => {
            const RewardIcon = reward.imageIcon;
            const canAfford = userPoints >= reward.points;

            return (
              <motion.div
                key={reward.id}
                whileHover={{ y: -4 }}
                className="saas-card p-6 flex flex-col justify-between relative overflow-hidden group"
              >
                {reward.popular && (
                  <span className="absolute top-4 right-4 px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/30 font-bold text-[10px] uppercase tracking-wider">
                    🔥 Mais Trocado
                  </span>
                )}

                <div>
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <RewardIcon className="w-6 h-6" />
                  </div>

                  <h4 className="font-bold text-lg text-slate-900 dark:text-white leading-snug">
                    {reward.title}
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
                    {reward.description}
                  </p>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-100 dark:border-zinc-800/80 flex items-center justify-between gap-3">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Custo</span>
                    <span className="text-xl font-extrabold font-display text-amber-500">
                      {reward.points.toLocaleString('pt-BR')} <span className="text-xs">pts</span>
                    </span>
                  </div>

                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleRedeem(reward)}
                    disabled={!canAfford}
                    className={`px-5 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer shadow-sm ${
                      canAfford
                        ? 'bg-amber-400 hover:bg-yellow-400 text-slate-950 hover:shadow-md'
                        : 'bg-slate-100 dark:bg-zinc-800 text-slate-400 cursor-not-allowed border border-slate-200 dark:border-zinc-700'
                    }`}
                  >
                    <span>{canAfford ? 'Resgatar' : 'Pontos Insuficientes'}</span>
                  </motion.button>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Histórico de Resgates */}
      <div className="space-y-4 pt-4">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-amber-500" />
          <h3 className="font-display font-bold text-xl text-slate-900 dark:text-white">
            Seus Resgates Recentes
          </h3>
        </div>

        <div className="saas-card overflow-hidden">
          {resgates.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-zinc-900/50 border-b border-slate-200 dark:border-zinc-800 text-slate-400 text-[11px] uppercase tracking-wider font-bold">
                    <th className="px-6 py-3.5">ID Solicitado</th>
                    <th className="px-6 py-3.5">Prêmio</th>
                    <th className="px-6 py-3.5">Pontos</th>
                    <th className="px-6 py-3.5">Data</th>
                    <th className="px-6 py-3.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/60 text-xs">
                  {resgates.map(res => (
                    <tr key={res.id} className="hover:bg-slate-50/50 dark:hover:bg-zinc-900/30 transition-colors">
                      <td className="px-6 py-4 font-mono font-bold text-slate-500">{res.id}</td>
                      <td className="px-6 py-4 font-bold text-slate-900 dark:text-white">{res.rewardTitle}</td>
                      <td className="px-6 py-4 font-bold text-amber-500">-{res.pointsUsed} pts</td>
                      <td className="px-6 py-4 text-slate-500">{res.date}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          res.status === 'Concluído'
                            ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                            : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                        }`}>
                          {res.status === 'Concluído' ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                          {res.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center text-slate-400 text-xs">
              Você ainda não realizou nenhum resgate de prêmio.
            </div>
          )}
        </div>
      </div>

      {/* Modal de Confirmação de Resgate */}
      <AnimatePresence>
        {selectedReward && (
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-zinc-900 rounded-3xl max-w-md w-full p-6 sm:p-8 border border-slate-200 dark:border-zinc-800 shadow-2xl relative"
            >
              <button 
                onClick={() => setSelectedReward(null)}
                className="absolute top-6 right-6 p-2 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
                  <Gift className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-xl text-slate-900 dark:text-white">
                    Confirmar Resgate
                  </h3>
                  <p className="text-xs text-slate-500">Troca de pontos por recompensa</p>
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-zinc-800/50 rounded-2xl p-4 mb-6 border border-slate-200/60 dark:border-zinc-700/50 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Item Selecionado:</span>
                  <span className="font-bold text-slate-900 dark:text-white">{selectedReward.title}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Custo do Resgate:</span>
                  <span className="font-bold text-amber-500">-{selectedReward.points} pts</span>
                </div>
                <div className="flex justify-between text-xs pt-2 border-t border-slate-200/60 dark:border-zinc-700/50">
                  <span className="text-slate-500">Saldo Restante:</span>
                  <span className="font-bold text-emerald-500">{userPoints - selectedReward.points} pts</span>
                </div>
              </div>

              {/* PIX Key Input if PIX category */}
              {selectedReward.category === 'pix' && (
                <div className="mb-6 space-y-2">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    Sua Chave PIX (CPF, E-mail, Celular ou Aleatória)
                  </label>
                  <input
                    type="text"
                    value={pixKey}
                    onChange={(e) => setPixKey(e.target.value)}
                    placeholder="Ex: 000.000.000-00 ou email@pix.com"
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:border-amber-400 font-medium"
                  />
                </div>
              )}

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedReward(null)}
                  className="flex-1 py-3 border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirmRedeem}
                  disabled={isSubmitting}
                  className="flex-1 py-3 bg-amber-400 hover:bg-yellow-400 text-slate-950 font-bold text-xs rounded-xl shadow-sm hover:shadow transition-all flex items-center justify-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  <span>Confirmar Resgate</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
