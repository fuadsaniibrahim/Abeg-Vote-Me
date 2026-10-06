import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { useId } from 'react';

type ButtonVariant = 'primary' | 'ghost';

export function Button({ variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 font-semibold transition disabled:cursor-not-allowed disabled:opacity-60';
  const styles: Record<ButtonVariant, string> = {
    primary: 'bg-naija-600 text-white shadow-sm hover:bg-naija-700 active:scale-[0.98]',
    ghost: 'border border-naija-600/40 text-naija-700 hover:bg-naija-50 dark:text-naija-100 dark:hover:bg-naija-900/50',
  };
  return <button className={`${base} ${styles[variant]} ${className}`} {...props} />;
}

export function TextField({ label, hint, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        aria-describedby={hintId}
        className="rounded-xl border border-black/15 bg-white px-4 py-3 text-base text-ink outline-none focus:border-naija-600 dark:border-white/15 dark:bg-[#12201a] dark:text-naija-50"
        {...props}
      />
      {hint && (
        <p id={hintId} className="text-xs opacity-70">
          {hint}
        </p>
      )}
    </div>
  );
}

export function Alert({ kind = 'error', children }: { kind?: 'error' | 'success' | 'info'; children: ReactNode }) {
  const styles = {
    error: 'border-red-600/30 bg-red-50 text-red-800 dark:bg-red-950/50 dark:text-red-200',
    success: 'border-naija-600/30 bg-naija-50 text-naija-900 dark:bg-naija-900/50 dark:text-naija-50',
    info: 'border-sky-600/30 bg-sky-50 text-sky-900 dark:bg-sky-950/50 dark:text-sky-100',
  }[kind];
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={`rounded-xl border px-4 py-3 text-sm ${styles}`}>
      {children}
    </div>
  );
}

/** Green-white-green flag mark, inline SVG (no image assets). */
export function FlagMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 30 30" aria-hidden="true" className="rounded-md shadow-sm">
      <rect width="10" height="30" fill="#008751" />
      <rect x="10" width="10" height="30" fill="#ffffff" />
      <rect x="20" width="10" height="30" fill="#008751" />
    </svg>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#101c16] ${className}`}>{children}</div>;
}
