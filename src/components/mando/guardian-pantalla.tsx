"use client";

/**
 * Guardián de «pantalla siempre encendida» (Ola 1005P · PA1005D)
 * ─────────────────────────────────────────────────────────────────────────
 * Una vez montado en Genesis: sondea `GET /api/mando/pantalla` (cada 60 s y
 * al recuperar el foco; si falla conserva el último valor, y por defecto
 * está activa) y, si el ajuste está encendido, pide la Screen Wake Lock del
 * navegador. El navegador la suelta al ocultar la pestaña: se vuelve a pedir
 * en `visibilitychange` y `focus`, y se suelta si el ajuste pasa a inactivo.
 *
 * Límite honesto, que la tarjeta de Ajustes enseña: con la pestaña en
 * segundo plano, el navegador de móvil o tablet NO permite mantener la
 * pantalla; en la Mac sí, por el servicio `com.starseed.pantalla`.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { Copy, MonitorCheck, MonitorOff, MoonStar, Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { instalarKeepalive, detectOS, type OsId } from "@/lib/install/device-install";

export interface EstadoPantallaMando {
    activa: boolean;
    desde: number | null;
    mac: { servicio_vivo: boolean; pid: number | null };
}

export type EstadoBloqueo = "activo" | "suelto" | "sin-soporte" | "oculta";

/** Encendido por defecto: antes de la primera lectura, vale activa. */
export const PANTALLA_DEFECTO: EstadoPantallaMando = {
    activa: true,
    desde: null,
    mac: { servicio_vivo: false, pid: null },
};

interface WakeLockSentinela {
    release(): Promise<void>;
    addEventListener(tipo: string, oyente: () => void): void;
}

/* ─── Segundo plano con la pantalla apagada (KAL1101C) ─────────────────────── */

/** La tapa declarada por el latido del nodo (KAL1101B · `despierto_logica.tapa_de`). */
export type TapaLatido = "desactivada" | "sin-tapa" | "clamshell" | "duerme";

const TAPAS_LATIDO: readonly TapaLatido[] = ["desactivada", "sin-tapa", "clamshell", "duerme"];

/** `salud.despierto` del latido (KAL1101B): lo que la neurona sabe de sí misma. */
export interface DespiertoLatido {
    despierta: boolean;
    herramienta: string | null;
    bateria: number | null;
    enchufada: boolean;
    tapa: TapaLatido;
    va_a_dormir: boolean;
    se_va_a_dormir: boolean;
    umbral_bateria: number;
}

/** Clave del ajuste por neurona en el localStorage del aparato. */
export const CLAVE_SEGUNDO_PLANO = "starseed.segundo-plano.v1";

/** PURA: el wakeLock del navegador si existe, tipado, o null. */
function wakeLockDelNavegador(): { request(t: "screen"): Promise<WakeLockSentinela> } | null {
    if (typeof navigator === "undefined") return null;
    const wl = (navigator as Navigator & { wakeLock?: unknown }).wakeLock;
    return wl as { request(t: "screen"): Promise<WakeLockSentinela> } | undefined ?? null;
}

/** PURA: texto del estado de ESTE dispositivo para la tarjeta de Ajustes. */
export function estadoPantalla(bloqueo: EstadoBloqueo): string {
    switch (bloqueo) {
        case "activo":
            return "Este dispositivo mantiene la pantalla encendida.";
        case "oculta":
            return "Pestaña en segundo plano: el navegador suelta el bloqueo hasta volver.";
        case "sin-soporte":
            return "Este navegador no permite mantener la pantalla (sin Wake Lock).";
        default:
            return "Bloqueo de pantalla suelto en este dispositivo.";
    }
}

/** PURA: texto del servicio de la Mac (caffeinate) para la tarjeta. */
export function estadoMac(mac: EstadoPantallaMando["mac"]): string {
    return mac.servicio_vivo && mac.pid
        ? `Mac: servicio activo (PID ${mac.pid})`
        : "Mac: servicio apagado";
}

/** Pide y mantiene la Screen Wake Lock mientras el ajuste esté activo. */
export function useMantenerPantalla(activa: boolean): EstadoBloqueo {
    const [estado, setEstado] = useState<EstadoBloqueo>("suelto");
    const senal = useRef<WakeLockSentinela | null>(null);

    useEffect(() => {
        const wl = wakeLockDelNavegador();
        if (!wl) {
            setEstado("sin-soporte");
            return;
        }
        let vivo = true;
        const soltar = () => {
            const s = senal.current;
            senal.current = null;
            if (s) void s.release().catch(() => undefined);
            if (vivo) setEstado("suelto");
        };
        if (!activa) {
            soltar();
            return;
        }
        const pedir = () => {
            if (document.visibilityState !== "visible") {
                if (vivo) setEstado("oculta");
                return;
            }
            wl.request("screen").then(
                (s) => {
                    if (!vivo) {
                        void s.release().catch(() => undefined);
                        return;
                    }
                    senal.current = s;
                    setEstado("activo");
                    s.addEventListener("release", () => {
                        if (senal.current === s) senal.current = null;
                        if (vivo) setEstado("suelto");
                    });
                },
                () => {
                    if (vivo) setEstado("suelto");
                },
            );
        };
        pedir();
        const alCambiarVisibilidad = () => {
            if (document.visibilityState === "visible") pedir();
            else if (vivo) setEstado("oculta");
        };
        document.addEventListener("visibilitychange", alCambiarVisibilidad);
        window.addEventListener("focus", pedir);
        return () => {
            vivo = false;
            document.removeEventListener("visibilitychange", alCambiarVisibilidad);
            window.removeEventListener("focus", pedir);
            const s = senal.current;
            senal.current = null;
            if (s) void s.release().catch(() => undefined);
        };
    }, [activa]);

    return estado;
}

/** PURA: sanea `salud.despierto` del latido; acepta la raíz o el propio objeto. */
export function parsearDespierto(bruto: unknown): DespiertoLatido | null {
    if (!bruto || typeof bruto !== "object") return null;
    let d = bruto as Record<string, unknown>;
    const salud = d.salud;
    const anidado = salud && typeof salud === "object" ? (salud as Record<string, unknown>).despierto : null;
    if (anidado && typeof anidado === "object") {
        d = anidado as Record<string, unknown>;
    } else if (salud) {
        return null;
    }
    if (typeof d.despierta !== "boolean") return null;
    const tapa = typeof d.tapa === "string" && (TAPAS_LATIDO as readonly string[]).includes(d.tapa)
        ? (d.tapa as TapaLatido)
        : null;
    if (tapa === null) return null;
    return {
        despierta: d.despierta,
        herramienta: typeof d.herramienta === "string" && d.herramienta.length > 0
            ? d.herramienta.slice(0, 40)
            : null,
        bateria: typeof d.bateria === "number" && Number.isFinite(d.bateria) ? d.bateria : null,
        enchufada: d.enchufada === true,
        tapa,
        va_a_dormir: tapa === "duerme",
        se_va_a_dormir: d.se_va_a_dormir === true,
        umbral_bateria: typeof d.umbral_bateria === "number" && Number.isFinite(d.umbral_bateria)
            ? d.umbral_bateria
            : 25,
    };
}

/** PURA: texto HONESTO de esta neurona según su latido (nada si no hay dato). */
export function textoSegundoPlano(latido: DespiertoLatido | null): string {
    if (!latido) return "El latido de esta neurona todavía no informa si aguanta la tapa cerrada.";
    let base: string;
    switch (latido.tapa) {
        case "desactivada":
            base = "El dueño desactivó el reposo del sistema: aguanta la tapa cerrada.";
            break;
        case "sin-tapa":
            base = "Equipo sin tapa (escritorio o servidor): nada que cerrar lo duerma.";
            break;
        case "clamshell":
            base = "Clamshell (corriente y pantalla externa): sigue despierto con la tapa cerrada.";
            break;
        default:
            base =
                "En un portátil, cerrar la tapa duerme el equipo salvo con corriente y pantalla externa; si duerme, sus tareas siguen en el A1 (colmena).";
            if (latido.bateria !== null) {
                base += ` Batería al ${latido.bateria}% (umbral ${latido.umbral_bateria}%).`;
            }
            if (latido.se_va_a_dormir) {
                base += " Ya se anuncia «se va a dormir» y entregará sus tareas al A1 antes de apagarse.";
            }
            break;
    }
    return latido.despierta && latido.herramienta ? `${base} Lo sostiene hoy: ${latido.herramienta}.` : base;
}

/** PURA: el interruptor por neurona vale encendido solo con «true» explícito. */
export function leerSegundoPlano(bruto: string | null): boolean {
    return bruto === "true";
}

/** Sanea el cuerpo del GET/POST; cualquier cosa rara devuelve null. */
export function parsearEstadoPantalla(bruto: unknown): EstadoPantallaMando | null {
    if (!bruto || typeof bruto !== "object") return null;
    const obj = bruto as Record<string, unknown>;
    if (typeof obj.activa !== "boolean") return null;
    const macBruto = (obj.mac ?? {}) as Record<string, unknown>;
    const pidBruto = macBruto.pid;
    return {
        activa: obj.activa,
        desde: typeof obj.desde === "number" && Number.isFinite(obj.desde) ? obj.desde : null,
        mac: {
            servicio_vivo: Boolean(macBruto.servicio_vivo),
            pid: typeof pidBruto === "number" && Number.isFinite(pidBruto) ? pidBruto : null,
        },
    };
}

/** Lee el ajuste del servicio local; null = lectura fallida. */
export async function leerEstadoPantalla(): Promise<EstadoPantallaMando | null> {
    try {
        const r = await fetch("/api/mando/pantalla", { cache: "no-store" });
        if (!r.ok) return null;
        return parsearEstadoPantalla(await r.json());
    } catch {
        return null;
    }
}

/**
 * Interruptor «Seguir trabajando con la pantalla apagada» POR NEURONA
 * (KAL1101C). Se guarda en el localStorage del APARATO (no en la cuenta: es
 * decisión de este dispositivo) y NO toca la energía del sistema ni instala
 * nada: enseña el estado honesto del latido (`salud.despierto`, KAL1101B)
 * que le entre por `latido`, y el comando de keepalive para ESTE SO
 * (`device-install.instalarKeepalive`). Quien la monte pasa el latido crudo
 * de esta neurona; sin latido se dice la verdad: aún sin dato.
 */
export function InterruptorSegundoPlano({
    latido = null,
}: {
    /** Latido crudo de esta neurona (raíz del latido o `salud.despierto`). */
    latido?: unknown;
}) {
    const [activo, setActivo] = useState(false);
    const [so, setSo] = useState<OsId>("unknown");
    const [copiado, setCopiado] = useState<string | null>(null);

    useEffect(() => {
        setSo(detectOS().os);
        try {
            setActivo(leerSegundoPlano(window.localStorage.getItem(CLAVE_SEGUNDO_PLANO)));
        } catch {
            /* sin localStorage vale apagado */
        }
    }, []);

    const alCambiar = useCallback((v: boolean) => {
        setActivo(v);
        try {
            window.localStorage.setItem(CLAVE_SEGUNDO_PLANO, String(v));
        } catch {
            /* */
        }
    }, []);

    const copiar = useCallback(async (comando: string) => {
        try {
            await navigator.clipboard.writeText(comando);
            setCopiado(comando);
            window.setTimeout(() => setCopiado(null), 1500);
        } catch {
            /* el navegador no lo permite: queda el comando a la vista */
        }
    }, []);

    const opciones = useMemo(() => instalarKeepalive(so), [so]);
    const despierto = useMemo(() => parsearDespierto(latido), [latido]);

    return (
        <article className="rounded-xl border border-white/10 bg-black/30 p-4">
            <header className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                        <MoonStar
                            className={activo ? "h-4 w-4 text-emerald-300" : "h-4 w-4 text-white/50"}
                            aria-hidden
                        />
                        Seguir trabajando con la pantalla apagada
                    </h3>
                    <p className="mt-0.5 text-xs text-white/50">
                        Ajuste de ESTA neurona: se guarda en este aparato, no en tu cuenta.
                    </p>
                </div>
                <Switch
                    id="switch-segundo-plano"
                    checked={activo}
                    onCheckedChange={alCambiar}
                    className="cursor-pointer"
                    aria-label="Seguir trabajando con la pantalla apagada"
                />
            </header>
            <div className="mt-3 space-y-2 text-xs text-white/60">
                <p>{textoSegundoPlano(despierto)}</p>
                <p className="text-[11px] text-amber-200/80">
                    Aviso honesto: en un portátil, cerrar la tapa duerme el equipo salvo con
                    corriente y pantalla externa; si duerme, sus tareas siguen en el A1
                    (colmena).
                </p>
                {opciones.map((o) => (
                    <div key={o.label} className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5">
                        <p className="font-medium text-white/80">{o.label}</p>
                        {o.comando ? (
                            <div className="mt-1 flex items-center gap-2">
                                <code className="min-w-0 flex-1 truncate font-mono text-[10px] text-white/70">
                                    {o.comando}
                                </code>
                                <button
                                    type="button"
                                    onClick={() => void copiar(o.comando)}
                                    className="cursor-pointer shrink-0 rounded p-1 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                                    aria-label={`Copiar el comando de ${o.label}`}
                                >
                                    <Copy className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        ) : (
                            <a
                                href={o.href ?? ""}
                                target="_blank"
                                rel="noreferrer"
                                className="cursor-pointer text-white/70 underline"
                            >
                                Paquetes .deb/.rpm/.apk en Releases
                            </a>
                        )}
                        {copiado !== null && copiado === o.comando && (
                            <p role="status" className="text-[10px] text-emerald-300">Comando copiado.</p>
                        )}
                        <p className="mt-1 text-[10px] text-white/40">{o.nota}</p>
                    </div>
                ))}
            </div>
        </article>
    );
}

/** Cambia el ajuste y devuelve el estado resultante; null = fallo. */
export async function guardarEstadoPantalla(activa: boolean): Promise<EstadoPantallaMando | null> {
    try {
        const r = await fetch("/api/mando/pantalla", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ activa }),
        });
        if (!r.ok) return null;
        return parsearEstadoPantalla(await r.json());
    } catch {
        return null;
    }
}
