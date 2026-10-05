import type { ReactNode } from 'react';

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from '@/components/ui/field';
import Input, { type InputProps } from '@/components/ui/input';

import { cn } from '@/lib/utils';

export type FieldInputProps = Omit<InputProps, 'id'> & {
  description?: ReactNode;
  descriptionClassName?: string;
  fieldClassName?: string;
  id: string;
  label: ReactNode;
  labelClassName?: string;
};

export const FieldInput = ({
  className,
  description,
  descriptionClassName,
  fieldClassName,
  id,
  label,
  labelClassName,
  variant = 'themed',
  ...inputProps
}: FieldInputProps) => (
  <Field className={cn('gap-2', fieldClassName)}>
    <FieldLabel
      className={cn('text-sm text-light-blue', labelClassName)}
      htmlFor={id}
    >
      {label}
    </FieldLabel>
    <FieldContent>
      <Input
        className={className}
        id={id}
        variant={variant}
        {...inputProps}
      />
    </FieldContent>
    {description ? (
      <FieldDescription
        className={cn('text-xs text-medium-blue', descriptionClassName)}
      >
        {description}
      </FieldDescription>
    ) : null}
  </Field>
);
