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
    ExternalLink,
    Eye,
    EyeOff,
    KeyRound,
    Loader2,
    PenTool,
    RefreshCw,
    Search,
    Shuffle,
} from "lucide-react";

import type { EstadoMando } from "@/lib/mando/tipos";
import { flotaConocida, type ModeloFlota, type ProveedorFlota } from "@/lib/mando/flota";
import type { ModeloDisponible, SaludProveedor } from "@/lib/mando/modelos-disponibles";
import { proveedoresDisponibles, type ProveedorDisponible } from "@/lib/mando/proveedores-catalogo";

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

/** Lista de claves (var · medio · huella, nunca valores) con la activa marcada. */
function ListaClaves({ proveedor }: { proveedor: ProveedorDisponible }) {
    if (proveedor.claves.length === 0) return null;
    return (
        <ul className="mt-2 space-y-1">
            {proveedor.claves.map((c) => (
                <li key={`${c.var}-${c.medio}`} className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-white/70">
                    <span className={c.var === proveedor.activa ? "text-emerald-300" : ""}>{c.var}</span>
                    <span className="text-white/40">· {c.medio}</span>
                    <span className="text-white/40">· {c.huella}</span>
                    {c.var === proveedor.activa ? (
                        <span className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-300">
                            activa
                        </span>
                    ) : null}
                </li>
            ))}
        </ul>
    );
}

/** Chip «dato antiguo (hace N min)»: la salud local lleva más de 30 min sin sondeo. */
function ChipDatoAntiguo({ proveedor }: { proveedor: ProveedorDisponible }) {
    if (!proveedor.datoAntiguo) return null;
    return (
        <span
            title="La salud local de este proveedor tiene más de 30 minutos; se prefiere la foto del bus."
            className="cursor-help rounded-full border border-amber-400/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300"
        >
            dato antiguo{proveedor.edadSaludMin !== null ? ` (hace ${proveedor.edadSaludMin} min)` : ""}
        </span>
    );
}

/** Resultado de una acción sobre una clave (prueba o guardado). */
interface ResultadoClave {
    tipo: "ok" | "error";
    texto: string;
    /** Huella devuelta por el guardado (`gsk_xx…(44)`), nunca el valor. */
    huella?: string;
}

/**
 * Botón «Añadir mi clave» y su diálogo en línea para probar/guardar/olvidar la
 * clave de un proveedor (Ola 286 · 2026-09-08 · F2). Habla con `POST
 * /api/mando/claves`, que SOLO escribe en `~/.starseed/env` (chmod 600) y nunca
 * devuelve el valor. El valor aquí solo vive en el estado de React mientras se
 * escribe; al guardar se limpia y jamás se mete en la URL ni en un atributo
 * visible. Se reutiliza en las tres secciones (agotados, listos, por conseguir).
 */
function ControlesClave({ proveedor, onCambio }: { proveedor: ProveedorDisponible; onCambio: () => void }) {
    const [abierto, setAbierto] = useState(false);
    const [variable, setVariable] = useState(proveedor.variables[0] ?? "");
    const [valor, setValor] = useState("");
    const [visible, setVisible] = useState(false);
    const [ocupado, setOcupado] = useState(false);
    const [resultado, setResultado] = useState<ResultadoClave | null>(null);
    const [ofrecerForzar, setOfrecerForzar] = useState(false);
    const [confirmaOlvidar, setConfirmaOlvidar] = useState(false);

    const variableDefinida = proveedor.variables.length > 0;
    // Para olvidar se usa la clave activa del proveedor, o la primera que tenga.
    const varOlvidar = proveedor.activa ?? proveedor.claves[0]?.var ?? "";

    /** Limpia el estado sensible: la clave sale de la memoria de React al guardar. */
    const limpiar = () => {
        setValor("");
        setVisible(false);
        setResultado(null);
        setOfrecerForzar(false);
        setConfirmaOlvidar(false);
    };

    const cerrar = () => {
        limpiar();
        setAbierto(false);
    };

    const probar = async () => {
        if (!valor) return;
        setOcupado(true);
        setResultado(null);
        setOfrecerForzar(false);
        try {
            const r = await fetch("/api/mando/claves", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ accion: "probar", proveedor: proveedor.id, valor }),
            });
            const d = (await r.json()) as { ok?: boolean; modelos?: number; error?: string };
            if (d.ok) setResultado({ tipo: "ok", texto: `✓ ${d.modelos ?? 0} modelos disponibles` });
            else setResultado({ tipo: "error", texto: d.error ?? "La clave no fue aceptada." });
        } catch {
            setResultado({ tipo: "error", texto: "No se pudo contactar con el mando." });
        } finally {
            setOcupado(false);
        }
    };

    const guardar = async (forzar: boolean) => {
        if (!valor) return;
        setOcupado(true);
        setResultado(null);
        setOfrecerForzar(false);
        try {
            const r = await fetch("/api/mando/claves", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ accion: "guardar", proveedor: proveedor.id, variable, valor, forzar }),
            });
            const d = (await r.json()) as {
                ok?: boolean;
                error?: string;
                huella?: string;
                prueba?: { ok?: boolean; error?: string };
            };
            if (!d.ok) {
                // Si la prueba falló y no la forzamos, ofrecemos «Guardar de todas formas».
                if (!forzar && d.prueba && d.prueba.ok === false) {
                    setOfrecerForzar(true);
                    setResultado({ tipo: "error", texto: d.error ?? d.prueba.error ?? "La clave falló la prueba." });
                } else {
                    setResultado({ tipo: "error", texto: d.error ?? "No se pudo guardar." });
                }
                return;
            }
            // Éxito: enseñamos la huella, sacamos el valor de la memoria y cerramos.
            setResultado({ tipo: "ok", texto: "Clave guardada.", huella: d.huella });
            setValor("");
            setTimeout(cerrar, 1200);
        } catch {
            setResultado({ tipo: "error", texto: "No se pudo contactar con el mando." });
        } finally {
            setOcupado(false);
        }
    };

    const olvidar = async () => {
        setOcupado(true);
        try {
            await fetch("/api/mando/claves", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ accion: "olvidar", variable: varOlvidar }),
            });
        } catch {
            // Silencioso: se recarga igual y el panel refleja lo que quede en disco.
        } finally {
            setOcupado(false);
            cerrar();
            onCambio();
        }
    };

    return (
        <div className="flex flex-wrap items-center gap-2">
            <button
                type="button"
                onClick={() => {
                    setConfirmaOlvidar(false);
                    setAbierto((v) => !v);
                }}
                disabled={!variableDefinida}
                title={variableDefinida ? "Añadir mi clave" : "Este proveedor aún no define una variable."}
                className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
                <KeyRound className="h-3.5 w-3.5" />
                Añadir mi clave
            </button>

            {proveedor.claves.length > 0 && (
                <button
                    type="button"
                    onClick={() => (confirmaOlvidar ? void olvidar() : setConfirmaOlvidar(true))}
                    disabled={ocupado}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-red-400/20 bg-red-500/10 px-2.5 py-1.5 text-xs text-red-200 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                    title={`Olvidar la clave ${varOlvidar || ""}`.trim()}
                >
                    {confirmaOlvidar ? "¿Seguro? Olvidar" : "Olvidar clave"}
                </button>
            )}

            {abierto && variableDefinida && (
                <div className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 p-4 backdrop-blur">
                    <p className="text-xs text-white/60">Variable de entorno</p>
                    {proveedor.variables.length > 1 ? (
                        <select
                            value={variable}
                            onChange={(e) => setVariable(e.target.value)}
                            className="mt-1 w-full cursor-pointer rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white"
                        >
                            {proveedor.variables.map((v) => (
                                <option key={v} value={v} className="bg-black">
                                    {v}
                                </option>
                            ))}
                        </select>
                    ) : (
                        <p className="mt-1 font-mono text-xs text-white">{variable}</p>
                    )}
                    <p className="mt-2 text-[11px] leading-relaxed text-white/50">
                        Se guarda solo en ~/.starseed/env de esta neurona, con permisos 600; nunca en
                        el repositorio ni en la nube.
                    </p>

                    <div className="relative mt-2">
                        <input
                            type={visible ? "text" : "password"}
                            autoComplete="off"
                            spellCheck={false}
                            value={valor}
                            onChange={(e) => {
                                setValor(e.target.value);
                                setResultado(null);
                                setOfrecerForzar(false);
                            }}
                            placeholder="Pega tu clave aquí"
                            className="w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 pr-9 text-xs text-white placeholder:text-white/30"
                        />
                        <button
                            type="button"
                            onClick={() => setVisible((v) => !v)}
                            aria-label={visible ? "Ocultar clave" : "Mostrar clave"}
                            className="absolute inset-y-0 right-0 flex cursor-pointer items-center px-2 text-white/50 hover:text-white/80"
                        >
                            {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                    </div>

                    {resultado && (
                        <p
                            role="status"
                            className={`mt-2 rounded-md border px-2 py-1.5 text-[11px] ${
                                resultado.tipo === "ok"
                                    ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                                    : "border-amber-400/30 bg-amber-500/10 text-amber-200"
                            }`}
                        >
                            {resultado.texto}
                            {resultado.huella && (
                                <span className="mt-0.5 block font-mono text-white/60">{resultado.huella}</span>
                            )}
                        </p>
                    )}

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => void probar()}
                            disabled={ocupado || !valor}
                            className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            Probar
                        </button>
                        <button
                            type="button"
                            onClick={() => void guardar(false)}
                            disabled={ocupado || !valor}
                            className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1.5 text-xs text-emerald-200 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            Guardar
                        </button>
                        {ofrecerForzar && (
                            <button
                                type="button"
                                onClick={() => void guardar(true)}
                                disabled={ocupado}
                                className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-amber-400/40 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-200 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                Guardar de todas formas
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={cerrar}
                            className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white/80 hover:bg-white/10"
                        >
                            Cerrar
                        </button>
                        {ocupado && <Loader2 className="h-3.5 w-3.5 animate-spin text-white/50" />}
                    </div>
                </div>
            )}
        </div>
    );
}

/**
 * Proveedores del catálogo con su estado vivo y enlaces (Ola 271): agotados o
 * enfriándose con hasta cuándo y sus claves por medio; disponibles ahora con su
 * base; y por conseguir, que solo Alex puede abrir. La clasificación la hace el
 * servidor con las claves REALES de la máquina (M9B); el cálculo sobre el catálogo
 * del cliente solo queda como respaldo si el endpoint viejo no trajo `proveedores`.
 */
function SeccionProveedores({ catalogo, proveedores, onCambio }: { catalogo: ModeloDisponible[]; proveedores: ProveedorDisponible[] | null; onCambio: () => void }) {
    const disponibles = useMemo(() => {
        if (proveedores) return proveedores;
        // Respaldo: sin `proveedores` en la respuesta, se reconstruye la salud cruda a
        // partir del detalle que trae cada modelo del catálogo (`saludDetalle`).
        const salud: Record<string, unknown> = {};
        for (const m of catalogo) {
            if (!m.saludDetalle || salud[m.proveedor]) continue;
            salud[m.proveedor] = {
                estado: m.saludDetalle.estado,
                sin_cupo_hasta: m.saludDetalle.sinCupoHasta,
                t: m.saludDetalle.t,
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
    }, [catalogo, proveedores]);

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
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className="text-sm font-medium text-white">{p.nombre}</span>
                                    <span className="flex items-center gap-2">
                                        <ChipDatoAntiguo proveedor={p} />
                                        {p.sinCupoHasta ? (
                                            <span className="text-[11px] text-red-300">sin cupo hasta {p.sinCupoHasta}</span>
                                        ) : (
                                            <span className="text-[11px] text-amber-300">enfriándose</span>
                                        )}
                                    </span>
                                </div>
                                <ListaClaves proveedor={p} />
                                <div className="mt-2 flex flex-wrap items-center gap-3">
                                    <EnlaceExterno href={p.panelClaves} etiqueta="Conseguir clave" />
                                    <EnlaceExterno href={p.base} etiqueta="API" />
                                    <EnlaceExterno href={p.docs} etiqueta="Docs" />
                                    <ControlesClave proveedor={p} onCambio={onCambio} />
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
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className="text-sm font-medium text-white">{p.nombre}</span>
                                    <ChipDatoAntiguo proveedor={p} />
                                </div>
                                <p className="mt-1 font-mono text-[11px] text-white/50">{p.base}</p>
                                <p className="mt-1 text-[11px] text-white/60">{p.gratis}</p>
                                <ListaClaves proveedor={p} />
                                <div className="mt-2 flex flex-wrap items-center gap-3">
                                    <EnlaceExterno href={p.panelClaves} etiqueta="Conseguir clave" />
                                    <ControlesClave proveedor={p} onCambio={onCambio} />
                                </div>
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
                                <ControlesClave proveedor={p} onCambio={onCambio} />
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
    const [proveedores, setProveedores] = useState<ProveedorDisponible[] | null>(null);
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
                // El endpoint clasifica los proveedores con las claves REALES de la
                // máquina (M9B): nombres de variables, medios y huellas, nunca valores.
                const datos = (await respModelos.json()) as {
                    modelos: ModeloDisponible[];
                    proveedores?: ProveedorDisponible[];
                };
                setCatalogo(datos.modelos ?? []);
                setProveedores(datos.proveedores ?? null);
            } else {
                setCatalogo([]);
                setProveedores(null);
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

            {/* Los proveedores clasificados llegan del endpoint (`clavesPresentes` + bus). */}
            <SeccionProveedores catalogo={catalogo} proveedores={proveedores} onCambio={cargar} />

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
