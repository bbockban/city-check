import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'cursor-pointer inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    defaultVariants: {
      size: 'default',
      variant: 'default',
    },
    variants: {
      size: {
        default: 'h-9 px-4 py-2',
        icon: 'h-9 w-9',
        lg: 'h-10 rounded-md px-8',
        sm: 'h-8 rounded-md px-3 text-xs',
      },
      variant: {
        default: 'bg-primary text-light-blue shadow hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        gradient: 'bg-gradient-to-r from-medium-blue to-light-blue text-primary shadow-lg shadow-medium-blue/30 hover:from-light-blue hover:to-medium-blue transition-all',
        link: 'text-primary underline-offset-4 hover:underline',
        outline: 'border border-medium-blue bg-transparent text-light-blue shadow-sm hover:bg-medium-blue/10',
        secondary: 'bg-dark-green text-white shadow-sm hover:bg-dark-green/80',
      },
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
  VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({
    className,
    variant,
    size,
    asChild = false,
    ...props
  }, ref) => {
    const Comp = asChild ? Slot : 'button';

    return (
      <Comp
        className={cn(buttonVariants({ className, size, variant }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
