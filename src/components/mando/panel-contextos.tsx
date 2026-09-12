"use client";

/**
 * Panel de contextos del Centro de Mando (Ola 239)
 * ─────────────────────────────────────────────────────────────────────────────
 * Con qué trabajó cada agente del enjambre: la lista de tareas que registraron
 * su contexto (id · ola · título · hace cuánto · tamaño) y, al abrir una, sus
 * bloques: área, documentos que debía leer, reglas del área, habilidades,
 * fuentes externas, conexiones vivas, relevo y revisión previa. Un buscador
 * filtra por id, título, área o habilidad.
 *
 * Lee `GET /api/mando/contextos` (solo local; 404 en producción; sin claves
 * ni rutas absolutas del disco).
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
    ChevronLeft,
    CircleDashed,
    RefreshCw,
    Search,
} from "lucide-react";

// Solo el tipo viaja al cliente: `contextos.ts` es código de servidor (lee
// disco) y un import de valor metería `node:fs` en el bundle web. La lógica
// pura del panel (filtro, tiempos, tamaños) vive en `contextos-panel.ts`.
import type { ContextoAgente } from "@/lib/mando/contextos";
import { coincide, haceCuanto, tamanoTexto } from "@/lib/mando/contextos-panel";

/** Respuesta de `GET /api/mando/contextos`. */
interface RespuestaContextos {
    contextos: ContextoAgente[];
}

/** Un chip: documento, habilidad, fuente o archivo. */
function Chip({ children }: { children: ReactNode }) {
    return (
        <li className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-white/60">
            {children}
        </li>
    );
}

/** Bloque con título y contenido; se omite si no hay nada que mostrar. */
function Bloque({
    titulo,
    children,
}: {
    titulo: string;
    children: ReactNode;
}) {
    return (
        <section className="rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2">
            <h4 className="text-[11px] uppercase tracking-wide text-white/40">
                {titulo}
            </h4>
            <div className="mt-1 text-sm text-white/80">{children}</div>
        </section>
    );
}

/** Lista de chips con su etiqueta accesible; «—» si está vacía. */
function Chips({
    etiqueta,
    valores,
}: {
    etiqueta: string;
    valores: string[];
}) {
    if (valores.length === 0) return <span className="text-white/40">—</span>;
    return (
        <ul className="flex flex-wrap gap-1" aria-label={etiqueta}>
            {valores.map((valor, índice) => (
                <Chip key={valor || `chip-${índice}`}>{valor}</Chip>
            ))}
        </ul>
    );
}

/** Texto largo (relevo, revisión) en varias líneas, respetando saltos. */
function TextoLargo({ texto }: { texto: string }) {
    if (!texto.trim()) return <span className="text-white/40">—</span>;
    return (
        <p className="whitespace-pre-line text-sm text-white/80">{texto}</p>
    );
}

/** Ficha expandida de un contexto: todos sus bloques. */
function FichaContexto({
    contexto,
    onCerrar,
}: {
    contexto: ContextoAgente;
    onCerrar: () => void;
}) {
    return (
        <article className="space-y-3 rounded-xl border border-white/10 bg-black/30 p-4 backdrop-blur">
            <header className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h3 className="text-sm font-semibold text-white">
                        <span className="font-mono">{contexto.tarea}</span>
                        {contexto.ola ? (
                            <span className="text-white/40"> · {contexto.ola}</span>
                        ) : null}
                    </h3>
                    <p className="text-xs text-white/60">{contexto.titulo}</p>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-white/50">
                    <span>{haceCuanto(contexto.t)}</span>
                    <span>{tamanoTexto(contexto.caracteres)}</span>
                    <button
                        type="button"
                        onClick={onCerrar}
                        className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-xs text-white/70 hover:bg-white/5"
                    >
                        <ChevronLeft className="h-3 w-3" aria-hidden />
                        Volver
                    </button>
                </div>
            </header>
            <Bloque titulo="Área">
                {contexto.area ? (
                    <span className="text-sm text-white/80">{contexto.area}</span>
                ) : (
                    <span className="text-white/40">—</span>
                )}
            </Bloque>
            <Bloque titulo="Documentos que debía leer">
                <Chips
                    etiqueta="Documentos que debía leer"
                    valores={contexto.documentos}
                />
            </Bloque>
            <Bloque titulo="Reglas del área">
                {contexto.reglas.length > 0 ? (
                    <ul className="list-disc space-y-1 pl-4 text-sm text-white/80">
                        {contexto.reglas.map((regla, índice) => (
                            <li key={`regla-${índice}-${regla.slice(0, 24)}`}>
                                {regla}
                            </li>
                        ))}
                    </ul>
                ) : (
                    <span className="text-white/40">—</span>
                )}
            </Bloque>
            <Bloque titulo="Habilidades disponibles">
                <Chips
                    etiqueta="Habilidades disponibles"
                    valores={contexto.habilidades}
                />
            </Bloque>
            <Bloque titulo="Fuentes externas">
                {contexto.fuentes.length > 0 ? (
                    <ul className="flex flex-wrap gap-1" aria-label="Fuentes externas">
                        {contexto.fuentes.map((fuente, índice) => (
                            <Chip key={`fuente-${índice}-${fuente.slice(0, 24)}`}>
                                {fuente}
                            </Chip>
                        ))}
                    </ul>
                ) : (
                    <span className="text-white/40">—</span>
                )}
            </Bloque>
            <Bloque titulo="Conexiones vivas">
                <TextoLargo texto={contexto.conexiones} />
            </Bloque>
            <Bloque titulo="Relevo">
                <TextoLargo texto={contexto.relevo} />
            </Bloque>
            <Bloque titulo="Revisión previa">
                <TextoLargo texto={contexto.revisionPrevia} />
            </Bloque>
            <Bloque titulo="Archivos implicados">
                <Chips etiqueta="Archivos implicados" valores={contexto.archivos} />
            </Bloque>
        </article>
    );
}

/** Fila de la lista de contextos; al abrirla muestra su ficha. */
function FilaContexto({
    contexto,
    onAbrir,
    abierto,
}: {
    contexto: ContextoAgente;
    onAbrir: () => void;
    abierto: boolean;
}) {
    return (
        <li>
            <button
                type="button"
                onClick={onAbrir}
                aria-expanded={abierto}
                className="flex w-full cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2 text-left hover:bg-white/[0.06]"
            >
                <span className="font-mono text-xs text-white/90">
                    {contexto.tarea || "—"}
                </span>
                {contexto.ola ? (
                    <span className="text-[11px] text-white/50">{contexto.ola}</span>
                ) : null}
                <span className="min-w-0 flex-1 truncate text-sm text-white/80">
                    {contexto.titulo || "Sin título"}
                </span>
                {contexto.area ? (
                    <span className="text-[11px] text-violet-200">{contexto.area}</span>
                ) : null}
                <span className="text-[11px] text-white/50">
                    {haceCuanto(contexto.t)}
                </span>
                <span className="text-[11px] text-white/50">
                    {tamanoTexto(contexto.caracteres)}
                </span>
            </button>
        </li>
    );
}

export function PanelContextos() {
    const [contextos, setContextos] = useState<ContextoAgente[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [cargando, setCargando] = useState(true);
    const [busqueda, setBusqueda] = useState("");
    const [abierto, setAbierto] = useState<string | null>(null);

    const recargar = useCallback(async () => {
        setCargando(true);
        setError(null);
        try {
            const respuesta = await fetch("/api/mando/contextos", {
                cache: "no-store",
            });
            if (!respuesta.ok) {
                // 404 = consola apagada en esta instancia; 401 = falta la
                // sesión; cualquier otro código se muestra tal cual.
                setError(
                    respuesta.status === 404
                        ? "La consola está apagada en esta instancia (solo funciona en local o con STARSEED_MANDO=1)."
                        : respuesta.status === 401
                          ? "Necesitas iniciar sesión para ver los contextos."
                          : `No se pudieron leer los contextos (HTTP ${respuesta.status}).`,
                );
                setContextos(null);
                return;
            }
            const datos = (await respuesta.json()) as RespuestaContextos;
            setContextos(datos.contextos);
        } catch {
            setError("No se pudieron leer los contextos.");
            setContextos(null);
        } finally {
            setCargando(false);
        }
    }, []);

    // Carga inicial y refresco cada 30 s, limpiado al desmontar.
    useEffect(() => {
        void recargar();
        const intervalo = window.setInterval(() => {
            void recargar();
        }, 30_000);
        return () => window.clearInterval(intervalo);
    }, [recargar]);

    const filtrados = useMemo(
        () => (contextos ?? []).filter((c) => coincide(c, busqueda)),
        [contextos, busqueda],
    );
    // La ficha abierta se busca en la lista COMPLETA: cambiar el buscador
    // mientras se lee no debe cerrarla de golpe.
    const detalle = useMemo(
        () => (contextos ?? []).find((c) => c.tarea === abierto) ?? null,
        [contextos, abierto],
    );

    if (cargando && !contextos) {
        return (
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 p-4 text-sm text-white/60">
                <CircleDashed className="h-4 w-4 animate-spin" aria-hidden />
                Leyendo los contextos…
            </div>
        );
    }

    if (error || !contextos) {
        return (
            <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                {error ?? "Sin datos de contextos."}
                <button
                    type="button"
                    onClick={() => void recargar()}
                    className="ml-3 inline-flex cursor-pointer items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-xs hover:bg-white/5"
                >
                    <RefreshCw className="h-3 w-3" aria-hidden />
                    Reintentar
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <header className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-white/50">
                    Con qué trabajó cada agente: documentos, reglas, habilidades,
                    fuentes y relevo de cada tarea (se guarda desde la Ola 239).
                </p>
                <button
                    type="button"
                    onClick={() => void recargar()}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-xs text-white/70 hover:bg-white/5"
                >
                    <RefreshCw
                        className={`h-3 w-3 ${cargando ? "animate-spin" : ""}`}
                        aria-hidden
                    />
                    Actualizar
                </button>
            </header>

            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2">
                <Search className="h-4 w-4 shrink-0 text-white/40" aria-hidden />
                <input
                    type="search"
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    placeholder="Filtrar por id, título, área o habilidad…"
                    className="w-full cursor-text bg-transparent text-sm text-white placeholder:text-white/40 focus:outline-none"
                />
            </div>

            {detalle ? (
                <FichaContexto
                    contexto={detalle}
                    onCerrar={() => setAbierto(null)}
                />
            ) : contextos.length === 0 ? (
                <p className="rounded-xl border border-white/10 bg-black/30 p-4 text-sm text-white/50">
                    Ningún agente ha registrado su contexto todavía (se guarda
                    desde la Ola 239).
                </p>
            ) : filtrados.length === 0 ? (
                <p className="rounded-xl border border-white/10 bg-black/30 p-4 text-sm text-white/50">
                    Ningún contexto coincide con «{busqueda}».
                </p>
            ) : (
                <ul className="space-y-1.5" aria-label="Contextos por tarea">
                    {filtrados.map((contexto, índice) => (
                        <FilaContexto
                            key={contexto.tarea || `contexto-${índice}`}
                            contexto={contexto}
                            abierto={abierto === contexto.tarea}
                            onAbrir={() =>
                                setAbierto(
                                    abierto === contexto.tarea
                                        ? null
                                        : contexto.tarea,
                                )
                            }
                        />
                    ))}
                </ul>
            )}
        </div>
    );
}
