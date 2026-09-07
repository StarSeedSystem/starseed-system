"use client";

/**
 * Panel de flota del Centro de Mando (Ola 231)
 * ─────────────────────────────────────────────────────────────────────────────
 * Vista de un vistazo de los proveedores de inteligencia: papel en la cadena
 * de relevo (escritor / revisor), estado, barra de uso frente a su cuota,
 * modelos con su ventana de contexto y latencia, y los últimos enrutamientos
 * (quién escribió y quién revisó cada tarea, según la bitácora de relevo y
 * las revisiones). Lee `GET /api/mando/estado` (solo local; 404 en producción).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
    AlertTriangle,
    Cloud,
    Cpu,
    PenTool,
    RefreshCw,
    Search,
    Shuffle,
} from "lucide-react";

import type { EstadoMando } from "@/lib/mando/tipos";
import { flotaConocida, type ModeloFlota, type ProveedorFlota } from "@/lib/mando/flota";
import type { ModeloDisponible, SaludProveedor } from "@/lib/mando/modelos-disponibles";
import { proveedoresDisponibles } from "@/lib/mando/proveedores-catalogo";
import { ExternalLink } from "lucide-react";

/** Colores de estado (semaforización de la flota). */
const COLOR_ESTADO: Record<ProveedorFlota["estado"], string> = {
    listo: "bg-emerald-400",
    agotado: "bg-red-400",
    "sin-clave": "bg-amber-400",
    desconocido: "bg-zinc-500",
};

const TEXTO_ESTADO: Record<ProveedorFlota["estado"], string> = {
    listo: "Listo",
    agotado: "Agotado",
    "sin-clave": "Sin clave",
    desconocido: "Desconocido",
};

/** Icono según el papel del proveedor en la cadena de relevo. */
function IconoPapel({ papel }: { papel: ProveedorFlota["papel"] }) {
    const clase = "h-4 w-4";
    if (papel === "escritor") return <PenTool className={clase} aria-label="Escritor" />;
    if (papel === "revisor") return <Search className={clase} aria-label="Revisor" />;
    return <Shuffle className={clase} aria-label="Escritor y revisor" />;
}

const TEXTO_PAPEL: Record<ProveedorFlota["papel"], string> = {
    escritor: "Escritor",
    revisor: "Revisor",
    ambos: "Escribe y revisa",
};

/** Formatea una ventana de contexto grande de forma legible. */
function formatoContexto(tokens: number): string {
    if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(0)}M`;
    if (tokens >= 1000) return `${Math.round(tokens / 1000)}k`;
    return String(tokens);
}

/**
 * Marcas del catálogo vivo (`/api/mando/modelos`) para un modelo de la flota:
 * los ids de la flota no llevan prefijo de proveedor («moonshotai/kimi-k3»
 * casa con «nim/moonshotai/kimi-k3»).
 */
function marcasDeModelo(
    modelo: ModeloFlota,
    catalogo: ModeloDisponible[],
): { escritor: boolean; soloMarkdown: boolean } {
    for (const m of catalogo) {
        if (m.id === modelo.id || m.id.endsWith(`/${modelo.id}`)) {
            return { escritor: m.escritor === true, soloMarkdown: m.soloMarkdown === true };
        }
    }
    return { escritor: false, soloMarkdown: false };
}

/** Fecha del supervisor («AAAA-MM-DD HH:MM:SS», hora de la máquina) → ms, o null si no cuadra. */
function fechaSupervisor(t: string | null | undefined): number | null {
    if (!t) return null;
    const ms = Date.parse(t.replace(" ", "T") + (t.length <= 19 ? "Z" : ""));
    return Number.isFinite(ms) ? ms : null;
}

/** «HH:MM» local para una marca de tiempo. */
function horaCorta(ms: number): string {
    return new Date(ms).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

/** «Hace N min» redondeando hacia abajo. */
function minutosDesde(ms: number): number {
    return Math.max(0, Math.floor((Date.now() - ms) / 60_000));
}

/**
 * Salud viva de los revisores (Ola 269): «sin cupo hasta HH:MM» cuando el proveedor
 * anunció un agotamiento futuro, «enfriándose · 429 hace N min» en los 10 min tras un
 * 429, y arriba el último revisor que respondió algo útil.
 */
function AvisoSaludRevisores({ catalogo }: { catalogo: ModeloDisponible[] }) {
    const porProveedor = new Map<string, SaludProveedor>();
    let ultimoRevisorOk: string | null = null;
    for (const m of catalogo) {
        if (m.saludDetalle && !porProveedor.has(m.proveedor)) porProveedor.set(m.proveedor, m.saludDetalle);
        if (!ultimoRevisorOk && m.ultimoRevisorOk) ultimoRevisorOk = m.ultimoRevisorOk;
    }

    const ahora = Date.now();
    const pastillas: Array<{ clave: string; texto: string; titulo: string }> = [];
    for (const [proveedor, detalle] of porProveedor) {
        const sinCupo = fechaSupervisor(detalle.sinCupoHasta);
        if (sinCupo !== null && sinCupo > ahora) {
            pastillas.push({
                clave: `${proveedor}-cupo`,
                texto: `${proveedor}: sin cupo hasta ${horaCorta(sinCupo)}`,
                titulo: detalle.motivo ?? "Sin cupo según el supervisor del enjambre.",
            });
            continue;
        }
        const ultimo429 = fechaSupervisor(detalle.ultimo429);
        if (ultimo429 !== null && ahora - ultimo429 < 10 * 60_000) {
            pastillas.push({
                clave: `${proveedor}-429`,
                texto: `${proveedor}: enfriándose · 429 hace ${minutosDesde(ultimo429)} min`,
                titulo: detalle.motivo ?? "Último 429 registrado por el supervisor del enjambre.",
            });
        }
    }

    if (!ultimoRevisorOk && pastillas.length === 0) return null;

    return (
        <div
            data-testid="salud-revisores"
            className="space-y-2 rounded-xl border border-white/10 bg-black/30 p-3"
        >
            {ultimoRevisorOk && (
                <p className="text-xs text-white/60">
                    Último revisor que respondió:{" "}
                    <span className="font-mono text-emerald-300">{ultimoRevisorOk}</span>
                </p>
            )}
            {pastillas.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                    {pastillas.map((p) => (
                        <span
                            key={p.clave}
                            title={p.titulo}
                            className="inline-flex cursor-help items-center gap-1 rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-200"
                        >
                            <AlertTriangle className="h-3 w-3" />
                            {p.texto}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}

/** Convierte el uso diario (`ProveedorUso[]`) en `Record<motor, total>`. */
function usoPorMotor(estado: EstadoMando | null): Record<string, number> {
    const uso: Record<string, number> = {};
    for (const entrada of estado?.uso ?? []) {
        const clave = entrada.proveedor.trim().toLowerCase();
        if (!clave) continue;
        uso[clave] = (uso[clave] ?? 0) + entrada.usado;
    }
    return uso;
}

/** Tarjeta de un proveedor de la flota. */
function TarjetaProveedor({ proveedor, catalogo }: { proveedor: ProveedorFlota; catalogo: ModeloDisponible[] }) {
    const porcentaje =
        proveedor.limiteDia !== undefined && proveedor.limiteDia > 0
            ? Math.min(100, Math.round(((proveedor.usoHoy ?? 0) / proveedor.limiteDia) * 100))
            : null;

    return (
        <article className="rounded-xl border border-white/10 bg-black/30 p-4 backdrop-blur">
            <header className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <span
                        className={`h-2.5 w-2.5 rounded-full ${COLOR_ESTADO[proveedor.estado]}`}
                        title={TEXTO_ESTADO[proveedor.estado]}
                    />
                    <h3 className="text-sm font-semibold text-white">{proveedor.nombre}</h3>
                </div>
                <span className="flex items-center gap-1 rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-white/70">
                    <IconoPapel papel={proveedor.papel} />
                    {TEXTO_PAPEL[proveedor.papel]}
                </span>
            </header>

            {porcentaje !== null && proveedor.limiteDia !== undefined ? (
                <div className="mt-3">
                    <div className="flex justify-between text-[11px] text-white/60">
                        <span>Uso de hoy</span>
                        <span>
                            {proveedor.usoHoy ?? 0} / {proveedor.limiteDia}
                        </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                        <div
                            className={`h-full rounded-full ${
                                proveedor.estado === "agotado" ? "bg-red-400" : "bg-emerald-400"
                            }`}
                            style={{ width: `${porcentaje}%` }}
                        />
                    </div>
                </div>
            ) : (
                <p className="mt-3 text-[11px] text-white/60">
                    {proveedor.limiteRpm !== undefined
                        ? `Límite: ~${proveedor.limiteRpm} req/min · uso hoy: ${proveedor.usoHoy ?? 0}`
                        : `Uso hoy: ${proveedor.usoHoy ?? 0}`}
                </p>
            )}

            <ul className="mt-3 space-y-1">
                {proveedor.modelos.map((modelo) => {
                    const marcas = marcasDeModelo(modelo, catalogo);
                    return (
                        <li
                            key={modelo.id}
                            className="flex items-center justify-between gap-2 font-mono text-[11px] text-white/70"
                        >
                            <span className="truncate">{modelo.id}</span>
                            <span className="flex shrink-0 items-center gap-2 text-white/50">
                                {marcas.escritor && (
                                    <span className="rounded-full border border-sky-400/40 bg-sky-500/10 px-1.5 py-0.5 text-[10px] text-sky-300">
                                        escritor
                                    </span>
                                )}
                                {marcas.soloMarkdown && (
                                    <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300">
                                        solo Markdown
                                    </span>
                                )}
                                {modelo.contexto !== undefined && (
                                    <span>{formatoContexto(modelo.contexto)} ctx</span>
                                )}
                                {modelo.latenciaMs !== undefined && (
                                    <span>{modelo.latenciaMs} ms</span>
                                )}
                                {modelo.gratis && <span className="text-emerald-300">gratis</span>}
                            </span>
                        </li>
                    );
                })}
            </ul>

            <p className="mt-3 text-[11px] leading-relaxed text-white/50">{proveedor.nota}</p>
        </article>
    );
}

/** Los últimos enrutamientos: quién escribió y quién revisó cada tarea. */
function TablaEnrutamientos({ estado }: { estado: EstadoMando | null }) {
    const eventos = (estado?.relevo?.eventos ?? []).slice(-12).reverse();
    const revisiones = (estado?.revisiones ?? []).slice(0, 12);

    if (eventos.length === 0 && revisiones.length === 0) {
        return (
            <p className="text-xs text-white/50">
                Aún no hay enrutamientos registrados en la bitácora de relevo.
            </p>
        );
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
                <thead>
                    <tr className="border-b border-white/10 text-white/50">
                        <th className="py-2 pr-3 font-medium">Fecha</th>
                        <th className="py-2 pr-3 font-medium">Tarea</th>
                        <th className="py-2 pr-3 font-medium">Escritor</th>
                        <th className="py-2 pr-3 font-medium">Revisor</th>
                    </tr>
                </thead>
                <tbody>
                    {eventos.map((evento, índice) => {
                        const revisión = revisiones[índice];
                        return (
                            <tr
                                key={`${evento.id}-${índice}`}
                                className="border-b border-white/5 text-white/75"
                            >
                                <td className="max-w-[9rem] truncate py-2 pr-3 text-white/50">
                                    {evento.t || "—"}
                                </td>
                                <td className="max-w-[16rem] truncate py-2 pr-3">
                                    {evento.tarea || evento.texto || "—"}
                                </td>
                                <td className="py-2 pr-3">{evento.quien || "—"}</td>
                                <td className="py-2 pr-3">
                                    {revisión ? revisión.titulo.replace(/^#+\s*/, "") : "—"}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

/** Enlace editorial del catálogo (panel de claves, API o docs). */
function EnlaceExterno({ href, etiqueta }: { href: string; etiqueta: string }) {
    return (
        <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex cursor-pointer items-center gap-1 text-[11px] text-sky-300 underline decoration-sky-300/40 underline-offset-2 transition-colors hover:text-sky-200"
        >
            {etiqueta}
            <ExternalLink className="h-3 w-3" />
        </a>
    );
}

/**
 * Proveedores del catálogo con su estado vivo y enlaces (Ola 271): agotados o
 * enfriándose con hasta cuándo y sus claves por medio; disponibles ahora con su
 * base; y por conseguir, que solo Alex puede abrir.
 */
function SeccionProveedores({ catalogo }: { catalogo: ModeloDisponible[] }) {
    const disponibles = useMemo(() => {
        // Se reconstruye la salud cruda a partir del detalle que trae cada modelo
        // del catálogo (`saludDetalle` por proveedor, con claves y la activa).
        const salud: Record<string, unknown> = {};
        for (const m of catalogo) {
            if (!m.saludDetalle || salud[m.proveedor]) continue;
            salud[m.proveedor] = {
                estado: m.saludDetalle.estado,
                sin_cupo_hasta: m.saludDetalle.sinCupoHasta,
                claves: {
                    claves: m.saludDetalle.claves.map((c) => ({
                        var: c.var,
                        medio: c.medio,
                        huella: c.huella,
                        agotada_hasta: c.agotadaHasta,
                    })),
                    activa: m.saludDetalle.clavesActiva,
                },
            };
        }
        return proveedoresDisponibles(salud);
    }, [catalogo]);

    const agotados = disponibles.filter((p) => p.estado === "sinCupo" || p.estado === "enfriandose");
    const listos = disponibles.filter((p) => p.estado === "activo" || p.estado === "sinClave");
    const porConseguir = disponibles.filter((p) => p.estado === "porConseguir");

    return (
        <section data-testid="proveedores-enlaces" className="space-y-4 rounded-xl border border-white/10 bg-black/30 p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                <Cloud className="h-4 w-4" />
                Proveedores
            </h3>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="space-y-2">
                    <h4 className="text-xs font-medium uppercase tracking-wide text-white/50">
                        Agotados o enfriándose
                    </h4>
                    {agotados.length === 0 ? (
                        <p className="text-xs text-white/50">Ninguno agotado ahora mismo.</p>
                    ) : (
                        agotados.map((p) => (
                            <article key={p.id} className="rounded-lg border border-red-400/20 bg-red-500/5 p-3">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-sm font-medium text-white">{p.nombre}</span>
                                    {p.sinCupoHasta ? (
                                        <span className="text-[11px] text-red-300">sin cupo hasta {p.sinCupoHasta}</span>
                                    ) : (
                                        <span className="text-[11px] text-amber-300">enfriándose</span>
                                    )}
                                </div>
                                {p.claves.length > 0 && (
                                    <ul className="mt-2 space-y-1">
                                        {p.claves.map((c) => (
                                            <li key={c.var} className="flex items-center gap-2 font-mono text-[11px] text-white/70">
                                                <span className={c.var === p.activa ? "text-emerald-300" : ""}>
                                                    {c.var}
                                                </span>
                                                <span className="text-white/40">· {c.medio}</span>
                                                <span className="text-white/40">· {c.huella}</span>
                                                {c.var === p.activa ? (
                                                    <span className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-300">
                                                        activa
                                                    </span>
                                                ) : null}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                                <div className="mt-2 flex flex-wrap items-center gap-3">
                                    <EnlaceExterno href={p.panelClaves} etiqueta="Conseguir clave" />
                                    <EnlaceExterno href={p.base} etiqueta="API" />
                                    <EnlaceExterno href={p.docs} etiqueta="Docs" />
                                </div>
                            </article>
                        ))
                    )}
                </div>

                <div className="space-y-2">
                    <h4 className="text-xs font-medium uppercase tracking-wide text-white/50">
                        Disponibles ahora
                    </h4>
                    {listos.length === 0 ? (
                        <p className="text-xs text-white/50">Ninguno disponible.</p>
                    ) : (
                        listos.map((p) => (
                            <article key={p.id} className="rounded-lg border border-emerald-400/20 bg-emerald-500/5 p-3">
                                <span className="text-sm font-medium text-white">{p.nombre}</span>
                                <p className="mt-1 font-mono text-[11px] text-white/50">{p.base}</p>
                                <p className="mt-1 text-[11px] text-white/60">{p.gratis}</p>
                            </article>
                        ))
                    )}
                </div>
            </div>

            {porConseguir.length > 0 && (
                <div className="space-y-2">
                    <h4 className="text-xs font-medium uppercase tracking-wide text-white/50">
                        Por conseguir (solo Alex crea cuentas)
                    </h4>
                    <ul className="space-y-1">
                        {porConseguir.map((p) => (
                            <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-400/20 bg-amber-500/5 p-2 text-[12px]">
                                <span className="font-medium text-white">{p.nombre}</span>
                                <span className="text-white/50">{p.gratis}</span>
                                <EnlaceExterno href={p.panelClaves} etiqueta="Conseguir clave" />
                                <EnlaceExterno href={p.base} etiqueta="API" />
                                <EnlaceExterno href={p.docs} etiqueta="Docs" />
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </section>
    );
}

/** Panel principal de la flota de proveedores de inteligencia. */
export function PanelFlota() {
    const [estado, setEstado] = useState<EstadoMando | null>(null);
    const [catalogo, setCatalogo] = useState<ModeloDisponible[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [cargando, setCargando] = useState(true);

    const cargar = useCallback(async () => {
        setCargando(true);
        setError(null);
        try {
            const [respuesta, respModelos] = await Promise.all([
                fetch("/api/mando/estado", { cache: "no-store" }),
                // Catálogo vivo: salud de revisores y marcas escritor/solo Markdown.
                fetch("/api/mando/modelos", { cache: "no-store" }).catch(() => null),
            ]);
            if (!respuesta.ok) {
                setError("El mando no está disponible (solo funciona en local).");
                setEstado(null);
                setCatalogo([]);
                return;
            }
            setEstado((await respuesta.json()) as EstadoMando);
            if (respModelos?.ok) {
                setCatalogo(((await respModelos.json()) as { modelos: ModeloDisponible[] }).modelos ?? []);
            } else {
                setCatalogo([]);
            }
        } catch {
            setError("No se pudo leer el estado del mando.");
        } finally {
            setCargando(false);
        }
    }, []);

    useEffect(() => {
        void cargar();
    }, [cargar]);

    const flota = useMemo(() => flotaConocida(usoPorMotor(estado)), [estado]);
    const agotados = flota.filter((p) => p.estado === "agotado");

    if (error) {
        return (
            <section className="rounded-xl border border-white/10 bg-black/30 p-4 text-sm text-white/70">
                <p className="flex items-center gap-2">
                    <Cloud className="h-4 w-4" />
                    {error}
                </p>
            </section>
        );
    }

    return (
        <section className="space-y-4">
            <header className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-base font-semibold text-white">
                    <Cpu className="h-4 w-4" />
                    Flota de inteligencia
                </h2>
                <button
                    type="button"
                    onClick={() => void cargar()}
                    className="flex cursor-pointer items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-xs text-white/70 transition-colors hover:bg-white/10"
                    disabled={cargando}
                >
                    <RefreshCw className={`h-3.5 w-3.5 ${cargando ? "animate-spin" : ""}`} />
                    Actualizar
                </button>
            </header>

            <AvisoSaludRevisores catalogo={catalogo} />

            <SeccionProveedores catalogo={catalogo} />

            {agotados.length > 0 && (
                <p className="flex items-center gap-2 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                    <AlertTriangle className="h-4 w-4" />
                    Sin cuota hoy: {agotados.map((p) => p.nombre).join(" · ")}. La cadena de
                    relevo seguirá con el siguiente proveedor disponible.
                </p>
            )}

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {flota.map((proveedor) => (
                    <TarjetaProveedor key={proveedor.id} proveedor={proveedor} catalogo={catalogo} />
                ))}
            </div>

            <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                <h3 className="mb-2 text-sm font-semibold text-white">Enrutamientos recientes</h3>
                <TablaEnrutamientos estado={estado} />
            </div>
        </section>
    );
}
