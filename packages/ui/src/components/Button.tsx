import * as React from 'react';

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost';
};

export function Button({ variant = 'primary', className, children, ...props }: ButtonProps): React.JSX.Element {
  const base =
    'inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50';
  const variants: Record<NonNullable<ButtonProps['variant']>, string> = {
    primary: 'bg-red-600 text-white hover:bg-red-700 focus-visible:outline-red-600',
    secondary: 'bg-slate-100 text-slate-900 hover:bg-slate-200',
    ghost: 'bg-transparent hover:bg-slate-100 text-slate-900',
  };
  const classes = [base, variants[variant], className].filter(Boolean).join(' ');
  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}
