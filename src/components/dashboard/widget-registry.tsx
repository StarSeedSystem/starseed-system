'use client';

import { DashboardWidget } from "./dashboard-types";
import dynamic from "next/dynamic";
import { useAppearance } from "@/context/appearance-context";
import { getWidgetFunctionStyle } from "./widget-function-style";
import { WidgetStyleOverrideProvider } from "./kit/widget-style-override";
import { ClockDateWidget } from "@/components/dashboard/widgets/clock-date-widget";
import { TasksQuickWidget } from "@/components/dashboard/widgets/tasks-quick-widget";
import { QuickNotesWidget } from "@/components/dashboard/widgets/quick-notes-widget";
import { AuroraLastWidget } from "@/components/dashboard/widgets/aurora-last-widget";
import { BadgesWidget } from "@/components/dashboard/widgets/badges-widget";
import { NetworkFeedWidget } from "@/components/dashboard/widgets/network-feed-widget";
import { ThemeSelectorWidget } from "@/components/dashboard/widgets/theme-selector-widget";
import { ExploreNetworkWidget } from "@/components/dashboard/widgets/explore-network-widget";
import { MyPagesWidget } from "@/components/dashboard/widgets/my-pages-widget";
import { SystemStatusWidget } from "@/components/dashboard/widgets/system-status-widget";
import { RecentActivityWidget } from "@/components/dashboard/widgets/recent-activity-widget";
import { NexusQuickAccessWidget } from "@/components/dashboard/widgets/nexus-quick-access-widget";
import { QuickAccessWidget } from "@/components/dashboard/widgets/quick-access-widget";
import { ActivitySummaryWidget } from "@/components/dashboard/widgets/activity-summary-widget";
import { ThemeManagerWidget } from "@/components/dashboard/widgets/theme-manager-widget";
import { MentalCoherenceWidget } from "@/components/dashboard/widgets/mental-coherence-widget";
import { ActiveProjectsWidget } from "@/components/dashboard/widgets/active-projects-widget";
import { CollabProjectsWidget } from "@/components/dashboard/widgets/collab-projects-widget";

import { WeatherBasicWidget } from "@/modules/weather/components/widgets/terrestrial/weather-basic-widget";
import { WeatherBasicFluidWidget } from "@/modules/weather/components/widgets/terrestrial/weather-basic-fluid";
import { WeatherBasicCrystallineWidget } from "@/modules/weather/components/widgets/terrestrial/weather-basic-crystalline";
import { WeatherBasicFloraWidget } from "@/modules/weather/components/widgets/terrestrial/weather-basic-flora";
import { WeatherBasicAuroraWidget } from "@/modules/weather/components/widgets/terrestrial/weather-basic-aurora";
import { WeatherOmniClimateWidget } from "@/modules/weather/components/widgets/terrestrial/weather-omni-climate";
const WeatherHolisticWidget = dynamic(
    () => import("@/modules/weather/components/widgets/terrestrial/weather-holistic-widget").then(mod => mod.WeatherHolisticWidget),
    { ssr: false, loading: () => <div className="w-full h-full flex items-center justify-center bg-black/50 text-white/50 animate-pulse text-xs">Cargando 3D...</div> }
);
import { WeatherTemperatureWidget } from "@/modules/weather/components/widgets/terrestrial/weather-temperature-widget";
import { WeatherWindWidget } from "@/modules/weather/components/widgets/terrestrial/weather-wind-widget";
import { WeatherHumidityWidget } from "@/modules/weather/components/widgets/terrestrial/weather-humidity-widget";
import { WeatherUvWidget } from "@/modules/weather/components/widgets/terrestrial/weather-uv-widget";
import { WeatherAirQualityWidget } from "@/modules/weather/components/widgets/terrestrial/weather-air-quality-widget";
import { SpaceEnergySolarWidget } from "@/modules/weather/components/widgets/solar/space-energy-solar-widget";
import { SpaceEnergySchumannWidget } from "@/modules/weather/components/widgets/space/space-energy-schumann-widget";
import { KpIndexWidget } from "@/modules/weather/components/widgets/space/space-weather-kp-index-widget";
import { MagnetometerWidget } from "@/modules/weather/components/widgets/space/space-weather-magnetometer-widget";
import { XRayFlareWidget } from "@/modules/weather/components/widgets/space/space-weather-flare-widget";
import { WeatherAstronomyWidget } from "@/modules/weather/components/widgets/terrestrial/weather-astronomy-widget";
import { CulturalFeedWidget } from "@/components/dashboard/widgets/cultural-feed-widget";
import { CalculatorWidget } from "@/components/dashboard/widgets/calculator-widget";
import { RelevantPostsWidget } from "@/components/dashboard/widgets/relevant-posts-widget";
import { MessagesWidget } from "@/components/dashboard/widgets/messages-widget";
import { MyEventsWidget } from "@/components/dashboard/widgets/my-events-widget";
import { MyGroupsWidget } from "@/components/dashboard/widgets/my-groups-widget";
import { CommunitiesWidget } from "@/components/dashboard/widgets/communities-widget";
import { FederatedEntitiesWidget } from "@/components/dashboard/widgets/federated-entities-widget";
import { MemoriesWidget } from "@/components/dashboard/widgets/memories-widget";
import { BrainsWidget } from "@/components/dashboard/widgets/brains-widget";
import { VaultsWidget } from "@/components/dashboard/widgets/vaults-widget";
import { DocumentsWidget } from "@/components/dashboard/widgets/documents-widget";
import { NotificationsWidget } from "@/components/dashboard/widgets/notifications-widget";
import { RecentGalleryWidget } from "@/components/dashboard/widgets/recent-gallery-widget";
import { CameraQuickWidget } from "@/components/dashboard/widgets/camera-quick-widget";
import { AiGeneratedWidget } from "@/components/dashboard/widgets/ai-generated-widget";
import { AppLauncherWidget } from "@/components/dashboard/widgets/app-launcher-widget";
import { UniversalOpenerWidget } from "@/components/dashboard/widgets/universal-opener-widget";
import { MusicPlayerWidget } from "@/components/dashboard/widgets/media/music-player-widget";
import { OmnifrecuenciasWidget } from "@/components/dashboard/widgets/media/omnifrecuencias-widget";
import { RadioWidget } from "@/components/dashboard/widgets/media/radio-widget";
import { AudiomorphicBgWidget } from "@/components/dashboard/widgets/media/audiomorphic-bg-widget";
import { MediaControlWidget } from "@/components/dashboard/widgets/media/media-control-widget";
import { OfficialDataWidget } from "@/components/dashboard/widgets/data/official-data-widget";
import { SpaceWeatherWidget } from "@/components/dashboard/widgets/space/space-weather-widget";
import { ImmersiveWidget } from "@/components/dashboard/widgets/immersive-widget";
import { LearningPathWidget } from "@/components/dashboard/widgets/learning-path-widget";
import { InternetRadarWidget } from "@/components/dashboard/widgets/internet-radar-widget";
import { LiveDataWidget } from "@/components/dashboard/widgets/live-data-widget";
import {
    CivicAlchemyWidget,
    VitalFlowAuditWidget,
    SocialResonanceWidget,
    GiftAgoraWidget,
    CommonsMatrixWidget,
    FoodOracleWidget,
    RegenTracerWidget,
} from "@/components/dashboard/widgets/gen3";

// Cuarta generación — cobertura final del catálogo
import {
    ElderCouncilWidget,
    RestorativeCourtWidget,
    BarterMarketWidget,
    EnergyGridWidget,
    MentorMatchWidget,
    UniversalLibraryWidget,
    MultiverseHubWidget,
    CreativeStudioWidget,
    OraclePredictWidget,
    IdentityVaultWidget,
    EnergyMapWidget,
} from "@/components/dashboard/widgets/gen4";

// Quinta generación — cobertura ampliada del catálogo
import { ProjectSwarmWidget } from "@/components/dashboard/widgets/gen5/project-swarm-widget";
import { AbundanceRadarWidget } from "@/components/dashboard/widgets/gen5/abundance-radar-widget";
import { TransitFlowWidget } from "@/components/dashboard/widgets/gen5/transit-flow-widget";
import { CryptoShieldWidget } from "@/components/dashboard/widgets/gen5/crypto-shield-widget";
import { HabitatCoreWidget } from "@/components/dashboard/widgets/gen5/habitat-core-widget";
import { SerendipityLensWidget } from "@/components/dashboard/widgets/gen5/serendipity-lens-widget";
import { IdeaForgeWidget } from "@/components/dashboard/widgets/gen5/idea-forge-widget";
import { MeritGalleryWidget } from "@/components/dashboard/widgets/gen5/merit-gallery-widget";
import { SocietyPulseWidget } from "@/components/dashboard/widgets/gen5/society-pulse-widget";

// Mapa real interactivo (OpenStreetMap + Leaflet vía CDN)
const MapWidget = dynamic(
    () => import("@/components/dashboard/widgets/map-widget").then(mod => mod.MapWidget),
    { ssr: false, loading: () => <div className="w-full h-full flex items-center justify-center bg-black/50 text-white/50 animate-pulse text-xs">Cargando mapa...</div> }
);

// Segunda generación — widgets adaptativos (kit + capa de datos en vivo)
import {
    AgoraCausalWidget,
    LiquidDelegationWidget,
    AstrauraCortexWidget,
    AkashicCodexWidget,
    NatalChartWidget,
    MeshRadarWidget,
    ImmersionPortalWidget,
} from "@/components/dashboard/widgets/gen2";

// Adenda 138 (rendimiento): recharts (~105KB gzip) fuera del First Load de
// /dashboard. Estos 8 widgets importaban recharts de forma ESTÁTICA (directa
// o vía el barrel de gen2) y solo se pintan cuando el usuario tiene ese
// widget_type en su grid — mismo patrón que MapWidget/WeatherHolisticWidget
// arriba: dynamic({ssr:false}) saca recharts del chunk inicial del dashboard
// y solo lo descarga cuando el widget concreto se monta. Siguen renderizando
// EXACTAMENTE igual (mismo componente, mismos props — aquí ninguno lleva).
const dashboardWidgetLoading = () => (
    <div className="w-full h-full flex items-center justify-center bg-black/20 text-white/40 animate-pulse text-xs">
        Cargando…
    </div>
);
const PoliticalSummaryWidget = dynamic(
    () => import("@/components/dashboard/widgets/political-summary-widget").then((mod) => mod.PoliticalSummaryWidget),
    { ssr: false, loading: dashboardWidgetLoading }
);
const EconomicOverviewWidget = dynamic(
    () => import("@/components/dashboard/widgets/economic-overview-widget").then((mod) => mod.EconomicOverviewWidget),
    { ssr: false, loading: dashboardWidgetLoading }
);
const CarteraStarseedWidget = dynamic(
    () => import("@/components/dashboard/widgets/cartera-starseed").then((mod) => mod.CarteraStarseedWidget),
    { ssr: false, loading: dashboardWidgetLoading }
);
const SocialRadarWidget = dynamic(
    () => import("@/components/dashboard/widgets/social-radar-widget").then((mod) => mod.SocialRadarWidget),
    { ssr: false, loading: dashboardWidgetLoading }
);
const FlowDirectorWidget = dynamic(
    () => import("@/components/dashboard/widgets/gen5/flow-director-widget").then((mod) => mod.FlowDirectorWidget),
    { ssr: false, loading: dashboardWidgetLoading }
);
const OikosMetabolismWidget = dynamic(
    () => import("@/components/dashboard/widgets/gen2/oikos-metabolism-widget").then((mod) => mod.OikosMetabolismWidget),
    { ssr: false, loading: dashboardWidgetLoading }
);
const SkillTreeWidget = dynamic(
    () => import("@/components/dashboard/widgets/gen2/skill-tree-widget").then((mod) => mod.SkillTreeWidget),
    { ssr: false, loading: dashboardWidgetLoading }
);
const SovereignNodeWidget = dynamic(
    () => import("@/components/dashboard/widgets/gen2/sovereign-node-widget").then((mod) => mod.SovereignNodeWidget),
    { ssr: false, loading: dashboardWidgetLoading }
);

interface WidgetProps {
    widget: DashboardWidget;
    /** Persiste un patch en `widget.settings` (fusionado por el llamador — ver
     *  grid-area.tsx). Opcional: solo lo usan los widgets con opciones propias
     *  editables in-place (p. ej. CLOCK_DATE: analógico/digital, zona horaria). */
    onUpdateSettings?: (patch: Record<string, any>) => void;
}

export function WidgetRegistry({ widget, onUpdateSettings }: WidgetProps) {
    // Estilo por FUNCIÓN: teñimos el contenedor con el acento de la familia del
    // widget como variable CSS de respaldo (--w-fn-accent) y marcamos data-widget-fn.
    // Aditivo y no intrusivo: el WidgetShell y sus acentos explícitos siguen mandando;
    // esto da coherencia visual "que habla por sí misma" y un hook para estilos futuros.
    const fn = getWidgetFunctionStyle(widget.widget_type);
    // Override de estilo POR WIDGET (panel de config → engranaje), persistido en
    // el propio item del dashboard. Sin elección explícita, el Provider pasa
    // `{}` y WidgetShell se comporta exactamente igual que antes (tema global).
    const styleOverride = {
        variant: widget.settings?.styleVariant,
        trinityNode: widget.settings?.trinityNode,
    };
    return (
        <div
            className="h-full w-full"
            data-widget-fn={fn.kind}
            data-widget-weight={fn.weight}
            style={{ ["--w-fn-accent" as string]: fn.accent }}
        >
            <WidgetStyleOverrideProvider value={styleOverride}>
                <WidgetRegistryInner widget={widget} onUpdateSettings={onUpdateSettings} />
            </WidgetStyleOverrideProvider>
        </div>
    );
}

function WidgetRegistryInner({ widget, onUpdateSettings }: WidgetProps) {
    const { config } = useAppearance();

    switch (widget.widget_type) {
        case 'EXPLORE_NETWORK':
            return <ExploreNetworkWidget />;
        case 'MY_PAGES':
            return <MyPagesWidget />;
        case 'POLITICAL_SUMMARY':
            return <PoliticalSummaryWidget />;
        case 'SYSTEM_STATUS':
            return <SystemStatusWidget />;
        case 'RECENT_ACTIVITY':
            return <RecentActivityWidget />;

        case 'NEXUS_QUICK_ACCESS':
            return <NexusQuickAccessWidget />;
        case 'QUICK_ACCESS':
            return <QuickAccessWidget />;
        case 'ACTIVITY_SUMMARY':
            return <ActivitySummaryWidget />;
        case 'LEARNING_PATH':
            return <LearningPathWidget />;
        case 'SOCIAL_RADAR':
            return <SocialRadarWidget />;
        case 'COLLAB_PROJECTS':
            return <CollabProjectsWidget />;
        case 'ECONOMIC_OVERVIEW':
            return <EconomicOverviewWidget />;
        case 'CARTERA_STARSEED':
            return <CarteraStarseedWidget />;
        case 'ACTIVE_PROJECTS':
            return <ActiveProjectsWidget />;
        case 'WELLNESS':
            return <MentalCoherenceWidget />;
        case 'THEME_SELECTOR':
            return <ThemeSelectorWidget />;
        case 'THEME_MANAGER':
            return <ThemeManagerWidget />;
        case 'WEATHER_BASIC':
            const variant = config.widgets?.weatherVariant || "minimal";
            if (variant === "hologram" || variant === "crystalline") {
                return <WeatherBasicCrystallineWidget />;
            } else if (variant === "detailed" || variant === "fluid") {
                return <WeatherBasicFluidWidget />;
            } else if (variant === "flora") {
                return <WeatherBasicFloraWidget />;
            } else if (variant === "aurora") {
                return <WeatherBasicAuroraWidget />;
            } else if (variant === 'omni') {
                return <WeatherOmniClimateWidget />;
            } else {
                return <WeatherBasicWidget />;
            }
        case 'WEATHER_HOLISTIC':
            return <WeatherHolisticWidget />;
        case 'WEATHER_TEMPERATURE':
            return <WeatherTemperatureWidget />;
        case 'WEATHER_WIND':
            return <WeatherWindWidget />;
        case 'WEATHER_HUMIDITY':
            return <WeatherHumidityWidget />;
        case 'WEATHER_UV':
            return <WeatherUvWidget />;
        case 'WEATHER_AIR_QUALITY':
            return <WeatherAirQualityWidget />;
        case 'WEATHER_SPACE_SOLAR':
        case 'WEATHER_SPACE': // Legacy mapping
            return <SpaceEnergySolarWidget />;
        case 'WEATHER_SPACE_SCHUMANN':
            return <SpaceEnergySchumannWidget />;
        case 'WEATHER_SPACE_KP':
            return <KpIndexWidget />;
        case 'WEATHER_SPACE_MAGNETOMETER':
            return <MagnetometerWidget />;
        case 'WEATHER_SPACE_FLARE':
            return <XRayFlareWidget />;
        case 'WEATHER_ASTRONOMY':
            return <WeatherAstronomyWidget />;
        case 'CULTURAL_FEED':
            return <CulturalFeedWidget />;
        case 'CALCULATOR':
            return <CalculatorWidget />;
        case 'RELEVANT_POSTS':
            return <RelevantPostsWidget />;
        case 'MESSAGES':
            return <MessagesWidget />;

        // ── Áreas del SOSD con datos reales en vivo ──
        case 'MY_EVENTS':
            return <MyEventsWidget />;
        case 'MY_GROUPS':
            return <MyGroupsWidget />;
        case 'COMMUNITIES':
            return <CommunitiesWidget />;
        case 'FEDERATED_ENTITIES':
            return <FederatedEntitiesWidget />;
        case 'MEMORIES':
            return <MemoriesWidget />;
        case 'BRAINS':
            return <BrainsWidget />;
        case 'VAULTS':
            return <VaultsWidget />;
        case 'DOCUMENTS':
            return <DocumentsWidget />;
        case 'NOTIFICATIONS':
            return <NotificationsWidget />;
        case 'RECENT_GALLERY':
            return <RecentGalleryWidget />;
        case 'CAMERA_QUICK':
            return <CameraQuickWidget />;
        case 'LIVE_DATA':
            return <LiveDataWidget />;
        case 'AI_GENERATED':
            return <AiGeneratedWidget widget={widget} />;
        case 'APP_LAUNCHER':
            return <AppLauncherWidget widget={widget} />;
        case 'UNIVERSAL_OPENER':
            return <UniversalOpenerWidget widget={widget} />;
        case 'MUSIC_PLAYER':
            return <MusicPlayerWidget />;
        case 'OMNIFRECUENCIAS':
            return <OmnifrecuenciasWidget />;
        case 'RADIO_LIVE':
            return <RadioWidget />;
        case 'AUDIOMORPHIC_BG':
            return <AudiomorphicBgWidget />;
        case 'MEDIA_CONTROL':
            return <MediaControlWidget />;
        case 'OFFICIAL_DATA':
            return <OfficialDataWidget />;
        case 'SPACE_WEATHER':
            return <SpaceWeatherWidget />;
        case 'IMMERSIVE':
            return <ImmersiveWidget />;

        // ── Segunda generación: widgets adaptativos ──
        case 'AGORA_CAUSAL':
            return <AgoraCausalWidget />;
        case 'LIQUID_DELEGATION':
            return <LiquidDelegationWidget />;
        case 'OIKOS_METABOLISM':
            return <OikosMetabolismWidget />;
        case 'SKILL_TREE':
            return <SkillTreeWidget />;
        case 'ASTRAURA_CORTEX':
            return <AstrauraCortexWidget />;
        case 'SOVEREIGN_NODE':
            return <SovereignNodeWidget />;
        case 'AKASHIC_CODEX':
            return <AkashicCodexWidget />;
        case 'NATAL_CHART':
            return <NatalChartWidget />;
        case 'MESH_RADAR':
            return <MeshRadarWidget />;
        case 'INTERNET_RADAR':
            return <InternetRadarWidget />;
        case 'IMMERSION_PORTAL':
            return <ImmersionPortalWidget />;

        // ── Tercera generación: oleada Política/Ontocracia ──
        case 'CIVIC_ALCHEMY':
            return <CivicAlchemyWidget />;
        case 'VITAL_FLOW_AUDIT':
            return <VitalFlowAuditWidget />;
        case 'SOCIAL_RESONANCE':
            return <SocialResonanceWidget />;

        // ── Oleada Economía/Ecología ──
        case 'GIFT_AGORA':
            return <GiftAgoraWidget />;
        case 'COMMONS_MATRIX':
            return <CommonsMatrixWidget />;
        case 'FOOD_ORACLE':
            return <FoodOracleWidget />;
        case 'REGEN_TRACER':
            return <RegenTracerWidget />;

        // ── Cuarta generación: cobertura final del catálogo ──
        case 'ELDER_COUNCIL':
            return <ElderCouncilWidget />;
        case 'RESTORATIVE_COURT':
            return <RestorativeCourtWidget />;
        case 'BARTER_MARKET':
            return <BarterMarketWidget />;
        case 'ENERGY_GRID':
            return <EnergyGridWidget />;
        case 'MENTOR_MATCH':
            return <MentorMatchWidget />;
        case 'UNIVERSAL_LIBRARY':
            return <UniversalLibraryWidget />;
        case 'MULTIVERSE_HUB':
            return <MultiverseHubWidget />;
        case 'CREATIVE_STUDIO':
            return <CreativeStudioWidget />;
        case 'ORACLE_PREDICT':
            return <OraclePredictWidget />;
        case 'IDENTITY_VAULT':
            return <IdentityVaultWidget />;
        case 'ENERGY_MAP':
            return <EnergyMapWidget />;

        // ── Quinta generación: cobertura ampliada del catálogo ──
        case 'FLOW_DIRECTOR':
            return <FlowDirectorWidget />;
        case 'PROJECT_SWARM':
            return <ProjectSwarmWidget />;
        case 'ABUNDANCE_RADAR':
            return <AbundanceRadarWidget />;
        case 'TRANSIT_FLOW':
            return <TransitFlowWidget />;
        case 'CRYPTO_SHIELD':
            return <CryptoShieldWidget />;
        case 'HABITAT_CORE':
            return <HabitatCoreWidget />;
        case 'SERENDIPITY_LENS':
            return <SerendipityLensWidget />;
        case 'IDEA_FORGE':
            return <IdeaForgeWidget />;
        case 'MERIT_GALLERY':
            return <MeritGalleryWidget />;
        case 'SOCIETY_PULSE':
            return <SocietyPulseWidget />;

        // ── Mapa real interactivo (Ubicación) ──
        case 'MAP_LOCATION':
            return <MapWidget />;

        // ── Sexta oleada: rediseño de widgets predeterminados (2026-07) ──
        case 'CLOCK_DATE':
            return <ClockDateWidget widget={widget} onUpdateSettings={onUpdateSettings} />;
        case 'TASKS_QUICK':
            return <TasksQuickWidget />;
        case 'QUICK_NOTES':
            return <QuickNotesWidget />;
        case 'AURORA_LAST':
            return <AuroraLastWidget />;
        case 'BADGES':
            return <BadgesWidget />;
        case 'NETWORK_FEED_MINI':
            return <NetworkFeedWidget />;

        default:
            return (
                <div className="flex h-full items-center justify-center p-4">
                    <span className="text-muted-foreground text-sm">Widget desconocido: {widget.widget_type}</span>
                </div>
            );
    }
}
