import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'active' | 'danger';
  interactive?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  variant = 'default',
  interactive = false,
  className = '',
  ...props
}) => {
  const variantStyles: Record<string, React.CSSProperties> = {
    default: {
      backgroundColor: 'var(--c-bg-secondary)',
      borderColor: 'var(--c-border)'
    },
    active: {
      backgroundColor: 'var(--c-peach-surface)',
      borderColor: 'var(--c-peach-border)'
    },
    danger: {
      backgroundColor: 'var(--c-mint-surface)',
      borderColor: 'var(--c-mint-border)'
    }
  };

  return (
    <div
      {...props}
      style={{
        ...variantStyles[variant],
        ...props.style
      }}
      className={`rounded-xl border p-3 transition-colors ${
        interactive ? 'cursor-pointer hover:border-[var(--c-border-hover)]' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
};
