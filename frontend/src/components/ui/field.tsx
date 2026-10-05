import { useMemo, type ComponentProps } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { Label } from '@/components/ui/label';

import { cn } from '@/lib/utils';

const FieldSet = ({ className, ...props }: ComponentProps<'fieldset'>) => (
  <fieldset
    data-slot="field-set"
    className={cn(
      'flex flex-col gap-6',
      'has-[>[data-slot=checkbox-group]]:gap-3 has-[>[data-slot=radio-group]]:gap-3',
      className,
    )}
    {...props}
  />
);

const FieldLegend = ({
  className,
  variant = 'legend',
  ...props
}: ComponentProps<'legend'> & { variant?: 'legend' | 'label' }) => (
  <legend
    data-slot="field-legend"
    data-variant={variant}
    className={cn(
      'mb-3 font-medium',
      'data-[variant=legend]:text-base',
      'data-[variant=label]:text-sm',
      className,
    )}
    {...props}
  />
);

const FieldGroup = ({ className, ...props }: ComponentProps<'div'>) => (
  <div
    data-slot="field-group"
    className={cn(
      'group/field-group @container/field-group flex w-full flex-col gap-7 data-[slot=checkbox-group]:gap-3 *:data-[slot=field-group]:gap-4',
      className,
    )}
    {...props}
  />
);

const fieldVariants = cva(
  'group/field data-[invalid=true]:text-destructive flex w-full gap-3',
  {
    defaultVariants: { orientation: 'vertical' },
    variants: {
      orientation: {
        horizontal: [
          'flex-row items-center',
          '[&>[data-slot=field-label]]:flex-auto',
          'has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px has-[>[data-slot=field-content]]:items-start',
        ],
        responsive: [
          '@md/field-group:flex-row @md/field-group:items-center @md/field-group:[&>*]:w-auto flex-col [&>*]:w-full [&>.sr-only]:w-auto',
          '@md/field-group:[&>[data-slot=field-label]]:flex-auto',
          '@md/field-group:has-[>[data-slot=field-content]]:items-start @md/field-group:has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px',
        ],
        vertical: ['flex-col [&>*]:w-full [&>.sr-only]:w-auto'],
      },
    },
  },
);

const Field = ({
  className,
  orientation = 'vertical',
  ...props
}: ComponentProps<'div'> & VariantProps<typeof fieldVariants>) => (
  <div
    role="group"
    data-slot="field"
    data-orientation={orientation}
    className={cn(fieldVariants({ orientation }), className)}
    {...props}
  />
);

const FieldContent = ({ className, ...props }: ComponentProps<'div'>) => (
  <div
    data-slot="field-content"
    className={cn(
      'group/field-content flex flex-1 flex-col gap-1.5 leading-snug',
      className,
    )}
    {...props}
  />
);

const FieldLabel = ({
  className,
  ...props
}: ComponentProps<typeof Label>) => (
  <Label
    data-slot="field-label"
    className={cn(
      'group/field-label peer/field-label flex w-fit gap-2 leading-snug group-data-[disabled=true]/field:opacity-50',
      'has-[>[data-slot=field]]:w-full has-[>[data-slot=field]]:flex-col has-[>[data-slot=field]]:rounded-md has-[>[data-slot=field]]:border *:data-[slot=field]:p-4',
      'has-data-[state=checked]:bg-primary/5 has-data-[state=checked]:border-primary dark:has-data-[state=checked]:bg-primary/10',
      className,
    )}
    {...props}
  />
);

const FieldTitle = ({ className, ...props }: ComponentProps<'div'>) => (
  <div
    data-slot="field-label"
    className={cn(
      'flex w-fit items-center gap-2 text-sm font-medium leading-snug group-data-[disabled=true]/field:opacity-50',
      className,
    )}
    {...props}
  />
);

const FieldDescription = ({ className, ...props }: ComponentProps<'p'>) => (
  <p
    data-slot="field-description"
    className={cn(
      'text-muted-foreground text-sm font-normal leading-normal group-has-data-[orientation=horizontal]/field:text-balance',
      'nth-last-2:-mt-1 last:mt-0 [[data-variant=legend]+&]:-mt-1.5',
      '[&>a:hover]:text-primary [&>a]:underline [&>a]:underline-offset-4',
      className,
    )}
    {...props}
  />
);

const FieldError = ({
  className,
  children,
  errors,
  ...props
}: ComponentProps<'div'> & {
  errors?: Array<{ message?: string } | undefined>
}) => {
  const content = useMemo(() => {
    if (children) {
      return children;
    }

    if (!errors) {
      return null;
    }

    if (errors?.length === 1 && errors[0]?.message) {
      return errors[0].message;
    }

    return (
      <ul className="ml-4 flex list-disc flex-col gap-1">
        {errors.map(
          (error: { message?: string } | undefined, index: number) =>
            error?.message ? (
              <li key={index}>{error.message}</li>
            ) : null,
        )}
      </ul>
    );
  }, [children, errors]);

  if (!content) {
    return null;
  }

  return (
    <div
      role="alert"
      data-slot="field-error"
      className={cn('text-destructive text-sm font-normal', className)}
      {...props}
    >
      {content}
    </div>
  );
};

export {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLegend,
  FieldSet,
  FieldContent,
  FieldTitle,
};
