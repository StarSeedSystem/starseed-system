"use client";

import * as React from "react"

import { cn } from "@/lib/utils"
import { useAppearance } from "@/context/appearance-context";

import { LiquidGlassWrapper } from "@/components/ui/LiquidGlassWrapper";

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { liquid?: boolean }
>(({ className, liquid, ...props }, ref) => {
  const { config } = useAppearance();
  const isCrystal = config.themeStore.activeMode === 'crystal';
  const isPrimary = config.themeStore.activeMode === 'primary';

  const cardContent = (
    <div
      ref={ref}
      className={cn(
        "rounded-lg border bg-card text-card-foreground shadow-sm transition-all duration-300",
        // Default glass effect if not crystal
        (!isCrystal && !isPrimary) && "bg-card/80 backdrop-blur-xl border-white/10",
        // Crystal effect overrides
        isCrystal && "crystal-window text-foreground border-transparent",
        // Primary (Liquid) effect overrides: remove default bg/border to let glass show
        isPrimary && "bg-transparent/10 border-white/10 text-white shadow-none backdrop-blur-none",
        "data-[liquid-ui=true]:liquid-glass-ui",
        className
      )}
      data-component="card"
      {...props}
    />
  );

  if (liquid) {
    return (
      <LiquidGlassWrapper className="rounded-xl">
        {cardContent}
      </LiquidGlassWrapper>
    );
  }

  return cardContent;
})
Card.displayName = "Card"

// Header, Title, Description, Content, Footer remain unchanged but imports need to be consistent
const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props}
  />
))
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "text-2xl font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
))
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
