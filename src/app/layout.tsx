import type { Metadata, Viewport } from "next";
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
// Aurora GLOBAL: provider + orbe viven en el layout RAÍZ para que el orbe (y el
// acceso Trinity que ofrece) exista en TODAS las rutas — dashboard (main),
// login, onboarding… — y para que el ZenithCurtain (Exocórtex) quede DENTRO del
// árbol del provider. Ambos son defensivos sin sesión.
import { AuroraProvider } from "@/components/aurora/aurora-provider";
import { AuroraWidget } from "@/components/aurora/aurora-widget";
import { CursorFxHost } from "@/components/desktop/cursor-fx";
import { PerfController, PerfHeavyOnly, PerfStaticBackdrop } from "@/components/perf/perf-gate";
import { PinnedWidgetOverlay } from "@/components/dashboard/widgets/pinned-widget-overlay";
import { MediaMiniDock } from "@/components/dashboard/apps/media/media-mini-dock";
import { SovereignSyncMount } from "@/components/system/sovereign-sync-mount";
import { OmniAppHost } from "@/components/dashboard/apps/omnifrecuencias/omni-app-host";
import { AudiomorphicConfigHost } from "@/components/ui/backgrounds/audiomorphic-config-window";
import { RegisterSW } from "@/components/pwa/register-sw";

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
  applicationName: "StarSeed OS",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "StarSeed",
  },
  icons: {
    icon: [
      { url: "/favicon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/starseed-symbol-square.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/favicon-48.png",
    apple: "/apple-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0A0712",
  colorScheme: "dark",
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
        {/* Registro del Service Worker (PWA): instalable + shell offline.
            Defensivo y sin UI; se omite en dev salvo NEXT_PUBLIC_ENABLE_SW=1. */}
        <RegisterSW />
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
                        {/* Aurora envuelve TODO el árbol visible (incluido el
                            ZenithCurtain/Exocórtex) y monta su orbe universal. */}
                        <AuroraProvider>
                        {/* Rendimiento: fija data-perf y decide cuánto fondo montar.
                            En móviles/gama baja (eco) NO se montan las 6 capas
                            pesadas; queda el fondo estático cristalino StarSeed. */}
                        <PerfController />
                        <PerfStaticBackdrop />
                        <LiquidGlass />
                        <PerfHeavyOnly>
                          <WebGLBackground />
                          <SplineDefaultBackground />
                          <LiquidPsychedelicBackground />
                          <MateriaVivaBackgroundHost />
                          <LivingBackground />
                          <AudiomorphicBackground />
                        </PerfHeavyOnly>
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
                        {/* App Omnifrecuencias en ventana del OS (escucha 'starseed:open-omnifrecuencias'). */}
                        <OmniAppHost />
                        {/* Ventana de configuración del fondo Audiomorphic (escucha 'starseed:open-audiomorphic-config'). */}
                        <AudiomorphicConfigHost />
                        <SplineWatermarkCover />
                        <PerimeterInterface />
                        {/* Trinity Móvil · Bloque 4 — asas de borde + deslizar desde
                            cada orilla para abrir los menús cardinales en táctil.
                            Decide por sí mismo si renderizarse (auto/on/off). */}
                        <TrinityEdgeAccess />
                        {/* ORBE de Aurora: acceso universal a la voz + menú
                            Trinity centrado, presente en todas las rutas. */}
                        <AuroraWidget />
                        {/* Cursor personalizado + animaciones de clic (config en
                            Apariencia → Cursor; 'starseed.cursorfx.v1'). Global. */}
                        <CursorFxHost />
                        <Toaster />
                        <Sonner />
                        </AuroraProvider>
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
