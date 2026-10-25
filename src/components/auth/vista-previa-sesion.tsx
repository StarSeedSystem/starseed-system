"use client";

/**
 * Vistas previas de la puerta de sesión — lo que se ve (difuminado) detrás de «Te damos la bienvenida».
 * ═══════════════════════════════════════════════════════════════════════════
 * (Ola 1025T · ACC1025B) Una página que pide cuenta ya no pinta una tarjeta suelta «Inicia sesión…» sobre un
 * fondo vacío: pinta la página como sería con datos vacíos, y la puerta (`puerta-sesion.tsx`) la difumina y
 * pone delante la tarjeta de bienvenida. Aquí viven esas páginas «de mentira»:
 *
 *   · `perfil`     — el perfil por defecto: la CABECERA REAL del perfil (`ProfileHeader`, la misma de
 *                    `/profile/[usuario]`) con datos vacíos —portada de sistema, avatar vacío, «Tu nombre»,
 *                    «@usuario»— los carriles de pestañas REALES (`SectionTabs`) y bloques de sección;
 *   · `biblioteca` — una vista neutra de la Biblioteca (selector de entidad, filtros y carpetas);
 *   · `correos`    — una vista neutra de la bandeja de Correos (dirección, pestañas y mensajes).
 *
 * Las neutras son bloques sobrios, sin texto inventado ni datos de nadie. Todo es decoración que NO se
 * puede usar: la puerta la envuelve en `aria-hidden` + `inert` + `pointer-events-none`.
 *
 * Es un módulo aparte (y la puerta lo carga con `React.lazy`) para que las páginas con sesión no paguen
 * ni un byte de esto.
 */

import { BookMarked, CalendarDays, FileText, FolderOpen, Inbox, Layers, LayoutDashboard, Library, Link2, Mail, Send, Users } from "lucide-react";

import { cn } from "@/lib/utils";
import { ProfileHeader } from "@/components/profile/profile-header";
import { SectionTabs, type SectionTabItem } from "@/components/ui/section-tabs";

export type VistaPreviaId = "perfil" | "biblioteca" | "correos";

/* ───────────────────────────── Piezas de esqueleto ───────────────────────────── */

const noop = () => undefined;

function Linea({ ancho = "w-full", className }: { ancho?: string; className?: string }) {
    return <span className={cn("block h-2.5 rounded-full bg-white/[0.09]", ancho, className)} />;
}

/** Una tarjeta de sección vacía: título, subtítulo y unas líneas de contenido. */
function TarjetaEsqueleto({ titulo, lineas = 3, className }: { titulo?: string; lineas?: number; className?: string }) {
    return (
        <div className={cn("min-w-0 space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur", className)}>
            {titulo ? <p className="font-headline text-sm font-semibold text-foreground/80">{titulo}</p> : <Linea ancho="w-1/3" className="h-3" />}
            <div className="space-y-2">
                {Array.from({ length: lineas }, (_, i) => (
                    <Linea key={i} ancho={i === lineas - 1 ? "w-2/3" : "w-full"} />
                ))}
            </div>
        </div>
    );
}

/* ─────────────────────────────────── Perfil ─────────────────────────────────── */

const PESTANAS_PERFIL: SectionTabItem[] = [
    { value: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { value: "agenda", label: "Agenda", icon: CalendarDays },
    { value: "posts", label: "Publicaciones", icon: FileText },
    { value: "connections", label: "Conexiones", icon: Users },
    { value: "library", label: "Biblioteca", icon: Library },
    { value: "collections", label: "Colecciones", icon: Layers },
    { value: "enlaces", label: "Enlaces", icon: Link2 },
];

/** El perfil por defecto, vacío: la cabecera real + pestañas + secciones. */
export function VistaPreviaPerfil() {
    return (
        <div className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-4 overflow-x-clip p-3 sm:gap-6 sm:p-4" data-testid="vista-previa-perfil">
            <ProfileHeader
                profileData={{
                    name: "Tu nombre",
                    handle: "@usuario",
                    bio: "",
                    avatar: "",
                    cover: "",
                    isUser: false,
                    pageType: "personal",
                }}
            />
            <SectionTabs
                className="w-full max-w-full overflow-hidden"
                items={PESTANAS_PERFIL}
                value="dashboard"
                onValueChange={noop}
                ariaLabel="Secciones del perfil"
            />
            <div className="grid min-w-0 gap-4 sm:gap-6 lg:grid-cols-2">
                <TarjetaEsqueleto titulo="Primeros pasos" lineas={4} className="lg:col-span-2" />
                <TarjetaEsqueleto titulo="Publicaciones recientes" />
                <TarjetaEsqueleto titulo="Conexiones" />
                <TarjetaEsqueleto titulo="Sobre mí" lineas={2} />
                <TarjetaEsqueleto titulo="Enlaces" lineas={2} />
            </div>
        </div>
    );
}

/* ───────────────────────────────── Biblioteca ───────────────────────────────── */

export function VistaPreviaBiblioteca() {
    return (
        <div className="flex flex-col gap-4 p-3 sm:p-4" data-testid="vista-previa-biblioteca">
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3 backdrop-blur">
                <span className="flex items-center gap-1.5 pl-1 pr-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <BookMarked className="h-3.5 w-3.5" aria-hidden /> Biblioteca de
                </span>
                <span className="h-8 w-28 rounded-full bg-white/[0.09]" />
                <span className="h-8 w-24 rounded-full bg-white/[0.05]" />
                <span className="h-8 w-24 rounded-full bg-white/[0.05]" />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {Array.from({ length: 8 }, (_, i) => (
                    <div key={i} className="flex min-w-0 flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur">
                        <FolderOpen className="h-7 w-7 text-primary/60" aria-hidden />
                        <Linea ancho="w-3/4" />
                        <Linea ancho="w-1/2" />
                    </div>
                ))}
            </div>
        </div>
    );
}

/* ────────────────────────────────── Correos ────────────────────────────────── */

const PESTANAS_CORREOS: SectionTabItem[] = [
    { value: "inbox", label: "Recibidos", icon: Inbox },
    { value: "sent", label: "Enviados", icon: Send },
    { value: "ext", label: "Externos", icon: Mail },
];

export function VistaPreviaCorreos() {
    return (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-3 sm:p-6" data-testid="vista-previa-correos">
            <div className="space-y-2">
                <p className="font-headline text-2xl font-semibold text-foreground/85">Correos StarSeed</p>
                <Linea ancho="w-2/3" />
            </div>
            <SectionTabs
                className="w-full max-w-full overflow-hidden"
                items={PESTANAS_CORREOS}
                value="inbox"
                onValueChange={noop}
                ariaLabel="Bandejas"
            />
            <div className="space-y-2">
                {Array.from({ length: 6 }, (_, i) => (
                    <div key={i} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 backdrop-blur">
                        <span className="h-9 w-9 shrink-0 rounded-full bg-white/[0.09]" />
                        <div className="min-w-0 flex-1 space-y-2">
                            <Linea ancho="w-1/3" />
                            <Linea ancho="w-4/5" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

/* ─────────────────────────────────── Selector ─────────────────────────────────── */

export function VistaPrevia({ vista }: { vista: VistaPreviaId }) {
    if (vista === "biblioteca") return <VistaPreviaBiblioteca />;
    if (vista === "correos") return <VistaPreviaCorreos />;
    return <VistaPreviaPerfil />;
}

export default VistaPrevia;
