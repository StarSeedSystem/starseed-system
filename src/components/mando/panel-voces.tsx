"use client";

/**
 * PANEL «VOCES» DEL CENTRO DE MANDO (Ola 275 · Tarea V3 · 2026-09-07)
 * ─────────────────────────────────────────────────────────────────────────────
 * Une en una sola pestaña todo lo relacionado con la voz:
 *
 *  · «Demonio de voz» — salud viva del daemon de voz 127.0.0.1:4444, leída del
 *    `GET /api/mando/voces` (campo `demonio`), sondeada cada 20 s.
 *  · «Forja 1.58» — progreso global y por fases de la forja de voces.
 *  · «Voz del Mando» — monta la tarjeta ya existente (`TarjetaVozDelMando`),
 *    protegida por si no hay `VozMandoProvider` montado.
 *  · «Voces por agente» — asigna timbre a escritores/revisores, los cinco
 *    agentes 1.58 y las personalidades del OS, con «Oír» y «Guardar».
 *  · «Estudio de Voces» — el estudio completo, tal cual.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Ear, Mic, Play, Save, Volume2, Wand2 } from "lucide-react";

import { buscarTimbre, TIMBRES } from "@/lib/aurora/timbres";
import { hablarStarSeed } from "@/lib/aurora/voz-starseed/motor";
import { PERSONALITY_PRESETS } from "@/lib/aurora/personalities";
import { FASES_FORJA, progresoFase, progresoForja } from "@/lib/voces/forja/manifiesto";
import { asignarVozAutomatica, type VozDeAgente } from "@/lib/mando/voz-mando";
import { usarControl, TarjetaVozDelMando } from "@/components/mando/voz-del-mando";
import { EstudioVoces } from "@/components/voces/estudio-voces";
// (Ola 279 · V7B) Diagnóstico de voz visible, montado en la tarjeta «Demonio
// de voz» para responder al «la voz no funciona» sin depurar a ciegas.
import { DiagnosticoVoz } from "@/components/voces/diagnostico-voz";

/** Forma del `demonio` que devuelve `GET /api/mando/voces` (null sin daemon). */
interface EstadoDemonio {
    ready?: boolean;
    engine?: string;
    model?: string;
    ffmpeg?: boolean;
    pitchDisponible?: boolean;
    efectosDisponibles?: boolean;
    asr?: { residente?: boolean; cesiones?: number; turnoBitnet?: boolean };
}

/** Etiqueta legible del género para pintar junto a cada timbre. */
const GENERO_TEXTO: Record<string, string> = {
    femenina: "femenina",
    masculina: "masculina",
    neutra: "neutra",
};

/** Los cinco agentes 1.58 del aprendizaje continuo (con su nombre legible). */
const AGENTES_158: Array<{ id: string; nombre: string }> = [
    { id: "curador", nombre: "Curador" },
    { id: "entrenador", nombre: "Entrenador" },
    { id: "evaluador", nombre: "Evaluador" },
    { id: "desplegador", nombre: "Desplegador" },
    { id: "cronista", nombre: "Cronista" },
];

/** Una fila de la tabla «Voces por agente»: id, tipo y nombre amable. */
interface FilaVoz {
    id: string;
    tipo: VozDeAgente["tipo"];
    nombre: string;
}

/** Chips ok/aviso de una característica del demonio: booleano → chip coloreado. */
function Chip({ activo, etiqueta }: { activo: boolean | undefined | null; etiqueta: string }) {
    const clase = activo
        ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
        : "border-white/10 bg-white/5 text-white/50";
    return <span className={`rounded-full border px-2 py-0.5 text-[11px] ${clase}`}>{etiqueta}</span>;
}

/** Marco común de una tarjeta del panel (misma estética que el resto del Mando). */
function Tarjeta({ titulo, icono, nino }: { titulo: string; icono: React.ReactNode; nino: React.ReactNode }) {
    return (
        <section className="rounded-xl border border-white/10 bg-black/30 p-4 backdrop-blur">
            <header className="mb-3 flex items-center gap-2">
                {icono}
                <h3 className="text-sm font-semibold text-white">{titulo}</h3>
            </header>
            {nino}
        </section>
    );
}

/**
 * Tarjeta «Demonio de voz»: salud viva del daemon local (127.0.0.1:4444).
 * El daemon llega como `null` si no responde; cada campo presente pinta un chip.
 */
function TarjetaDemonio({ demonio }: { demonio: EstadoDemonio | null }) {
    // (Ola 279 · V7B) El diagnóstico siempre está disponible en esta tarjeta,
    // use el demonio el estado que use: TIMBRES[0] (Aurora) es un timbre válido.
    const diagnostico = <DiagnosticoVoz timbre={TIMBRES[0]} />;
    if (!demonio) {
        return (
            <Tarjeta
                titulo="Demonio de voz"
                icono={<Mic className="h-4 w-4 text-white/70" aria-hidden />}
                nino={
                    <div className="space-y-2">
                        <p className="text-xs text-white/60">El demonio de voz no responde en 127.0.0.1:4444.</p>
                        {diagnostico}
                    </div>
                }
            />
        );
    }
    return (
        <Tarjeta
            titulo="Demonio de voz"
            icono={<Mic className="h-4 w-4 text-white/70" aria-hidden />}
            nino={
                <div className="space-y-2 text-xs">
                    <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${demonio.ready ? "bg-emerald-400" : "bg-amber-400"}`} aria-hidden />
                        <span className="text-white/70">{demonio.ready ? "Listo" : "Despertando"}</span>
                        {demonio.engine ? <span className="text-white/40">· {demonio.engine}</span> : null}
                        {demonio.model ? <span className="truncate text-white/40">· {demonio.model}</span> : null}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        <Chip activo={demonio.ffmpeg} etiqueta="ffmpeg" />
                        <Chip activo={demonio.pitchDisponible} etiqueta="tono" />
                        <Chip activo={demonio.efectosDisponibles} etiqueta="efectos" />
                        <Chip activo={demonio.asr?.residente} etiqueta="oído residente" />
                        <Chip activo={demonio.asr?.turnoBitnet} etiqueta="BitNet" />
                    </div>
                    {demonio.asr && demonio.asr.cesiones != null && (
                        <p className="flex items-center gap-1 text-white/50">
                            <Ear className="h-3.5 w-3.5" aria-hidden />
                            Cesiones del oído: {demonio.asr.cesiones}
                        </p>
                    )}
                    {diagnostico}
                </div>
            }
        />
    );
}

/**
 * Tarjeta «Forja 1.58»: barra global y lista de fases con su progreso parcial.
 */
function TarjetaForja() {
    const global = progresoForja();
    return (
        <Tarjeta
            titulo="Forja 1.58"
            icono={<Wand2 className="h-4 w-4 text-white/70" aria-hidden />}
            nino={
                <div className="space-y-3 text-xs">
                    <div>
                        <div className="mb-1 flex items-baseline justify-between">
                            <span className="text-white/50">Progreso global</span>
                            <span className="font-mono text-white/80">{global} %</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-white/10" aria-hidden>
                            <div className="h-full rounded-full bg-emerald-400" style={{ width: `${global}%` }} />
                        </div>
                    </div>
                    <ul className="space-y-1.5">
                        {FASES_FORJA.map((fase) => {
                            const pct = progresoFase(fase);
                            return (
                                <li key={fase.id} className="flex items-center justify-between gap-3">
                                    <span className="truncate text-white/60">
                                        {fase.id}. {fase.nombre}
                                    </span>
                                    <span className="shrink-0 font-mono text-white/50">{pct} %</span>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            }
        />
    );
}

/**
 * Tarjeta «Voz del Mando» protegida: usa la tarjeta existente
 * (`TarjetaVozDelMando`), pero si falta el `VozMandoProvider` (que monta
 * `CentroMando`), avisa en vez de romper por contexto vacío.
 */
function TarjetaVozDelMandoProtegida() {
    let control: ReturnType<typeof usarControl>;
    try {
        control = usarControl();
    } catch {
        return (
            <Tarjeta
                titulo="Voz del Mando"
                icono={<Volume2 className="h-4 w-4 text-white/70" aria-hidden />}
                nino={<p className="text-xs text-white/60">Activa la Voz del Mando desde la cabecera para ajustarla aquí.</p>}
            />
        );
    }
    if (!control || control.prefs === undefined) {
        return (
            <Tarjeta
                titulo="Voz del Mando"
                icono={<Volume2 className="h-4 w-4 text-white/70" aria-hidden />}
                nino={<p className="text-xs text-white/60">Activa la Voz del Mando desde la cabecera para ajustarla aquí.</p>}
            />
        );
    }
    return (
        <Tarjeta
            titulo="Voz del Mando"
            icono={<Volume2 className="h-4 w-4 text-white/70" aria-hidden />}
            nino={<TarjetaVozDelMando />}
        />
    );
}

/** Un "Oír" para una fila: habla SIN solaparse (una cola de un elemento). */
async function hablarNombre(texto: string, timbreId: string): Promise<void> {
    try {
        const timbre = buscarTimbre(timbreId) ?? TIMBRES[0];
        await hablarStarSeed(texto, { timbre, contexto: "conversacion" });
    } catch {
        // La voz es un extra: un fallo de síntesis nunca rompe el panel.
    }
}

/**
 * Tabla «Voces por agente»: asigna timbre a escritores/revisores del catálogo,
 * a los cinco agentes 1.58 y a las personalidades del OS. Una fila por entrada.
 */
function TablaVocesPorAgente({
    filas,
    voces,
    hablandoId,
    alOir,
    alAuto,
    alGuardar,
    guardando,
    estado,
}: {
    filas: FilaVoz[];
    voces: VozDeAgente[];
    hablandoId: string | null;
    alOir: (fila: FilaVoz, timbreId: string) => void;
    alAuto: (fila: FilaVoz) => void;
    alGuardar: () => void;
    guardando: boolean;
    estado: string | null;
}) {
    // Timbre asignado a cada id (mapa id → timbreId) para el select de la fila.
    const timbreDe: Record<string, string> = useMemo(() => {
        const m: Record<string, string> = {};
        for (const v of voces) m[v.id] = v.timbreId;
        return m;
    }, [voces]);

    return (
        <div className="space-y-2 text-xs">
            <ul className="divide-y divide-white/5">
                {filas.map((fila) => {
                    const timbreId = timbreDe[fila.id] ?? TIMBRES[0].id;
                    const hablando = hablandoId === fila.id;
                    return (
                        <li key={`${fila.tipo}:${fila.id}`} className="flex items-center gap-2 py-1.5">
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-white/80">{fila.nombre}</p>
                                <p className="text-[11px] text-white/40">{fila.tipo}</p>
                            </div>
                            <select
                                aria-label={`Timbre de ${fila.nombre}`}
                                value={timbreId}
                                onChange={(e) => alOir(fila, e.target.value)}
                                className="cursor-pointer rounded-md border border-white/10 bg-black/40 px-1.5 py-1 text-white/80"
                            >
                                {TIMBRES.map((t) => (
                                    <option key={t.id} value={t.id}>
                                        {t.nombre} · {GENERO_TEXTO[t.genero] ?? t.genero}
                                    </option>
                                ))}
                            </select>
                            <button
                                type="button"
                                onClick={() => alAuto(fila)}
                                className="cursor-pointer rounded-md border border-white/10 bg-white/5 px-1.5 py-1 text-white/60 hover:bg-white/10"
                                title="Asignar una voz automática determinista"
                            >
                                Auto
                            </button>
                            <button
                                type="button"
                                disabled={hablando}
                                onClick={() => alOir(fila, timbreId)}
                                className={`inline-flex cursor-pointer items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-white/70 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50 ${hablando ? "border-emerald-400/40 text-emerald-200" : ""}`}
                                title="Oír cómo suena esta voz"
                            >
                                <Play className="h-3 w-3" aria-hidden />
                                Oír
                            </button>
                        </li>
                    );
                })}
            </ul>

            <div className="flex items-center gap-2 pt-1">
                <button
                    type="button"
                    onClick={alGuardar}
                    disabled={guardando}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1.5 text-emerald-200 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <Save className="h-3.5 w-3.5" aria-hidden />
                    Guardar
                </button>
                {estado && <span className={`text-[11px] ${estado === "guardado" ? "text-emerald-300" : "text-red-300"}`}>{estado === "guardado" ? "guardado" : estado}</span>}
            </div>
        </div>
    );
}

/** Modelo del catálogo tal como llega de `GET /api/mando/modelos`. */
interface ModeloCat {
    id: string;
    proveedor: string;
    nombre?: string;
    papel?: string;
    escritor?: boolean;
}

/** Respuesta de `GET /api/mando/voces`. */
interface RespuestaVoces {
    prefs?: unknown;
    vocesPorAgente?: VozDeAgente[];
    demonio?: EstadoDemonio | null;
}

/** Máximo de filas visibles antes de «ver todos». */
const MAX_FILAS = 12;

/**
 * Panel principal de la pestaña «Voces» del Mando. Agrupa demonio, forja, la
 * Voz del Mando, la asignación por agente y el Estudio de Voces completo.
 */
export function PanelVoces() {
    const [demonio, setDemonio] = useState<EstadoDemonio | null>(null);
    const [voces, setVoces] = useState<VozDeAgente[]>([]);
    const [modelos, setModelos] = useState<ModeloCat[]>([]);
    const [hablandoId, setHablandoId] = useState<string | null>(null);
    const [guardando, setGuardando] = useState(false);
    const [estado, setEstado] = useState<string | null>(null);
    const [verTodos, setVerTodos] = useState(false);

    // Guarda la cola del que «Oír» está sonando para no solapar dos voces:
    // mientras habla una fila, el resto queda deshabilitado.
    const enCurso = useRef(false);

    // Sondeo del demonio cada 20 s, saltando la lectura con la pestaña oculta.
    useEffect(() => {
        let vivo = true;
        let pendiente = false;
        const cargar = async () => {
            if (pendiente) return;
            pendiente = true;
            try {
                const r = await fetch("/api/mando/voces", { cache: "no-store" });
                if (!vivo || !r.ok) return;
                const datos = (await r.json()) as RespuestaVoces;
                if (datos.demonio !== undefined) setDemonio(datos.demonio ?? null);
                if (Array.isArray(datos.vocesPorAgente)) setVoces(datos.vocesPorAgente);
            } catch {
                // Sin endpoint (producción): el panel queda en su estado vacío.
            } finally {
                pendiente = false;
            }
        };
        const conFiltro = () => {
            if (document.visibilityState === "visible") void cargar();
        };
        void conFiltro();
        const cada = window.setInterval(conFiltro, 20_000);
        const alVolver = () => {
            if (document.visibilityState === "visible") void cargar();
        };
        document.addEventListener("visibilitychange", alVolver);
        return () => {
            vivo = false;
            window.clearInterval(cada);
            document.removeEventListener("visibilitychange", alVolver);
        };
    }, []);

    // Carga el catálogo de modelos una vez para las filas de escritores/revisores.
    useEffect(() => {
        let vivo = true;
        void fetch("/api/mando/modelos", { cache: "no-store" })
            .then((r) => (r.ok ? (r.json() as Promise<{ modelos?: ModeloCat[] }>) : null))
            .then((d) => {
                if (vivo && d && Array.isArray(d.modelos)) setModelos(d.modelos);
            })
            .catch(() => {
                // Sin catálogo: solo aparecen agentes y personalidades.
            });
        return () => {
            vivo = false;
        };
    }, []);

    // Fila de los modelos del catálogo: solo escritores y revisores, agrupados
    // por proveedor para no pintar decenas de modelos sin contexto.
    const filasModelos = useMemo<FilaVoz[]>(() => {
        const orden: FilaVoz[] = [];
        const vistos = new Set<string>();
        for (const m of modelos) {
            if (m.papel !== "escritor" && m.papel !== "revisor") continue;
            if (vistos.has(m.id)) continue;
            vistos.add(m.id);
            orden.push({ id: m.id, tipo: m.papel === "escritor" ? "escritor" : "revisor", nombre: m.nombre || m.id });
        }
        orden.sort((a, b) => a.tipo.localeCompare(b.tipo) || a.id.localeCompare(b.id));
        return orden;
    }, [modelos]);

    // Filas de los cinco agentes 1.58 y de las personalidades del OS.
    const filasAgentes = useMemo<FilaVoz[]>(
        () => AGENTES_158.map((a) => ({ id: a.id, tipo: "agente158" as const, nombre: a.nombre })),
        [],
    );
    const filasPersonalidades = useMemo<FilaVoz[]>(
        () => PERSONALITY_PRESETS.map((p) => ({ id: p.id, tipo: "personalidad" as const, nombre: p.name })),
        [],
    );

    const todas = useMemo(
        () => [...filasModelos, ...filasAgentes, ...filasPersonalidades],
        [filasModelos, filasAgentes, filasPersonalidades],
    );

    // «Oír»: habla la frase con el timbre de la fila, sin solapar (un solo turno).
    const oir = useCallback((fila: FilaVoz, timbreId: string) => {
        if (enCurso.current) return;
        enCurso.current = true;
        setHablandoId(`${fila.tipo}:${fila.id}`);
        void hablarNombre(`Soy ${fila.nombre}, ${fila.tipo}`, timbreId).finally(() => {
            enCurso.current = false;
            setHablandoId(null);
        });
    }, []);

    // «Auto»: asigna una voz determinista por hash del id y actualiza el estado.
    const auto = useCallback(
        (fila: FilaVoz) => {
            const nueva = asignarVozAutomatica(
                fila.id,
                fila.tipo,
                TIMBRES.map((t) => t.id),
            );
            setVoces((prev) => {
                const resto = prev.filter((v) => !(v.id === fila.id && v.tipo === fila.tipo));
                return [...resto, nueva];
            });
        },
        [],
    );

    // «Guardar»: POST de la lista completa, con aviso de resultado.
    const guardar = useCallback(() => {
        setGuardando(true);
        setEstado(null);
        void fetch("/api/mando/voces", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ vocesPorAgente: voces }),
        })
            .then((r) => {
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                setEstado("guardado");
            })
            .catch((e) => {
                setEstado(e instanceof Error ? e.message : "Error al guardar.");
            })
            .finally(() => setGuardando(false));
    }, [voces]);

    const filasVisibles = verTodos ? todas : todas.slice(0, MAX_FILAS);

    return (
        <section data-testid="panel-voces" className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                <TarjetaDemonio demonio={demonio} />
                <TarjetaForja />
                <TarjetaVozDelMandoProtegida />
            </div>

            <Tarjeta
                titulo="Voces por agente"
                icono={<Volume2 className="h-4 w-4 text-white/70" aria-hidden />}
                nino={
                    <div>
                        <TablaVocesPorAgente
                            filas={filasVisibles}
                            voces={voces}
                            hablandoId={hablandoId}
                            alOir={oir}
                            alAuto={auto}
                            alGuardar={guardar}
                            guardando={guardando}
                            estado={estado}
                        />
                        {todas.length > MAX_FILAS && (
                            <button
                                type="button"
                                onClick={() => setVerTodos((v) => !v)}
                                className="mt-2 cursor-pointer text-[11px] text-white/50 hover:text-white/80"
                            >
                                {verTodos ? "Ver menos" : `Ver todos (${todas.length})`}
                            </button>
                        )}
                    </div>
                }
            />

            <section className="rounded-xl border border-white/10 bg-black/30 p-4 backdrop-blur">
                <EstudioVoces />
            </section>
        </section>
    );
}