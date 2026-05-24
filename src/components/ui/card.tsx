"use client";

import * as React from "react"
import { motion, useMotionTemplate, useMotionValue, useSpring, useTransform, useAnimation } from "framer-motion";
import { cn } from "@/lib/utils"
import { useAppearance } from "@/context/appearance-context";

import { LiquidGlassWrapper } from "@/components/ui/LiquidGlassWrapper";

/**
 * Crystal theme presets — each maps to a CSS class that defines
 * custom properties (--crystal-glow, --crystal-accent, etc.)
 * These produce animated, contextual 3D glass effects WITHOUT a Spline canvas.
 */
export type CrystalTheme =
  | 'emerald'       // Kp Index / Geomagnetic — green aurora
  | 'solar-wind'    // Solar Wind — orange plasma
  | 'flare'         // X-Ray Flare — fuchsia/magenta
  | 'magnetometer'  // Magnetometer — deep blue
  | 'schumann'      // Schumann Resonance — teal
  | 'cosmic'        // Generic cosmic — purple/indigo
  | 'gold'          // Solar / sun imagery — amber/gold
  | 'ice'           // Ionospheric — ice blue
  | 'none';         // No crystal effect

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  liquid?: boolean;
  splineDepth?: number;
  interactive?: boolean;
  /** Crystal theme for liquid crystal 3D CSS effects — replaces per-widget Spline */
  crystalTheme?: CrystalTheme;
  /** Data-driven intensity (0-1) — controls animation speed and glow strength */
  crystalIntensity?: number;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, children, liquid, splineDepth = 30, interactive = true, crystalTheme = 'none', crystalIntensity = 0.5, ...props }, ref) => {
    const { config } = useAppearance();
    const isCrystal = config.themeStore.activeMode === 'crystal';
    const isPrimary = config.themeStore.activeMode === 'primary';

    // Use crystal effects in primary mode or when crystalTheme is explicitly set
    const useCrystalEffects = isPrimary || crystalTheme !== 'none';

    // --- NATIVE CSS 3D PHYSICS ---
    const x = useMotionValue(0);
    const y = useMotionValue(0);

    // Smooth springs for liquid movement
    const mouseXSpring = useSpring(x, { stiffness: 150, damping: 20 });
    const mouseYSpring = useSpring(y, { stiffness: 150, damping: 20 });

    // Map mouse to 3D rotation — reduced on mobile for stability
    const [maxTilt, setMaxTilt] = React.useState(7);
    React.useEffect(() => {
      if (typeof window !== 'undefined') {
        setMaxTilt(window.innerWidth < 768 ? 3 : 7);
      }
    }, []);

    const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], [`${maxTilt}deg`, `-${maxTilt}deg`]);
    const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], [`-${maxTilt}deg`, `${maxTilt}deg`]);

    // Dynamic glare that follows mouse
    const glareX = useTransform(mouseXSpring, [-0.5, 0.5], ["0%", "100%"]);
    const glareY = useTransform(mouseYSpring, [-0.5, 0.5], ["0%", "100%"]);
    const glareBackground = useMotionTemplate`radial-gradient(600px circle at ${glareX} ${glareY}, rgba(255,255,255,0.08), transparent 40%)`;

    // Refraction highlight — moves opposite to glare for depth illusion
    const refractionX = useTransform(mouseXSpring, [-0.5, 0.5], ["80%", "20%"]);
    const refractionY = useTransform(mouseYSpring, [-0.5, 0.5], ["80%", "20%"]);
    const refractionBackground = useMotionTemplate`radial-gradient(400px circle at ${refractionX} ${refractionY}, var(--crystal-refraction, rgba(120,200,255,0.06)), transparent 60%)`;

    // Idle floating animation
    const floatingControls = useAnimation();

    React.useEffect(() => {
      if (useCrystalEffects && interactive) {
        floatingControls.start({
          y: [0, -3, 0],
          transition: {
            duration: 4 + Math.random() * 2,
            repeat: Infinity,
            ease: "easeInOut"
          }
        });
      } else {
        floatingControls.stop();
        floatingControls.set({ y: 0 });
      }
    }, [useCrystalEffects, interactive, floatingControls]);

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
      if (!interactive || !useCrystalEffects) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      x.set(mouseX / rect.width - 0.5);
      y.set(mouseY / rect.height - 0.5);
    };

    const handleMouseLeave = () => {
      if (!interactive || !useCrystalEffects) return;
      x.set(0);
      y.set(0);
    };

    // Map intensity to animation duration (lower intensity = slower/calmer)
    const breathDuration = Math.max(3, 8 - crystalIntensity * 5);
    const glowStrength = 0.5 + crystalIntensity * 0.5;

    const crystalThemeClass = crystalTheme !== 'none' ? `crystal-widget crystal-${crystalTheme}` : '';

    const cardClasses = cn(
      "rounded-2xl border text-card-foreground transition-shadow duration-300 relative overflow-hidden",
      (!isCrystal && !useCrystalEffects) && "bg-card border-foreground/10",
      isCrystal && "crystal-window text-foreground border-transparent",
      useCrystalEffects && "!border-foreground/[0.12] text-foreground shadow-[0_8px_32px_rgba(0,0,0,0.1)]",
      crystalThemeClass,
      className
    );

    const cardContent = (
      <motion.div
        ref={ref as any}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        animate={floatingControls}
        style={{
          rotateX: (useCrystalEffects && interactive) ? rotateX : 0,
          rotateY: (useCrystalEffects && interactive) ? rotateY : 0,
          transformStyle: "preserve-3d",
          // Data-driven CSS custom properties
          ['--crystal-intensity' as any]: crystalIntensity,
          ['--crystal-breathe-duration' as any]: `${breathDuration}s`,
          ['--crystal-glow-strength' as any]: glowStrength,
        }}
        className={cn("w-full h-full relative group/crystal-card", cardClasses)}
        data-component={useCrystalEffects ? "crystal-card" : "card"}
        {...props}
      >
        {/* CRYSTAL BACKGROUND LAYERS — CSS-only, no WebGL */}
        {useCrystalEffects && (
          <>
            {/* Layer 1: Animated gradient background (the "liquid crystal" base) */}
            <div className="crystal-bg-layer absolute inset-0 z-0 rounded-2xl" />

            {/* Layer 2: Noise texture for organic depth */}
            <div className="absolute inset-0 z-[1] rounded-2xl opacity-[0.03] mix-blend-overlay"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
                backgroundSize: '128px 128px',
              }}
            />

            {/* Layer 3: Dynamic mouse-following glare */}
            {interactive && (
              <motion.div
                className="pointer-events-none absolute inset-0 z-[2] rounded-2xl opacity-0 group-hover/crystal-card:opacity-100 transition-opacity duration-500"
                style={{ background: glareBackground }}
              />
            )}

            {/* Layer 4: Refraction counter-highlight (moves opposite to glare) */}
            {interactive && (
              <motion.div
                className="pointer-events-none absolute inset-0 z-[3] rounded-2xl opacity-0 group-hover/crystal-card:opacity-60 transition-opacity duration-700"
                style={{ background: refractionBackground }}
              />
            )}

            {/* Layer 5: Crystal edge / refractive border glow */}
            <div className="crystal-edge-glow pointer-events-none absolute inset-0 z-[4] rounded-2xl" />

            {/* Layer 6: Inner light caustics (the shifting light patterns inside crystals) */}
            <div className="crystal-caustics pointer-events-none absolute inset-0 z-[5] rounded-2xl" />
          </>
        )}

        {/* Content wrapper — z-50 guarantees text is ABOVE every visual layer */}
        <div
          className={cn("relative z-50 w-full h-full", useCrystalEffects && "liquid-crystal-text")}
          style={useCrystalEffects ? { transform: `translateZ(${splineDepth}px)`, transformStyle: "preserve-3d" } : {}}
        >
          {children}
        </div>
      </motion.div>
    );

    if (liquid) {
      return (
        <LiquidGlassWrapper className="rounded-2xl" style={{ perspective: '1200px' }}>
          {cardContent}
        </LiquidGlassWrapper>
      );
    }

    if (useCrystalEffects) {
      return (
        <div style={{ perspective: '1200px', transformStyle: 'preserve-3d' }} className="w-full h-full liquid-crystal-3d">
          {cardContent}
        </div>
      );
    }

    return cardContent;
  })
Card.displayName = "Card"

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6 relative z-20", className)}
    style={{ transform: "translateZ(10px)" }}
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
      "text-2xl font-semibold leading-none tracking-tight drop-shadow-md",
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
    className={cn("text-sm text-foreground/70 font-medium", className)}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("p-6 pt-0 relative z-10", className)}
    style={{ transform: "translateZ(15px)", transformStyle: "preserve-3d" }}
    {...props}
  />
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0 relative z-20", className)}
    style={{ transform: "translateZ(20px)" }}
    {...props}
  />
))
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
