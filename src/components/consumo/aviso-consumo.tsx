"use client";
/**
 * Aviso de consumo (2026-09-29): una banda discreta cuando la nube está en pausa.
 *
 * Cinco casos, de más a menos grave: el cortacircuitos (Supabase respondió 402 o «restricted»),
 * el freno remoto del proyecto (presupuesto diario superado), el presupuesto diario de este
 * dispositivo, el freno local de la pestaña y (CON1010) el modo ahorro fuerte, que avisa ANTES de la
 * pausa. Dice qué pasa, hasta cuándo, qué ruta gastó más, qué hace el OS al respecto y qué sigue
 * funcionando; se puede ocultar y vuelve solo si la situación cambia. Se monta perezoso.
 */
import { useEffect, useMemo, useState, useSyncExternalStore, type CSSProperties } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CirclePause, CloudOff, Gauge, Leaf, Timer, X, type LucideIcon } from "lucide-react";
import {
    avisoConsumoServidor,
    leerAvisoConsumo,
    PRESUPUESTO_DIA,
    suscribirConsumo,
    type AvisoGuardian,
} from "@/lib/consumo/guardian";
import { useFreno, type EstadoFreno } from "@/lib/consumo/freno";
import { resumenDeHoy, type RutaTop } from "@/lib/consumo/ritmo";
import estilos from "./aviso-consumo.module.css";

export interface DescripcionAviso {
    /** Identifica la situación: si cambia, un aviso oculto vuelve a mostrarse. */
    clave: string;
    titulo: string;
    detalle: string;
    color: string;
    Icono: LucideIcon;
}

function hora(ms: number): string {
    try {
        return new Date(ms).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    } catch {
        return new Date(ms).toISOString().slice(11, 16);
    }
}

/** Próxima medianoche UTC en la hora local de quien lee. */
function medianocheUtc(ahora: number): string {
    const d = new Date(ahora);
    return hora(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
}

const COLOR = { corte: "#DC143C", freno: "#FFBF00", dia: "#FFBF00", local: "#007FFF", ahorro: "#10B981" } as const;

/** Lo que el aviso sabe del día, además del estado del guardián (lo lee del registro compartido). */
export interface ContextoAviso {
    /** Peticiones de hoy en este aparato. */
    hoy?: number;
    /** La ruta que más gastó hoy, con nombre legible. */
    rutaTop?: RutaTop | null;
}

function cifra(n: number): string {
    return n.toLocaleString("es-ES");
}

function fraseRutaTop(r: RutaTop | null | undefined, verbo: "gastó" | "gasta"): string {
    return r ? `Lo que más ${verbo}: ${r.nombre} (${cifra(r.n)}). ` : "";
}

export function describirAviso(
    aviso: AvisoGuardian,
    freno: EstadoFreno,
    ahora: number,
    ctx: ContextoAviso = {},
): DescripcionAviso | null {
    if (aviso.corte) {
        const hasta = aviso.corteHasta;
        if (hasta && hasta > ahora) {
            return {
                clave: `corte:${hasta}`,
                titulo: "La nube de StarSeed está en pausa",
                detalle:
                    `Supabase pidió parar por exceso de tráfico. Ninguna pestaña le pide nada hasta las ${hora(hasta)}; ` +
                    "después se prueba con una sola petición. Lo que ya está en este dispositivo sigue a mano.",
                color: COLOR.corte,
                Icono: CloudOff,
            };
        }
        return {
            clave: `sonda:${hasta ?? 0}`,
            titulo: "Comprobando si la nube ha vuelto",
            detalle: "La pausa terminó: la próxima petición sirve de prueba. Si responde bien, todo vuelve solo.",
            color: COLOR.corte,
            Icono: CloudOff,
        };
    }
    if (freno.activo) {
        const cuando = freno.hasta && Number.isFinite(Date.parse(freno.hasta)) ? hora(Date.parse(freno.hasta)) : medianocheUtc(ahora);
        return {
            clave: `freno:${freno.hasta ?? ""}:${freno.motivo ?? ""}`,
            titulo: "Freno diario del proyecto",
            detalle:
                `${freno.motivo ? `${freno.motivo.replace(/[.\s]+$/, "")}. ` : "Se alcanzó el presupuesto de hoy. "}` +
                `Las lecturas de la nube vuelven a las ${cuando}; lo que escribas se sigue guardando.`,
            color: COLOR.freno,
            Icono: Gauge,
        };
    }
    if (aviso.diaAgotado) {
        return {
            clave: `dia:${Math.floor(ahora / 86_400_000)}`,
            titulo: "Este dispositivo usó su presupuesto de hoy",
            detalle:
                `Llegó a ${PRESUPUESTO_DIA.toLocaleString("es-ES")} peticiones. ${fraseRutaTop(ctx.rutaTop, "gastó")}` +
                `El OS ya espació los sondeos de fondo; las lecturas de la nube vuelven a las ${medianocheUtc(ahora)} ` +
                "y lo que escribas, tu sesión y tus preferencias se siguen guardando.",
            color: COLOR.dia,
            Icono: Timer,
        };
    }
    if (aviso.frenoLocalHasta && aviso.frenoLocalHasta > ahora) {
        return {
            clave: `local:${aviso.frenoLocalHasta}`,
            titulo: "Pausa breve en esta pestaña",
            detalle: `Pidió demasiados datos seguidos. Se reanuda sola a las ${hora(aviso.frenoLocalHasta)}.`,
            color: COLOR.local,
            Icono: CirclePause,
        };
    }
    if ((aviso.nivelRitmo ?? 0) >= 2) {
        const lleva = ctx.hoy && ctx.hoy > 0 ? `Este aparato va por ${cifra(ctx.hoy)} de ${cifra(PRESUPUESTO_DIA)} peticiones hoy. ` : "";
        return {
            clave: `ahorro:${Math.floor(ahora / 86_400_000)}`,
            titulo: "Modo ahorro de consumo",
            detalle:
                lleva +
                fraseRutaTop(ctx.rutaTop, "gasta") +
                "El OS espació 4 veces los sondeos de fondo para no llegar a la pausa; escribir, la sesión y tus " +
                "preferencias siguen igual.",
            color: COLOR.ahorro,
            Icono: Leaf,
        };
    }
    return null;
}

function useModoEco(): boolean {
    const [eco, setEco] = useState(false);
    useEffect(() => {
        const html = document.documentElement;
        const leer = () => setEco(html.getAttribute("data-perf") === "eco");
        leer();
        const obs = new MutationObserver(leer);
        obs.observe(html, { attributes: true, attributeFilter: ["data-perf"] });
        return () => obs.disconnect();
    }, []);
    return eco;
}

export function AvisoConsumo() {
    const aviso = useSyncExternalStore(suscribirConsumo, leerAvisoConsumo, avisoConsumoServidor);
    const freno = useFreno();
    const [ahora, setAhora] = useState(() => Date.now());
    const [oculto, setOculto] = useState<string | null>(null);
    const reducir = useReducedMotion();
    const eco = useModoEco();

    // Cada cambio de estado refresca la hora; y un único temporizador despierta en la próxima frontera.
    useEffect(() => {
        setAhora(Date.now());
    }, [aviso, freno]);
    useEffect(() => {
        const t = Date.now();
        const fronteras = [aviso.corteHasta, aviso.frenoLocalHasta, freno.hasta ? Date.parse(freno.hasta) : null]
            .filter((x): x is number => typeof x === "number" && Number.isFinite(x) && x > t)
            .sort((a, b) => a - b);
        if (!fronteras.length) return;
        const id = window.setTimeout(() => setAhora(Date.now()), Math.min(fronteras[0] - t + 250, 2 ** 31 - 1));
        return () => window.clearTimeout(id);
    }, [aviso, freno, ahora]);

    // Ruta que más gastó y peticiones de hoy: se leen del registro compartido al cambiar el estado.
    const desc = useMemo(() => describirAviso(aviso, freno, ahora, resumenDeHoy(ahora)), [aviso, freno, ahora]);
    const visible = desc !== null && desc.clave !== oculto;
    const sinMovimiento = reducir || eco;

    const estiloAcento = desc
        ? ({
              "--acento": desc.color,
              "--acento-suave": `${desc.color}1f`,
              "--acento-borde": `${desc.color}66`,
              "--acento-halo": `${desc.color}59`,
          } as CSSProperties)
        : undefined;

    return (
        <div className={estilos.raiz}>
            <AnimatePresence>
                {visible && desc ? (
                    <motion.div
                        key={desc.clave}
                        role="status"
                        aria-live="polite"
                        className={estilos.banda}
                        style={estiloAcento}
                        data-testid="aviso-consumo"
                        initial={sinMovimiento ? false : { opacity: 0, y: -14, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={sinMovimiento ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: -10, scale: 0.98 }}
                        transition={sinMovimiento ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 32 }}
                    >
                        <span className={estilos.icono} aria-hidden="true">
                            <desc.Icono size={18} strokeWidth={2} />
                        </span>
                        <div className={estilos.textos}>
                            <p className={estilos.rotulo}>Pausa de consumo</p>
                            <p className={estilos.titulo}>{desc.titulo}</p>
                            <p className={estilos.detalle}>{desc.detalle}</p>
                        </div>
                        <button
                            type="button"
                            className={`${estilos.cerrar} ss-redondo`}
                            onClick={() => setOculto(desc.clave)}
                            aria-label="Ocultar este aviso"
                            title="Ocultar este aviso"
                        >
                            <X size={16} strokeWidth={2} aria-hidden="true" />
                        </button>
                    </motion.div>
                ) : null}
            </AnimatePresence>
        </div>
    );
}

export default AvisoConsumo;
