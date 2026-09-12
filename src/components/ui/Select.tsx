import React from 'react';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  icon?: React.ReactNode;
}

export const Select: React.FC<SelectProps> = ({
  children,
  icon,
  className = '',
  ...props
}) => {
  return (
    <div className="relative flex items-center w-full">
      {icon && (
        <div className="absolute left-2.5 text-[var(--c-text-muted)] pointer-events-none flex items-center">
          {icon}
        </div>
      )}
      <select
        {...props}
        style={{
          backgroundColor: 'var(--c-bg-tertiary)',
          borderColor: 'var(--c-border)',
          color: 'var(--c-text)',
          ...props.style
        }}
        className={`w-full h-8 rounded-lg border text-xs outline-none transition-all appearance-none cursor-pointer focus:border-[var(--c-peach)] focus:ring-1 focus:ring-[var(--c-peach)]/30 ${
          icon ? 'pl-8' : 'px-3'
        } pr-8 ${className}`}
      >
        {children}
      </select>
      <div className="absolute right-2.5 pointer-events-none text-[var(--c-text-muted)] text-[10px]">
        ▼
      </div>
    </div>
  );
};
