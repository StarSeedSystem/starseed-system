"use client";

// ProvidersTree — todos los Client Components de providers y el árbol
// visible del OS, anidados. Se monta desde RootLayoutClient (Server
// Component) para que el layout raíz NO use hooks de React directamente
// y así se elimine el "Invalid hook call" (#310) de raíz: el server render
// del layout no requiere dispatcher de hooks; los providers (client) hidratan
// con la instancia única de React del navegador, sin necesidad de alias.
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { AppearanceProvider } from "@/context/appearance-context";
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
import { AuroraProvider } from "@/components/aurora/aurora-provider";
import { SystemSelectionProvider } from "@/components/system-selection-provider";
import { AuroraWidget } from "@/components/aurora/aurora-widget";
import { AuroraGuide } from "@/components/onboarding/aurora-guide";
import { CursorFxHost } from "@/components/desktop/cursor-fx";
import { PerfController, PerfHeavyOnly, PerfStaticBackdrop } from "@/components/perf/perf-gate";
import { PinnedWidgetOverlay } from "@/components/dashboard/widgets/pinned-widget-overlay";
import { MediaMiniDock } from "@/components/dashboard/apps/media/media-mini-dock";
import { SovereignSyncMount } from "@/components/system/sovereign-sync-mount";
import { RealtimeSyncProvider } from "@/components/system/realtime-sync-provider";
import { OmniAppHost } from "@/components/dashboard/apps/omnifrecuencias/omni-app-host";
import { AudiomorphicConfigHost } from "@/components/ui/backgrounds/audiomorphic-config-window";
import { RegisterSW } from "@/components/pwa/register-sw";
import { FileRequestListener } from "@/components/files/file-request-listener";
import { GlobalForgeHost } from "@/components/creation/global-forge-host";
import { GlobalEditorHost } from "@/components/creation/global-editor-host";
import { AlarmsEngine } from "@/components/alarms/alarms-engine";
import { ThemeBackgroundHost } from "@/components/backgrounds/theme-live-background";
import { AppNotifyBridge } from "@/components/notifications/app-notify-bridge";
import { AppPopupHost } from "@/components/notifications/app-popup-host";
import { AutoUpdateWatcher } from "@/components/notifications/auto-update-watcher";
import { LiquidGlass } from "@/components/ui/liquid-glass";
import { WebGLBackground } from "@/components/ui/backgrounds/webgl-background";
import { SplineDefaultBackground } from "@/components/ui/backgrounds/spline-default-background";
import { SplineWatermarkCover } from "@/components/ui/SplineWatermarkCover";
import { VoiceNeuronOnboardingLoader } from "@/components/aurora/voice-neuron-onboarding-loader";
import { LiquidPsychedelicBackground } from "@/components/ui/backgrounds/liquid-psychedelic-background";
import { MateriaVivaBackgroundHost } from "@/components/backgrounds/materia-viva-background";
import { LivingBackground } from "@/components/ui/backgrounds/living-background";
import { BackgroundLayerStack } from "@/components/ui/backgrounds/background-layer-stack";
import { CrystalFilters } from "@/components/ui/effects/CrystalFilters";
import { GlobalEnvironment } from "@/components/ui/global-environment";
import type { ReactNode } from "react";

export default function ProvidersTree({ children }: { children: ReactNode }) {
  return (
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
                      <AuroraProvider>
                        <PerfController />
                        <PerfStaticBackdrop />
                        <LiquidGlass />
                        <PerfHeavyOnly>
                          <WebGLBackground />
                          <SplineDefaultBackground />
                          <LiquidPsychedelicBackground />
                          <MateriaVivaBackgroundHost />
                          <LivingBackground />
                          <BackgroundLayerStack />
                        </PerfHeavyOnly>
                        <CrystalFilters />
                        <GlobalEnvironment />
                        <ThemeBackgroundHost />
                        <SystemSelectionProvider>{children}</SystemSelectionProvider>
                        <ZenithCurtain />
                        <SideCurtains />

                        <OmniDock />
                        <PinnedWidgetOverlay />
                        <MediaMiniDock />
                        <SovereignSyncMount />
                        <RealtimeSyncProvider />
                        <OmniAppHost />
                        <AudiomorphicConfigHost />
                        <FileRequestListener />
                        <AppNotifyBridge />
                        <AppPopupHost />
                        <AutoUpdateWatcher />
                        <GlobalForgeHost />
                        <GlobalEditorHost />
                        <SplineWatermarkCover />
                        <VoiceNeuronOnboardingLoader />
                        <PerimeterInterface />
                        <TrinityEdgeAccess />
                        <AuroraWidget />
                        <AuroraGuide />
                        <CursorFxHost />
                        <AlarmsEngine />
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
  );
}
