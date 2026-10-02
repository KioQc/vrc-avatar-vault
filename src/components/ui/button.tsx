import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../utils/cn';
const variants = cva('button', {
  variants: {
    variant: { default: 'primary', secondary: 'secondary', ghost: 'ghost', destructive: 'danger' },
    size: { default: '', sm: 'small', icon: 'icon-button' },
  },
  defaultVariants: { variant: 'secondary', size: 'default' },
});
export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof variants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      className={cn(variants({ variant, size }), className)}
      {...props}
      title={props.title ?? props['aria-label']}
    />
  );
}
