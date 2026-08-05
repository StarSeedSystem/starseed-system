import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk, Source_Code_Pro, Roboto, Outfit } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { AppearanceProvider } from "@/context/appearance-context";
// Adenda 137 (a11y): proveedor LIGERO de diálogos in-app (useConfirm/usePrompt,
// reemplazo de window.confirm/alert/prompt). Va en el layout RAÍZ para cubrir TODO
// el árbol —incluida la chrome global (OmniDock, visores) y la página not-found—,
// no solo el grupo (app). Solo contexto + un AlertDialog reutilizable (sin peso).
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { LiquidGlass } from "@/components/ui/liquid-glass";
// Adenda 136 (rendimiento): WebGLBackground (three.js) y SplineDefaultBackground
// (@splinetool/react-spline + runtime) se cargan vía next/dynamic({ssr:false})
// para sacar three.js/Spline del chunk inicial de este layout raíz — se monta
// en TODAS las rutas (incluida /login). layout.tsx es un Server Component, así
// que el dynamic(...,{ssr:false}) vive en el wrapper cliente
// dynamic-heavy-backgrounds.tsx (Next 15 prohíbe ssr:false fuera de "use
// client"). Ambos siguen renderizándose igual, en el mismo sitio del árbol —
// solo cambia CUÁNDO se descarga su JS (cliente, tras hidratar).
import { SplineWatermarkCover } from "@/components/ui/SplineWatermarkCover";
import { LiquidPsychedelicBackground } from "@/components/ui/backgrounds/liquid-psychedelic-background";
import { MateriaVivaBackgroundHost } from "@/components/backgrounds/materia-viva-background";
import { LivingBackground } from "@/components/ui/backgrounds/living-background";
import { BackgroundLayerStack } from "@/components/ui/backgrounds/background-layer-stack";
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
// Paleta de comandos global (Cmd/Ctrl+K): buscar y saltar a cualquier app o
// página del OS + acciones rápidas. Hermana de {children} (no lo envuelve,
// igual que el resto de la chrome global) para estar disponible en TODAS las
// rutas, igual que ConfirmProvider (Adenda 137). Ver command-palette.tsx.
import { CommandPalette } from "@/components/layout/command-palette";
// Aurora GLOBAL: provider + orbe viven en el layout RAÍZ para que el orbe (y el
// acceso Trinity que ofrece) exista en TODAS las rutas — dashboard (main),
// login, onboarding… — y para que el ZenithCurtain (Exocórtex) quede DENTRO del
// árbol del provider. Ambos son defensivos sin sesión.
import { AuroraProvider } from "@/components/aurora/aurora-provider";
import { SystemSelectionProvider } from "@/components/system-selection-provider";
import { VoiceNeuronOnboardingLoader } from "@/components/aurora/voice-neuron-onboarding-loader";
// (loaders globales que NO deben ir en el Server Component layout.tsx: ver abajo)

import { AuroraWidget } from "@/components/aurora/aurora-widget";
// Guía dinámica de bienvenida y ayuda (tour vivo de la interfaz). Global,
// defensiva y SSR-safe: arranca sola en la primera visita y se reabre con el
// evento 'starseed:open-guide' o el acceso flotante "Guía".
import { AuroraGuide } from "@/components/onboarding/aurora-guide";
import { CursorFxHost } from "@/components/desktop/cursor-fx";
import { PerfController, PerfHeavyOnly, PerfStaticBackdrop } from "@/components/perf/perf-gate";
import { PinnedWidgetOverlay } from "@/components/dashboard/widgets/pinned-widget-overlay";
import { MediaMiniDock } from "@/components/dashboard/apps/media/media-mini-dock";
import { SovereignSyncMount } from "@/components/system/sovereign-sync-mount";
// Motor de sincronización en TIEMPO REAL entre dispositivos de la cuenta
// (escritorios, memorias, chats de Aurora, ajustes…): src/lib/sync/realtime-sync.ts.
import { RealtimeSyncProvider } from "@/components/system/realtime-sync-provider";
import { OmniAppHost } from "@/components/dashboard/apps/omnifrecuencias/omni-app-host";
import { AudiomorphicConfigHost } from "@/components/ui/backgrounds/audiomorphic-config-window";
import { RegisterSW } from "@/components/pwa/register-sw";
import { A11yBoot } from "@/components/a11y/a11y-boot";
// Foco + anuncio aria-live al cambiar de ruta (SPA), para teclado/lector.
import { RouteFocus } from "@/components/a11y/route-focus";
// MotionConfig raíz: framer-motion respeta prefers-reduced-motion en todo el árbol.
import { MotionConfig } from "framer-motion";
// Receptor global de "Solicitar archivo a esta neurona" (subida universal de
// archivos, Adenda 64 §9): escucha 'file-request' en el canal de cuenta y
// muestra el diálogo para elegir/subir. Sin UI hasta que llega una solicitud.
import { FileRequestListener } from "@/components/files/file-request-listener";
// Fragua de Widgets GLOBAL (Adenda 63 §2): escucha 'starseed:open-forge' y abre
// la MISMA Fragua del dashboard en CUALQUIER ruta (antes solo funcionaba dentro
// de /dashboard). Persiste los widgets forjados con el mismo mecanismo local +
// sync que el dashboard. Sin UI hasta que llega el evento.
import { GlobalForgeHost } from "@/components/creation/global-forge-host";
// Editor Universal GLOBAL (Adenda 71-ter · I3): escucha 'starseed:open-editor'
// (disparado desde el Centro de Creación de Trinity) y abre la MISMA
// UniversalEditor en CUALQUIER ruta, aunque la ventana Exocórtex esté cerrada.
import { GlobalEditorHost } from "@/components/creation/global-editor-host";
// Alarmas propias del usuario (invitaciones a eventos, recordatorios…):
// @/lib/alarms/alarms.ts. Global (root), a diferencia del <AlarmScheduler/>
// del Sincrómetro (que vive solo dentro de (app), atado a CalendarProvider) —
// las alarmas deben sonar también desde /messages y /correos (fuera de (app)).
import { AlarmsEngine } from "@/components/alarms/alarms-engine";
// Fondos animados del CATÁLOGO DE TEMAS (theme-engine.ts + theme-catalog.ts):
// matrix-rain/estrellas/gradiente-aurora/weather-live. Sin efecto salvo que
// un ThemePack del catálogo los active (data-ss-background en <html>).
// Adenda 136: ThemeBackgroundHost arrastra el módulo weather/NOAA (usado por
// el tema "climatico") — también se carga vía dynamic ssr:false, ver import
// de dynamic-heavy-backgrounds.tsx más abajo.
import {
  DynamicWebGLBackground,
  DynamicSplineDefaultBackground,
  DynamicThemeBackgroundHost,
} from "@/components/backgrounds/dynamic-heavy-backgrounds";
// Notificaciones y ventanas emergentes de las apps instaladas (Adenda 69 · J-1):
// el bridge PERSISTE las notificaciones de apps en el centro y valida los
// postMessage de iframes; el host pinta los popups apilables. Sin UI hasta que
// una app notifica/abre un popup.
import { AppNotifyBridge } from "@/components/notifications/app-notify-bridge";
import { AppPopupHost } from "@/components/notifications/app-popup-host";
// Auto-actualización de la Biblioteca (Adenda 69 · J-2): si está activada, aplica
// solas las actualizaciones de los paquetes instalados y avisa. Sin UI.
import { AutoUpdateWatcher } from "@/components/notifications/auto-update-watcher";

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
  // viewportFit=cover habilita env(safe-area-inset-*) en toda la app —
  // lo usan los escritorios (barra superior/dock) en notch/isla dinámica.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="dark" suppressHydrationWarning>
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
        {/* Salto de accesibilidad: PRIMER elemento focusable del documento.
            Invisible salvo con foco de teclado; lleva al landmark #main-content. */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[9999] focus:rounded-lg focus:bg-background focus:px-4 focus:py-2 focus:text-foreground focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring"
        >
          Saltar al contenido
        </a>
        {/* MotionConfig raíz: todas las animaciones de framer-motion respetan
            `prefers-reduced-motion` del SO (transform/layout se desactivan). */}
        <MotionConfig reducedMotion="user">
        {/* Registro del Service Worker (PWA): instalable + shell offline.
            Defensivo y sin UI; se omite en dev salvo NEXT_PUBLIC_ENABLE_SW=1. */}
        <RegisterSW />
        {/* Accesibilidad aplicada en el ARRANQUE (no solo al abrir el panel):
            contraste, movimiento reducido, texto grande, daltonismo, diana. */}
        <A11yBoot />
        {/* Foco y anuncio de cambio de ruta (SPA) para teclado/lector. */}
        <RouteFocus />
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <AppearanceProvider>
            <ConfirmProvider>
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
                          <DynamicWebGLBackground />
                          <DynamicSplineDefaultBackground />
                          <LiquidPsychedelicBackground />
                          <MateriaVivaBackgroundHost />
                          <LivingBackground />
                          {/* Capas de fondo (Adenda 68 · D): pila ordenada por
                              encima del fondo base — color/degradado/imagen/
                              vídeo/Audiomorphic, con opacidad y mezcla propias.
                              Vacía por defecto ⇒ el OS arranca con UN solo fondo
                              y Audiomorphic NO se monta. */}
                          <BackgroundLayerStack />
                        </PerfHeavyOnly>
                        <CrystalFilters />
                        <GlobalEnvironment />
                        {/* Fondo del ThemePack activo (catálogo de temas), si define uno. */}
                        <DynamicThemeBackgroundHost />
                        <SystemSelectionProvider>
                          {/* Landmark objetivo del salto de accesibilidad y del
                              enfoque por cambio de ruta (RouteFocus). display:contents
                              (clase `contents`) ⇒ no genera caja ni altera el layout
                              de las páginas; solo sirve de ancla de foco (tabIndex=-1). */}
                          <div id="main-content" tabIndex={-1} className="contents">
                            {children}
                          </div>
                        </SystemSelectionProvider>
                        <ZenithCurtain />
                        <SideCurtains />

                        <OmniDock />
                        <PinnedWidgetOverlay />
                        {/* Mini-reproductor global del media center (aparece al reproducir). */}
                        <MediaMiniDock />
                        {/* Sincronización soberana: biblioteca/apps/dashboards ↔ Supabase (defensiva). */}
                        <SovereignSyncMount />
                        {/* Sincronización en TIEMPO REAL entre dispositivos de la cuenta (defensiva). */}
                        <RealtimeSyncProvider />
                        {/* App Omnifrecuencias en ventana del OS (escucha 'starseed:open-omnifrecuencias'). */}
                        <OmniAppHost />
                        {/* Ventana de configuración del fondo Audiomorphic (escucha 'starseed:open-audiomorphic-config'). */}
                        <AudiomorphicConfigHost />
                        {/* Receptor de solicitudes de archivo entre neuronas de la cuenta (defensivo, sin UI hasta que llega una). */}
                        <FileRequestListener />
                        {/* Notificaciones/popups de apps (J-1): persiste avisos de apps en el centro + valida iframes; pinta popups apilables. */}
                        <AppNotifyBridge />
                        <AppPopupHost />
                        {/* Auto-actualización de la Biblioteca (J-2): aplica solas las actualizaciones si el usuario lo activó. */}
                        <AutoUpdateWatcher />
                        {/* Fragua de Widgets universal (escucha 'starseed:open-forge' fuera del dashboard). */}
                        <GlobalForgeHost />
                        {/* Editor Universal global (escucha 'starseed:open-editor' desde el Centro de Creación). */}
                        <GlobalEditorHost />
                        <SplineWatermarkCover />
                        <PerimeterInterface />
                        {/* Trinity Móvil · Bloque 4 — asas de borde + deslizar desde
                            cada orilla para abrir los menús cardinales en táctil.
                            Decide por sí mismo si renderizarse (auto/on/off). */}
                        <TrinityEdgeAccess />
                        {/* ORBE de Aurora: acceso universal a la voz + menú
                            Trinity centrado, presente en todas las rutas. */}
                        <AuroraWidget />
                        {/* Guía dinámica de bienvenida/ayuda: tour vivo que
                            presenta y resalta orbe, menús Trinity, Escritorio,
                            Dashboard, Astraura, Perfil, Cerebros y Librería.
                            Arranca sola la primera vez; reabrible siempre. */}
                        <AuroraGuide />
                        {/* Cursor personalizado + animaciones de clic (config en
                            Apariencia → Cursor; 'starseed.cursorfx.v1'). Global. */}
                        <CursorFxHost />
                        <AlarmsEngine />
                        <CommandPalette />
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
            </ConfirmProvider>
          </AppearanceProvider>
        </ThemeProvider>
        </MotionConfig>
      </body>
    </html >
  );
}
