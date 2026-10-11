"use client";

/**
 * «Puerta de datos (A1)» en Genesis › Consumo y créditos (PDA1010, architecture/puerta-datos-a1.md).
 *
 * Alex: «esas peticiones de Supabase ¿no podrían manejarse por nuestro servicio de nube de Oracle?».
 * La puerta del A1 sirve el tráfico de máquina a máquina y lo que se lee mucho; esta fila enseña lo
 * que ella MIDE (peticiones servidas sin Supabase menos las que ella misma pidió a Supabase), su
 * salud (servicio, HTTPS, claves de sesión, réplica) y, en ESTA neurona, cuántas operaciones fueron
 * por la puerta o por Supabase, con el interruptor para apagarla aquí.
 *
 * Lee `GET /api/mando/puerta-datos` cada 2 min con la pestaña visible; «Comprobar ahora» hace POST.
 * La configuración y los contadores de la neurona son de este aparato (localStorage), sin red.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { DatabaseZap, RefreshCw } from "lucide-react";

import {
    guardarConfigPuerta,
    leerConfigPuerta,
    leerContadores,
    vistaPuerta,
    type AlmacenPuerta,
    type ContadoresPuerta,
    type DatosPuerta,
    type ModoPuerta,
    type TonoPuerta,
} from "@/lib/datos/puerta-a1-tipos";

const RUTA = "/api/mando/puerta-datos";
const SONDEO_MS = 120_000;
/** Los contadores de ESTA neurona (localStorage) se releen así de seguido con la pestaña visible. */
const CONTADORES_MS = 15_000;
/** Los grupos que la fase 2 lleva por la puerta desde el navegador (PDA1012). */
const GRUPOS_NAVEGADOR: { id: string; texto: string }[] = [
    { id: "neuronas", texto: "neuronas" },
    { id: "presencia", texto: "presencia" },
    { id: "freno", texto: "freno" },
];

/** Lo que el adaptador de ESTA pestaña sabe ahora: si conoce la URL y cómo respondió la salud. */
interface EnlaceAqui {
    configurada: boolean;
    ok: boolean;
    ms: number | null;
    en: number;
}

const ACENTO: Record<TonoPuerta, string> = { ok: "#34d399", aviso: "#fbbf24", peligro: "#fb7185", neutro: "#94a3b8" };
const TEXTO: Record<TonoPuerta, string> = { ok: "text-emerald-200", aviso: "text-amber-200", peligro: "text-rose-200", neutro: "text-white/70" };

function almacen(): AlmacenPuerta | null {
    try {
        return typeof window !== "undefined" ? window.localStorage : null;
    } catch {
        return null;
    }
}

function miles(n: number): string {
    return Math.round(n).toLocaleString("es-ES");
}

function hace(iso: string, ahora: number): string {
    const ms = ahora - Date.parse(iso);
    if (!Number.isFinite(ms)) return "en fecha desconocida";
    const min = Math.round(ms / 60_000);
    if (min < 1) return "hace un momento";
    if (min < 60) return `hace ${min} min`;
    const h = Math.round(min / 60);
    return h < 48 ? `hace ${h} h` : `hace ${Math.round(h / 24)} días`;
}

export function usePuertaDatos() {
    const [datos, setDatos] = useState<DatosPuerta | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [mensaje, setMensaje] = useState<string | null>(null);
    const [comprobando, setComprobando] = useState(false);
    const vivo = useRef(true);

    const recargar = useCallback(async () => {
        try {
            const r = await fetch(RUTA, { cache: "no-store" });
            const d = (await r.json().catch(() => ({}))) as { datos?: DatosPuerta | null; error?: string };
            if (!vivo.current) return;
            setDatos(d.datos ?? null);
            setError(d.datos ? null : (d.error ?? `La puerta de datos no respondió (HTTP ${r.status}).`));
        } catch {
            if (vivo.current) setError("No se pudo leer la puerta de datos.");
        }
    }, []);

    const comprobar = useCallback(async () => {
        setComprobando(true);
        setMensaje(null);
        try {
            const r = await fetch(RUTA, { method: "POST", cache: "no-store" });
            const d = (await r.json().catch(() => ({}))) as { datos?: DatosPuerta | null; mensaje?: string; error?: string };
            if (!vivo.current) return;
            if (d.datos) setDatos(d.datos);
            setMensaje(d.error ?? d.mensaje ?? null);
        } catch {
            if (vivo.current) setMensaje("No se pudo pedir la comprobación a Genesis.");
        } finally {
            if (vivo.current) setComprobando(false);
        }
    }, []);

    useEffect(() => {
        vivo.current = true;
        let id: number | null = null;
        const arrancar = () => {
            if (id === null) id = window.setInterval(() => void recargar(), SONDEO_MS);
        };
        const parar = () => {
            if (id !== null) window.clearInterval(id);
            id = null;
        };
        const alCambiar = () => {
            if (document.visibilityState === "hidden") parar();
            else {
                void recargar();
                arrancar();
            }
        };
        if (document.visibilityState !== "hidden") {
            void recargar();
            arrancar();
        }
        document.addEventListener("visibilitychange", alCambiar);
        return () => {
            vivo.current = false;
            parar();
            document.removeEventListener("visibilitychange", alCambiar);
        };
    }, [recargar]);

    return { datos, error, mensaje, comprobando, comprobar };
}

function Pastilla({ texto, tono }: { texto: string; tono: TonoPuerta }) {
    const c = ACENTO[tono];
    return (
        <span
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold text-white/90"
            style={{ background: `${c}1f`, boxShadow: `inset 0 0 0 1px ${c}66` }}
        >
            <i aria-hidden className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: c }} />
            {texto}
        </span>
    );
}

export function FilaPuertaDatos() {
    const { datos, error, mensaje, comprobando, comprobar } = usePuertaDatos();
    const [modo, setModo] = useState<ModoPuerta>("auto");
    const [aparato, setAparato] = useState<ContadoresPuerta | null>(null);

    useEffect(() => {
        const a = almacen();
        setModo(leerConfigPuerta(a).modo);
        setAparato(leerContadores(a, Date.now()));
        const alGuardar = (e: StorageEvent) => {
            if (e.key && e.key.startsWith("starseed.puerta-datos.")) {
                setModo(leerConfigPuerta(a).modo);
                setAparato(leerContadores(a, Date.now()));
            }
        };
        window.addEventListener("storage", alGuardar);
        return () => window.removeEventListener("storage", alGuardar);
    }, []);

    // (PDA1012) Los contadores de esta neurona cambian en ESTA pestaña (el evento `storage` solo
    // llega de las otras): se releen cada 15 s con la pestaña a la vista.
    useEffect(() => {
        const id = window.setInterval(() => {
            if (document.visibilityState !== "hidden") setAparato(leerContadores(almacen(), Date.now()));
        }, CONTADORES_MS);
        return () => window.clearInterval(id);
    }, []);

    // ¿Habla esta pestaña con la puerta? Lo dice el propio adaptador (sin tocar Supabase salvo la
    // fila `os_puerta_datos`, que se guarda 6 h en el aparato).
    const [aqui, setAqui] = useState<EnlaceAqui | null>(null);
    useEffect(() => {
        let vivo = true;
        const medir = async () => {
            try {
                const { puertaA1 } = await import("@/lib/datos/puerta-a1");
                const p = puertaA1();
                const configurada = await p.configurada();
                const s = configurada ? await p.salud() : null;
                if (vivo) setAqui({ configurada, ok: Boolean(s?.ok), ms: s?.ms ?? null, en: s?.en ?? 0 });
            } catch {
                if (vivo) setAqui({ configurada: false, ok: false, ms: null, en: 0 });
            }
        };
        void medir();
        const id = window.setInterval(() => {
            if (document.visibilityState !== "hidden") void medir();
        }, 60_000);
        return () => {
            vivo = false;
            window.clearInterval(id);
        };
    }, [modo]);

    const cambiarModo = (m: ModoPuerta) => {
        guardarConfigPuerta(almacen(), { modo: m });
        setModo(m);
        // El adaptador vivo de esta pestaña lo nota al momento (vuelve a probar la salud).
        void import("@/lib/datos/puerta-a1").then(({ puertaA1 }) => puertaA1().fijarModo(m)).catch(() => undefined);
    };

    const porGrupo = aparato?.porGrupo ?? {};
    const gruposAqui = GRUPOS_NAVEGADOR.map((g) => ({ ...g, c: porGrupo[g.id] ?? { puerta: 0, supabase: 0 } }));

    const ahora = Date.now();
    const v = datos ? vistaPuerta(datos, ahora) : null;
    const p = datos?.presencia;
    return (
        <div className="mt-2.5" data-testid="medidor-puerta-datos">
            <article aria-label="Puerta de datos del A1" className="flex min-w-0 flex-col gap-2.5 rounded-2xl border border-white/10 bg-black/25 p-3">
                <header className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="flex items-center gap-2 text-[13px] font-semibold text-white/85">
                        <DatabaseZap className="h-4 w-4 text-violet-200/80" aria-hidden />
                        Puerta de datos · A1 de Oracle
                    </h4>
                    {v ? <Pastilla texto={v.estado.texto} tono={v.estado.tono} /> : <Pastilla texto="Sin lectura" tono="neutro" />}
                </header>

                <div className="grid gap-2.5 sm:grid-cols-3">
                    <div>
                        <p className="text-[12px] text-white/60">Peticiones a Supabase ahorradas hoy</p>
                        <p className={`text-[20px] font-semibold tabular-nums ${v?.ahorradasHoy ? "text-emerald-200" : "text-white/70"}`} data-testid="puerta-ahorradas">
                            {v?.ahorradasHoy != null ? miles(v.ahorradasHoy) : "—"}
                        </p>
                        <p className="text-[11px] leading-snug text-white/45">{v?.detalleHoy ?? "medido en la propia puerta"}</p>
                    </div>
                    <div>
                        <p className="text-[12px] text-white/60">En esta neurona hoy</p>
                        <p className="text-[13px] tabular-nums text-white/80" data-testid="puerta-aparato">
                            {aparato ? `${miles(aparato.porPuerta)} por la puerta · ${miles(aparato.porSupabase)} por Supabase` : "—"}
                        </p>
                        <p className="text-[11px] leading-snug text-white/45" data-testid="puerta-grupos">
                            {gruposAqui.map((g) => `${g.texto} ${miles(g.c.puerta)}/${miles(g.c.puerta + g.c.supabase)}`).join(" · ")}
                        </p>
                        <p className="text-[11px] leading-snug text-white/45" data-testid="puerta-aqui">
                            {aparato?.enCola ? `${miles(aparato.enCola)} escrituras esperaron en la cola · ` : ""}
                            {modo === "apagada"
                                ? "apagada aquí: todo va a Supabase"
                                : !aqui
                                  ? "elección automática con respaldo"
                                  : !aqui.configurada
                                    ? "la puerta no está publicada para esta cuenta: va a Supabase"
                                    : aqui.ok
                                      ? `esta neurona usa la puerta${aqui.ms ? ` · ${aqui.ms} ms` : ""}`
                                      : "la puerta no responde: va a Supabase y se vuelve a probar sola"}
                        </p>
                    </div>
                    <div>
                        <p className="text-[12px] text-white/60">Réplica y presencia</p>
                        <p className={`text-[12px] leading-snug ${v ? TEXTO[v.replica.tono] : "text-white/60"}`}>{v?.replica.texto ?? "—"}</p>
                        <p className="text-[11px] leading-snug text-white/45">
                            {p ? `${miles(p.neuronas_vivas)} de ${miles(p.neuronas)} neuronas vivas · ${miles(p.en_linea)} cuentas en línea` : "sin presencia aún"}
                        </p>
                    </div>
                </div>

                {datos?.motivo && !datos.ok ? <p className="text-[11px] text-amber-200/85">{datos.motivo}</p> : null}

                <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] text-white/45">
                        {datos ? `comprobada ${hace(datos.comprobado, ahora)} por SSH y HTTPS` : (error ?? "")}
                        {v?.viejo ? <span className="text-amber-200/85"> · lectura vieja</span> : null}
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                        <label className="inline-flex items-center gap-1.5 text-[11px] text-white/60">
                            En esta neurona
                            <select
                                value={modo}
                                onChange={(e) => cambiarModo(e.target.value === "apagada" ? "apagada" : "auto")}
                                className="cursor-pointer rounded-md border border-white/15 bg-black/40 px-1.5 py-0.5 text-[11px] text-white/80"
                                aria-label="Usar la puerta de datos en esta neurona"
                            >
                                <option value="auto">Automática</option>
                                <option value="apagada">Apagada</option>
                            </select>
                        </label>
                        <button
                            type="button"
                            onClick={() => void comprobar()}
                            disabled={comprobando}
                            className="mc-alzar inline-flex cursor-pointer items-center gap-1 rounded-md border border-white/15 bg-white/5 px-2 py-1 text-[11px] text-white/75 transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <RefreshCw className={`h-3 w-3 ${comprobando ? "animate-spin" : ""}`} aria-hidden />
                            {comprobando ? "Comprobando…" : "Comprobar ahora"}
                        </button>
                    </div>
                </div>
                {mensaje ? (
                    <p role="status" className="text-[11px] text-violet-100/80">
                        {mensaje}
                    </p>
                ) : null}
            </article>
        </div>
    );
}
