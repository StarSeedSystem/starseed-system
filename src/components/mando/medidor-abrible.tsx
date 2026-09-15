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

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";

import type { AccionMedidor, ClaveMedidor, DetalleMedidor, FilaMedidor } from "@/lib/mando/medidores";

export type TonoMedidor = "normal" | "aviso" | "peligro" | "ok";

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

    const cargar = useCallback(async () => {
        setCargando(true);
        try {
            const r = await fetch(`/api/mando/medidores?clave=${encodeURIComponent(clave)}`, { cache: "no-store" });
            const d = (await r.json()) as { detalle?: DetalleMedidor };
            setDatos(d.detalle ?? null);
        } catch {
            setAviso("No se pudo leer el detalle.");
        } finally {
            setCargando(false);
        }
    }, [clave]);

    useEffect(() => {
        setDatos(null);
        setAviso(null);
        void cargar();
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
                <button
                    type="button"
                    onClick={alCerrar}
                    className="ml-2 cursor-pointer rounded-md border border-white/10 px-2 py-0.5 text-[10px] text-white/50"
                >
                    Cerrar
                </button>
            </header>

            {cargando && !datos ? (
                <p className="mt-2 flex items-center justify-center gap-2 text-[11px] text-white/50">
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                    Leyendo…
                </p>
            ) : null}

            {datos ? (
                datos.filas.length === 0 ? (
                    <p className="mc-centrado mt-2 text-[11px] leading-relaxed text-white/45">{datos.vacio}</p>
                ) : (
                    /* Rejilla: con cuarenta filas, una columna deja la página infinita.
                       El texto de cada ficha va a la IZQUIERDA a propósito: son datos que
                       se leen en columna y centrarlos los vuelve ilegibles. */
                    <ul className="mt-2 grid gap-1.5 md:grid-cols-2 xl:grid-cols-3">
                        {datos.filas.map((f) => (
                            <li key={f.id} className="rounded-lg border border-white/10 bg-black/25 p-2 text-left">
                                <p className="flex flex-wrap items-baseline gap-1.5">
                                    <span className="font-mono text-[11px] text-cyan-200/90">{f.id}</span>
                                    {f.estado ? (
                                        <span className="rounded-full border border-white/10 px-1.5 text-[10px] text-white/45">
                                            {f.estado}
                                        </span>
                                    ) : null}
                                </p>
                                <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-white/80">{f.titulo}</p>
                                {f.porque ? (
                                    <p className="mt-0.5 text-[10px] leading-relaxed text-amber-200/70">{f.porque}</p>
                                ) : null}
                                {f.quien || f.desde ? (
                                    <p className="mt-0.5 text-[10px] text-white/35">
                                        {[f.quien, f.desde].filter(Boolean).join(" · ")}
                                    </p>
                                ) : null}
                                {f.acciones.length ? (
                                    <p className="mt-1.5 flex flex-wrap gap-1.5">
                                        {f.acciones.map((a) => (
                                            <BotonAccion key={`${f.id}-${a.clase}`} accion={a} fila={f} alAccionar={ejecutar} />
                                        ))}
                                    </p>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                )
            ) : null}

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
