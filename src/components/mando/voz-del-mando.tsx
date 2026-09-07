"use client";

/**
 * VOZ DEL MANDO — capa de UI (Ola 275 · Tarea V2 · 2026-09-07)
 * ─────────────────────────────────────────────────────────────────────────────
 * El Puente de Mando HABLA. Este módulo une la lógica pura de `voz-mando.ts`
 * con el motor único `hablarStarSeed`:
 *
 *  · `useVozDelMando(eventos, estado)` — hook que se monta UNA vez en el Mando.
 *    Carga las preferencias de `GET /api/mando/voces` (con caché en
 *    `localStorage` `starseed.mando.voz.v1` para arrancar rápido), convierte la
 *    tanda de eventos en anuncios con `anunciosDe`, los planifica con
 *    `planificar` y los habla en serie, uno tras otro, sin solaparse nunca. Los
 *    eventos anteriores a la carga se marcan como ya anunciados (no se hablan).
 *  · `<ControlVozDelMando />` — botón de altavoz para la cabecera (activo/silencio).
 *  · `<TarjetaVozDelMando />` — tarjeta con el selector de timbre, interruptores
 *    por tipo de anuncio, silencio, «Probar anuncio» y «Léeme el estado».
 *
 * Para no solapar dos síntesis, todo pasa por una cola de un elemento en curso:
 * `hablarStarSeed` no se invoca dos veces a la vez.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Play, Volume2, VolumeX } from "lucide-react";

import {
    anunciosDe,
    planificar,
    resumenParaLeer,
    validarPreferenciasVoz,
    PREFERENCIAS_VOZ_POR_DEFECTO,
    type AnuncioVoz,
    type PreferenciasVozMando,
    type VozDeAgente,
} from "@/lib/mando/voz-mando";
import { buscarTimbre, TIMBRES } from "@/lib/aurora/timbres";
import type { EventoRelevo } from "@/lib/mando/tipos";

/** Clave de caché local para arrancar rápido antes de la respuesta del endpoint. */
const CLAVE_CACHE = "starseed.mando.voz.v1";

/** Lo que «Léeme el estado» resume (el mismo contrato que `resumenParaLeer`). */
export interface EstadoVozMando {
    olaActiva?: string;
    cuentas?: { integradas: number; enCurso: number; fallidas: number; pendientes: number };
    proveedoresCaidos?: string[];
    sinPublicar?: number;
}

/** Control que expone el hook a la interfaz. */
export interface ControlVozMando {
    prefs: PreferenciasVozMando;
    vocesPorAgente: VozDeAgente[];
    cargando: boolean;
    hablando: boolean;
    /** Guarda preferencias (POST + caché local). */
    fijarPrefs: (p: PreferenciasVozMando) => void;
    /** Activa/desactiva la voz (un solo toque desde la cabecera). */
    alternar: () => void;
    /** Habla el resumen del estado con el timbre elegido. */
    leerEstado: () => void;
    /** Habla una frase de ejemplo de prioridad 1. */
    probar: () => void;
    /** Guarda la asignación de voces por agente (POST). */
    fijarVocesPorAgente: (v: VozDeAgente[]) => void;
}

const Vacio: ControlVozMando = {
    prefs: PREFERENCIAS_VOZ_POR_DEFECTO,
    vocesPorAgente: [],
    cargando: true,
    hablando: false,
    fijarPrefs: () => {},
    alternar: () => {},
    leerEstado: () => {},
    probar: () => {},
    fijarVocesPorAgente: () => {},
};

const ContextoVozMando = createContext<ControlVozMando>(Vacio);

/** Lee el control del contexto (para `ControlVozDelMando` y `TarjetaVozDelMando`). */
export function usarControl(): ControlVozMando {
    return useContext(ContextoVozMando);
}

/** Habla una frase de ejemplo de prioridad 1 (para «Probar anuncio»). */
const FRASE_PRUEBA = "Atención: tarea esperando tu visto bueno. Toque de prueba de la voz del Mando.";

/** Nombre legible del timbre para la prueba de voz por agente. */
function nombreTimbre(timbreId: string | null | undefined): string {
    const t = timbreId ? buscarTimbre(timbreId) : null;
    return t?.nombre ?? "voz activa";
}

/** Habla UNA locución con el timbre pedido; nunca lanza. */
async function hablarUna(texto: string, timbreId: string | null | undefined, emocion?: string): Promise<void> {
    try {
        const { hablarStarSeed } = await import("@/lib/aurora/voz-starseed/motor");
        const timbre = (timbreId ? buscarTimbre(timbreId) : null) ?? TIMBRES[0];
        await hablarStarSeed(texto, {
            timbre,
            contexto: "aviso",
            ...(emocion ? { emocion } : {}),
        });
    } catch {
        // La voz es un extra: un fallo de síntesis nunca rompe el Mando.
    }
}

/** Proveedor de contexto: expone el control del hook a los hijos. */
export function VozMandoProvider({ control, children }: { control: ControlVozMando; children: ReactNode }) {
    return <ContextoVozMando.Provider value={control}>{children}</ContextoVozMando.Provider>;
}

/** Caché local de preferencias (tolerante): null si no hay o está roto. */
function leerCache(): PreferenciasVozMando | null {
    if (typeof window === "undefined") return null;
    try {
        const crudo = window.localStorage.getItem(CLAVE_CACHE);
        if (!crudo) return null;
        return validarPreferenciasVoz(JSON.parse(crudo) as unknown);
    } catch {
        return null;
    }
}

/** Escribe la caché local de preferencias (tolerante). */
function escribirCache(p: PreferenciasVozMando): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(CLAVE_CACHE, JSON.stringify(p));
    } catch {
        // Sin almacenamiento: la voz sigue funcionando sin caché.
    }
}

/**
 * Forma de la respuesta de `GET /api/mando/voces`.
 */
interface RespuestaVoces {
    prefs: PreferenciasVozMando;
    vocesPorAgente: VozDeAgente[];
    demonio: unknown;
}

/**
 * Hook de la Voz del Mando: se monta UNA vez en `CentroMando`. Convierte los
 * eventos de la orquestación en anuncios hablados (en serie) y expone el control
 * a la cabecera y al panel.
 *
 *  · La primera carga marca todos los eventos recibidos como «ya anunciados»:
 *    solo los que LLEGUEN después (`id` nuevo) se hablan, para no recitar toda
 *    la bitácora al entrar.
 *  · Si la pestaña está oculta, se habla igual (los anuncios son la alarma de
 *    fondo de la orquestación).
 */
export function useVozDelMando(eventos: EventoRelevo[], estado: EstadoVozMando | null): ControlVozMando {
    const [prefs, setPrefs] = useState<PreferenciasVozMando>(() => leerCache() ?? PREFERENCIAS_VOZ_POR_DEFECTO);
    const [vocesPorAgente, setVocesPorAgente] = useState<VozDeAgente[]>([]);
    const [cargando, setCargando] = useState(true);
    const [hablando, setHablando] = useState(false);

    const yaAnunciados = useRef<Set<string>>(new Set());
    const lineaBase = useRef<boolean>(false);
    const enCurso = useRef<boolean>(false);
    const cola = useRef<AnuncioVoz[]>([]);
    const ultimoMs = useRef<number>(0);

    // Referencia viva al estado para que «Léeme el estado» lea lo último sin depender del efecto.
    const estadoRef = useRef<EstadoVozMando | null>(estado);
    estadoRef.current = estado;

    // Carga inicial desde el endpoint. La caché ya pinta el botón; aquí llega lo persistido.
    useEffect(() => {
        let vivo = true;
        void fetch("/api/mando/voces", { cache: "no-store" })
            .then((r) => (r.ok ? (r.json() as Promise<RespuestaVoces>) : null))
            .then((datos) => {
                if (!vivo || !datos) return;
                setPrefs(datos.prefs);
                escribirCache(datos.prefs);
                setVocesPorAgente(datos.vocesPorAgente);
            })
            .catch(() => {
                // Sin endpoint (producción): la voz queda apagada con los defectos.
            })
            .finally(() => {
                if (vivo) setCargando(false);
            });
        return () => {
            vivo = false;
        };
    }, []);

    /** Habla una locución y, al acabar, sigue con la cola. Encadena en serie. */
    const drenar = useCallback(async () => {
        if (enCurso.current) return;
        enCurso.current = true;
        setHablando(true);
        try {
            while (cola.current.length > 0) {
                const a = cola.current.shift();
                if (!a) continue;
                await hablarUna(a.texto, a.timbreId, a.emocion);
                ultimoMs.current = Date.now();
            }
        } finally {
            enCurso.current = false;
            setHablando(false);
        }
    }, []);

    /** Encola anuncios (los ya anunciados no se repiten aquí: llegan filtrados). */
    const encolar = useCallback(
        (anuncios: AnuncioVoz[]) => {
            for (const a of anuncios) {
                yaAnunciados.current.add(a.clave);
                cola.current.push(a);
            }
            void drenar();
        },
        [drenar],
    );

    // Convierte eventos → anuncios → planificados → cola, en cada cambio.
    useEffect(() => {
        // La primera tanda define la línea base: se marca y no se habla.
        if (!lineaBase.current) {
            for (const e of eventos) yaAnunciados.current.add(e.id);
            lineaBase.current = true;
            return;
        }
        if (!prefs.activa) return;
        const mapa: Record<string, string> = {};
        for (const v of vocesPorAgente) mapa[v.id] = v.timbreId;
        const anuncios = anunciosDe(eventos, prefs, yaAnunciados.current, mapa);
        if (anuncios.length === 0) return;
        const hablables = planificar(anuncios, Date.now(), ultimoMs.current, prefs.silencioS);
        if (hablables.length === 0) return;
        encolar(hablables);
    }, [eventos, prefs, vocesPorAgente, encolar]);

    /** Guarda las preferencias (POST cuando se puede; caché local siempre). */
    const fijarPrefs = useCallback((p: PreferenciasVozMando) => {
        const sana = validarPreferenciasVoz(p);
        setPrefs(sana);
        escribirCache(sana);
        void fetch("/api/mando/voces", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prefs: sana }),
        }).catch(() => {
            // Sin endpoint: la preferencia queda en caché local.
        });
    }, []);

    /** Guarda la asignación de voces por agente (POST). */
    const fijarVocesPorAgente = useCallback((v: VozDeAgente[]) => {
        setVocesPorAgente(v);
        void fetch("/api/mando/voces", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ vocesPorAgente: v }),
        }).catch(() => {
            // Sin endpoint: se mantiene solo en memoria.
        });
    }, []);

    const alternar = useCallback(() => {
        fijarPrefs({ ...prefs, activa: !prefs.activa });
    }, [fijarPrefs, prefs]);

    const probar = useCallback(() => {
        setPrefs((p) => {
            void hablarUna(FRASE_PRUEBA, p.timbreId, "seria");
            return p;
        });
    }, []);

    const leerEstado = useCallback(() => {
        const texto = resumenParaLeer({
            olaActiva: estadoRef.current?.olaActiva,
            cuentas: estadoRef.current?.cuentas,
            proveedoresCaidos: estadoRef.current?.proveedoresCaidos,
            sinPublicar: estadoRef.current?.sinPublicar,
        });
        const timbreId = prefs.timbreId;
        void hablarUna(texto, timbreId, "serena");
    }, [prefs.timbreId]);

    return useMemo<ControlVozMando>(
        () => ({
            prefs,
            vocesPorAgente,
            cargando,
            hablando,
            fijarPrefs,
            alternar,
            leerEstado,
            probar,
            fijarVocesPorAgente,
        }),
        [prefs, vocesPorAgente, cargando, hablando, fijarPrefs, alternar, leerEstado, probar, fijarVocesPorAgente],
    );
}

// ── Componentes de interfaz ───────────────────────────────────────────────────

/**
 * Botón pequeño de altavoz para la cabecera del Mando: activa/silencia la voz
 * con un toque. Lee su estado del contexto (`useVozDelMando` debe montarse en
 * `CentroMando` y envolver el árbol con `VozMandoProvider`).
 */
export function ControlVozDelMando() {
    const { prefs, alternar } = usarControl();
    const activa = prefs.activa;
    return (
        <button
            type="button"
            onClick={alternar}
            aria-pressed={activa}
            title={activa ? "Silenciar la voz del Mando" : "Activar la voz del Mando"}
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] shadow-lg backdrop-blur transition-colors ${
                activa
                    ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20"
                    : "border-white/15 bg-white/5 text-white/60 hover:bg-white/10"
            }`}
        >
            {activa ? <Volume2 className="h-3.5 w-3.5" aria-hidden /> : <VolumeX className="h-3.5 w-3.5" aria-hidden />}
            Voz
        </button>
    );
}

/** Etiqueta legible del género para pintar junto a cada timbre. */
const GENERO_TEXTO: Record<string, string> = {
    femenina: "femenina",
    masculina: "masculina",
    neutra: "neutra",
};

/** Lista de interruptores por tipo de anuncio (clave de `prefs.anunciar`). */
const ANUNCIOS: Array<{ clave: keyof PreferenciasVozMando["anunciar"]; etiqueta: string }> = [
    { clave: "vistoBueno", etiqueta: "Visto bueno pendiente" },
    { clave: "fallidas", etiqueta: "Tareas fallidas" },
    { clave: "proveedores", etiqueta: "Proveedores que caen o vuelven" },
    { clave: "publicaciones", etiqueta: "Publicaciones en producción" },
    { clave: "integradas", etiqueta: "Tareas integradas" },
    { clave: "olaTerminada", etiqueta: "Ola terminada" },
];

/**
 * Tarjeta «Voz del Mando»: selector de timbre, interruptor maestro, los
 * interruptores por tipo de anuncio, silencio mínimo, «Probar anuncio» y
 * «Léeme el estado». Todo lee y escribe a través del control del contexto.
 */
export function TarjetaVozDelMando() {
    const { prefs, fijarPrefs, probar, leerEstado, hablando } = usarControl();

    const cambiarAnuncio = (clave: keyof PreferenciasVozMando["anunciar"], valor: boolean) => {
        fijarPrefs({ ...prefs, anunciar: { ...prefs.anunciar, [clave]: valor } });
    };

    return (
        <div className="space-y-3 text-xs">
            <label className="flex cursor-pointer items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                <span className="text-white/80">Voz del Mando activa</span>
                <input
                    type="checkbox"
                    checked={prefs.activa}
                    onChange={(e) => fijarPrefs({ ...prefs, activa: e.target.checked })}
                    className="h-4 w-4 cursor-pointer accent-emerald-400"
                />
            </label>

            <label className="block">
                <span className="mb-1 block text-white/50">Timbre de los avisos</span>
                <select
                    value={prefs.timbreId ?? ""}
                    onChange={(e) => fijarPrefs({ ...prefs, timbreId: e.target.value || null })}
                    className="w-full cursor-pointer rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-white/90"
                >
                    <option value="">Voz activa del OS</option>
                    {TIMBRES.map((t) => (
                        <option key={t.id} value={t.id}>
                            {t.nombre} · {GENERO_TEXTO[t.genero] ?? t.genero}
                        </option>
                    ))}
                </select>
            </label>

            <div className="space-y-1">
                {ANUNCIOS.map(({ clave, etiqueta }) => (
                    <label
                        key={clave}
                        className="flex cursor-pointer items-center justify-between gap-2 rounded-md px-1 py-0.5 hover:bg-white/5"
                    >
                        <span className="text-white/70">{etiqueta}</span>
                        <input
                            type="checkbox"
                            checked={prefs.anunciar[clave]}
                            onChange={(e) => cambiarAnuncio(clave, e.target.checked)}
                            className="h-4 w-4 cursor-pointer accent-emerald-400"
                        />
                    </label>
                ))}
            </div>

            <label className="block">
                <span className="mb-1 block text-white/50">Silencio mínimo entre avisos ({prefs.silencioS} s)</span>
                <input
                    type="range"
                    min={5}
                    max={120}
                    step={5}
                    value={prefs.silencioS}
                    onChange={(e) => fijarPrefs({ ...prefs, silencioS: Number(e.target.value) })}
                    className="w-full cursor-pointer"
                />
            </label>

            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    onClick={probar}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-white/80 hover:bg-white/10"
                >
                    <Play className="h-3.5 w-3.5" aria-hidden />
                    Probar anuncio
                </button>
                <button
                    type="button"
                    onClick={leerEstado}
                    disabled={hablando}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-white/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <Volume2 className="h-3.5 w-3.5" aria-hidden />
                    Léeme el estado
                </button>
            </div>
        </div>
    );
}