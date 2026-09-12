import React from 'react';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'peach' | 'mint' | 'neutral' | 'outline';
  size?: 'sm' | 'md';
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'neutral',
  size = 'md',
  className = '',
  ...props
}) => {
  const sizeClasses = {
    sm: 'text-[10px] px-1.5 py-0.5',
    md: 'text-[11px] px-2 py-0.5'
  }[size];

  const variantStyles: Record<string, React.CSSProperties> = {
    peach: {
      backgroundColor: 'var(--c-peach-surface)',
      color: 'var(--c-peach-light)',
      borderColor: 'var(--c-peach-border)'
    },
    mint: {
      backgroundColor: 'var(--c-mint-surface)',
      color: 'var(--c-mint-light)',
      borderColor: 'var(--c-mint-border)'
    },
    neutral: {
      backgroundColor: 'var(--c-bg-tertiary)',
      color: 'var(--c-text-muted)',
      borderColor: 'var(--c-border)'
    },
    outline: {
      backgroundColor: 'transparent',
      color: 'var(--c-text)',
      borderColor: 'var(--c-border)'
    }
  };

  return (
    <span
      {...props}
      style={{
        ...variantStyles[variant],
        ...props.style
      }}
      className={`inline-flex items-center gap-1 font-medium font-mono rounded border whitespace-nowrap select-none ${sizeClasses} ${className}`}
    >
      {children}
    </span>
  );
};
