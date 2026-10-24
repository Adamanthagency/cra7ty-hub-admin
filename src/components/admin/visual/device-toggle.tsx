'use client';

import { cn } from '@/lib/utils';

/**
 * Preview width presets for the visual editor frame. The toggle is
 * hidden below 768px (the parent forces phone width there), matching
 * the spec: device choice only exists where there is room for it.
 */
export const DEVICES = {
  phone: { label: 'Phone', width: 390 },
  tablet: { label: 'Tablet', width: 768 },
  desktop: { label: 'Desktop', width: 1440 },
} as const;

export type DeviceKey = keyof typeof DEVICES;

interface DeviceToggleProps {
  value: DeviceKey;
  onChange: (device: DeviceKey) => void;
}

export function DeviceToggle({ value, onChange }: DeviceToggleProps) {
  return (
    <div
      role="group"
      aria-label="Preview device width"
      className="hidden items-center rounded-card border border-line p-0.5 md:inline-flex"
    >
      {(Object.keys(DEVICES) as DeviceKey[]).map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          aria-pressed={value === key}
          className={cn(
            'rounded-[3px] px-3 py-1.5 font-mono text-[11px] transition-colors',
            value === key ? 'bg-paper-12 text-paper' : 'text-paper-60 hover:text-paper'
          )}
        >
          {DEVICES[key].label} {DEVICES[key].width}
        </button>
      ))}
    </div>
  );
}
