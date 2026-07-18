'use client';

import { Users as UsersIcon, Target, MousePointerClick, TrendingUp, Trophy, Medal } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import Avatar from 'boring-avatars';

const chartData = [
  { name: 'Jan', novas: 40, emContato: 24, emNegociacao: 15, vencemos: 10, perdemos: 5 },
  { name: 'Fev', novas: 50, emContato: 30, emNegociacao: 20, vencemos: 12, perdemos: 8 },
  { name: 'Mar', novas: 65, emContato: 45, emNegociacao: 30, vencemos: 18, perdemos: 10 },
  { name: 'Abr', novas: 80, emContato: 55, emNegociacao: 35, vencemos: 25, perdemos: 12 },
  { name: 'Mai', novas: 95, emContato: 70, emNegociacao: 45, vencemos: 32, perdemos: 15 },
  { name: 'Jun', novas: 110, emContato: 85, emNegociacao: 55, vencemos: 40, perdemos: 20 },
];

export function DashboardView() {
  const topColaboradores = [
    { initials: 'AC', name: 'Ana Costa', points: 120, conversions: 12, rank: 1, color: 'text-amber-500', bg: 'bg-amber-100' },
    { initials: 'CO', name: 'Carlos Oliveira', points: 85, conversions: 8, rank: 2, color: 'text-gray-400', bg: 'bg-gray-100' },
    { initials: 'BS', name: 'Beatriz Souza', points: 60, conversions: 5, rank: 3, color: 'text-amber-700', bg: 'bg-amber-50' },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-300 pb-12">
      <div>
        <h2 className="font-display text-3xl font-bold text-brand-charcoal dark:text-white">Dashboard</h2>
        <p className="text-brand-muted dark:text-gray-400 mt-1">Visão geral do desempenho de indicações e leads.</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard icon={UsersIcon} title="Total de Leads" value="1,248" trend="+12% este mês" trendUp={true} />
        <StatCard icon={Target} title="Conversões" value="384" trend="+5% este mês" trendUp={true} />
        <StatCard icon={MousePointerClick} title="Cliques em Links" value="8,492" trend="+22% este mês" trendUp={true} />
        <StatCard icon={TrendingUp} title="Taxa de Conversão" value="30.7%" trend="-1.2% este mês" trendUp={false} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Gráfico */}
        <div className="lg:col-span-2 bg-white dark:bg-[#18181b] rounded-2xl border border-brand-border dark:border-gray-800 shadow-sm p-6 flex flex-col min-h-[420px] transition-colors">
          <div className="mb-6">
            <h3 className="font-bold text-lg text-brand-charcoal dark:text-white">Desempenho de Leads por Mês</h3>
            <p className="text-sm text-brand-muted dark:text-gray-400">Comparativo de status de conversão ao longo do tempo.</p>
          </div>
          <div className="flex-1 w-full h-full min-h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" className="dark:stroke-gray-700" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#83868C', fontSize: 12 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#83868C', fontSize: 12 }} />
                <Tooltip 
                  cursor={{ fill: 'transparent' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', fontWeight: 500 }}
                />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px', fontSize: '13px', fontWeight: 500 }} />
                <Bar dataKey="novas" name="Novas Indicações" fill="#e5e7eb" radius={[4, 4, 0, 0]} maxBarSize={40} />
                <Bar dataKey="emContato" name="Em Contato" fill="#93c5fd" radius={[4, 4, 0, 0]} maxBarSize={40} />
                <Bar dataKey="emNegociacao" name="Em Negociação" fill="#fcd34d" radius={[4, 4, 0, 0]} maxBarSize={40} />
                <Bar dataKey="vencemos" name="Vencemos" fill="#4ade80" radius={[4, 4, 0, 0]} maxBarSize={40} />
                <Bar dataKey="perdemos" name="Perdemos" fill="#f87171" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Leaderboard - Top Colaboradores */}
        <div className="bg-white dark:bg-[#18181b] rounded-2xl border border-brand-border dark:border-gray-800 shadow-sm p-6 flex flex-col h-[420px] transition-colors">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 bg-brand-yellow/20 rounded-xl text-brand-charcoal dark:text-brand-yellow">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-brand-charcoal dark:text-white leading-tight">Top Colaboradores</h3>
              <p className="text-xs text-brand-muted dark:text-gray-400">Ranking do Mês</p>
            </div>
          </div>
          
          <div className="flex-1 flex flex-col gap-3 overflow-y-auto pr-1">
            {topColaboradores.map((colab) => (
              <div key={colab.rank} className="flex items-center gap-4 p-4 rounded-xl border border-brand-border dark:border-gray-800 bg-gray-50/50 dark:bg-[#27272a]/50 hover:bg-gray-50 dark:hover:bg-[#27272a] transition-colors">
                <div className="relative">
                  <Avatar size={40} name={colab.name} variant="beam" colors={['#FFC700', '#2E2D32', '#F9FAFB', '#D1D5DB', '#9CA3AF']} />
                  <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full ${colab.bg} ${colab.color} border-2 border-white dark:border-gray-800 flex items-center justify-center text-[10px] font-bold shadow-sm`}>
                    {colab.rank}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-brand-charcoal dark:text-white text-sm truncate">{colab.name}</p>
                  <p className="text-xs text-brand-muted dark:text-gray-400 truncate">{colab.conversions} conversões</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-brand-charcoal dark:text-white text-sm">{colab.points}</p>
                  <p className="text-[10px] text-brand-muted dark:text-gray-400 font-medium uppercase">Pts</p>
                </div>
              </div>
            ))}
          </div>
          
          <button className="w-full mt-4 py-3 border border-brand-border dark:border-gray-700 text-brand-charcoal dark:text-white text-sm font-semibold rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            Ver Ranking Completo
          </button>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, title, value, trend, trendUp }: any) {
  return (
    <div className="bg-white dark:bg-[#18181b] p-6 rounded-2xl border border-brand-border dark:border-gray-800 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2.5 bg-brand-yellow/20 rounded-xl text-brand-charcoal dark:text-brand-yellow">
          <Icon className="w-5 h-5" />
        </div>
        <h3 className="font-semibold text-brand-muted dark:text-gray-400 text-sm">{title}</h3>
      </div>
      <p className="font-display text-4xl font-bold text-brand-charcoal dark:text-white mb-2">{value}</p>
      <p className={`text-xs font-bold ${trendUp ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
        {trend}
      </p>
    </div>
  );
}

