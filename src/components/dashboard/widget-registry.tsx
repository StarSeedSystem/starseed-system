'use client';

import { DashboardWidget } from "./dashboard-types";
import { ThemeSelectorWidget } from "@/components/dashboard/widgets/theme-selector-widget";
import { ExploreNetworkWidget } from "@/components/dashboard/widgets/explore-network-widget";
import { MyPagesWidget } from "@/components/dashboard/widgets/my-pages-widget";
import { PoliticalSummaryWidget } from "@/components/dashboard/widgets/political-summary-widget";
import { SystemStatusWidget } from "@/components/dashboard/widgets/system-status-widget";
import { RecentActivityWidget } from "@/components/dashboard/widgets/recent-activity-widget";

// We can extract other widgets later
import { Activity, Calendar, Heart, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface WidgetProps {
    widget: DashboardWidget;
}

export function WidgetRegistry({ widget }: WidgetProps) {
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
        case 'LEARNING_PATH':
            return <LearningPathWidget />;
        case 'SOCIAL_RADAR':
            return <SocialRadarWidget />;
        case 'WELLNESS':
            return <WellnessWidget />;
        case 'THEME_SELECTOR':
            return <ThemeSelectorWidget />;
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

function WellnessWidget() {
    return (
        <div className="flex h-full flex-col p-6 text-white bg-gradient-to-br from-teal-400 to-teal-600 relative overflow-hidden backdrop-blur-md">
            <div className="absolute -bottom-4 -right-4 bg-white/20 h-32 w-32 rounded-full blur-2xl" />
            <div className="absolute top-4 right-4 bg-white/10 p-2 rounded-full">
                <Heart className="h-5 w-5 text-white" />
            </div>

            <div className="relative z-10 flex flex-col h-full justify-between">
                <div>
                    <h3 className="text-lg font-headline font-semibold opacity-90">Bienestar</h3>
                    <p className="text-sm opacity-75">Tu momento diario</p>
                </div>

                <div className="text-center py-4">
                    <p className="text-xl font-medium font-serif italic mb-2">"La paz comienza con una sonrisa."</p>
                    <p className="text-xs opacity-75">- Madre Teresa</p>
                </div>

                <Button variant="secondary" size="sm" className="w-full bg-white/20 hover:bg-white/30 border-0 text-white backdrop-blur-sm">
                    Registrar Estado de Ánimo
                </Button>
            </div>
        </div>
    );
}
