import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
  rightElement?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ icon, rightElement, className = '', ...props }, ref) => {
    return (
      <div className="relative flex items-center w-full">
        {icon && (
          <div className="absolute left-2.5 text-[var(--c-text-muted)] pointer-events-none flex items-center">
            {icon}
          </div>
        )}
        <input
          ref={ref}
          {...props}
          style={{
            backgroundColor: 'var(--c-bg-tertiary)',
            borderColor: 'var(--c-border)',
            color: 'var(--c-text)',
            ...props.style
          }}
          className={`w-full h-8 rounded-lg border text-xs outline-none transition-all placeholder:text-[var(--c-text-muted)] focus:border-[var(--c-peach)] focus:ring-1 focus:ring-[var(--c-peach)]/30 ${
            icon ? 'pl-8' : 'px-3'
          } ${rightElement ? 'pr-8' : 'pr-3'} ${className}`}
        />
        {rightElement && (
          <div className="absolute right-2 flex items-center">
            {rightElement}
          </div>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
