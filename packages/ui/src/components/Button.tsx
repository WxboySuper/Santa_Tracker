import * as React from 'react';

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost';
};

export function Button({ variant = 'primary', className, children, ...props }: ButtonProps): React.JSX.Element {
  const variants: Record<NonNullable<ButtonProps['variant']>, string> = {
    primary: 'st-button--primary',
    secondary: 'st-button--secondary',
    ghost: 'st-button--ghost',
  };
  const classes = ['st-button', variants[variant], className].filter(Boolean).join(' ');
  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}
