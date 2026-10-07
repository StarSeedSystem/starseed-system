"use client";

/**
 * Panel ÚNICO de bloqueadas (Ola 1005Z · BLQ1005C · contrato
 * `architecture/bloqueadas-reparacion.md` §3).
 *
 * Antes había dos listas de bloqueadas: la del medidor del pulso y la de la
 * sección de procesos, y en ninguna funcionaba el reintento con cambio. Esta
 * es la ÚNICA lista: se monta en el detalle del medidor «Bloqueadas» y en la
 * sección de procesos, con paridad total.
 *
 * Reglas que no son de gusto:
 *   · TODA acción va a la misma API: `POST /api/mando/reintentar`, con
 *     `{ids?, cambio?, automatico?, escalar?}`. Ni un camino aparte para el
 *     medidor ni otro para procesos.
 *   · El cambio propuesto (automático, por la causa detectada) se muestra
 *     EDITABLE: o lo aceptas tal cual («Reparar ahora») o lo corriges y lo
 *     envías («Reparar con mi cambio»). Un reintento sin cambio nuevo es el
 *     mismo intento y falla igual.
 *   · Descartar es la EXCEPCIÓN (§2 del contrato): el botón solo existe
 *     cuando la tarea es descartable (sustituida, duplicada…) y pide dos
 *     clics, nunca `window.confirm`.
 *   · Al reparar con éxito, el botón del original se desactiva y la ficha
 *     enseña el sucesor: «reparada como Xb (posición 1)».
 */

import { useCallback, useMemo, useState } from "react";

import type { FilaMedidor } from "@/lib/mando/medidores";
import { cambioAutomatico, obtenerBaseId } from "@/lib/mando/reintento-inteligente";

/** Estados de fallo o bloqueo que «Reparar todas las que sirvan» procesa
 *  (contrato §3): nunca `sustituida`, `informe`, `en_curso` ni `pendiente`. */
const ESTADOS_REPARABLES = new Set([
    "fallo", "fallo_motor", "fallo_tsc", "fallo_tests", "sin_cambios",
    "interrumpida", "conflicto", "rechazada", "bloqueante", "faltan",
]);

/** Estos estados YA viven con otro id: repararlos es duplicar trabajo. */
const ESTADOS_DESCARTABLES = new Set(["sustituida", "reasignada", "duplicada", "descartada"]);

export function esEstadoReparable(estado: string): boolean {
    const e = estado.toLowerCase();
    return ESTADOS_REPARABLES.has(e) || e.startsWith("fallo");
}

export function esEstadoDescartable(estado: string): boolean {
    return ESTADOS_DESCARTABLES.has(estado.toLowerCase());
}

/** Lo que la ficha muestra y lo que el cambio editable lleva. */
export interface ItemBloqueada {
    id: string;
    titulo: string;
    estado: string;
    /** Causa detectada en castellano (una frase). */
    causa: string;
    /** Cambio automático propuesto; se muestra editable antes de enviar. */
    cambio: string;
    /** Cadena de sucesores conocida (X, Xb, Xc…), la última es la vigente. */
    sucesores: string[];
    reparable: boolean;
    descartable: boolean;
}

/** Ids de la misma cadena (X, Xb, Xc), ordenados: base primero, luego sufijos. */
export function cadenaSucesores(id: string, idsConocidos: readonly string[]): string[] {
    const base = obtenerBaseId(id);
    return [...new Set([id, ...idsConocidos])]
        .filter((x) => obtenerBaseId(x) === base)
        .sort((a, b) => {
            const sufijo = (x: string) => (x === base ? 0 : Math.max(1, x.charCodeAt(x.length - 1) - 96));
            return sufijo(a) - sufijo(b);
        });
}

/** Fila del medidor «Bloqueadas» → ítem del panel. La causa sale del `porque`
 *  del detalle; el cambio, del mismo clasificador que usa la API. */
export function itemDesdeFilaMedidor(f: FilaMedidor, idsConocidos: readonly string[] = []): ItemBloqueada {
    const estado = f.estado ?? "";
    const cambio = cambioAutomatico({ id: f.id, estado, titulo: f.titulo, nota: f.porque });
    return {
        id: f.id,
        titulo: f.titulo,
        estado,
        causa: f.porque?.trim() || cambio.split("\n")[0] || "causa sin anotar",
        cambio,
        sucesores: cadenaSucesores(f.id, idsConocidos),
        reparable: esEstadoReparable(estado),
        descartable: esEstadoDescartable(estado),
    };
}

/** Mínimo que necesita el panel de una tarea de la sección de procesos. Es
 *  compatible con `RamaTarea` sin importar el tipo (lib con carga pesada). */
export interface TareaRamaMinima {
    id: string;
    titulo: string;
    estado: string;
    nota?: string | null;
    bloqueadaPor?: string | null;
    archivos?: string[];
    veredicto?: { accion: string; motivo: string } | null;
}

/** Tarea de la ramificación → ítem del panel. AQUÍ la causa es el veredicto
 *  que calculó el SERVIDOR leyendo `revisiones.md`: el navegador no puede. */
export function itemDesdeRamaTarea(t: TareaRamaMinima, idsConocidos: readonly string[] = []): ItemBloqueada {
    const estado = t.estado ?? "";
    const cambio = cambioAutomatico({
        id: t.id, estado, titulo: t.titulo, nota: t.nota ?? "", archivos: t.archivos,
    });
    const veredicto = t.veredicto?.motivo?.trim();
    return {
        id: t.id,
        titulo: t.titulo,
        estado,
        causa:
            veredicto ||
            (t.bloqueadaPor ? `bloqueada por dependencia: ${t.bloqueadaPor}` : "") ||
            cambio.split("\n")[0] ||
            "causa sin anotar",
        cambio: t.bloqueadaPor && !veredicto
            ? `Tu dependencia no se integró (${t.bloqueadaPor}). Comprueba que ya está en main y, si lo está, ejecuta la tarea tal cual; si no, espera.`
            : cambio,
        sucesores: cadenaSucesores(t.id, idsConocidos),
        reparable: esEstadoReparable(estado) || Boolean(t.bloqueadaPor),
        descartable: esEstadoDescartable(estado),
    };
}

/** Respuesta de `POST /api/mando/reintentar` tal y como la usa el panel. */
export interface RespuestaReparacion {
    resultados?: Array<{ id: string; accion?: string; motivo?: string; sucesor?: string; posicion?: number; texto?: string }>;
    reintentadas?: string[];
    escaladas?: Array<{ id: string; motivo: string }>;
    descartadas?: Array<{ id: string; motivo: string }>;
    esperando?: Array<{ id: string; motivo: string }>;
    error?: string;
}

/** Frase corta de lo que hizo la API con UNA tarea («reparada como Xb»). */
export function textoResultado(r: RespuestaReparacion, id: string): { ok: boolean; texto: string; sucesor?: string } {
    const mio = r.resultados?.find((x) => x.id === id) ?? r.resultados?.[0];
    if (!mio) return { ok: false, texto: r.error ?? "sin respuesta del servidor" };
    const sucesor = mio.sucesor ?? r.reintentadas?.[0];
    if (mio.accion === "reintentada" && sucesor) {
        return { ok: true, texto: `reparada como ${sucesor} (posición ${mio.posicion ?? "—"})`, sucesor };
    }
    return { ok: mio.accion !== "esperando", texto: mio.texto ?? `${mio.accion ?? "procesada"}: ${mio.motivo ?? "sin motivo"}` };
}

/** Frase del pie tras «Reparar todas las que sirvan». */
export function resumenReparacion(r: RespuestaReparacion): string {
    const n = (l?: unknown[]) => l?.length ?? 0;
    return `${n(r.reintentadas)} reparadas · ${n(r.escaladas)} escaladas · ${n(r.descartadas)} descartadas · ${n(r.esperando)} esperando`;
}

async function pedirReparacion(cuerpo: Record<string, unknown>): Promise<RespuestaReparacion> {
    const r = await fetch("/api/mando/reintentar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
    });
    const d = (await r.json().catch(() => null)) as RespuestaReparacion | null;
    if (!r.ok) return { error: d?.error ?? `No se pudo (HTTP ${r.status}).` };
    return d ?? { error: "respuesta vacía" };
}

/** Una ficha: causas, cambio editable, cadena y los cuatro botones. */
function FichaBloqueada({
    item,
    alVer,
    alHecho,
}: {
    item: ItemBloqueada;
    alVer?: (id: string) => void;
    alHecho?: () => void;
}) {
    const [cambio, setCambio] = useState(item.cambio);
    const [ocupado, setOcupado] = useState(false);
    const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
    const [sucesor, setSucesor] = useState<string | null>(null);
    const [confirmando, setConfirmando] = useState(false);

    const ejecutar = useCallback(
        async (cuerpo: Record<string, unknown>) => {
            setOcupado(true);
            const d = await pedirReparacion(cuerpo);
            const hecho = textoResultado(d, item.id);
            setAviso({ ok: hecho.ok, texto: d.error ?? hecho.texto });
            if (hecho.sucesor) setSucesor(hecho.sucesor);
            setOcupado(false);
            setConfirmando(false);
            alHecho?.();
        },
        [item.id, alHecho],
    );

    const yaReparada = Boolean(sucesor);
    return (
        <li
            className="mc-cristal rounded-lg border border-white/10 p-2.5 text-left"
            data-testid={`bloqueada-panel-${item.id}`}
        >
            <p className="flex flex-wrap items-baseline gap-1.5">
                {alVer ? (
                    <button
                        type="button"
                        onClick={() => alVer(item.id)}
                        className="cursor-pointer font-mono text-[11px] text-cyan-200/90 hover:underline"
                    >
                        {item.id}
                    </button>
                ) : (
                    <span className="font-mono text-[11px] text-cyan-200/90">{item.id}</span>
                )}
                <span className="rounded-full border border-white/10 px-1.5 text-[10px] text-white/45">
                    {item.estado || "sin estado"}
                </span>
                {sucesor ? (
                    <span className="text-[10px] text-emerald-300/80" data-testid={`sucesor-${item.id}`}>
                        → reparada como {sucesor}
                    </span>
                ) : null}
            </p>
            <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-white/80">{item.titulo}</p>
            <p className="mt-1 text-[10px] leading-relaxed text-amber-200/70">
                causa: {item.causa}
            </p>
            <label className="mt-1.5 block text-[10px] text-white/40" htmlFor={`cambio-${item.id}`}>
                cambio propuesto (puedes editarlo antes de enviar):
            </label>
            <textarea
                id={`cambio-${item.id}`}
                value={cambio}
                onChange={(e) => setCambio(e.target.value)}
                disabled={yaReparada}
                rows={3}
                className="mt-0.5 w-full resize-y rounded-md border border-white/15 bg-black/40 px-2 py-1 font-mono text-[10px] leading-relaxed text-white/85 outline-none focus:border-cyan-300/50 disabled:opacity-50"
            />
            {item.sucesores.length > 1 ? (
                <p className="mt-1 text-[10px] text-white/40" data-testid={`cadena-${item.id}`}>
                    cadena: {item.sucesores.join(" → ")}
                </p>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                    type="button"
                    disabled={ocupado || yaReparada || !item.reparable}
                    onClick={() => void ejecutar({ ids: [item.id], automatico: true })}
                    className="cursor-pointer rounded-md border border-cyan-300/40 bg-cyan-400/10 px-2 py-1 text-[11px] text-cyan-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                    Reparar ahora
                </button>
                <button
                    type="button"
                    disabled={ocupado || yaReparada || !item.reparable || !cambio.trim()}
                    onClick={() => void ejecutar({ ids: [item.id], cambio })}
                    className="cursor-pointer rounded-md border border-white/15 bg-white/5 px-2 py-1 text-[11px] text-white/75 disabled:cursor-not-allowed disabled:opacity-40"
                >
                    Reparar con mi cambio
                </button>
                <button
                    type="button"
                    disabled={ocupado || yaReparada}
                    onClick={() => void ejecutar({ ids: [item.id], escalar: true })}
                    className="cursor-pointer rounded-md border border-fuchsia-300/30 bg-fuchsia-500/10 px-2 py-1 text-[11px] text-fuchsia-200 disabled:cursor-not-allowed disabled:opacity-40"
                >
                    Escalar a director
                </button>
                {item.descartable ? (
                    <button
                        type="button"
                        disabled={ocupado || yaReparada}
                        onBlur={() => setConfirmando(false)}
                        onClick={() => {
                            if (!confirmando) return setConfirmando(true);
                            void ejecutar({ ids: [item.id], automatico: true });
                        }}
                        className={`cursor-pointer rounded-md border px-2 py-1 text-[11px] disabled:cursor-not-allowed disabled:opacity-40 ${
                            confirmando
                                ? "border-rose-400/70 bg-rose-500/25 text-rose-100"
                                : "border-rose-400/30 bg-rose-500/10 text-rose-200"
                        }`}
                    >
                        {confirmando ? "¿Seguro?" : "Descartar"}
                    </button>
                ) : null}
            </div>
            {aviso ? (
                <p
                    role="status"
                    data-testid={`aviso-${item.id}`}
                    className={`mt-1.5 text-[10px] ${aviso.ok ? "text-emerald-300" : "text-rose-300"}`}
                >
                    {aviso.texto}
                </p>
            ) : null}
        </li>
    );
}

/**
 * EL PANEL. La única lista de bloqueadas de Genesis: las mismas fichas y los
 * mismos botones en el detalle del medidor y en la sección de procesos.
 * Legible a 360 px: una columna, botones que se envuelven.
 */
export function BloqueadasPanel({
    items,
    alVer,
    alHecho,
}: {
    items: ItemBloqueada[];
    /** Si se da, el id de la ficha es un botón que abre la tarea en Procesos. */
    alVer?: (id: string) => void;
    /** Se avisa tras cada acción para que el padre relea sus datos. */
    alHecho?: () => void;
}) {
    const [enviando, setEnviando] = useState(false);
    const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);

    const reparables = useMemo(() => items.filter((i) => i.reparable), [items]);

    const repararTodas = useCallback(async () => {
        setEnviando(true);
        setResultado(null);
        // Sin `ids`: la API procesa SOLO estados de fallo o bloqueo (contrato §3).
        const d = await pedirReparacion({});
        setResultado(
            d.error ? { ok: false, texto: d.error } : { ok: true, texto: resumenReparacion(d) },
        );
        setEnviando(false);
        alHecho?.();
    }, [alHecho]);

    if (items.length === 0) return null;
    return (
        <section className="mt-2 text-left" data-testid="bloqueadas-panel">
            <ul className="grid gap-1.5 md:grid-cols-2 xl:grid-cols-3">
                {items.map((item) => (
                    <FichaBloqueada key={item.id} item={item} alVer={alVer} alHecho={alHecho} />
                ))}
            </ul>
            {reparables.length > 0 ? (
                <p className="mt-2.5 flex flex-wrap items-center justify-center gap-2 border-t border-white/10 pt-2.5">
                    <button
                        type="button"
                        disabled={enviando}
                        onClick={() => void repararTodas()}
                        className="cursor-pointer rounded-md border border-amber-400/40 bg-amber-500/15 px-3 py-1.5 text-[11px] font-medium text-amber-100 hover:bg-amber-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                        data-testid="reparar-todas"
                    >
                        {enviando ? "Reparando…" : `Reparar todas las que sirvan (${reparables.length})`}
                    </button>
                    {resultado ? (
                        <span
                            role="status"
                            data-testid="resultado-reparar-todas"
                            className={`text-[11px] ${resultado.ok ? "text-emerald-300" : "text-rose-300"}`}
                        >
                            {resultado.texto}
                        </span>
                    ) : null}
                </p>
            ) : null}
        </section>
    );
}
