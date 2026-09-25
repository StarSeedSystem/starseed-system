"use client";

/**
 * Botón «Instalar StarSeed OS» — el ÚNICO de todo el OS.
 * ═══════════════════════════════════════════════════════════════════════════
 * Lo usan la franja y la tarjeta de descarga de la Biblioteca, «Instalar StarSeed», la
 * página /instalar, la bienvenida y el diálogo de instalar de la ficha del OS. Un toque:
 * detecta el sistema, trae la última versión de GitHub y descarga el archivo que toca
 * (lógica en src/lib/install/instalar-os*.ts). Después dice, en una línea, cómo abrir el
 * archivo en ese sistema, y siempre ofrece «Otros sistemas y versiones».
 *
 * En iPhone/iPad (y donde no hay app nativa) explica cómo instalar la web y, si el
 * navegador tiene su diálogo de «instalar app», lo lanza.
 */

import { useCallback, useState } from "react";
import { CheckCircle2, Download, ExternalLink, Loader2, MonitorSmartphone, Package, Share } from "lucide-react";

import { cn } from "@/lib/utils";
import { tamanoLegible, type ReleaseOficial } from "@/lib/apps-oficiales/apps-oficiales";
import { useUltimaVersion } from "@/lib/apps-oficiales/ultima-version";
import { useInstalarOS, type ResultadoInstalarOS } from "@/lib/install/instalar-os";
import { instaladoresPorSistema, OS_APP_ID, OS_RELEASES_ULTIMA_URL, PASOS_IOS } from "@/lib/install/instalar-os-logica";

export interface BotonInstalarOSProps {
    className?: string;
    /** Sin la línea de ayuda bajo el botón (para filas de acciones y diálogos). */
    compacto?: boolean;
    /** Añade la lista de archivos de los otros sistemas (no solo el enlace). */
    conOtrosSistemas?: boolean;
    /** Tras pulsar: qué pasó (la descarga arrancó, la web se instaló…). */
    onResultado?: (r: ResultadoInstalarOS) => void;
}

function Enlace({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
                "inline-flex cursor-pointer items-center gap-1 font-medium text-emerald-300 underline-offset-2 hover:text-emerald-200 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300",
                className,
            )}
        >
            {children}
        </a>
    );
}

export function BotonInstalarOS({ className, compacto, conOtrosSistemas, onResultado }: BotonInstalarOSProps) {
    const { plan, cargando, instalar, release } = useInstalarOS();
    const [resultado, setResultado] = useState<ResultadoInstalarOS | null>(null);
    const [ocupado, setOcupado] = useState(false);

    const alPulsar = useCallback(async () => {
        if (ocupado || plan.tipo === "ya-instalada") return;
        setOcupado(true);
        try {
            const r = await instalar();
            setResultado(r);
            onResultado?.(r);
        } finally {
            setOcupado(false);
        }
    }, [ocupado, plan.tipo, instalar, onResultado]);

    const yaInstalada = plan.tipo === "ya-instalada";
    const Icono = yaInstalada ? CheckCircle2 : plan.tipo === "web" ? (plan.pasos === PASOS_IOS ? Share : MonitorSmartphone) : Download;
    const etiqueta = yaInstalada ? plan.titulo : plan.accion;
    const pista =
        plan.tipo === "descargar"
            ? `${plan.version} · ${plan.asset.formato}${plan.asset.bytes ? ` · ${tamanoLegible(plan.asset.bytes)}` : ""}`
            : plan.detalle;
    // El resultado mostrado debe ser del plan vigente (si el dispositivo se afinó después, se oculta).
    const res = resultado && resultado.plan.tipo === plan.tipo ? resultado : null;

    return (
        <div className={cn("flex w-full flex-col gap-2", className)} data-testid="boton-instalar-os">
            <button
                type="button"
                onClick={() => void alPulsar()}
                disabled={yaInstalada || ocupado}
                aria-describedby={compacto ? undefined : "instalar-os-pista"}
                className={cn(
                    "inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[13px] border px-4 py-2.5 text-sm font-bold",
                    "transition-[filter,opacity] duration-150 motion-reduce:transition-none",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300",
                    yaInstalada
                        ? "cursor-default border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
                        : "cursor-pointer border-emerald-300/30 bg-gradient-to-br from-violet-500/20 to-emerald-400/20 text-emerald-50 hover:brightness-110 disabled:opacity-75",
                )}
            >
                {ocupado ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Icono className="h-4 w-4" aria-hidden />}
                {etiqueta}
            </button>

            {!compacto && (
                <p id="instalar-os-pista" className="text-center text-[11px] leading-snug text-white/55">
                    {cargando && plan.tipo !== "ya-instalada" ? "Buscando la última versión publicada…" : pista}
                </p>
            )}

            {res && (
                <div
                    role="status"
                    aria-live="polite"
                    className="rounded-xl border border-white/12 bg-white/[0.04] p-3 text-xs leading-relaxed text-white/80"
                    data-testid="resultado-instalar-os"
                >
                    {res.plan.tipo === "descargar" && (
                        <>
                            <p className="font-semibold text-emerald-100">
                                {res.descargaIniciada
                                    ? `Descargando ${res.plan.asset.nombre} (${res.plan.version}).`
                                    : "Tu navegador no dejó empezar la descarga."}
                            </p>
                            <p className="mt-1">
                                <span className="font-semibold text-white/90">Cómo abrirlo: </span>
                                {res.plan.instrucciones}
                            </p>
                            {res.plan.nota && <p className="mt-1 text-amber-200/90">{res.plan.nota}</p>}
                            <p className="mt-1.5">
                                {res.descargaIniciada ? "¿No empezó? " : ""}
                                <a
                                    href={res.plan.asset.url}
                                    download={res.plan.asset.nombre}
                                    className="cursor-pointer font-medium text-emerald-300 underline-offset-2 hover:underline"
                                >
                                    {res.descargaIniciada ? "Descargar de nuevo" : `Descargar ${res.plan.asset.nombre}`}
                                </a>
                            </p>
                        </>
                    )}
                    {res.plan.tipo === "web" && (
                        <>
                            {res.pwa === "accepted" ? (
                                <p className="font-semibold text-emerald-100">Listo: StarSeed OS ya está instalada como app en este dispositivo.</p>
                            ) : (
                                <>
                                    <p>{res.pwa === "dismissed" ? "Instalación cancelada. Puedes hacerlo cuando quieras:" : res.plan.detalle}</p>
                                    <ol className="mt-1.5 list-decimal space-y-0.5 pl-4">
                                        {res.plan.pasos.map((p) => (
                                            <li key={p}>{p}</li>
                                        ))}
                                    </ol>
                                </>
                            )}
                        </>
                    )}
                </div>
            )}

            {(!compacto || res) && (
                <p className="text-center text-[11px]">
                    <Enlace href={plan.otrosUrl}>
                        Otros sistemas y versiones <ExternalLink className="h-3 w-3" aria-hidden />
                    </Enlace>
                </p>
            )}

            {conOtrosSistemas && <OtrosSistemasOS release={release} />}
        </div>
    );
}

/**
 * Los archivos del OS de la última versión, por sistema, con enlace directo. Lee el mismo
 * release que el botón (la caché compartida evita una segunda petición a GitHub).
 */
export function OtrosSistemasOS({ release, className }: { release?: ReleaseOficial | null; className?: string }) {
    const propio = useUltimaVersion(release === undefined ? OS_APP_ID : "");
    const r = release === undefined ? propio.release : release;
    const grupos = instaladoresPorSistema(r);
    const tag = r ? (r.tag.startsWith("v") ? r.tag : `v${r.tag}`) : "";

    return (
        <div className={cn("rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs", className)} data-testid="otros-sistemas-os">
            <p className="mb-2 flex items-center gap-1.5 font-semibold text-white/85">
                <Package className="h-3.5 w-3.5" aria-hidden /> Otros sistemas y versiones{tag ? ` · ${tag}` : ""}
            </p>
            <ul className="grid gap-1.5 sm:grid-cols-2">
                {grupos.map((g) => (
                    <li key={g.sistema} className="min-w-0">
                        <span className="text-white/70">{g.etiqueta}: </span>
                        {g.archivos.map((a, i) => (
                            <span key={a.nombre}>
                                {i > 0 && <span className="text-white/30"> · </span>}
                                <a
                                    href={a.url}
                                    download={a.nombre}
                                    title={a.nombre}
                                    className="cursor-pointer font-medium text-emerald-300 underline-offset-2 hover:text-emerald-200 hover:underline"
                                >
                                    {a.formato}
                                </a>
                            </span>
                        ))}
                    </li>
                ))}
                <li className="text-white/70 sm:col-span-2">iPhone o iPad: instala la web desde Safari (Compartir → «Añadir a pantalla de inicio»).</li>
            </ul>
            <p className="mt-2">
                <Enlace href={OS_RELEASES_ULTIMA_URL}>
                    Todas las versiones en GitHub <ExternalLink className="h-3 w-3" aria-hidden />
                </Enlace>
            </p>
        </div>
    );
}

export default BotonInstalarOS;
