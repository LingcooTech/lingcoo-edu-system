import { Slot as SlotPrimitive } from 'radix-ui';
import * as React from 'react';

import { cn } from '@/lib/utils';

type ButtonVariant = 'default' | 'primary' | 'destructive' | 'danger' | 'outline' | 'secondary' | 'ghost' | 'link';
type ButtonSize = 'default' | 'sm' | 'md' | 'lg' | 'icon';

const variantClasses: Record<ButtonVariant, string> = {
  default: 'bg-primary text-primary-foreground hover:bg-primary/90',
  primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
  destructive: 'bg-red-600 text-white hover:bg-red-700',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  outline: 'border bg-card text-foreground hover:bg-muted',
  secondary: 'bg-muted text-foreground hover:bg-muted/80',
  ghost: 'text-foreground hover:bg-muted',
  link: 'text-primary underline-offset-4 hover:underline',
};

const sizeClasses: Record<ButtonSize, string> = {
  default: 'h-10 px-4 py-2',
  sm: 'h-9 px-3.5 text-sm',
  md: 'h-10 px-4 py-2',
  lg: 'h-11 px-6 text-base',
  icon: 'h-10 w-10',
};

export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'prefix'> {
  asChild?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'default',
      size = 'default',
      block = false,
      asChild = false,
      type,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? SlotPrimitive.Root : 'button';

    return (
      <Comp
        ref={ref}
        className={cn(
          'ring-offset-background focus-visible:ring-ring inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-[14px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
          variantClasses[variant],
          sizeClasses[size],
          block && 'w-full',
          className,
        )}
        type={asChild ? undefined : type ?? 'button'}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { Button };
