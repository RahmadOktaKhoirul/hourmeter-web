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
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.18 }}
            className="relative z-10 w-full max-w-lg bg-surface rounded-2xl shadow-xl border border-outline-variant/20 overflow-hidden"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/10">
              <h2 className="text-base font-semibold text-on-surface">{title}</h2>
              <button onClick={onClose} className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-all">
                <Icons.X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-6 py-5">{children}</div>
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
      <label className="block text-xs font-medium text-on-surface-variant">{label}</label>
      {children}
    </div>
  );
}

export const inputCls = "w-full bg-surface-container-low border border-outline-variant/30 rounded-lg px-3 py-2.5 text-sm text-on-surface focus:ring-2 focus:ring-primary/30 focus:border-primary/50 outline-none transition-all";
export const selectCls = inputCls + " appearance-none cursor-pointer";
