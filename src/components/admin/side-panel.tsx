'use client';

import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface SidePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}

/**
 * Slide-over panel from the right (promo code creation).
 * Full-width on small screens, 400px rail on desktop.
 */
export function SidePanel({
  open,
  onOpenChange,
  title,
  description,
  children,
}: SidePanelProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="fixed inset-y-0 right-0 left-auto m-0 h-full w-full max-w-none translate-x-0 translate-y-0 rounded-none border-l border-line bg-surface p-0 data-[state=closed]:translate-x-0 data-[state=open]:slide-in-from-right-0 [&>button:last-child]:hidden sm:w-[400px] sm:max-w-[400px]">
        <DialogHeader className="flex h-16 flex-row items-center justify-between border-b border-line px-4 text-left">
          <div>
            <DialogTitle className="text-sm font-medium text-paper">{title}</DialogTitle>
            {description && (
              <DialogDescription className="font-mono text-[11px] text-paper-60">
                {description}
              </DialogDescription>
            )}
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Close panel"
            className="rounded-card p-2 text-paper-60 hover:bg-paper-12 hover:text-paper"
          >
            <X size={16} />
          </button>
        </DialogHeader>
        <div className="h-[calc(100%-4rem)] overflow-y-auto p-4">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
