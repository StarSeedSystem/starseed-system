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

// We can extract other widgets later
import { Activity, Calendar, Heart, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

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
        case 'AI_GENERATED':
            return <AiGeneratedWidget widget={widget} />;
        default:
            return (
                <div className="flex h-full items-center justify-center p-4">
                    <span className="text-muted-foreground text-sm">Widget desconocido: {widget.widget_type}</span>
                </div>
            );
    }
}

function LearningPathWidget() {
    return (
        <div className="flex h-full flex-col p-6 relative overflow-hidden bg-card/60 backdrop-blur-sm">
            <div className="absolute top-0 right-0 p-4 opacity-10">
                <Activity className="h-24 w-24 text-purple-500" />
            </div>
            <div className="flex items-center justify-between mb-6 relative z-10">
                <h3 className="text-lg font-headline font-semibold flex items-center gap-2">
                    <Activity className="h-4 w-4 text-purple-500" />
                    Ruta de Aprendizaje
                </h3>
            </div>

            <div className="flex-1 flex flex-col justify-center relative z-10 space-y-6">
                <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                        <span className="font-medium">Intro a la Ontocracia</span>
                        <span className="text-purple-500 font-bold">75%</span>
                    </div>
                    <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                        <div className="h-full bg-purple-500 w-[75%]" />
                    </div>
                </div>

                <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                        <span className="font-medium">Jardinería Urbana</span>
                        <span className="text-purple-500 font-bold">30%</span>
                    </div>
                    <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                        <div className="h-full bg-purple-500 w-[30%]" />
                    </div>
                </div>

                <Button className="w-full mt-4" size="sm" variant="secondary">
                    Continuar Aprendiendo <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
            </div>
        </div>
    );
}

function SocialRadarWidget() {
    return (
        <div className="flex h-full flex-col p-6 bg-gradient-to-br from-pink-500/5 to-background backdrop-blur-sm">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-headline font-semibold flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-pink-500" />
                    Radar Social
                </h3>
            </div>
            <div className="space-y-3">
                <div className="flex gap-4 items-start p-3 rounded-lg bg-card border shadow-sm hover:shadow-md transition-all">
                    <div className="flex flex-col items-center justify-center bg-pink-100 dark:bg-pink-900/30 text-pink-600 rounded-lg h-12 w-12 shrink-0">
                        <span className="text-xs font-bold uppercase">ENE</span>
                        <span className="text-lg font-bold">28</span>
                    </div>
                    <div>
                        <h4 className="font-semibold text-sm">Asamblea Vecinal</h4>
                        <p className="text-xs text-muted-foreground mb-1">16:00 • Parque Central</p>
                        <div className="flex -space-x-2">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="h-5 w-5 rounded-full border-2 border-background bg-muted" />
                            ))}
                            <span className="text-[10px] pl-3 flex items-center text-muted-foreground">+5</span>
                        </div>
                    </div>
                </div>
                <div className="text-center mt-2">
                    <Button variant="link" size="sm" className="text-pink-500">Ver Calendario Completo</Button>
                </div>
            </div>
        </div>
    );
}
