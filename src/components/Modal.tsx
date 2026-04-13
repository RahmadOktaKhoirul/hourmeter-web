import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Icons } from '../lib/icons';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export default function Modal({ open, onClose, title, children }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2 }}
            className="relative z-10 w-full max-w-lg bg-surface rounded-3xl shadow-2xl border border-outline-variant/20 overflow-hidden"
          >
            <div className="flex items-center justify-between px-8 py-6 border-b border-outline-variant/10">
              <h2 className="text-xl font-headline font-bold text-on-surface tracking-tight">{title}</h2>
              <button onClick={onClose} className="p-2 rounded-xl text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-all">
                <Icons.ChevronRight className="w-5 h-5 rotate-180" />
              </button>
            </div>
            <div className="px-8 py-6">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// Reusable form field components
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">{label}</label>
      {children}
    </div>
  );
}

export const inputCls = "w-full bg-surface-container-high border border-outline-variant/20 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/40 outline-none transition-all";
export const selectCls = inputCls + " appearance-none cursor-pointer";
