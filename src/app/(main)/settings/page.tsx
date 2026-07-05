"use client";

import React from "react";
import Link from "next/link";
import { AppearanceEditor } from "@/components/settings/appearance/appearance-editor";
import IntegrationsPanel from "@/components/integrations/integrations-panel";
import { AiProvidersPanel } from "@/components/settings/ai/ai-providers-panel";
import { IntelligencePanel } from "@/components/settings/ai/intelligence-panel";
import { NeuronsPanel } from "@/components/settings/neurons/neurons-panel";
import { AuroraChannelsPanel } from "@/components/settings/ai/aurora-channels-panel";
import { AuroraVoiceFallbackPanel } from "@/components/settings/aurora-voice-fallback-panel";
import { VoiceOssPanel } from "@/components/settings/aurora/voice-oss-panel";
import { VisionPanel } from "@/components/settings/aurora/vision-panel";
import { MixtureOfAgentsPanel } from "@/components/settings/ai/mixture-of-agents-panel";
import { TriSourceConfig } from "@/components/services/tri-source-config";
import { PrivacyPanel } from "@/components/settings/privacy/privacy-panel";
import { TrinityFabSettings } from "@/components/settings/trinity/trinity-fab-settings";
import { TrinityEdgeSettings } from "@/components/settings/trinity/trinity-edge-settings";
import { AccountSyncPanel } from "@/components/settings/account/account-sync-panel";
import { ProfileIdentityPanel } from "@/components/settings/profile/profile-identity-panel";
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
    Mail,
    Ear,
    Bell,
    Server,
    ExternalLink,
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

/* ── Tarjeta de enlace a una página dedicada ────────────────────────────────── */
function LinkCard({
    href,
    icon: Icon,
    label,
    description,
    accentText = "text-primary",
    accentBg = "bg-primary/10 border-primary/20",
}: {
    href: string;
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    description: string;
    accentText?: string;
    accentBg?: string;
}) {
    return (
        <Link
            href={href}
            className="flex items-center gap-3 p-3.5 rounded-xl border border-border/50 bg-card/40 hover:bg-card/70 transition-colors cursor-pointer group h-full"
        >
            <span className={cn("grid place-items-center w-9 h-9 rounded-lg border shrink-0", accentBg, accentText)}>
                <Icon className="w-4 h-4" />
            </span>
            <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-tight">{label}</p>
                <p className="text-[11px] text-muted-foreground leading-snug truncate">{description}</p>
            </div>
            <ExternalLink className="w-4 h-4 text-muted-foreground shrink-0 opacity-50 group-hover:opacity-90 transition-opacity" />
        </Link>
    );
}

/* ── Acceso rápido: tiles de navegación interna ───────────────────────────────
   Cada familia lleva su MATERIAL StarSeed (capa src/styles/starseed-materials.css)
   y su tono cardinal Trinity:
   · Perfil & Cuenta  → cristal líquido + Anchor (identidad = acceso raíz)
   · IA & Modelos     → neón Zenith (azul, la guía IA)
   · Aurora & Sentidos→ neón Horizon (lima/esmeralda, vitalidad)
   · Seguridad        → metal orgánico + oro Logic (orden, ejecución)          */
interface QuickTile {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    description: string;
    /** Material de la familia (ss-crystal / ss-neon--* / ss-metal). */
    material: string;
    /** Tono cardinal Trinity para icono 3D y anillo luminoso. */
    tone: string;
    tab: string;
}

const QUICK_TILES: QuickTile[] = [
    {
        icon: User,
        label: "Perfil & Cuenta",
        description: "Identidad · correos",
        material: "ss-crystal",
        tone: "ss-tone--anchor",
        tab: "profile",
    },
    {
        icon: Cpu,
        label: "IA & Modelos",
        description: "Local · API · Fuentes",
        material: "ss-neon ss-neon--zenith",
        tone: "",
        tab: "ai",
    },
    {
        icon: Sparkles,
        label: "Aurora & Sentidos",
        description: "Asistente · percepción",
        material: "ss-neon ss-neon--horizon",
        tone: "",
        tab: "experience",
    },
    {
        icon: Shield,
        label: "Seguridad",
        description: "Privacidad · conexiones",
        material: "ss-metal",
        tone: "ss-tone--logic",
        tab: "security",
    },
];

function QuickAccessTiles({ onTabChange }: { onTabChange: (tab: string) => void }) {
    return (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {QUICK_TILES.map((tile) => {
                const Icon = tile.icon;
                return (
                    <button
                        key={tile.label}
                        className="text-left h-full cursor-pointer"
                        onClick={() => onTabChange(tile.tab)}
                    >
                        <div
                            className={cn(
                                // Material + micro-tilt 3D + feedback táctil (transform only)
                                "flex flex-col gap-1.5 p-3 rounded-xl cursor-pointer group h-full ss-tilt ss-press",
                                tile.material,
                                tile.tone,
                            )}
                        >
                            <div className="flex items-center justify-between">
                                <span className="ss-icon-3d ss-icon-3d--sm">
                                    <Icon className="w-4 h-4" />
                                </span>
                                <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity" />
                            </div>
                            <p className="text-xs font-semibold leading-tight">{tile.label}</p>
                            <p className="text-[10px] leading-snug opacity-75">{tile.description}</p>
                        </div>
                    </button>
                );
            })}
        </div>
    );
}

/* ── Ramificación de menús: chips-ancla pegajosos por categoría ───────────────
   Barra compacta que acompaña al hacer scroll; cada chip activa su pestaña y
   desplaza suavemente hasta el panel de secciones (#settings-secciones). El
   chip activo viste el material de su familia; el resto queda neutro.        */
function CategoryChipsBar({ activeTab, onNavigate }: { activeTab: string; onNavigate: (tab: string) => void }) {
    return (
        <div className="sticky top-2 z-30">
            <nav
                aria-label="Categorías de configuración"
                className="ss-crystal rounded-full p-1.5 flex items-center gap-1 ss-hscroll ss-hscroll-fade w-fit max-w-full mx-auto md:mx-0"
            >
                {QUICK_TILES.map((tile) => {
                    const Icon = tile.icon;
                    const active = activeTab === tile.tab;
                    return (
                        <button
                            key={tile.tab}
                            type="button"
                            onClick={() => onNavigate(tile.tab)}
                            aria-current={active ? "true" : undefined}
                            className={cn(
                                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap transition-all duration-200 cursor-pointer ss-press shrink-0",
                                tile.tone,
                                active
                                    ? tile.material
                                    : "border border-transparent opacity-70 hover:opacity-100 hover:bg-foreground/5",
                            )}
                        >
                            <Icon className="w-3.5 h-3.5" />
                            <span>{tile.label}</span>
                        </button>
                    );
                })}
            </nav>
        </div>
    );
}

/* ── Página principal ───────────────────────────────────────────────────────── */
export default function SettingsPage() {
    const [activeTab, setActiveTab] = React.useState("appearance");

    // Ancla REAL: activa la pestaña y desplaza con scroll suave hasta el
    // panel de secciones (respeta prefers-reduced-motion).
    const goToSection = React.useCallback((tab: string) => {
        setActiveTab(tab);
        requestAnimationFrame(() => {
            const reduce =
                typeof window !== "undefined" &&
                window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            document.getElementById("settings-secciones")?.scrollIntoView({
                behavior: reduce ? "auto" : "smooth",
                block: "start",
            });
        });
    }, []);

    return (
        <div className="w-full mx-auto px-[clamp(1rem,3vw,3rem)] py-[clamp(1rem,2vw,2rem)] space-y-[clamp(1.5rem,3vw,3rem)] pb-24">
            {/* ── Encabezado de página ──────────────────────────────── */}
            <div className="flex flex-col gap-[clamp(0.5rem,1vw,1rem)] text-center md:text-left items-center md:items-start w-full">
                <h1 className="page-title w-full text-center md:text-left">Configuración</h1>
                <p className="text-[clamp(0.9rem,1.2vw,1.2rem)] text-muted-foreground max-w-2xl text-balance w-full text-center md:text-left">
                    Gestiona tu identidad, apariencia, IA, sentidos y seguridad. Todo sincronizado con tu cuenta soberana.
                </p>
            </div>

            {/* ── Panel superior: Cuenta real + Acceso rápido ─────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4 items-start">
                {/* ProfileSwitcher — Cuenta soberana REAL */}
                <ProfileSwitcher />

                {/* Acceso rápido a secciones clave */}
                <div className="space-y-2 lg:min-w-[260px] xl:min-w-[320px]">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground px-1">
                        Acceso rápido
                    </p>
                    <QuickAccessTiles onTabChange={goToSection} />
                </div>
            </div>

            {/* ── Chips-ancla pegajosos por categoría (ramificación) ── */}
            <CategoryChipsBar activeTab={activeTab} onNavigate={goToSection} />

            {/* ── Área de pestañas ─────────────────────────────────── */}
            <div className="relative">
                <div id="settings-secciones" className="scroll-mt-20 backdrop-blur-xl bg-background/30 border rounded-xl overflow-hidden shadow-2xl">
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                        <div className="border-b bg-muted/20 p-4">
                            <TabsList className="grid w-full grid-cols-3 md:grid-cols-7 max-w-4xl mx-auto gap-1">
                                <TabsTrigger value="appearance" className="gap-2 data-[state=active]:bg-background/50 cursor-pointer">
                                    <Palette className="h-4 w-4" /> <span className="hidden sm:inline">Diseño</span>
                                </TabsTrigger>
                                <TabsTrigger value="profile" className="gap-2 data-[state=active]:bg-background/50 cursor-pointer">
                                    <User className="h-4 w-4" /> <span className="hidden sm:inline">Perfil</span>
                                </TabsTrigger>
                                <TabsTrigger value="ai" className="gap-2 data-[state=active]:bg-background/50 cursor-pointer">
                                    <Sparkles className="h-4 w-4" /> <span className="hidden sm:inline">IA & Modelos</span>
                                </TabsTrigger>
                                <TabsTrigger value="integrations" className="gap-2 data-[state=active]:bg-background/50 cursor-pointer">
                                    <Plug2 className="h-4 w-4" /> <span className="hidden sm:inline">Integraciones</span>
                                </TabsTrigger>
                                <TabsTrigger value="experience" className="gap-2 data-[state=active]:bg-background/50 cursor-pointer">
                                    <Compass className="h-4 w-4" /> <span className="hidden sm:inline">Experiencia</span>
                                </TabsTrigger>
                                <TabsTrigger value="privacy" className="gap-2 data-[state=active]:bg-background/50 cursor-pointer">
                                    <ShieldCheck className="h-4 w-4" /> <span className="hidden sm:inline">Privacidad</span>
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

                            {/* ── Perfil e identidad (REAL) ──────────────────── */}
                            <TabsContent value="profile" className="m-0 space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <TabIntro
                                    icon={User}
                                    title="Perfil e identidad"
                                    description="Tu identidad soberana sincronizada con tu cuenta StarSeed. Edita nombre, @, avatar y bio; gestiona tus correos."
                                />

                                {/* Edición de perfil REAL contra Supabase */}
                                <ProfileIdentityPanel />

                                {/* Cuenta & correos @star.seed */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <LinkCard
                                        href="/cuenta"
                                        icon={ShieldCheck}
                                        label="Cuenta e identidad StarSeed"
                                        description="Dirección @star.seed · recuperación · verificación"
                                    />
                                    <LinkCard
                                        href="/correos"
                                        icon={Mail}
                                        label="Correos & buzones"
                                        description="Correos @star.seed y externos vinculados"
                                        accentText="text-[#39FF14]"
                                        accentBg="bg-[#39FF14]/10 border-[#39FF14]/20"
                                    />
                                </div>

                                {/* Sincronización de preferencias con la cuenta */}
                                <AccountSyncPanel />
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
                                {/* Inteligencia de Aurora (Astraura): gratis-primero, modelo por tarea y rutas transparentes */}
                                <IntelligencePanel />

                                <AiProvidersPanel />

                                {/* Mixture of Agents: combinaciones multi-agente que Aurora orquesta y selecciona por contexto */}
                                <MixtureOfAgentsPanel />

                                {/* Canales de Aurora: por dónde habla (interno + Telegram/Google Chat/API) */}
                                <AuroraChannelsPanel />

                                {/* Motor de voz de Aurora: Navegador / Kokoro (local, mejor español) / Kitten (beta) */}
                                <VoiceOssPanel />

                                {/* Reconocimiento de voz alternativo (open-source) para navegadores sin voz nativa */}
                                <AuroraVoiceFallbackPanel />

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

                                {/* Enlaces a páginas dedicadas de IA / servicios */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <LinkCard
                                        href="/ai-setup"
                                        icon={Brain}
                                        label="Asistente de configuración de IA"
                                        description="Pon en marcha tu Exocórtex paso a paso"
                                        accentText="text-[#FFBF00]"
                                        accentBg="bg-[#FFBF00]/10 border-[#FFBF00]/20"
                                    />
                                    <LinkCard
                                        href="/servicios"
                                        icon={Plug2}
                                        label="Servicios & fuentes"
                                        description="Modelos, almacenamiento y servidores conectados"
                                        accentText="text-[#39FF14]"
                                        accentBg="bg-[#39FF14]/10 border-[#39FF14]/20"
                                    />
                                </div>
                            </TabsContent>

                            {/* ── Integraciones (conectores OSS funcionales) ── */}
                            <TabsContent value="integrations" className="m-0 space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <TabIntro
                                    icon={Plug2}
                                    title="Integraciones de herramientas"
                                    description="Conecta tu OS a herramientas de código abierto (rastreo, apps IA, runtimes locales, automatización). Por defecto se usan los servicios de StarSeed; configura tu propio endpoint para usar el tuyo."
                                />
                                {/* Configuración GLOBAL (sin brainId). Cada cerebro puede sobrescribirla. */}
                                <IntegrationsPanel />
                            </TabsContent>

                            {/* ── Experiencia: Aurora / Astraura · Sentidos · Notificaciones ── */}
                            <TabsContent value="experience" className="m-0 space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <TabIntro
                                    icon={Compass}
                                    title="Experiencia inmersiva"
                                    description="Tu asistente Aurora/Astraura, la percepción sensorial del sistema, la navegación Trinity y tus notificaciones."
                                />

                                {/* Aurora / Astraura + Sentidos + Notificaciones (páginas dedicadas) */}
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <LinkCard
                                        href="/aurora"
                                        icon={Sparkles}
                                        label="Aurora / Astraura"
                                        description="Asistente · personalidad · palabra de activación"
                                    />
                                    <LinkCard
                                        href="/sentidos"
                                        icon={Ear}
                                        label="Sentidos"
                                        description="Percepción ambiental y multimodal del OS"
                                        accentText="text-[#39FF14]"
                                        accentBg="bg-[#39FF14]/10 border-[#39FF14]/20"
                                    />
                                    <LinkCard
                                        href="/notifications"
                                        icon={Bell}
                                        label="Notificaciones"
                                        description="Avisos del sistema y de la red"
                                        accentText="text-[#FFBF00]"
                                        accentBg="bg-[#FFBF00]/10 border-[#FFBF00]/20"
                                    />
                                </div>

                                {/* ── Visión de Aurora (SmolVLM2 · WebGPU · 100% local) ── */}
                                <VisionPanel />

                                {/* ── Astraura · Neuronas: tus dispositivos como red personal ── */}
                                <div className="space-y-3">
                                    <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground px-1">
                                        Astraura · Neuronas
                                    </p>
                                    <NeuronsPanel />
                                </div>

                                {/* Navegación Trinity (se configura aquí) */}
                                <Card className="bg-background/40 backdrop-blur-sm border-0 shadow-none">
                                    <CardHeader>
                                        <CardTitle className="flex items-center gap-2">
                                            <Compass className="w-5 h-5 text-primary" /> Navegación Trinity
                                        </CardTitle>
                                        <CardDescription>
                                            Configura el acceso a los 4 nodos cardinales: botón flotante en móvil y gestos desde los bordes de la pantalla.
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-5">
                                        <TrinityFabSettings />
                                        <TrinityEdgeSettings />
                                    </CardContent>
                                </Card>
                            </TabsContent>

                            {/* ── Privacidad ─────────────────────────────────── */}
                            <TabsContent value="privacy" className="m-0 space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <TabIntro
                                    icon={ShieldCheck}
                                    title="Privacidad"
                                    description="Controla qué datos compartes y cómo aparece tu actividad en el grafo público."
                                />
                                {/* Enlaces de red y privacidad */}
                                <LinkCard
                                    href="/servidores"
                                    icon={Globe}
                                    label="Servidores de internet"
                                    description="VPN · Nodos de red · Conexión al Fediverso"
                                    accentText="text-[#007FFF]"
                                    accentBg="bg-[#007FFF]/10 border-[#007FFF]/20"
                                />
                                <PrivacyPanel />
                            </TabsContent>

                            {/* ── Seguridad ──────────────────────────────────── */}
                            <TabsContent value="security" className="m-0 space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <TabIntro
                                    icon={Shield}
                                    title="Seguridad y soberanía"
                                    description="Gestiona tus llaves, conexiones autorizadas y la fragmentación segura de tus datos desde el Centro de Seguridad."
                                />

                                {/* Accesos a páginas dedicadas de seguridad/conexiones */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <LinkCard
                                        href="/seguridad"
                                        icon={Shield}
                                        label="Centro de Seguridad"
                                        description="Llaves, respaldo y fragmentación (MPC)"
                                    />
                                    <LinkCard
                                        href="/conexiones"
                                        icon={Plug2}
                                        label="Conexiones de servicios"
                                        description="OAuth · Wallets · Apps externas autorizadas"
                                        accentText="text-[#39FF14]"
                                        accentBg="bg-[#39FF14]/10 border-[#39FF14]/20"
                                    />
                                </div>

                                <Card className="bg-background/40 backdrop-blur-sm border-0 shadow-none">
                                    <CardHeader>
                                        <CardTitle className="flex items-center gap-2">
                                            <Shield className="w-5 h-5 text-primary" />
                                            Soberanía y seguridad MPC
                                        </CardTitle>
                                        <CardDescription>
                                            La gestión avanzada de llaves criptográficas y la fragmentación de datos (Multi-Party Computation) vive en el Centro de Seguridad.
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <div className="p-4 rounded-lg bg-muted/30 border border-border/40 flex items-start gap-3">
                                            <span className="grid place-items-center w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 text-primary shrink-0">
                                                <Server className="w-4 h-4" />
                                            </span>
                                            <div className="min-w-0">
                                                <h3 className="font-semibold text-sm">Fragmentación de llaves (Shamir / MPC)</h3>
                                                <p className="text-xs text-muted-foreground mt-0.5">
                                                    Aún no has configurado la fragmentación de tus llaves. Hazlo desde el Centro de Seguridad para dividirlas en nodos y habilitar el respaldo biométrico.
                                                </p>
                                                <Link
                                                    href="/seguridad"
                                                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-2 cursor-pointer"
                                                >
                                                    Abrir Centro de Seguridad <ArrowRight className="w-3 h-3" />
                                                </Link>
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
