"use client";

/**
 * Panel de ajustes del Centro de Mando (Ola 233)
 * ─────────────────────────────────────────────────────────────────────────────
 * Configura cómo trabaja el enjambre desde la propia consola del OS, sin
 * editar el archivo a mano. Habla con `GET/PUT /api/mando/ajustes`
 * (solo local; 404 en producción), que es la única ventana sobre
 * `~/.starseed/enjambre.json`.
 *
 * El panel muestra:
 *  • Deslizadores de workers y concurrencia (con aviso en rojo si pasan de 5,
 *    porque la Mac de 8 GB se queda sin memoria).
 *  • Lista ordenable de modelos escritores.
 *  • Cadena de revisores (pares proveedor + modelo).
 *  • Cupos por minuto por proveedor (1-120).
 *  • Interruptor de revisión cruzada.
 *
 * Reglas del área (no negociables):
 *  • El panel JAMÁS envía claves, comandos ni rutas: solo el contrato
 *    `ConfigEnjambre` saneado en el servidor.
 *  • Al guardar avisa de que los cambios se aplican a la SIGUIENTE ola.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
    AlertTriangle,
    ArrowDown,
    ArrowUp,
    CheckCircle2,
    CircleDashed,
    Eye,
    KeyRound,
    ListChecks,
    Loader2,
    Plus,
    Save,
    ShieldCheck,
    Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";

/** Forma del GET que devuelve el backend. */
interface RespuestaAjustes {
    archivo: string;
    limites: {
        workersMin: number;
        workersMax: number;
        concurrenciaMin: number;
        concurrenciaMax: number;
        cupoMin: number;
        cupoMax: number;
    };
    proveedores: readonly string[];
    modelosSugeridos: Record<string, readonly string[]>;
    porDefecto: ConfigEnjambre;
    config: ConfigEnjambre;
    actualizadoEn: string;
}

/** Forma de la configuración que entiende el formulario. */
interface ConfigEnjambre {
    workers: number;
    concurrenciaOpencode: number;
    modelos: string[];
    revisores: Array<[string, string]>;
    cuposRpm: Record<string, number>;
    revisionActiva: boolean;
}

const PROVEEDORES_TODOS = [
    "nvidia",
    "aihubmix",
    "tokenrouter",
    "openrouter",
    "gemini",
    "nim",
    "xkiro",
] as const;

/** Tarjeta de ajuste informativo (igual que la versión anterior). */
function Tarjeta({
    titulo,
    icono,
    children,
}: {
    titulo: string;
    icono: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <article className="rounded-xl border border-white/10 bg-black/30 p-4 backdrop-blur">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                <span className="text-white/60">{icono}</span>
                {titulo}
            </h3>
            <div className="mt-2 space-y-2 text-sm text-white/70">{children}</div>
        </article>
    );
}

/** Un deslizador con etiqueta y aviso de memoria si el valor es alto. */
function SliderConAviso({
    id,
    etiqueta,
    valor,
    mínimo,
    máximo,
    alCambiar,
    unidad,
    avisoSobre,
}: {
    id: string;
    etiqueta: string;
    valor: number;
    mínimo: number;
    máximo: number;
    alCambiar: (n: number) => void;
    unidad: string;
    avisoSobre?: { limite: number; texto: string };
}) {
    const aviso = avisoSobre && valor > avisoSobre.limite;
    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
                <Label htmlFor={id} className="text-xs text-white/80">
                    {etiqueta}
                </Label>
                <span
                    className={`font-mono text-xs ${
                        aviso ? "text-red-300" : "text-white/70"
                    }`}
                >
                    {valor} {unidad}
                </span>
            </div>
            <Slider
                id={id}
                min={mínimo}
                max={máximo}
                step={1}
                value={[valor]}
                onValueChange={(v: number[]) => alCambiar(v[0] ?? valor)}
                aria-label={etiqueta}
            />
            {aviso && (
                <p
                    className="flex items-center gap-1 text-[11px] text-red-300"
                    role="alert"
                >
                    <AlertTriangle className="h-3 w-3" />
                    {avisoSobre?.texto}
                </p>
            )}
        </div>
    );
}

/** Un modelo de la lista ordenable. */
function FilaModelo({
    modelo,
    índice,
    total,
    alSubir,
    alBajar,
    alQuitar,
}: {
    modelo: string;
    índice: number;
    total: number;
    alSubir: () => void;
    alBajar: () => void;
    alQuitar: () => void;
}) {
    return (
        <li className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5">
            <span className="w-5 shrink-0 text-center font-mono text-[10px] text-white/40">
                {índice + 1}
            </span>
            <input
                type="text"
                value={modelo}
                readOnly
                className="min-w-0 flex-1 cursor-default truncate border-none bg-transparent font-mono text-xs text-white/90 outline-none"
                aria-label={`Modelo ${índice + 1}`}
            />
            <div className="flex shrink-0 items-center gap-0.5">
                <button
                    type="button"
                    onClick={alSubir}
                    disabled={índice === 0}
                    className="cursor-pointer rounded p-1 text-white/60 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                    aria-label="Subir modelo"
                >
                    <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                    type="button"
                    onClick={alBajar}
                    disabled={índice === total - 1}
                    className="cursor-pointer rounded p-1 text-white/60 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                    aria-label="Bajar modelo"
                >
                    <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button
                    type="button"
                    onClick={alQuitar}
                    className="cursor-pointer rounded p-1 text-white/60 transition-colors hover:bg-red-500/20 hover:text-red-200"
                    aria-label="Quitar modelo"
                >
                    <Trash2 className="h-3.5 w-3.5" />
                </button>
            </div>
        </li>
    );
}

/** Un par [proveedor, modelo] de la cadena de revisores. */
function FilaRevisor({
    par,
    índice,
    total,
    proveedores,
    alSubir,
    alBajar,
    alQuitar,
    alCambiar,
}: {
    par: [string, string];
    índice: number;
    total: number;
    proveedores: readonly string[];
    alSubir: () => void;
    alBajar: () => void;
    alQuitar: () => void;
    alCambiar: (siguiente: [string, string]) => void;
}) {
    return (
        <li className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5">
            <span className="w-5 shrink-0 text-center font-mono text-[10px] text-white/40">
                {índice + 1}
            </span>
            <select
                value={par[0]}
                onChange={(e) => alCambiar([e.target.value, par[1]])}
                className="cursor-pointer rounded border border-white/10 bg-black/40 px-2 py-1 text-xs text-white outline-none"
                aria-label={`Proveedor del revisor ${índice + 1}`}
            >
                {proveedores.map((p) => (
                    <option key={p} value={p}>
                        {p}
                    </option>
                ))}
            </select>
            <input
                type="text"
                value={par[1]}
                onChange={(e) => alCambiar([par[0], e.target.value])}
                placeholder="modelo/revisor"
                className="min-w-0 flex-1 cursor-text rounded border border-white/10 bg-black/40 px-2 py-1 font-mono text-xs text-white outline-none focus:border-white/30"
                aria-label={`Modelo del revisor ${índice + 1}`}
            />
            <div className="flex shrink-0 items-center gap-0.5">
                <button
                    type="button"
                    onClick={alSubir}
                    disabled={índice === 0}
                    className="cursor-pointer rounded p-1 text-white/60 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                    aria-label="Subir revisor"
                >
                    <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                    type="button"
                    onClick={alBajar}
                    disabled={índice === total - 1}
                    className="cursor-pointer rounded p-1 text-white/60 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                    aria-label="Bajar revisor"
                >
                    <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button
                    type="button"
                    onClick={alQuitar}
                    className="cursor-pointer rounded p-1 text-white/60 transition-colors hover:bg-red-500/20 hover:text-red-200"
                    aria-label="Quitar revisor"
                >
                    <Trash2 className="h-3.5 w-3.5" />
                </button>
            </div>
        </li>
    );
}

/** Un cupo por minuto por proveedor. */
function FilaCupo({
    proveedor,
    valor,
    mínimo,
    máximo,
    alCambiar,
}: {
    proveedor: string;
    valor: number;
    mínimo: number;
    máximo: number;
    alCambiar: (n: number) => void;
}) {
    return (
        <li className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5">
            <span className="w-24 shrink-0 font-mono text-xs text-white/80">{proveedor}</span>
            <Slider
                min={mínimo}
                max={máximo}
                step={1}
                value={[valor]}
                onValueChange={(v: number[]) => alCambiar(v[0] ?? valor)}
                aria-label={`Cupo rpm de ${proveedor}`}
            />
            <span className="w-14 shrink-0 text-right font-mono text-xs text-white/70">
                {valor}/min
            </span>
        </li>
    );
}

/** Sugerencias planas de modelos para el selector de "+ Añadir escritor". */
function unionModelos(
    modelos: readonly string[],
    sugerencias: Record<string, readonly string[]>,
): string[] {
    const set = new Set<string>(modelos);
    for (const lista of Object.values(sugerencias)) {
        for (const id of lista) set.add(id);
    }
    return Array.from(set);
}

/** Componente principal del panel. */
export function PanelAjustes() {
    const [cargando, setCargando] = useState(true);
    const [soloLocal, setSoloLocal] = useState(false);
    const [respuesta, setRespuesta] = useState<RespuestaAjustes | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [guardando, setGuardando] = useState(false);
    const [mensaje, setMensaje] = useState<{ tono: "ok" | "error"; texto: string } | null>(
        null,
    );

    const cargar = useCallback(async () => {
        setCargando(true);
        setError(null);
        setMensaje(null);
        try {
            const r = await fetch("/api/mando/ajustes", { cache: "no-store" });
            if (!r.ok) {
                if (r.status === 404) {
                    setSoloLocal(true);
                } else {
                    setError(`No se pudo leer la configuración (HTTP ${r.status}).`);
                }
                return;
            }
            const datos = (await r.json()) as RespuestaAjustes;
            setRespuesta(datos);
        } catch {
            setSoloLocal(true);
        } finally {
            setCargando(false);
        }
    }, []);

    useEffect(() => {
        void cargar();
    }, [cargar]);

    const guardar = useCallback(async () => {
        if (!respuesta) return;
        setGuardando(true);
        setMensaje(null);
        try {
            const r = await fetch("/api/mando/ajustes", {
                method: "PUT",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(respuesta.config),
            });
            const datos = (await r.json().catch(() => null)) as {
                ok?: boolean;
                error?: string;
                config?: ConfigEnjambre;
            } | null;
            if (!r.ok || !datos?.ok) {
                setMensaje({
                    tono: "error",
                    texto: datos?.error ?? `No se pudo guardar (HTTP ${r.status}).`,
                });
                return;
            }
            if (datos.config) {
                setRespuesta({ ...respuesta, config: datos.config });
            }
            setMensaje({
                tono: "ok",
                texto:
                    datos.error ??
                    "Cambios guardados. Se aplicarán a la SIGUIENTE ola, no a la que está corriendo.",
            });
        } catch (e) {
            setMensaje({
                tono: "error",
                texto: e instanceof Error ? e.message : "Error desconocido al guardar.",
            });
        } finally {
            setGuardando(false);
        }
    }, [respuesta]);

    const cfg = respuesta?.config;

    const alCambiarWorkers = useCallback(
        (n: number) =>
            setRespuesta((r) => (r ? { ...r, config: { ...r.config, workers: n } } : r)),
        [],
    );
    const alCambiarConcurrencia = useCallback(
        (n: number) =>
            setRespuesta((r) =>
                r ? { ...r, config: { ...r.config, concurrenciaOpencode: n } } : r,
            ),
        [],
    );
    const alCambiarRevision = useCallback(
        (v: boolean) =>
            setRespuesta((r) =>
                r ? { ...r, config: { ...r.config, revisionActiva: v } } : r,
            ),
        [],
    );

    const alMoverModelo = useCallback(
        (índice: number, dirección: -1 | 1) =>
            setRespuesta((r) => {
                if (!r) return r;
                const modelos = r.config.modelos.slice();
                const nuevo = índice + dirección;
                if (nuevo < 0 || nuevo >= modelos.length) return r;
                [modelos[índice], modelos[nuevo]] = [modelos[nuevo] as string, modelos[índice] as string];
                return { ...r, config: { ...r.config, modelos } };
            }),
        [],
    );
    const alQuitarModelo = useCallback(
        (índice: number) =>
            setRespuesta((r) => {
                if (!r) return r;
                const modelos = r.config.modelos.filter((_, i) => i !== índice);
                return { ...r, config: { ...r.config, modelos } };
            }),
        [],
    );
    const alAñadirModelo = useCallback(
        (modelo: string) =>
            setRespuesta((r) => {
                if (!r) return r;
                const limpio = modelo.trim();
                if (!limpio || r.config.modelos.includes(limpio)) return r;
                return {
                    ...r,
                    config: { ...r.config, modelos: [...r.config.modelos, limpio] },
                };
            }),
        [],
    );

    const alMoverRevisor = useCallback(
        (índice: number, dirección: -1 | 1) =>
            setRespuesta((r) => {
                if (!r) return r;
                const revisores = r.config.revisores.slice();
                const nuevo = índice + dirección;
                if (nuevo < 0 || nuevo >= revisores.length) return r;
                [revisores[índice], revisores[nuevo]] = [
                    revisores[nuevo] as [string, string],
                    revisores[índice] as [string, string],
                ];
                return { ...r, config: { ...r.config, revisores } };
            }),
        [],
    );
    const alQuitarRevisor = useCallback(
        (índice: number) =>
            setRespuesta((r) => {
                if (!r) return r;
                const revisores = r.config.revisores.filter((_, i) => i !== índice);
                return { ...r, config: { ...r.config, revisores } };
            }),
        [],
    );
    const alCambiarRevisor = useCallback(
        (índice: number, par: [string, string]) =>
            setRespuesta((r) => {
                if (!r) return r;
                const revisores = r.config.revisores.slice();
                revisores[índice] = par;
                return { ...r, config: { ...r.config, revisores } };
            }),
        [],
    );
    const alAñadirRevisor = useCallback(
        () =>
            setRespuesta((r) => {
                if (!r) return r;
                const proveedores = r.proveedores;
                const prov = (proveedores[0] ?? "aihubmix") as string;
                return {
                    ...r,
                    config: {
                        ...r.config,
                        revisores: [...r.config.revisores, [prov, ""]],
                    },
                };
            }),
        [],
    );

    const alCambiarCupo = useCallback(
        (proveedor: string, valor: number) =>
            setRespuesta((r) => {
                if (!r) return r;
                return {
                    ...r,
                    config: {
                        ...r.config,
                        cuposRpm: { ...r.config.cuposRpm, [proveedor]: valor },
                    },
                };
            }),
        [],
    );

    const sugerencias = respuesta?.modelosSugeridos ?? {};
    const modelosDisponibles = useMemo(
        () => (cfg ? unionModelos(cfg.modelos, sugerencias) : []),
        [cfg, sugerencias],
    );
    const [modeloParaAñadir, setModeloParaAñadir] = useState("");

    if (cargando) {
        return (
            <p className="flex items-center gap-2 text-sm text-white/60">
                <CircleDashed className="h-4 w-4 animate-spin" />
                Leyendo la configuración del enjambre…
            </p>
        );
    }

    if (soloLocal) {
        return (
            <div className="space-y-4">
                <div
                    role="status"
                    className="flex items-start gap-3 rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100"
                >
                    <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
                    <p>
                        El panel de ajustes del enjambre solo funciona en tu máquina (las
                        rutas <code>/api/mando/*</code> están apagadas en el despliegue público).
                    </p>
                </div>
                <TarjetasInformativas />
            </div>
        );
    }

    if (error || !respuesta || !cfg) {
        return (
            <div
                role="alert"
                className="flex items-start gap-3 rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200"
            >
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                <p>{error ?? "No se pudo cargar la configuración."}</p>
            </div>
        );
    }

    const { limites } = respuesta;
    const proveedores = respuesta.proveedores.length > 0
        ? respuesta.proveedores
        : PROVEEDORES_TODOS;

    return (
        <div className="space-y-4">
            <header className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="flex items-center gap-2 text-base font-semibold text-white">
                        <ListChecks className="h-4 w-4" />
                        Ajustes del enjambre
                    </h2>
                    <p className="mt-0.5 text-xs text-white/50">
                        Archivo: <code>{respuesta.archivo}</code>
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void cargar()}
                        disabled={guardando}
                    >
                        Recargar
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        onClick={() => void guardar()}
                        disabled={guardando}
                    >
                        {guardando ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Save className="h-4 w-4" />
                        )}
                        Guardar cambios
                    </Button>
                </div>
            </header>

            {mensaje && (
                <div
                    role={mensaje.tono === "error" ? "alert" : "status"}
                    className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
                        mensaje.tono === "error"
                            ? "border-red-400/30 bg-red-500/10 text-red-200"
                            : "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                    }`}
                >
                    {mensaje.tono === "error" ? (
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    ) : (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                    )}
                    <p>{mensaje.texto}</p>
                </div>
            )}

            <p
                role="note"
                className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100"
            >
                Los cambios se guardan al pulsar «Guardar cambios» y se aplican a la
                <strong> SIGUIENTE ola</strong>, no a la que está corriendo ahora mismo.
            </p>

            <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <article className="rounded-xl border border-white/10 bg-black/30 p-4">
                    <h3 className="text-sm font-semibold text-white">Capacidad</h3>
                    <p className="mt-1 text-xs text-white/50">
                        Cuántos agentes corren en paralelo. Subirlo no baja la calidad, pero
                        sí la memoria disponible.
                    </p>
                    <div className="mt-4 space-y-4">
                        <SliderConAviso
                            id="slider-workers"
                            etiqueta="Workers (agentes escritores)"
                            valor={cfg.workers}
                            mínimo={limites.workersMin}
                            máximo={limites.workersMax}
                            alCambiar={alCambiarWorkers}
                            unidad="agentes"
                            avisoSobre={{
                                limite: 5,
                                texto: "Por encima de 5, la Mac de 8 GB se queda sin memoria.",
                            }}
                        />
                        <SliderConAviso
                            id="slider-concurrencia"
                            etiqueta="Concurrencia de opencode"
                            valor={cfg.concurrenciaOpencode}
                            mínimo={limites.concurrenciaMin}
                            máximo={limites.concurrenciaMax}
                            alCambiar={alCambiarConcurrencia}
                            unidad="tareas"
                            avisoSobre={{
                                limite: 5,
                                texto: "Por encima de 5, la Mac de 8 GB se queda sin memoria.",
                            }}
                        />
                    </div>
                </article>

                <article className="rounded-xl border border-white/10 bg-black/30 p-4">
                    <h3 className="text-sm font-semibold text-white">Revisión cruzada</h3>
                    <p className="mt-1 text-xs text-white/50">
                        Si está activo, cada cambio lo relee un modelo distinto antes de
                        aceptarlo. Apagarlo acelera la ola, pero baja la calidad.
                    </p>
                    <div className="mt-4 flex items-center justify-between gap-3">
                        <Label htmlFor="switch-revision" className="text-xs text-white/80">
                            {cfg.revisionActiva
                                ? "Revisión cruzada ACTIVADA"
                                : "Revisión cruzada desactivada"}
                        </Label>
                        <Switch
                            id="switch-revision"
                            checked={cfg.revisionActiva}
                            onCheckedChange={alCambiarRevision}
                        />
                    </div>
                </article>
            </section>

            <article className="rounded-xl border border-white/10 bg-black/30 p-4">
                <header className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <h3 className="text-sm font-semibold text-white">
                            Modelos escritores (rotación)
                        </h3>
                        <p className="mt-0.5 text-xs text-white/50">
                            El enjambre rota por esta lista para repartir la carga entre
                            proveedores. El orden importa: empieza por arriba.
                        </p>
                    </div>
                </header>
                <ul className="mt-3 space-y-1.5">
                    {cfg.modelos.length === 0 && (
                        <li className="rounded-lg border border-dashed border-white/10 px-2 py-3 text-center text-xs text-white/50">
                            Sin modelos: añade al menos uno abajo.
                        </li>
                    )}
                    {cfg.modelos.map((modelo, índice) => (
                        <FilaModelo
                            key={`${modelo}-${índice}`}
                            modelo={modelo}
                            índice={índice}
                            total={cfg.modelos.length}
                            alSubir={() => alMoverModelo(índice, -1)}
                            alBajar={() => alMoverModelo(índice, 1)}
                            alQuitar={() => alQuitarModelo(índice)}
                        />
                    ))}
                </ul>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                    <select
                        value={modeloParaAñadir}
                        onChange={(e) => setModeloParaAñadir(e.target.value)}
                        className="min-w-0 flex-1 cursor-pointer rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 font-mono text-xs text-white outline-none"
                        aria-label="Modelo para añadir"
                    >
                        <option value="">— Elige un modelo sugerido —</option>
                        {modelosDisponibles.map((m) => (
                            <option key={m} value={m}>
                                {m}
                            </option>
                        ))}
                    </select>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                            alAñadirModelo(modeloParaAñadir);
                            setModeloParaAñadir("");
                        }}
                        disabled={!modeloParaAñadir}
                    >
                        <Plus className="h-3.5 w-3.5" />
                        Añadir
                    </Button>
                </div>
            </article>

            <article className="rounded-xl border border-white/10 bg-black/30 p-4">
                <header className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <h3 className="text-sm font-semibold text-white">
                            Cadena de revisores
                        </h3>
                        <p className="mt-0.5 text-xs text-white/50">
                            Orden en que se relee cada cambio. Si el primero falla, se
                            prueba el siguiente. Vacío = sin revisión.
                        </p>
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={alAñadirRevisor}
                    >
                        <Plus className="h-3.5 w-3.5" />
                        Añadir revisor
                    </Button>
                </header>
                <ul className="mt-3 space-y-1.5">
                    {cfg.revisores.length === 0 && (
                        <li className="rounded-lg border border-dashed border-white/10 px-2 py-3 text-center text-xs text-white/50">
                            Cadena vacía: si la revisión cruzada está activa, no habrá
                            quien revise.
                        </li>
                    )}
                    {cfg.revisores.map((par, índice) => (
                        <FilaRevisor
                            key={`r-${índice}`}
                            par={par}
                            índice={índice}
                            total={cfg.revisores.length}
                            proveedores={proveedores}
                            alSubir={() => alMoverRevisor(índice, -1)}
                            alBajar={() => alMoverRevisor(índice, 1)}
                            alQuitar={() => alQuitarRevisor(índice)}
                            alCambiar={(s) => alCambiarRevisor(índice, s)}
                        />
                    ))}
                </ul>
            </article>

            <article className="rounded-xl border border-white/10 bg-black/30 p-4">
                <header>
                    <h3 className="text-sm font-semibold text-white">
                        Cupos por minuto (rpm)
                    </h3>
                    <p className="mt-0.5 text-xs text-white/50">
                        Solicitudes por minuto a cada proveedor. El orquestador respeta
                        este tope antes de mandar otra petición.
                    </p>
                </header>
                <ul className="mt-3 space-y-1.5">
                    {proveedores.map((p) => {
                        const valor = cfg.cuposRpm[p] ?? limites.cupoMin;
                        return (
                            <FilaCupo
                                key={p}
                                proveedor={p}
                                valor={valor}
                                mínimo={limites.cupoMin}
                                máximo={limites.cupoMax}
                                alCambiar={(n) => alCambiarCupo(p, n)}
                            />
                        );
                    })}
                </ul>
            </article>

            <TarjetasInformativas />
        </div>
    );
}

/** Tarjetas informativas (las mismas que la versión anterior). */
function TarjetasInformativas() {
    return (
        <div className="space-y-4">
            <Tarjeta
                titulo="Solo en tu máquina"
                icono={<ShieldCheck className="h-4 w-4" aria-hidden />}
            >
                <p>
                    Las rutas <code className="text-white/80">/api/mando/*</code> responden{" "}
                    <strong>404 fuera de local</strong>: nunca publican el estado del
                    desarrollo en el despliegue público.
                </p>
                <p>
                    Para activarlas en una instancia propia desplegada, define la variable{" "}
                    <code className="text-white/80">STARSEED_MANDO=1</code> en su entorno
                    (solo nombres de variables, jamás claves).
                </p>
            </Tarjeta>

            <Tarjeta
                titulo="Nunca claves ni rutas del disco"
                icono={<KeyRound className="h-4 w-4" aria-hidden />}
            >
                <p>
                    La API del mando recorta todo a rutas relativas del repositorio y a
                    resúmenes seguros. Jamás devuelve tokens, cookies ni rutas absolutas
                    del disco del usuario.
                </p>
            </Tarjeta>

            <Tarjeta
                titulo="Preferencias locales de la consola"
                icono={<Eye className="h-4 w-4" aria-hidden />}
            >
                <p>
                    La última pestaña visitada se guarda en{" "}
                    <code className="text-white/80">starseed.mando.pestana</code>{" "}
                    (localStorage del navegador). Nada se sube a tu cuenta.
                </p>
            </Tarjeta>
        </div>
    );
}
