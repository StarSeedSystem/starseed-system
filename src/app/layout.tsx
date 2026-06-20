import type { Metadata } from "next";
import { Inter, Space_Grotesk, Source_Code_Pro, Roboto, Outfit } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { AppearanceProvider } from "@/context/appearance-context";
import { cn } from "@/lib/utils";
import { LiquidGlass } from "@/components/ui/liquid-glass";
import { WebGLBackground } from "@/components/ui/backgrounds/webgl-background";
import { SplineDefaultBackground } from "@/components/ui/backgrounds/spline-default-background";
import { SplineWatermarkCover } from "@/components/ui/SplineWatermarkCover";
import { LiquidPsychedelicBackground } from "@/components/ui/backgrounds/liquid-psychedelic-background";
import { MateriaVivaBackgroundHost } from "@/components/backgrounds/materia-viva-background";
import { LivingBackground } from "@/components/ui/backgrounds/living-background";
import { AudiomorphicBackground } from "@/components/ui/backgrounds/audiomorphic-background";
import { CrystalFilters } from "@/components/ui/effects/CrystalFilters";
import { GlobalEnvironment } from "@/components/ui/global-environment";
import { PerimeterProvider } from "@/context/perimeter-context";
import { PerimeterInterface } from "@/components/layout/perimeter-interface";
import { TrinityEdgeAccess } from "@/components/layout/trinity-edge-access";
import { ZenithCurtain } from "@/components/layout/zenith-curtain";
import { SideCurtains } from "@/components/layout/side-curtains";
import { ControlPanelProvider } from "@/context/control-panel-context";
import { SidebarProvider } from "@/context/sidebar-context";
import { BoardProvider } from "@/context/board-context";
import { UserProvider } from "@/context/user-context";
import { NotificationsProvider } from "@/context/notifications-context";
import { AccountProvider } from "@/context/account-context";

import { OmniDock } from "@/components/layout/omni-dock";
import { PinnedWidgetOverlay } from "@/components/dashboard/widgets/pinned-widget-overlay";
import { MediaMiniDock } from "@/components/dashboard/apps/media/media-mini-dock";
import { SovereignSyncMount } from "@/components/system/sovereign-sync-mount";

const fontInter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const fontRoboto = Roboto({
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  variable: "--font-roboto",
});

const fontOutfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
});

const fontHeadline = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-headline",
});

const fontCode = Source_Code_Pro({
  subsets: ["latin"],
  variable: "--font-code",
});

export const metadata: Metadata = {
  title: "StarSeed System",
  description: "Sistema operativo social para la regeneración global",
  icons: {
    icon: [
      { url: "/favicon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/starseed-symbol-square.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/favicon-48.png",
    apple: "/apple-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={cn(
          "min-h-screen bg-background font-body antialiased",
          fontInter.variable,
          fontRoboto.variable,
          fontOutfit.variable,
          fontHeadline.variable,
          fontCode.variable
        )}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <AppearanceProvider>
            <AccountProvider>
            <BoardProvider>
              <UserProvider>
                <NotificationsProvider>
                  <SidebarProvider>
                    <ControlPanelProvider>
                      <PerimeterProvider>
                        <LiquidGlass />
                        <WebGLBackground />
                        <SplineDefaultBackground />
                        <LiquidPsychedelicBackground />
                        <MateriaVivaBackgroundHost />
                        <LivingBackground />
                        <AudiomorphicBackground />
                        <CrystalFilters />
                        <GlobalEnvironment />
                        {children}
                        <ZenithCurtain />
                        <SideCurtains />

                        <OmniDock />
                        <PinnedWidgetOverlay />
                        {/* Mini-reproductor global del media center (aparece al reproducir). */}
                        <MediaMiniDock />
                        {/* Sincronización soberana: biblioteca/apps/dashboards ↔ Supabase (defensiva). */}
                        <SovereignSyncMount />
                        <SplineWatermarkCover />
                        <PerimeterInterface />
                        {/* Trinity Móvil · Bloque 4 — asas de borde + deslizar desde
                            cada orilla para abrir los menús cardinales en táctil.
                            Decide por sí mismo si renderizarse (auto/on/off). */}
                        <TrinityEdgeAccess />
                        <Toaster />
                        <Sonner />
                      </PerimeterProvider>
                    </ControlPanelProvider>
                  </SidebarProvider>
                </NotificationsProvider>
              </UserProvider>
            </BoardProvider>
            </AccountProvider>
          </AppearanceProvider>
        </ThemeProvider>
      </body>
    </html >
  );
}
