import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'secondary',
  size = 'md',
  icon,
  className = '',
  disabled,
  ...props
}) => {
  const sizeClasses = {
    sm: 'h-7 px-2.5 text-xs gap-1.5',
    md: 'h-8 px-3 text-xs gap-2',
    lg: 'h-9 px-4 text-sm gap-2.5'
  }[size];

  const variantStyles: Record<string, React.CSSProperties> = {
    primary: {
      backgroundColor: 'var(--c-peach)',
      color: '#111318',
      fontWeight: 600,
      border: '1px solid transparent'
    },
    secondary: {
      backgroundColor: 'var(--c-bg-tertiary)',
      color: 'var(--c-text)',
      border: '1px solid var(--c-border)'
    },
    outline: {
      backgroundColor: 'transparent',
      color: 'var(--c-text)',
      border: '1px solid var(--c-border)'
    },
    ghost: {
      backgroundColor: 'transparent',
      color: 'var(--c-text-muted)',
      border: '1px solid transparent'
    },
    danger: {
      backgroundColor: 'var(--c-mint-surface)',
      color: 'var(--c-mint-light)',
      border: '1px solid var(--c-mint-border)'
    }
  };

  return (
    <button
      {...props}
      disabled={disabled}
      style={{
        ...variantStyles[variant],
        ...props.style
      }}
      className={`inline-flex items-center justify-center rounded-lg font-medium whitespace-nowrap transition-all select-none disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] ${sizeClasses} ${className}`}
    >
      {icon && <span className="shrink-0 flex items-center">{icon}</span>}
      {children && <span className="truncate">{children}</span>}
    </button>
  );
};
