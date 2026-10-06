import type { ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
// shadcn/ui Button pattern, adapted to WISE tokens; native button semantics.
const variants = cva('button', { variants: { variant: { default: 'button-primary', outline: 'button-outline', ghost: 'button-ghost', destructive: 'button-danger' } }, defaultVariants: { variant: 'default' } });
export function Button({ className, variant, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof variants>) { return <button className={twMerge(clsx(variants({ variant }), className))} {...props} />; }
