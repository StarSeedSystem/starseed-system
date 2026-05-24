"use client";

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { useAppearance } from "@/context/appearance-context"
import { LiquidGlassWrapper } from "@/components/ui/LiquidGlassWrapper"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-6 py-2", // Slightly larger base for organic feel
        sm: "h-9 rounded-full px-4",
        lg: "h-12 rounded-full px-8 text-base", // Larger tap targets
        icon: "h-11 w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
  VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const { config } = useAppearance();
    const isPrimary = config.themeStore.activeMode === 'primary';
    const Comp = asChild ? Slot : "button"

    const buttonContent = (
      <Comp
        className={cn(
          buttonVariants({ variant, size, className }),
          "transition-all duration-300 shadcn-button",
          isPrimary && "bg-background/20 hover:bg-background/30 border-foreground/10 text-foreground shadow-lg backdrop-blur-sm"
        )}
        data-component="button"
        ref={ref}
        {...props}
      />
    );

    if (isPrimary && variant !== 'link' && variant !== 'ghost') {
      const isSecondary = variant === 'secondary' || variant === 'outline';

      if (asChild) {
        return (
          <Comp
            className={cn(
              buttonVariants({ variant, size, className }),
              isSecondary ? "liquid-glass-panel border-opacity-50" : "bg-white/10 hover:bg-white/20 border border-white/20 backdrop-blur-md transition-all duration-300",
              "text-foreground shadow-lg relative z-10 drop-shadow-sm",
            )}
            data-component="button"
            ref={ref}
            {...props}
          />
        );
      }

      // Native Pure CSS Glass Injection
      return (
        <button
          className={cn(
            buttonVariants({ variant, size, className }),
            "relative overflow-hidden transition-all duration-300 text-foreground bg-white/5 hover:bg-white/15 border border-white/20 shadow-lg backdrop-blur-md group/glassbtn",
          )}
          data-component="button"
          ref={ref}
          {...props}
        >
          <div className="absolute inset-0 z-0 bg-gradient-to-tr from-white/5 via-transparent to-white/10 opacity-0 group-hover/glassbtn:opacity-100 transition-opacity duration-500 pointer-events-none" />
          <span className="relative z-10 drop-shadow-sm flex items-center justify-center gap-2">
            {props.children}
          </span>
        </button>
      );
    }

    return buttonContent;
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
