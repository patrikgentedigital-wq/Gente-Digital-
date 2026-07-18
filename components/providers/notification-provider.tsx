'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, X } from 'lucide-react';

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<{id: string, name: string}[]>([]);

  useEffect(() => {
    // Only subscribe if Supabase is properly configured
    const isSupabaseConfigured = process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder');
    if (!isSupabaseConfigured) return;

    const channel = supabase
      .channel('public:leads')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'leads' },
        (payload) => {
          const newLead = payload.new;
          // Use a simple counter or random for toast ID as it's not rendered in a loop that mutates during render phase
          const id = Math.random().toString(36).substring(7);
          setNotifications((prev) => [...prev, { id, name: newLead.name || 'Novo Lead' }]);
          
          setTimeout(() => {
            setNotifications((prev) => prev.filter((n) => n.id !== id));
          }, 5000);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const removeNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  return (
    <>
      {children}
      <div className="fixed top-20 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {notifications.map((n) => (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, x: 50, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
              className="pointer-events-auto flex items-start gap-3 bg-white dark:bg-[#27272a] p-4 rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-brand-border dark:border-gray-700 w-80"
            >
              <div className="p-2 bg-brand-yellow/20 rounded-full text-brand-yellow shrink-0 mt-0.5">
                <Bell className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-brand-charcoal dark:text-white text-sm">Novo Lead Recebido!</p>
                <p className="text-xs text-brand-muted dark:text-gray-400 truncate">{n.name}</p>
              </div>
              <button 
                onClick={() => removeNotification(n.id)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}
