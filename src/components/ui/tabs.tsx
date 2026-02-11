"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as React from "react";

import { useAppearance } from "@/context/appearance-context";
import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;

// Import LiquidGlassWrapper
import { LiquidGlassWrapper } from "./LiquidGlassWrapper";

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => {
  const { config } = useAppearance();
  // Check for 'glass' preset being active OR 'primary' mode
  // config.styling.style does not exist. We check crystalPreset or mode.
  const isGlassPreset = config.styling.crystalPreset !== 'none';
  const isPrimary = config.themeStore.activeMode === 'primary';
  const isCrystal = isGlassPreset || isPrimary;

  if (isPrimary) {
    return (
      <LiquidGlassWrapper
        displacementScale={30}
        blurAmount={0.2}
        saturation={1.1} // Slightly less saturated than buttons to be subtle
        elasticity={0.2}
        className="rounded-lg overflow-hidden"
        forceActive={true}
      >
        <TabsPrimitive.List
          ref={ref}
          className={cn(
            "inline-flex items-center justify-center rounded-lg bg-transparent p-1 text-muted-foreground/70 relative z-10",
            className,
          )}
          {...props}
        />
      </LiquidGlassWrapper>
    )
  }

  return (
    <TabsPrimitive.List
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center rounded-lg bg-muted p-0.5 text-muted-foreground/70",
        isCrystal && "crystal-tab-list bg-transparent",
        className,
      )}
      {...props}
    />
  );
});
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => {
  const { config } = useAppearance();
  // Check for 'glass' preset being active OR 'primary' mode
  const isGlassPreset = config.styling.crystalPreset !== 'none';
  const isPrimary = config.themeStore.activeMode === 'primary';
  const isCrystal = isGlassPreset || isPrimary;

  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium outline-offset-2 transition-all hover:text-muted-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:shadow-black/5",
        isCrystal && "crystal-tab-trigger data-[state=active]:bg-transparent data-[state=active]:shadow-none",
        className,
      )}
      {...props}
    />
  );
});
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsContent, TabsList, TabsTrigger };
