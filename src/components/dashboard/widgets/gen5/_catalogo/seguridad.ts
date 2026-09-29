"use client";
/**
 * Señales REALES de seguridad y privacidad de ESTE dispositivo (Ola 0929-C), sin red:
 * el bloqueo de la neurona (PIN, contraseña o huella/rostro, `lib/bloqueo`), si la conexión va
 * cifrada, si el navegador guarda los datos locales de forma persistente, si hay huella o rostro
 * disponible, el tráfico que ha salido hoy hacia la nube (guardián de consumo) y un escaneo
 * LOCAL de secretos a la vista en las claves del almacén (mismas reglas que /seguridad: las
 * bóvedas de credenciales no se leen nunca).
 *
 * `comprobaciones()` es PURA: convierte las señales en una lista con estado, explicación y la
 * acción que lo arregla (ruta del OS o acción directa).
 */
import * as React from "react";
import { deviceId } from "@/lib/sync/entity-state";
import { CLAVE_BLOQUEO, EVENTO_CONFIG_BLOQUEO, leerConfigBloqueo, type MetodoBloqueo } from "@/lib/bloqueo/politica-bloqueo";
import { biometriaDisponible } from "@/lib/bloqueo/passkey-registro";
import { leerContadores, suscribirConsumo } from "@/lib/consumo/guardian";
import { scanText } from "@/lib/security/scanner";
import { colorSalud } from "@/components/widgets-libres/familias/comun";

export interface SenalesSeguridad {
    metodo: MetodoBloqueo;
    minutosInactividad: number;
    alAbrir: boolean;
    passkey: boolean;
    /** Contexto seguro (HTTPS o localhost). */
    cifrada: boolean;
    /** null = aún no se sabe o el navegador no lo dice. */
    biometria: boolean | null;
    persistente: boolean | null;
}

export interface ConsumoHoy {
    hoy: number;
    presupuesto: number;
    pausa: boolean;
    bloqueadas: number;
}

export interface EscaneoLocal {
    claves: number;
    hallazgos: number;
    graves: number;
    boveda: number;
    en: number;
}

export type EstadoCheck = "bien" | "atencion" | "mal" | "info";

export interface Comprobacion {
    id: string;
    titulo: string;
    detalle: string;
    estado: EstadoCheck;
    accion?: { texto: string; href?: string; hacer?: "persistir" | "escanear" };
}

export const RUTA_SEGURIDAD_CUENTA = "/cuenta?section=seguridad";

/** Color de cada estado: los de salud Trinity y un pizarra neutro para lo informativo. */
export function colorCheck(e: EstadoCheck): string {
    return e === "info" ? "#94a3b8" : colorSalud(e);
}
export const RUTA_SEGURIDAD = "/seguridad";

const NOMBRE_METODO: Record<MetodoBloqueo, string> = { ninguno: "Sin bloqueo", pin: "PIN", contrasena: "Contraseña", biometria: "Huella o rostro" };

export function nombreMetodo(m: MetodoBloqueo): string {
    return NOMBRE_METODO[m];
}

/** Lista de comprobaciones del escudo (PURA). */
export function comprobaciones(s: SenalesSeguridad, c: ConsumoHoy | null, e: EscaneoLocal | null): Comprobacion[] {
    const out: Comprobacion[] = [];
    if (s.metodo === "ninguno") {
        out.push({ id: "bloqueo", titulo: "Sin bloqueo en este dispositivo", detalle: "Cualquiera que lo coja entra en tu OS. Pon un PIN, una contraseña o tu huella.", estado: "mal", accion: { texto: "Poner bloqueo", href: RUTA_SEGURIDAD_CUENTA } });
    } else {
        out.push({ id: "bloqueo", titulo: `Bloqueo con ${s.metodo === "pin" ? "PIN" : NOMBRE_METODO[s.metodo].toLowerCase()}`, detalle: s.alAbrir ? "Se pide al abrir el OS." : "Activo en esta neurona.", estado: "bien" });
        out.push(s.minutosInactividad > 0
            ? { id: "inactividad", titulo: `Se bloquea tras ${s.minutosInactividad} min`, detalle: "Si te alejas, se cierra solo.", estado: "bien" }
            : { id: "inactividad", titulo: "No se bloquea por inactividad", detalle: "Si te alejas, queda abierto hasta que lo cierres.", estado: "atencion", accion: { texto: "Ajustar", href: RUTA_SEGURIDAD_CUENTA } });
    }
    if (s.biometria === true && s.metodo !== "biometria") {
        out.push({ id: "biometria", titulo: "Tu dispositivo admite huella o rostro", detalle: "Desbloquear con biometría es más seguro que un PIN corto (la biometría nunca sale del dispositivo).", estado: "info", accion: { texto: "Usarla", href: RUTA_SEGURIDAD_CUENTA } });
    }
    out.push(s.cifrada
        ? { id: "cifrado", titulo: "Conexión cifrada", detalle: "Lo que viaja entre este dispositivo y la red va protegido.", estado: "bien" }
        : { id: "cifrado", titulo: "Conexión sin cifrar", detalle: "Esta página no llega por HTTPS: no escribas contraseñas aquí.", estado: "mal" });
    if (s.persistente === true) out.push({ id: "persistente", titulo: "Datos locales persistentes", detalle: "El navegador no borrará tus notas, tareas y claves locales para hacer sitio.", estado: "bien" });
    else if (s.persistente === false) out.push({ id: "persistente", titulo: "Datos locales borrables", detalle: "Si falta espacio, el navegador podría borrar lo que guardas aquí.", estado: "atencion", accion: { texto: "Protegerlos", hacer: "persistir" } });
    if (!e) out.push({ id: "secretos", titulo: "Secretos a la vista", detalle: "Busca claves o contraseñas guardadas en claro en este dispositivo. Nada sale de aquí.", estado: "info", accion: { texto: "Escanear", hacer: "escanear" } });
    else if (e.hallazgos === 0) out.push({ id: "secretos", titulo: "Sin secretos a la vista", detalle: `${e.claves} clave${e.claves === 1 ? "" : "s"} local${e.claves === 1 ? "" : "es"} revisada${e.claves === 1 ? "" : "s"}${e.boveda ? `; ${e.boveda} bóveda${e.boveda === 1 ? "" : "s"} de credenciales intacta${e.boveda === 1 ? "" : "s"}` : ""}.`, estado: "bien", accion: { texto: "Repetir", hacer: "escanear" } });
    else out.push({ id: "secretos", titulo: `${e.hallazgos} posible${e.hallazgos === 1 ? "" : "s"} secreto${e.hallazgos === 1 ? "" : "s"} a la vista`, detalle: e.graves ? `${e.graves} grave${e.graves === 1 ? "" : "s"}. Revísalos y redáctalos en Seguridad.` : "Revísalos en Seguridad.", estado: e.graves ? "mal" : "atencion", accion: { texto: "Revisar", href: RUTA_SEGURIDAD } });
    if (c) {
        const uso = c.presupuesto > 0 ? c.hoy / c.presupuesto : 0;
        out.push(c.pausa
            ? { id: "nube", titulo: "Salidas a la nube en pausa", detalle: "El guardián frenó el tráfico para no pasarse del cupo; se reanuda solo.", estado: "atencion" }
            : { id: "nube", titulo: `${c.hoy.toLocaleString("es-ES")} salidas a la nube hoy`, detalle: `De un tope diario de ${c.presupuesto.toLocaleString("es-ES")} en este dispositivo${c.bloqueadas ? ` · ${c.bloqueadas} frenadas` : ""}.`, estado: uso >= 0.7 ? "atencion" : "bien" });
    }
    return out;
}

/** Puntuación: comprobaciones en «bien» sobre las que cuentan (las informativas no). */
export function puntuacion(cs: Comprobacion[]): { bien: number; total: number; nivel: "bien" | "atencion" | "mal" } {
    const cuentan = cs.filter((c) => c.estado !== "info");
    const bien = cuentan.filter((c) => c.estado === "bien").length;
    const hayMal = cuentan.some((c) => c.estado === "mal");
    return { bien, total: cuentan.length, nivel: hayMal ? "mal" : bien === cuentan.length ? "bien" : "atencion" };
}

// ── Escaneo local (mismas reglas que el panel de /seguridad) ─────────────

const BOVEDAS = ["starseed.ai.providers", "starseed.connectors.creds.v1"];
const CLAVE_SOSPECHOSA = /(token|secret|secreto|clave|api[-_]?key|apikey|password|credential|bearer)/i;
/** Claves que guardan credenciales A PROPÓSITO (bóvedas, sesión, conectores): no se leen. */
function esBoveda(k: string): boolean {
    return BOVEDAS.includes(k) || /^sb-.*-auth-token/.test(k) || k.startsWith("starseed.integration.") || /^starseed\.brain\..+\.integration\./.test(k);
}

export function escanearAlmacen(almacen: Storage = localStorage): EscaneoLocal {
    let claves = 0, hallazgos = 0, graves = 0, boveda = 0;
    for (let i = 0; i < almacen.length; i++) {
        const k = almacen.key(i);
        if (!k) continue;
        if (esBoveda(k)) { if (BOVEDAS.includes(k)) boveda++; continue; }
        if (!CLAVE_SOSPECHOSA.test(k)) continue;
        claves++;
        const f = scanText((almacen.getItem(k) ?? "").slice(0, 100_000));
        hallazgos += f.length;
        graves += f.filter((x) => x.severity === "critical" || x.severity === "high").length;
    }
    return { claves, hallazgos, graves, boveda, en: Date.now() };
}

// ── Hooks ────────────────────────────────────────────────────────────────

function leerBloqueo(): Pick<SenalesSeguridad, "metodo" | "minutosInactividad" | "alAbrir" | "passkey"> {
    try {
        const c = leerConfigBloqueo(deviceId());
        return { metodo: c.metodo, minutosInactividad: c.minutosInactividad, alAbrir: c.alAbrir, passkey: !!c.passkey };
    } catch {
        return { metodo: "ninguno", minutosInactividad: 0, alAbrir: false, passkey: false };
    }
}

export function useSenalesSeguridad(): SenalesSeguridad & { listo: boolean; persistir: () => Promise<void> } {
    const [bloqueo, setBloqueo] = React.useState(leerBloqueo);
    const [cifrada, setCifrada] = React.useState(true);
    const [biometria, setBiometria] = React.useState<boolean | null>(null);
    const [persistente, setPersistente] = React.useState<boolean | null>(null);
    const [listo, setListo] = React.useState(false);

    React.useEffect(() => {
        const releer = () => setBloqueo(leerBloqueo());
        const alm = (e: StorageEvent) => { if (e.key === CLAVE_BLOQUEO) releer(); };
        releer();
        setCifrada(typeof window !== "undefined" && (window.isSecureContext ?? location.protocol === "https:"));
        let vivo = true;
        void biometriaDisponible().then((b) => { if (vivo) setBiometria(b); });
        const st = (navigator as Navigator & { storage?: { persisted?: () => Promise<boolean> } }).storage;
        if (st?.persisted) void st.persisted().then((p) => { if (vivo) setPersistente(p); }).catch(() => undefined);
        setListo(true);
        window.addEventListener(EVENTO_CONFIG_BLOQUEO, releer);
        window.addEventListener("storage", alm);
        return () => { vivo = false; window.removeEventListener(EVENTO_CONFIG_BLOQUEO, releer); window.removeEventListener("storage", alm); };
    }, []);

    const persistir = React.useCallback(async () => {
        const st = (navigator as Navigator & { storage?: { persist?: () => Promise<boolean> } }).storage;
        if (!st?.persist) return;
        try { setPersistente(await st.persist()); } catch { /* el navegador decide */ }
    }, []);

    return { ...bloqueo, cifrada, biometria, persistente, listo, persistir };
}

/** Tráfico de hoy hacia la nube según el guardián (sin consultas: sus contadores locales). */
export function useConsumoHoy(): ConsumoHoy {
    const [, setV] = React.useState(0);
    React.useEffect(() => suscribirConsumo(() => setV((v) => v + 1)), []);
    const c = leerContadores();
    const ahora = Date.now();
    return { hoy: c.hoy, presupuesto: c.presupuestoDia, pausa: (c.corteHasta ?? 0) > ahora || (c.frenoLocalHasta ?? 0) > ahora || c.frenoRemoto, bloqueadas: c.bloqueadas };
}

/** Escaneo local bajo demanda; el resultado se comparte entre instancias durante la sesión. */
let ultimoEscaneo: EscaneoLocal | null = null;
const oyentesEscaneo = new Set<() => void>();
export function useEscaneoLocal(): { escaneo: EscaneoLocal | null; escanear: () => void } {
    const [, setV] = React.useState(0);
    React.useEffect(() => {
        const f = () => setV((v) => v + 1);
        oyentesEscaneo.add(f);
        return () => { oyentesEscaneo.delete(f); };
    }, []);
    const escanear = React.useCallback(() => {
        try { ultimoEscaneo = escanearAlmacen(); } catch { ultimoEscaneo = { claves: 0, hallazgos: 0, graves: 0, boveda: 0, en: Date.now() }; }
        oyentesEscaneo.forEach((f) => f());
    }, []);
    return { escaneo: ultimoEscaneo, escanear };
}
