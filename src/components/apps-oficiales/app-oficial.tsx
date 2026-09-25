"use client";

/**
 * AppOficial — una app oficial del ecosistema DENTRO del OS, en su última versión.
 *
 * (2026-09-25) Alex: «las apps de Audiomorphic y de Omnifrecuencias dentro de StarSeed OS
 * deben ser las mismas que las últimas versiones actualizadas de sus repos oficiales,
 * utilizando el enlace de su sitio web para versiones en línea».
 *
 * Por qué un iframe a la web oficial y no el port:
 *   · Los ports (src/components/dashboard/apps/…) se copiaron hace semanas y se quedaron
 *     atrás; cada release nuevo exigía volver a portarlo. La web oficial se despliega sola
 *     desde su repo, así que SIEMPRE es la última.
 *   · Medido: audiomorphic.vercel.app y omnifrecuencias.vercel.app no envían
 *     X-Frame-Options ni CSP (se pueden enmarcar) y el OS no fija Permissions-Policy, así
 *     que el atributo `allow` concede micrófono, cámara, WebXR y pantalla completa.
 *   · Sin `sandbox`: con allow-scripts + allow-same-origin (que ambas necesitan) el sandbox
 *     ya no protege nada y sí puede romper WebXR, descargas y la instalación como app.
 *
 * El port se conserva como «versión integrada» (el de Audiomorphic mueve además la capa de
 * fondo del OS) y se carga solo si la persona lo elige. La elección se recuerda por app.
 */

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState, type ComponentType } from "react";
import { AlertTriangle, Code2, Download, ExternalLink, Layers, Loader2, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { APPS_OFICIALES } from "@/lib/apps-oficiales/apps-oficiales";
import { etiquetaVersion, useUltimaVersion } from "@/lib/apps-oficiales/ultima-version";
import { appPorId } from "@/lib/instalaciones/plan";

// El diálogo (neuronas, perfiles, cuenta) solo se descarga cuando alguien pulsa «Instalar».
const DialogoInstalar = dynamic(() => import("@/components/library/dialogo-instalar").then((m) => m.DialogoInstalar), {
    ssr: false,
});

export const ESPERA_IFRAME_MS = 12_000;

export type VistaApp = "oficial" | "integrada";

export function claveVista(appId: string): string {
    return `starseed.apps-oficiales.vista.${appId}.v1`;
}

function leerVista(appId: string): VistaApp {
    try {
        return localStorage.getItem(claveVista(appId)) === "integrada" ? "integrada" : "oficial";
    } catch {
        return "oficial";
    }
}

function guardarVista(appId: string, v: VistaApp): void {
    try {
        localStorage.setItem(claveVista(appId), v);
    } catch {
        /* modo privado: la elección dura lo que dure la pestaña */
    }
}

export interface AppOficialProps {
    appId: string;
    /** El port antiguo, ya envuelto en carga diferida; si falta, no se ofrece el conmutador. */
    integrada?: ComponentType;
    className?: string;
}

function BotonBarra({
    icono: Icono,
    etiqueta,
    onClick,
    href,
    activo,
    textoVisible,
}: {
    icono: LucideIcon;
    etiqueta: string;
    onClick?: () => void;
    href?: string;
    activo?: boolean;
    /** En móvil la barra enseña solo iconos (con nombre accesible); aquí se fuerza el texto. */
    textoVisible?: boolean;
}) {
    const clase = cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70",
        activo ? "border-amber-300/50 bg-amber-400/15 text-amber-100" : "border-white/15 text-white/85 hover:bg-white/10",
    );
    const contenido = (
        <>
            <Icono className="h-3.5 w-3.5" aria-hidden />
            <span className={textoVisible ? undefined : "sr-only md:not-sr-only"}>{etiqueta}</span>
        </>
    );
    if (href) {
        return (
            <a href={href} target="_blank" rel="noopener noreferrer" className={clase} title={etiqueta}>
                {contenido}
            </a>
        );
    }
    return (
        <button type="button" onClick={onClick} className={clase} title={etiqueta}>
            {contenido}
        </button>
    );
}

export function AppOficial({ appId, integrada: Integrada, className }: AppOficialProps) {
    const app = APPS_OFICIALES[appId];
    const { release, origen } = useUltimaVersion(appId);
    const [vista, setVista] = useState<VistaApp>("oficial");
    const [cargada, setCargada] = useState(false);
    const [atascada, setAtascada] = useState(false);
    const [dialogoAbierto, setDialogoAbierto] = useState(false);
    const [dialogoMontado, setDialogoMontado] = useState(false);
    // Cada «Seguir esperando» vuelve a armar el plazo de 12 s.
    const [intento, setIntento] = useState(0);

    // La vista guardada se lee tras montar: el servidor no tiene localStorage y el primer
    // render debe coincidir en los dos lados.
    useEffect(() => {
        if (Integrada) setVista(leerVista(appId));
    }, [appId, Integrada]);

    const cambiarVista = useCallback(
        (v: VistaApp) => {
            setVista(v);
            guardarVista(appId, v);
            setCargada(false);
            setAtascada(false);
        },
        [appId],
    );

    useEffect(() => {
        if (vista !== "oficial" || cargada) return;
        const t = setTimeout(() => setAtascada(true), ESPERA_IFRAME_MS);
        return () => clearTimeout(t);
    }, [vista, cargada, intento]);

    if (!app) return null;
    const verIntegrada = vista === "integrada" && Boolean(Integrada);
    const textoVersion = release ? etiquetaVersion(release) : "";

    return (
        <div className={cn("relative flex h-full w-full flex-col overflow-hidden bg-black", className)}>
            <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/10 bg-black/70 px-3 py-2 backdrop-blur">
                <div className="min-w-0 flex-1">
                    <h2 className="truncate text-sm font-bold text-white">{app.nombre}</h2>
                    <p
                        className="truncate text-[11px] text-muted-foreground"
                        title={origen === "respaldo" ? "No se pudo consultar GitHub: es la última versión conocida." : "Último release publicado en su repositorio."}
                    >
                        {verIntegrada ? "Versión integrada del OS" : `Versión oficial en línea${textoVersion ? ` · ${textoVersion}` : ""}`}
                        {!verIntegrada && origen === "respaldo" ? " (última conocida)" : ""}
                    </p>
                </div>
                <nav aria-label={`Acciones de ${app.nombre}`} className="flex flex-wrap items-center gap-1.5">
                    <BotonBarra icono={ExternalLink} etiqueta="Abrir en pestaña nueva" href={app.web} />
                    <BotonBarra
                        icono={Download}
                        etiqueta="Instalar en mis dispositivos"
                        onClick={() => {
                            setDialogoMontado(true);
                            setDialogoAbierto(true);
                        }}
                    />
                    <BotonBarra icono={Code2} etiqueta="Código fuente" href={`https://github.com/${app.repo}`} />
                    {Integrada && (
                        <button
                            type="button"
                            role="switch"
                            aria-checked={verIntegrada}
                            aria-describedby={`nota-integrada-${appId}`}
                            onClick={() => cambiarVista(verIntegrada ? "oficial" : "integrada")}
                            className={cn(
                                "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70",
                                verIntegrada ? "border-amber-300/50 bg-amber-400/15 text-amber-100" : "border-white/15 text-white/85 hover:bg-white/10",
                            )}
                        >
                            <Layers className="h-3.5 w-3.5" aria-hidden />
                            <span className="sr-only md:not-sr-only">Versión integrada del OS</span>
                        </button>
                    )}
                    <span id={`nota-integrada-${appId}`} className="sr-only">
                        integrada (más antigua; es la que usa el fondo del OS)
                    </span>
                </nav>
            </header>

            <div className="relative min-h-0 flex-1">
                {verIntegrada && Integrada ? (
                    <>
                        <div className="absolute inset-x-0 top-0 z-10 flex flex-wrap items-center justify-between gap-2 bg-amber-500/15 px-3 py-1.5 text-[11px] text-amber-100">
                            <span>Estás en la versión integrada (más antigua; es la que usa el fondo del OS).</span>
                            <button type="button" onClick={() => cambiarVista("oficial")} className="font-semibold underline-offset-2 hover:underline cursor-pointer">
                                Volver a la versión oficial
                            </button>
                        </div>
                        <div className="absolute inset-0 pt-8">
                            <Integrada />
                        </div>
                    </>
                ) : (
                    <>
                        <iframe
                            src={app.web}
                            title={`${app.nombre} · versión oficial en línea`}
                            allow={app.permisos}
                            allowFullScreen
                            referrerPolicy="strict-origin-when-cross-origin"
                            onLoad={() => setCargada(true)}
                            className="absolute inset-0 h-full w-full border-0 bg-black"
                        />
                        {!cargada && !atascada && (
                            <div role="status" className="absolute inset-0 grid place-items-center bg-black/80 text-xs font-semibold text-white/70">
                                <span className="inline-flex items-center gap-2">
                                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Cargando la versión oficial de {app.nombre}…
                                </span>
                            </div>
                        )}
                        {atascada && !cargada && (
                            <div role="alert" className="absolute inset-0 grid place-items-center bg-black/90 p-6 text-center">
                                <div className="flex max-w-sm flex-col items-center gap-3">
                                    <AlertTriangle className="h-8 w-8 text-amber-300" aria-hidden />
                                    <p className="text-sm text-white/85">
                                        La versión oficial no ha cargado en 12 segundos. Puede ser la conexión o que el navegador no la deje abrirse aquí dentro.
                                    </p>
                                    <div className="flex flex-wrap justify-center gap-2">
                                        <BotonBarra icono={ExternalLink} etiqueta="Abrir en pestaña nueva" href={app.web} textoVisible />
                                        {Integrada && (
                                            <BotonBarra icono={Layers} etiqueta="Usar la versión integrada" onClick={() => cambiarVista("integrada")} textoVisible />
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setAtascada(false);
                                                setIntento((i) => i + 1);
                                            }}
                                            className="text-xs font-semibold text-white/70 underline-offset-2 hover:underline cursor-pointer"
                                        >
                                            Seguir esperando
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {dialogoMontado && <DialogoInstalar app={appPorId(appId)} open={dialogoAbierto} onOpenChange={setDialogoAbierto} />}
        </div>
    );
}

export default AppOficial;
