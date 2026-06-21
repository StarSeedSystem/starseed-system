'use client';

import { DashboardWidget } from "./dashboard-types";
import dynamic from "next/dynamic";
import { useAppearance } from "@/context/appearance-context";
import { ThemeSelectorWidget } from "@/components/dashboard/widgets/theme-selector-widget";
import { ExploreNetworkWidget } from "@/components/dashboard/widgets/explore-network-widget";
import { MyPagesWidget } from "@/components/dashboard/widgets/my-pages-widget";
import { PoliticalSummaryWidget } from "@/components/dashboard/widgets/political-summary-widget";
import { SystemStatusWidget } from "@/components/dashboard/widgets/system-status-widget";
import { RecentActivityWidget } from "@/components/dashboard/widgets/recent-activity-widget";
import { NexusQuickAccessWidget } from "@/components/dashboard/widgets/nexus-quick-access-widget";
import { ThemeManagerWidget } from "@/components/dashboard/widgets/theme-manager-widget";
import { MentalCoherenceWidget } from "@/components/dashboard/widgets/mental-coherence-widget";
import { ActiveProjectsWidget } from "@/components/dashboard/widgets/active-projects-widget";
import { CollabProjectsWidget } from "@/components/dashboard/widgets/collab-projects-widget";
import { EconomicOverviewWidget } from "@/components/dashboard/widgets/economic-overview-widget";
import { CarteraStarseedWidget } from "@/components/dashboard/widgets/cartera-starseed";

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
import { NotificationsWidget } from "@/components/dashboard/widgets/notifications-widget";
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
import { LearningPathWidget } from "@/components/dashboard/widgets/learning-path-widget";
import { SocialRadarWidget } from "@/components/dashboard/widgets/social-radar-widget";
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
import { FlowDirectorWidget } from "@/components/dashboard/widgets/gen5/flow-director-widget";
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
    OikosMetabolismWidget,
    SkillTreeWidget,
    AstrauraCortexWidget,
    SovereignNodeWidget,
    AkashicCodexWidget,
    NatalChartWidget,
    MeshRadarWidget,
    ImmersionPortalWidget,
} from "@/components/dashboard/widgets/gen2";

interface WidgetProps {
    widget: DashboardWidget;
}

export function WidgetRegistry({ widget }: WidgetProps) {
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
        case 'NOTIFICATIONS':
            return <NotificationsWidget />;
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

        default:
            return (
                <div className="flex h-full items-center justify-center p-4">
                    <span className="text-muted-foreground text-sm">Widget desconocido: {widget.widget_type}</span>
                </div>
            );
    }
}
