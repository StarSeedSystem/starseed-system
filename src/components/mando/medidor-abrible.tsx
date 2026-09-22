"use client";

/**
 * Medidor abrible — la pastilla de la cabecera que ahora se abre (2026-09-15).
 *
 * Antes cada medidor decía un número y te dejaba solo: «23 bloqueadas» y a
 * buscarte la vida. Ahora se abre y enseña cuáles, por qué, y qué puedes hacer
 * con cada una.
 *
 * Decisiones que no son de gusto:
 *   · El detalle se pide SOLO al abrir. Ocho peticiones al montar la página es lo
 *     contrario de «que no ocupe muchos recursos».
 *   · Confirmación en dos pasos en el propio botón, nunca `window.confirm`: ese
 *     bloquea el hilo y congela todo el Mando mientras está abierto.
 *   · Un reintento sin describir el cambio no se puede enviar. Sería el mismo
 *     intento y fallaría exactamente igual.
 *   · Título, valor y botones CENTRADOS (lo pidió Alex). Las filas del panel van
 *     alineadas a la izquierda a propósito: son datos que se leen en columna y
 *     centrarlos los vuelve ilegibles. No lo «arregles».
 */

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";

import type { AccionMedidor, ClaveMedidor, DetalleMedidor, FilaMedidor } from "@/lib/mando/medidores";

export type TonoMedidor = "normal" | "aviso" | "peligro" | "ok";

/** Salud de una fila, cuando el servidor la trae: nota de 1 a 10 más el porqué. */
type SaludFila = {
    salud?: number;
    senal?: "bien" | "vigilar" | "mal";
    motivo?: string;
};

const PUNTO_SENAL: Record<NonNullable<SaludFila["senal"]>, string> = {
    bien: "bg-emerald-400",
    vigilar: "bg-amber-400",
    mal: "bg-rose-400",
};

/** «hace 3 min» a partir de una fecha ISO; «—» si no es hora válida. */
function haceMinutos(iso: string | null | undefined): string | null {
    if (!iso) return null;
    const ms = Date.parse(iso);
    if (Number.isNaN(ms)) return null;
    const min = Math.max(0, Math.round((Date.now() - ms) / 60_000));
    return min < 1 ? "hace menos de 1 min" : `hace ${min} min`;
}

const NEON: Record<TonoMedidor, string> = {
    normal: "mc-neon",
    aviso: "mc-neon--aviso",
    peligro: "mc-neon--peligro",
    ok: "mc-neon--ok",
};

const TEXTO: Record<TonoMedidor, string> = {
    normal: "text-white/85",
    aviso: "text-amber-200",
    peligro: "text-rose-200",
    ok: "text-emerald-200",
};

/** Un botón de acción: rojo y a dos clics si borra; con campo si pide texto. */
function BotonAccion({
    accion,
    fila,
    alAccionar,
}: {
    accion: AccionMedidor;
    fila?: FilaMedidor;
    alAccionar: (a: AccionMedidor, f: FilaMedidor | undefined, texto: string) => Promise<void>;
}) {
    const [confirmando, setConfirmando] = useState(false);
    const [pidiendo, setPidiendo] = useState(false);
    const [texto, setTexto] = useState("");
    const [ocupado, setOcupado] = useState(false);

    const ejecutar = useCallback(async () => {
        setOcupado(true);
        try {
            await alAccionar(accion, fila, texto);
        } finally {
            setOcupado(false);
            setConfirmando(false);
            setPidiendo(false);
            setTexto("");
        }
    }, [accion, alAccionar, fila, texto]);

    if (accion.pideTexto && pidiendo) {
        return (
            <span className="inline-flex flex-wrap items-center gap-1.5">
                <input
                    autoFocus
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    placeholder={accion.pideTexto}
                    aria-label={accion.pideTexto}
                    className="min-w-56 flex-1 rounded-md border border-white/15 bg-black/40 px-2 py-1 text-[11px] text-white/90 outline-none focus:border-cyan-300/50"
                />
                <button
                    type="button"
                    disabled={!texto.trim() || ocupado}
                    onClick={() => void ejecutar()}
                    className="mc-alzar cursor-pointer rounded-md border border-cyan-300/40 bg-cyan-400/10 px-2 py-1 text-[11px] text-cyan-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                    Enviar
                </button>
                <button
                    type="button"
                    onClick={() => setPidiendo(false)}
                    className="cursor-pointer rounded-md border border-white/10 px-2 py-1 text-[11px] text-white/50"
                >
                    Cancelar
                </button>
            </span>
        );
    }

    const peligrosa = accion.destructiva;
    return (
        <button
            type="button"
            disabled={ocupado}
            onClick={() => {
                if (accion.pideTexto) return setPidiendo(true);
                if (peligrosa && !confirmando) return setConfirmando(true);
                void ejecutar();
            }}
            onBlur={() => setConfirmando(false)}
            className={`mc-alzar mc-centrado cursor-pointer rounded-md border px-2 py-1 text-[11px] ${
                peligrosa
                    ? confirmando
                        ? "border-rose-400/70 bg-rose-500/25 text-rose-100"
                        : "border-rose-400/30 bg-rose-500/10 text-rose-200"
                    : "border-white/15 bg-white/5 text-white/75"
            }`}
        >
            {ocupado ? "…" : confirmando ? "¿Seguro?" : accion.texto}
        </button>
    );
}

/**
 * LA PASTILLA. Solo la tarjeta: ni abre nada por su cuenta ni contiene el panel.
 *
 * (2026-09-15) Antes el panel colgaba DENTRO de la pastilla, y la pastilla vivía en
 * una fila que se envuelve. Al abrir uno, la tarjeta pasaba de 8 rem a 30 y
 * reorganizaba toda la cabecera: huecos enormes, medidores saltando de sitio. El
 * panel ahora se pinta UNA vez, debajo de la rejilla entera, y a lo ancho.
 */
export function PastillaMedidor({
    clave,
    titulo,
    valor,
    detalle,
    tono = "normal",
    abierto = false,
    alPulsar,
    alClic,
}: {
    /** Sin `clave` la pastilla NO se abre: es informativa y se nota (no lleva chevrón). */
    clave?: ClaveMedidor;
    titulo: string;
    valor: string;
    detalle?: string;
    tono?: TonoMedidor;
    abierto?: boolean;
    alPulsar?: (clave: ClaveMedidor) => void;
    /** Acción propia para las pastillas que no abren panel (p. ej. abrir Drive). */
    alClic?: () => void;
}) {
    const pulsable = Boolean(clave || alClic);
    const contenido = (
        <>
            <span className="text-[10px] uppercase tracking-wider text-white/45">{titulo}</span>
            <span className={`text-lg font-semibold leading-tight ${TEXTO[tono]}`}>{valor}</span>
            {detalle ? (
                <span className="line-clamp-2 text-[10px] leading-snug text-white/45">{detalle}</span>
            ) : null}
            {clave ? (
                <ChevronDown
                    aria-hidden
                    className={`h-3 w-3 shrink-0 text-white/30 transition-transform duration-200 ${abierto ? "rotate-180" : ""}`}
                />
            ) : null}
        </>
    );
    const clases = `mc-cristal mc-centrado flex h-full min-h-[4.75rem] w-full flex-col items-center justify-center gap-0.5 px-3 py-2 ${
        pulsable ? "mc-alzar cursor-pointer" : ""
    } ${abierto ? "ring-1 ring-cyan-300/40" : ""} ${NEON[tono]}`;

    if (!pulsable) return <div className={clases}>{contenido}</div>;

    return (
        <button
            type="button"
            {...(clave ? { "aria-expanded": abierto, "aria-controls": "panel-medidor" } : {})}
            onClick={() => (clave ? alPulsar?.(clave) : alClic?.())}
            className={clases}
        >
            {contenido}
        </button>
    );
}

function FichaFila({
    f,
    ejecutar,
}: {
    f: FilaMedidor;
    ejecutar: (a: AccionMedidor, f: FilaMedidor | undefined, texto: string) => Promise<void>;
}) {
    return (
        <li className="rounded-lg border border-white/10 bg-black/25 p-2 text-left">
            <p className="flex flex-wrap items-baseline gap-1.5">
                <span className="font-mono text-[11px] text-cyan-200/90">{f.id}</span>
                {f.estado ? (
                    <span className="rounded-full border border-white/10 px-1.5 text-[10px] text-white/45">
                        {f.estado}
                    </span>
                ) : null}
            </p>
            <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-white/80">{f.titulo}</p>

            {typeof f.porcentaje === "number" ? (
                <p className="mt-1 flex items-center gap-1.5">
                    <span
                        className="mc-barra h-1 flex-1 overflow-hidden rounded-full bg-white/10"
                        role="progressbar"
                        aria-valuenow={f.porcentaje}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`Avance de ${f.id}`}
                    >
                        <i
                            className={`block h-full rounded-full ${
                                f.porcentaje === 0 ? "bg-white/25" : "bg-cyan-400/80"
                            }`}
                            style={{ transform: `scaleX(${Math.max(0.02, f.porcentaje / 100)})` }}
                        />
                    </span>
                    <span className="w-14 shrink-0 text-right text-[10px] tabular-nums text-white/55">
                        {f.porcentaje} %
                    </span>
                    {f.etapa ? (
                        <span className="shrink-0 text-[10px] text-cyan-200/70">{f.etapa}</span>
                    ) : null}
                </p>
            ) : null}

            {(() => {
                const s = f as FilaMedidor & SaludFila;
                return typeof s.salud === "number" ? (
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-white/60">
                        <span
                            aria-hidden
                            className={`inline-block h-1.5 w-1.5 rounded-full ${PUNTO_SENAL[s.senal ?? "vigilar"]}`}
                        />
                        <span className="tabular-nums">salud {s.salud}/10</span>
                        {s.motivo ? <span className="text-white/40">· {s.motivo}</span> : null}
                    </p>
                ) : null;
            })()}
            {f.porque ? (
                <p className="mt-0.5 text-[10px] leading-relaxed text-amber-200/70">{f.porque}</p>
            ) : null}
            {f.quien || f.desde ? (
                <p className="mt-0.5 text-[10px] text-white/35">
                    {[f.quien, f.desde].filter(Boolean).join(" · ")}
                </p>
            ) : null}
            <FichaDesplegable f={f} />
            {f.acciones.length ? (
                <p className="mt-1.5 flex flex-wrap gap-1.5">
                    {f.acciones.map((a) => (
                        <BotonAccion key={`${f.id}-${a.clase}`} accion={a} fila={f} alAccionar={ejecutar} />
                    ))}
                </p>
            ) : null}
        </li>
    );
}

/** Las sub-líneas de la ficha: sangradas bajo la etiqueta que las encabeza. */
const SANGRADAS = new Set(["·", "✓", "↳ no pudo"]);

/**
 * La ficha de una fila, CERRADA por defecto.
 *
 * (2026-09-22, pedido por Alex) Cada agente y cada tarea traen ahora una ficha larga:
 * modelo, entorno, worktree, rama, archivos que toca, enrutado, historial… Son muchas
 * líneas, y la lista tiene que seguir leyéndose de un vistazo, así que se despliega a
 * petición con un `<details>` nativo: sin estado en React, sin JavaScript, y accesible
 * con teclado desde el primer día.
 */
function FichaDesplegable({ f }: { f: FilaMedidor }) {
    const ficha = f.ficha ?? [];
    const historial = f.historial ?? [];
    if (!ficha.length && !historial.length) return null;
    return (
        <details className="group mt-1">
            <summary className="cursor-pointer list-none text-[10px] text-cyan-200/60 transition hover:text-cyan-200/90">
                <span className="inline-block transition group-open:rotate-90" aria-hidden>
                    ▸
                </span>{" "}
                {ficha.length ? `ficha (${ficha.length})` : "historial"}
                {historial.length ? ` · ${historial.length} en el historial` : ""}
            </summary>

            {ficha.length ? (
                <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[10px] leading-relaxed">
                    {ficha.map((dato, i) => {
                        const sangrada = SANGRADAS.has(dato.etiqueta);
                        // El rojo del Mando es el mismo que ya usa `porque`: no se inventa otro.
                        const tono = dato.aviso ? "text-amber-200/90" : "text-white/70";
                        return (
                            <Fragment key={`${f.id}-ficha-${i}-${dato.etiqueta}`}>
                                <dt
                                    className={`${sangrada ? "pl-3 text-white/25" : "text-white/40"} whitespace-nowrap`}
                                >
                                    {dato.etiqueta}
                                </dt>
                                <dd className={`${tono} break-words`}>
                                    {dato.enlace ? (
                                        <a
                                            href={dato.enlace}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="underline decoration-dotted underline-offset-2 hover:text-cyan-200"
                                        >
                                            {dato.valor}
                                        </a>
                                    ) : (
                                        dato.valor
                                    )}
                                </dd>
                            </Fragment>
                        );
                    })}
                </dl>
            ) : null}

            {historial.length ? (
                <ul className="mt-1.5 space-y-1 border-t border-white/5 pt-1.5">
                    {historial.map((h, i) => (
                        <li key={`${f.id}-hist-${i}`} className="text-[10px] leading-relaxed">
                            <span className="text-white/30">{h.t.replace("T", " ").slice(0, 16)}</span>{" "}
                            <span className="text-cyan-200/60">{h.de}</span>
                            <span className="block text-white/55">{h.texto}</span>
                        </li>
                    ))}
                </ul>
            ) : null}
        </details>
    );
}

/**
 * EL PANEL. Uno solo, debajo de la rejilla y a todo el ancho. Pide su detalle al
 * abrirse (nunca al montar: ocho peticiones que nadie ha pedido son lo contrario
 * de «que no ocupe muchos recursos»).
 */
export function PanelMedidor({
    clave,
    alAccionar,
    alIrA,
    alCerrar,
}: {
    clave: ClaveMedidor;
    alAccionar?: (clave: ClaveMedidor, a: AccionMedidor, f: FilaMedidor | undefined, texto: string) => Promise<string>;
    alIrA?: (destino: string) => void;
    alCerrar: () => void;
}) {
    const [datos, setDatos] = useState<DetalleMedidor | null>(null);
    const [cargando, setCargando] = useState(false);
    const [aviso, setAviso] = useState<string | null>(null);
    /** Última comprobación de directores (GET /api/mando/comprobar). */
    const [ultimaComprobacion, setUltimaComprobacion] = useState<string | null>(null);
    const [comprobando, setComprobando] = useState(false);

    /** Cuándo se comprobó por última vez; nunca se esconde: «nunca» también se dice. */
    const cargarComprobacion = useCallback(async () => {
        try {
            const r = await fetch(`/api/mando/comprobar?medidor=${encodeURIComponent(clave)}`, { cache: "no-store" });
            const d = (await r.json()) as { comprobacion?: { terminado?: string | null; empezado?: string } | null };
            setUltimaComprobacion(d.comprobacion?.terminado ?? d.comprobacion?.empezado ?? null);
        } catch {
            setUltimaComprobacion(null);
        }
    }, [clave]);

    // `primera` distingue la carga inicial de los refrescos: en un refresco NO se pinta el
    // esqueleto, o la lista parpadearía cada cinco segundos y sería ilegible.
    const cargar = useCallback(async (primera = false) => {
        if (primera) setCargando(true);
        try {
            const r = await fetch(`/api/mando/medidores?clave=${encodeURIComponent(clave)}`, { cache: "no-store" });
            const d = (await r.json()) as { detalle?: DetalleMedidor };
            setDatos(d.detalle ?? null);
            setAviso(null);
        } catch {
            setAviso("No se pudo leer el detalle.");
        } finally {
            if (primera) setCargando(false);
        }
    }, [clave]);

    /** POST /api/mando/comprobar y luego recarga panel y fecha de comprobación. */
    const comprobarAhora = useCallback(async () => {
        setComprobando(true);
        try {
            await fetch("/api/mando/comprobar", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ medidor: clave }),
            });
        } finally {
            await cargarComprobacion();
            await cargar();
            setComprobando(false);
        }
    }, [clave, cargar, cargarComprobacion]);

    useEffect(() => {
        setDatos(null);
        setAviso(null);
        void cargar(true);
        void cargarComprobacion();
    }, [cargar, cargarComprobacion]);

    /**
     * El panel se REFRESCA mientras está abierto.
     *
     * Hasta ahora pedía los datos una sola vez, al abrirse, y nunca volvía a preguntar: las
     * barras de avance se congelaban en el instante en que lo abrías. Alex lo dijo mirando la
     * pantalla —«sigue sin actualizarse las líneas de progreso»— mientras los agentes sí
     * avanzaban por detrás. Una barra de progreso que no se mueve es peor que no tenerla:
     * hace creer que el trabajo está parado.
     *
     * Cinco segundos es el ritmo del latido del orquestador (~20 s de escritura, fases de
     * minutos); más rápido no aporta nada y solo gasta. Y se PARA cuando la pestaña no se ve:
     * en una Mac de 8 GB con el enjambre escribiendo, una pestaña olvidada en segundo plano
     * no tiene por qué pedir nada.
     */
    useEffect(() => {
        let id: number | null = null;
        const arrancar = () => {
            if (id === null && !document.hidden) id = window.setInterval(() => void cargar(), 5_000);
        };
        const parar = () => {
            if (id !== null) window.clearInterval(id);
            id = null;
        };
        const alCambiarVisibilidad = () => {
            if (document.hidden) parar();
            else {
                void cargar(); // al volver, lo primero es ponerse al día
                arrancar();
            }
        };
        arrancar();
        document.addEventListener("visibilitychange", alCambiarVisibilidad);
        return () => {
            parar();
            document.removeEventListener("visibilitychange", alCambiarVisibilidad);
        };
    }, [cargar]);

    useEffect(() => {
        const alPulsar = (e: KeyboardEvent) => {
            if (e.key === "Escape") alCerrar();
        };
        window.addEventListener("keydown", alPulsar);
        return () => window.removeEventListener("keydown", alPulsar);
    }, [alCerrar]);

    const ejecutar = useCallback(
        async (a: AccionMedidor, f: FilaMedidor | undefined, texto: string) => {
            if (a.clase === "ir-a") {
                if (a.destino) alIrA?.(a.destino);
                return;
            }
            if (!alAccionar) return;
            setAviso(await alAccionar(clave, a, f, texto));
            void cargar();
        },
        [alAccionar, alIrA, clave, cargar],
    );

    return (
        <section
            id="panel-medidor"
            role="region"
            aria-label={`Detalle de ${datos?.titulo ?? clave}`}
            className="mc-cristal mc-desplegar mt-2 w-full p-3"
        >
            <header className="mc-centrado flex flex-wrap items-baseline justify-center gap-2">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-white/70">
                    {datos?.titulo ?? "…"}
                </h3>
                <span className="text-[11px] text-white/45">{datos?.resumen ?? ""}</span>
                {/* El avance del conjunto, para no tener que sumar las filas a ojo. */}
                {typeof datos?.porcentajeMedio === "number" ? (
                    <span className="inline-flex items-center gap-1.5">
                        <span
                            className="mc-barra h-1 w-20 overflow-hidden rounded-full bg-white/10"
                            role="progressbar"
                            aria-valuenow={datos.porcentajeMedio}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-label="Avance medio"
                        >
                            <i
                                className="block h-full rounded-full bg-cyan-400/80"
                                style={{ transform: `scaleX(${Math.max(0.02, datos.porcentajeMedio / 100)})` }}
                            />
                        </span>
                        <span className="text-[10px] tabular-nums text-white/55">{datos.porcentajeMedio} % medio</span>
                    </span>
                ) : null}
                <button
                    type="button"
                    disabled={comprobando}
                    onClick={() => void comprobarAhora()}
                    className="ml-2 inline-flex cursor-pointer items-center gap-1 rounded-md border border-cyan-300/40 bg-cyan-400/10 px-2 py-0.5 text-[10px] text-cyan-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                    {comprobando ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : null}
                    Comprobar ahora
                </button>
                <button
                    type="button"
                    onClick={alCerrar}
                    className="ml-2 cursor-pointer rounded-md border border-white/10 px-2 py-0.5 text-[10px] text-white/50"
                >
                    Cerrar
                </button>
            </header>

            <p className="mc-centrado mt-1 text-[10px] text-white/40">
                última comprobación: {ultimaComprobacion ? (haceMinutos(ultimaComprobacion) ?? "desconocida") : "nunca se ha comprobado"}
            </p>

            {cargando && !datos ? (
                <p className="mt-2 flex items-center justify-center gap-2 text-[11px] text-white/50">
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                    Leyendo…
                </p>
            ) : null}

            {datos ? (() => {
                const operativas = datos.filas.filter((f) => !f.historica);
                const historicas = datos.filas.filter((f) => f.historica);

                if (datos.filas.length === 0) {
                    return <p className="mc-centrado mt-2 text-[11px] leading-relaxed text-white/45">{datos.vacio}</p>;
                }

                return (
                    <>
                        {operativas.length > 0 ? (
                            <ul className="mt-2 grid gap-1.5 md:grid-cols-2 xl:grid-cols-3">
                                {operativas.map((f) => (
                                    <FichaFila key={f.id} f={f} ejecutar={ejecutar} />
                                ))}
                            </ul>
                        ) : (
                            <p className="mc-centrado mt-2 text-[11px] leading-relaxed text-white/45">{datos.vacio}</p>
                        )}

                        {historicas.length > 0 ? (
                            <details className="mt-3 border-t border-white/10 pt-2.5 text-left">
                                <summary className="cursor-pointer text-[11px] font-medium text-white/50 hover:text-white/80 select-none">
                                    de olas cerradas ({historicas.length})
                                </summary>
                                <ul className="mt-2 grid gap-1.5 md:grid-cols-2 xl:grid-cols-3">
                                    {historicas.map((f) => (
                                        <FichaFila key={f.id} f={f} ejecutar={ejecutar} />
                                    ))}
                                </ul>
                            </details>
                        ) : null}
                    </>
                );
            })() : null}

            {datos?.acciones.length ? (
                <p className="mc-centrado mt-2.5 flex flex-wrap justify-center gap-1.5 border-t border-white/10 pt-2.5">
                    {datos.acciones.map((a) => (
                        <BotonAccion key={a.clase} accion={a} alAccionar={ejecutar} />
                    ))}
                </p>
            ) : null}

            {aviso ? (
                <p className="mc-centrado mt-2 rounded-md border border-cyan-300/25 bg-cyan-400/10 px-2 py-1 text-[10px] text-cyan-100">
                    {aviso}
                </p>
            ) : null}
        </section>
    );
}
