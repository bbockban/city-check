import { X } from 'lucide-react';
import {
  type ReactNode,
  useEffect,
} from 'react';

import { cn } from '@/lib/utils';

export type InspectorSidePanelProps = {
  children: ReactNode;
  className?: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  title: string;
};

export const InspectorSidePanel = ({
  children,
  className,
  onOpenChange,
  open,
  title,
}: InspectorSidePanelProps) => {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };

    window.addEventListener('keydown', onKeyDown);

    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onOpenChange, open]);

  if (!open) return null;

  return (
    <aside
      aria-label={title}
      className={cn(
        'pointer-events-auto absolute inset-y-0 right-0 z-50 flex w-[min(100%,26rem)] max-w-full flex-col overflow-hidden border-l border-gray-200/90 bg-white text-gray-900 shadow-[-12px_0_48px_rgba(0,0,0,0.14)]',
        className,
      )}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-3">
        <h2 className="text-base font-semibold tracking-tight">
          {title}
        </h2>
        <button
          aria-label="Cerrar"
          className="rounded-full p-2 text-gray-600 hover:bg-gray-100"
          type="button"
          onClick={() => onOpenChange(false)}
        >
          <X className="size-5" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-3">
        {children}
      </div>
    </aside>
  );
};
