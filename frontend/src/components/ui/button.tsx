import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/src/lib/utils";

const buttonVariants = cva(
  "inline-flex h-button items-center justify-center rounded-md bg-emerald px-4 font-sans text-body-sm font-h2 text-white transition-colors hover:bg-deep-forest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald disabled:pointer-events-none disabled:opacity-50",
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ asChild = false, className, ...props }: ButtonProps) {
  const Component = asChild ? Slot : "button";
  return <Component className={cn(buttonVariants(), className)} {...props} />;
}
