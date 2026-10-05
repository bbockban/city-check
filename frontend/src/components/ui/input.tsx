import { type ComponentProps, forwardRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const inputVariants = cva(
  [
    'flex h-9 w-full rounded-md border px-3 py-1 text-base transition-colors md:text-sm',
    'file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground',
    'focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
  ].join(' '),
  {
    defaultVariants: { variant: 'default' },
    variants: {
      variant: {
        default: [
          'border-input bg-transparent shadow-sm text-foreground placeholder:text-muted-foreground',
          'focus-visible:ring-1 focus-visible:ring-ring',
        ].join(' '),
        themed: [
          'border-medium-blue bg-primary text-light-blue shadow-none',
          'placeholder:text-medium-blue/70',
          'focus-visible:border-medium-blue focus-visible:ring-1 focus-visible:ring-medium-blue',
        ].join(' '),
      },
    },
  },
);

export type InputProps = ComponentProps<'input'> & VariantProps<typeof inputVariants>;

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({
    className, type, variant, ...props
  }, ref) => (
    <input
      type={type}
      className={cn(inputVariants({ variant }), className)}
      ref={ref}
      {...props}
    />
  ),
);

Input.displayName = 'Input';

export default Input;
