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
import { flotaConocida, type ProveedorFlota } from "@/lib/mando/flota";

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
function TarjetaProveedor({ proveedor }: { proveedor: ProveedorFlota }) {
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
                {proveedor.modelos.map((modelo) => (
                    <li
                        key={modelo.id}
                        className="flex items-center justify-between gap-2 font-mono text-[11px] text-white/70"
                    >
                        <span className="truncate">{modelo.id}</span>
                        <span className="flex shrink-0 items-center gap-2 text-white/50">
                            {modelo.contexto !== undefined && (
                                <span>{formatoContexto(modelo.contexto)} ctx</span>
                            )}
                            {modelo.latenciaMs !== undefined && (
                                <span>{modelo.latenciaMs} ms</span>
                            )}
                            {modelo.gratis && <span className="text-emerald-300">gratis</span>}
                        </span>
                    </li>
                ))}
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

/** Panel principal de la flota de proveedores de inteligencia. */
export function PanelFlota() {
    const [estado, setEstado] = useState<EstadoMando | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [cargando, setCargando] = useState(true);

    const cargar = useCallback(async () => {
        setCargando(true);
        setError(null);
        try {
            const respuesta = await fetch("/api/mando/estado", { cache: "no-store" });
            if (!respuesta.ok) {
                setError("El mando no está disponible (solo funciona en local).");
                setEstado(null);
                return;
            }
            setEstado((await respuesta.json()) as EstadoMando);
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

            {agotados.length > 0 && (
                <p className="flex items-center gap-2 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                    <AlertTriangle className="h-4 w-4" />
                    Sin cuota hoy: {agotados.map((p) => p.nombre).join(" · ")}. La cadena de
                    relevo seguirá con el siguiente proveedor disponible.
                </p>
            )}

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {flota.map((proveedor) => (
                    <TarjetaProveedor key={proveedor.id} proveedor={proveedor} />
                ))}
            </div>

            <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                <h3 className="mb-2 text-sm font-semibold text-white">Enrutamientos recientes</h3>
                <TablaEnrutamientos estado={estado} />
            </div>
        </section>
    );
}
