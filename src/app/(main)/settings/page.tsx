"use client";

import React from "react";
import Link from "next/link";
import { AppearanceEditor } from "@/components/settings/appearance/appearance-editor";
import { AiProvidersPanel } from "@/components/settings/ai/ai-providers-panel";
import { TriSourceConfig } from "@/components/services/tri-source-config";
import { PrivacyPanel } from "@/components/settings/privacy/privacy-panel";
import { TrinityFabSettings } from "@/components/settings/trinity/trinity-fab-settings";
import { TrinityEdgeSettings } from "@/components/settings/trinity/trinity-edge-settings";
import { AccountSyncPanel } from "@/components/settings/account/account-sync-panel";
import { ProfileSwitcher } from "@/components/profile/profile-switcher";
import { GlassCard } from "@/components/ui/glass-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Palette,
    User,
    Shield,
    Sparkles,
    ShieldCheck,
    Compass,
    Brain,
    Cpu,
    Plug2,
    Globe,
    ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Encabezado de propósito reutilizable para cada pestaña ─────────────────── */
function TabIntro({
    icon: Icon,
    title,
    description,
    className,
}: {
    icon: React.ComponentType<{ className?: string }>;
    title: string;
    description: string;
    className?: string;
}) {
    return (
        <div className={cn("flex items-start gap-3 mb-1", className)}>
            <span className="grid place-items-center w-9 h-9 rounded-xl shrink-0 bg-primary/10 border border-primary/20 text-primary">
                <Icon className="w-[18px] h-[18px]" />
            </span>
            <div className="min-w-0">
                <h2 className="text-base font-semibold leading-tight">{title}</h2>
                <p className="text-[13px] text-muted-foreground leading-snug">{description}</p>
            </div>
        </div>
    );
}

/* ── Acceso rápido: tiles de navegación ─────────────────────────────────────── */
interface QuickTile {
    href: string;
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    description: string;
    accent: string;
    tab?: string; // si apunta a una pestaña interna
    external?: boolean;
}

const QUICK_TILES: QuickTile[] = [
    {
        href: "#",
        icon: Brain,
        label: "Memoria local",
        description: "Exocórtex personal",
        accent: "text-primary border-primary/20 bg-primary/5 hover:bg-primary/10",
        tab: "ai",
    },
    {
        href: "#",
        icon: Cpu,
        label: "Servicio de IA",
        description: "Local · API · Modelo",
        accent: "text-[#FFBF00] border-[#FFBF00]/20 bg-[#FFBF00]/5 hover:bg-[#FFBF00]/10",
        tab: "ai",
    },
    {
        href: "#",
        icon: Plug2,
        label: "Conexiones",
        description: "Servicios vinculados",
        accent: "text-[#39FF14] border-[#39FF14]/20 bg-[#39FF14]/5 hover:bg-[#39FF14]/10",
        tab: "security",
    },
    {
        href: "#",
        icon: Globe,
        label: "Red & Privacidad",
        description: "VPN · Nodos · Fediverso",
        accent: "text-[#007FFF] border-[#007FFF]/20 bg-[#007FFF]/5 hover:bg-[#007FFF]/10",
        tab: "privacy",
    },
];

function QuickAccessTiles({ onTabChange }: { onTabChange: (tab: string) => void }) {
    return (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {QUICK_TILES.map((tile) => {
                const Icon = tile.icon;
                const inner = (
                    <div
                        className={cn(
                            "flex flex-col gap-1.5 p-3 rounded-xl border transition-all duration-200 cursor-pointer group h-full",
                            tile.accent,
                        )}
                    >
                        <div className="flex items-center justify-between">
                            <Icon className="w-4 h-4" />
                            <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity" />
                        </div>
                        <p className="text-xs font-semibold leading-tight">{tile.label}</p>
                        <p className="text-[10px] text-muted-foreground leading-snug">{tile.description}</p>
                    </div>
                );

                if (tile.tab) {
                    return (
                        <button
                            key={tile.label}
                            className="text-left h-full cursor-pointer"
                            onClick={() => onTabChange(tile.tab!)}
                        >
                            {inner}
                        </button>
                    );
                }

                return (
                    <Link key={tile.label} href={tile.href} className="h-full cursor-pointer">
                        {inner}
                    </Link>
                );
            })}
        </div>
    );
}

/* ── Página principal ───────────────────────────────────────────────────────── */
export default function SettingsPage() {
    const [activeTab, setActiveTab] = React.useState("appearance");

    return (
        <div className="w-full mx-auto px-[clamp(1rem,3vw,3rem)] py-[clamp(1rem,2vw,2rem)] space-y-[clamp(1.5rem,3vw,3rem)] pb-24">
            {/* ── Encabezado de página ──────────────────────────────── */}
            <div className="flex flex-col gap-[clamp(0.5rem,1vw,1rem)] text-center md:text-left items-center md:items-start w-full">
                <h1 className="page-title w-full text-center md:text-left">Configuración</h1>
                <p className="text-[clamp(0.9rem,1.2vw,1.2rem)] text-muted-foreground max-w-2xl text-balance w-full text-center md:text-left">
                    Gestiona tus preferencias, apariencia y seguridad.
                </p>
            </div>

            {/* ── Panel superior: Perfiles + Acceso rápido ─────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4 items-start">
                {/* ProfileSwitcher — Dualidad Cuenta/Perfil */}
                <ProfileSwitcher />

                {/* Acceso rápido a secciones clave */}
                <div className="space-y-2 lg:min-w-[260px] xl:min-w-[320px]">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground px-1">
                        Acceso rápido
                    </p>
                    <QuickAccessTiles onTabChange={setActiveTab} />
                </div>
            </div>

            {/* ── Área de pestañas ─────────────────────────────────── */}
            <div className="relative">
                <div className="backdrop-blur-xl bg-background/30 border rounded-xl overflow-hidden shadow-2xl">
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                        <div className="border-b bg-muted/20 p-4">
                            <TabsList className="grid w-full grid-cols-3 md:grid-cols-6 max-w-3xl mx-auto gap-1">
                                <TabsTrigger value="appearance" className="gap-2 data-[state=active]:bg-background/50 cursor-pointer">
                                    <Palette className="h-4 w-4" /> <span className="hidden sm:inline">Diseño</span>
                                </TabsTrigger>
                                <TabsTrigger value="trinity" className="gap-2 data-[state=active]:bg-background/50 cursor-pointer">
                                    <Compass className="h-4 w-4" /> <span className="hidden sm:inline">Trinity</span>
                                </TabsTrigger>
                                <TabsTrigger value="ai" className="gap-2 data-[state=active]:bg-background/50 cursor-pointer">
                                    <Sparkles className="h-4 w-4" /> <span className="hidden sm:inline">IA & Modelos</span>
                                </TabsTrigger>
                                <TabsTrigger value="privacy" className="gap-2 data-[state=active]:bg-background/50 cursor-pointer">
                                    <ShieldCheck className="h-4 w-4" /> <span className="hidden sm:inline">Privacidad</span>
                                </TabsTrigger>
                                <TabsTrigger value="profile" className="gap-2 data-[state=active]:bg-background/50 cursor-pointer">
                                    <User className="h-4 w-4" /> <span className="hidden sm:inline">Perfil</span>
                                </TabsTrigger>
                                <TabsTrigger value="security" className="gap-2 data-[state=active]:bg-background/50 cursor-pointer">
                                    <Shield className="h-4 w-4" /> <span className="hidden sm:inline">Seguridad</span>
                                </TabsTrigger>
                            </TabsList>
                        </div>

                        <div className="p-6 bg-gradient-to-br from-background/50 to-background/10 min-h-[50vh]">
                            {/* ── Diseño ─────────────────────────────────────── */}
                            <TabsContent value="appearance" className="m-0 space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <TabIntro
                                    icon={Palette}
                                    title="Diseño y apariencia"
                                    description="Personaliza temas, tipografía, interfaz, fondo y accesibilidad. Todo se guarda al instante y es reversible."
                                />
                                <AppearanceEditor />
                            </TabsContent>

                            {/* ── Trinity ────────────────────────────────────── */}
                            <TabsContent value="trinity" className="m-0 space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <TabIntro
                                    icon={Compass}
                                    title="Navegación Trinity"
                                    description="Configura el acceso a los 4 nodos cardinales: botón flotante en móvil y gestos desde los bordes de la pantalla."
                                />
                                <TrinityFabSettings />
                                <TrinityEdgeSettings />
                            </TabsContent>

                            {/* ── IA & Modelos ───────────────────────────────── */}
                            <TabsContent value="ai" className="m-0 space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <TabIntro
                                    icon={Sparkles}
                                    title="IA y modelos"
                                    description="Gestiona los proveedores de tu Exocórtex. Las claves se cifran y viven solo en tu navegador."
                                />
                                {/* Resumen de estado del Exocórtex */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <GlassCard intensity="low" className="p-4 flex items-center gap-3">
                                        <span className="grid place-items-center w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 text-primary shrink-0">
                                            <Brain className="w-4 h-4" />
                                        </span>
                                        <div>
                                            <p className="text-sm font-semibold">Memoria local (Exocórtex)</p>
                                            <p className="text-[11px] text-muted-foreground">Almacenada en tu navegador · Solo tú la controlas</p>
                                        </div>
                                    </GlassCard>
                                    <GlassCard intensity="low" className="p-4 flex items-center gap-3">
                                        <span className="grid place-items-center w-9 h-9 rounded-lg bg-[#FFBF00]/10 border border-[#FFBF00]/20 text-[#FFBF00] shrink-0">
                                            <Cpu className="w-4 h-4" />
                                        </span>
                                        <div>
                                            <p className="text-sm font-semibold">Servicio de IA activo</p>
                                            <p className="text-[11px] text-muted-foreground">Configura proveedores API o modelo local</p>
                                        </div>
                                    </GlassCard>
                                </div>
                                <AiProvidersPanel />

                                {/* Modelo tri-fuente: elige y modula las fuentes de IA */}
                                <TriSourceConfig
                                    domain="ai"
                                    title="Fuentes de IA (propio · StarSeed · externo)"
                                    description="Más allá de los proveedores de arriba, define qué servidor(es) atienden la IA y cómo se interconectan: tu modelo propio, StarSeed o una API externa, simultáneamente y modulados."
                                    endpointPlaceholder="https://mi-llm.local/v1"
                                    paramHints={[
                                        { key: "model", label: "Modelo", placeholder: "p.ej. llama3.1 / gpt-4o" },
                                        { key: "temperature", label: "Temperatura", placeholder: "0.7" },
                                    ]}
                                />
                            </TabsContent>

                            {/* ── Privacidad ─────────────────────────────────── */}
                            <TabsContent value="privacy" className="m-0 space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <TabIntro
                                    icon={ShieldCheck}
                                    title="Privacidad"
                                    description="Controla qué datos compartes y cómo aparece tu actividad en el grafo público."
                                />
                                {/* Tiles de red y privacidad */}
                                <GlassCard intensity="low" className="p-4 flex items-center gap-3">
                                    <span className="grid place-items-center w-9 h-9 rounded-lg bg-[#007FFF]/10 border border-[#007FFF]/20 text-[#007FFF] shrink-0">
                                        <Globe className="w-4 h-4" />
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold">Servidores de internet</p>
                                        <p className="text-[11px] text-muted-foreground">VPN · Nodos de red · Conexión al Fediverso</p>
                                    </div>
                                    <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                                </GlassCard>
                                <PrivacyPanel />
                            </TabsContent>

                            {/* ── Perfil e identidad ─────────────────────────── */}
                            <TabsContent value="profile" className="m-0 space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <TabIntro
                                    icon={User}
                                    title="Perfil e identidad"
                                    description="Tu identidad soberana, credenciales verificables y la sincronización con tu cuenta StarSeed."
                                />

                                {/* Acceso rápido al perfil público */}
                                <GlassCard intensity="low" className="p-4 flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <span className="grid place-items-center w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 text-primary shrink-0">
                                            <User className="w-4 h-4" />
                                        </span>
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold">Ver mi perfil público</p>
                                            <p className="text-[11px] text-muted-foreground truncate">starseed-os.vercel.app/profile/alex_starseed</p>
                                        </div>
                                    </div>
                                    <Link href="/profile/alex_starseed" className="cursor-pointer shrink-0">
                                        <span className="flex items-center gap-1 text-xs text-primary hover:underline cursor-pointer">
                                            Abrir <ArrowRight className="w-3 h-3" />
                                        </span>
                                    </Link>
                                </GlassCard>

                                <Card className="bg-background/40 backdrop-blur-sm border-0 shadow-none">
                                    <CardHeader>
                                        <CardTitle className="flex items-center gap-2">
                                            <User className="w-5 h-5 text-primary" />
                                            Identidad Soberana
                                        </CardTitle>
                                        <CardDescription>
                                            Tu representación en el Grafo Vivo. Estos datos están anclados en IPFS.
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-6">
                                        <div className="flex flex-col md:flex-row gap-6 items-start">
                                            <div className="flex flex-col items-center gap-3">
                                                <div className="relative group cursor-pointer">
                                                    <div className="absolute -inset-1 bg-gradient-to-tr from-primary to-accent rounded-full blur opacity-40 group-hover:opacity-75 transition-opacity" />
                                                    <div className="h-24 w-24 rounded-full overflow-hidden border-2 border-background relative z-10">
                                                        <img src="https://placehold.co/200x200.png" alt="Profile" className="object-cover w-full h-full" />
                                                    </div>
                                                    <div className="absolute bottom-0 right-0 bg-background border p-1 rounded-full z-20 shadow-sm">
                                                        <Palette className="w-3 h-3 text-muted-foreground" />
                                                    </div>
                                                </div>
                                                <button className="text-xs text-primary hover:underline cursor-pointer">Cambiar Avatar NFT</button>
                                            </div>

                                            <div className="flex-1 space-y-4 w-full">
                                                <div className="grid md:grid-cols-2 gap-4">
                                                    <div className="space-y-2">
                                                        <label className="text-sm font-medium">Alias (Handle)</label>
                                                        <input className="w-full flex h-10 rounded-md border border-input bg-background/50 px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                                            defaultValue="@alex_starseed"
                                                        />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <label className="text-sm font-medium">Nombre Público</label>
                                                        <input className="w-full flex h-10 rounded-md border border-input bg-background/50 px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                                            defaultValue="Alex"
                                                        />
                                                    </div>
                                                </div>

                                                <div className="space-y-2">
                                                    <label className="text-sm font-medium">Bio (Manifiesto Personal)</label>
                                                    <textarea className="flex min-h-[80px] w-full rounded-md border border-input bg-background/50 px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                                        defaultValue="Arquitecto de realidades y explorador del sistema StarSeed. Buscando la convergencia entre tecnología y naturaleza."
                                                    />
                                                </div>

                                                <div className="space-y-2">
                                                    <label className="text-sm font-medium">Credenciales Verificables (Claims)</label>
                                                    <div className="flex flex-wrap gap-2 p-3 bg-muted/20 rounded-lg border border-dashed">
                                                        <div className="px-2 py-1 rounded-full bg-primary/10 text-primary text-xs border border-primary/20 flex items-center gap-1">
                                                            <span>Permacultor Nivel 3</span>
                                                        </div>
                                                        <div className="px-2 py-1 rounded-full bg-primary/10 text-primary text-xs border border-primary/20 flex items-center gap-1">
                                                            <span>Humano Verificado</span>
                                                        </div>
                                                        <div className="px-2 py-1 rounded-full bg-muted text-muted-foreground text-xs border flex items-center gap-1 opacity-50 cursor-not-allowed">
                                                            <span>+ Vincular Nueva Credencial</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>

                                <AccountSyncPanel />
                            </TabsContent>

                            {/* ── Seguridad ──────────────────────────────────── */}
                            <TabsContent value="security" className="m-0 space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <TabIntro
                                    icon={Shield}
                                    title="Seguridad y soberanía"
                                    description="Gestiona tus llaves criptográficas, el respaldo biométrico y la fragmentación segura de tus datos (MPC)."
                                />

                                {/* Tile de conexiones de servicios */}
                                <GlassCard intensity="low" className="p-4 flex items-center gap-3">
                                    <span className="grid place-items-center w-9 h-9 rounded-lg bg-[#39FF14]/10 border border-[#39FF14]/20 text-[#39FF14] shrink-0">
                                        <Plug2 className="w-4 h-4" />
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold">Conexiones de servicios</p>
                                        <p className="text-[11px] text-muted-foreground">OAuth · Wallets · Aplicaciones externas autorizadas</p>
                                    </div>
                                    <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                                </GlassCard>

                                <Card className="bg-background/40 backdrop-blur-sm border-0 shadow-none">
                                    <CardHeader>
                                        <CardTitle className="flex items-center gap-2">
                                            <Shield className="w-5 h-5 text-primary" />
                                            Soberanía y Seguridad MPC
                                        </CardTitle>
                                        <CardDescription>
                                            Gestiona tus llaves criptográficas y la fragmentación de datos (Multi-Party Computation).
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-6">

                                        <div className="p-4 rounded-lg bg-muted/30 border border-primary/10">
                                            <div className="flex items-center justify-between mb-4">
                                                <div>
                                                    <h3 className="font-semibold text-sm">Estado de Fragmentación (Shards)</h3>
                                                    <p className="text-xs text-muted-foreground">Tus llaves privadas están divididas en 3 nodos seguros.</p>
                                                </div>
                                                <div className="flex gap-1">
                                                    <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" title="Nodo Alpha: Activo" />
                                                    <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse delay-75" title="Nodo Beta: Activo" />
                                                    <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse delay-150" title="Nodo Gamma: Activo" />
                                                </div>
                                            </div>
                                            <div className="h-2 w-full bg-secondary/20 rounded-full overflow-hidden">
                                                <div className="h-full bg-primary w-[100%] animate-[shimmer_2s_infinite]" />
                                            </div>
                                            <div className="mt-2 flex justify-between text-xs font-mono opacity-70">
                                                <span>Integridad: 100%</span>
                                                <span>Protocolo: Shamir's Secret Sharing</span>
                                            </div>
                                        </div>

                                        <div className="grid md:grid-cols-2 gap-4">
                                            <div className="p-4 rounded-lg border bg-card/50 hover:bg-card/80 transition-colors cursor-pointer group">
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="font-medium text-sm">Respaldo Biométrico</span>
                                                    <div className="w-8 h-4 rounded-full bg-primary/20 p-0.5 group-hover:bg-primary/30 transition-colors">
                                                        <div className="w-3 h-3 rounded-full bg-primary translate-x-4 transition-transform" />
                                                    </div>
                                                </div>
                                                <p className="text-xs text-muted-foreground">Usar FaceID/TouchID para regenerar fragmentos locales.</p>
                                            </div>

                                            <div className="p-4 rounded-lg border bg-card/50 hover:bg-card/80 transition-colors cursor-pointer group">
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="font-medium text-sm">Modo Fantasma</span>
                                                    <div className="w-8 h-4 rounded-full bg-muted p-0.5 group-hover:bg-muted/80 transition-colors">
                                                        <div className="w-3 h-3 rounded-full bg-muted-foreground/50 transition-transform" />
                                                    </div>
                                                </div>
                                                <p className="text-xs text-muted-foreground">Ocultar actividad en el grafo público (ActivityPub).</p>
                                            </div>
                                        </div>

                                    </CardContent>
                                </Card>
                            </TabsContent>
                        </div>
                    </Tabs>
                </div>
            </div>
        </div>
    );
}
