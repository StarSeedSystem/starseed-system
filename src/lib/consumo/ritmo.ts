/**
 * Ritmo adaptativo del consumo por aparato (contrato «consumo» · CON1010, 2026-10-10).
 *
 * Por qué: el 2026-10-10 el navegador integrado de la Mac (todas las pestañas de `localhost:9002`
 * de los agentes, que comparten aparato) llegó a las 8.000 peticiones del día hacia las 12:00 UTC
 * y desde ahí el OS dejó de leer la nube hasta medianoche. El guardián solo sabía «todo» o «nada».
 * Ahora, ANTES de llegar a la pausa, el aparato baja solo el ritmo de lo que no es esencial:
 *
 *   nivel 0 · normal            — el gasto va por debajo de la curva del día.
 *   nivel 1 · ahorro (×2)       — por encima de la curva (con 3 h de holgura) o > 1.000 en la hora.
 *   nivel 2 · ahorro fuerte (×4) — ≥ 85 % del día, ≥ 1,5× la curva o > 2.000 en la hora.
 *   nivel 3 · pausa             — presupuesto del día agotado (lo de siempre).
 *
 * «Bajar el ritmo» = los bucles de fondo (`bucle-fondo.ts`) multiplican su intervalo por el factor
 * y el cubo de fichas del guardián rellena más despacio las lecturas NO esenciales. Lo esencial no
 * se toca nunca: escribir, la sesión (Auth) y las lecturas marcadas con `senalEsencial()` (las
 * preferencias del arranque).
 *
 * Módulo PURO (sin imports): lo usan el guardián, el aviso y los paneles.
 */

/** Registro del día en localStorage, compartido por las pestañas del aparato (lo escribe el guardián). */
export const CLAVE_DIA_CONSUMO = "starseed.supabase.dia.v1";

export const DIA_MS = 86_400_000;
export const HORA_MS = 3_600_000;
/** Horas de holgura de la curva: a las 00:00 UTC ya se pueden gastar 3/24 del día sin bajar el ritmo. */
export const HOLGURA_HORAS = 3;
/** Rutas que se guardan por día (las que más gastan). */
export const RUTAS_GUARDADAS = 15;

export type NivelRitmo = 0 | 1 | 2 | 3;
export const FACTOR_POR_NIVEL: Record<NivelRitmo, number> = { 0: 1, 1: 2, 2: 4, 3: 8 };

export interface EntradaRitmo {
    /** Peticiones de hoy (UTC) en este aparato. */
    hoy: number;
    /** Peticiones en la hora UTC en curso en este aparato. */
    enLaHora: number;
    presupuestoDia: number;
    ahora: number;
}

export interface Ritmo {
    nivel: NivelRitmo;
    /** Multiplicador de los intervalos de fondo (1, 2, 4, 8). */
    factor: number;
    /** Lo que el aparato «puede» llevar gastado a esta hora sin bajar el ritmo. */
    curva: number;
    motivo: string;
}

/** Curva del día: el presupuesto repartido por horas, con `HOLGURA_HORAS` de adelanto. */
export function curvaDelDia(presupuestoDia: number, ahora: number): number {
    const fraccion = (((ahora % DIA_MS) + DIA_MS) % DIA_MS) / DIA_MS;
    return Math.round(presupuestoDia * Math.min(1, fraccion + HOLGURA_HORAS / 24));
}

export function calcularRitmo(e: EntradaRitmo): Ritmo {
    const p = Math.max(1, e.presupuestoDia);
    const curva = curvaDelDia(p, e.ahora);
    const cuotaHora = p / 24;
    let nivel: NivelRitmo = 0;
    let motivo = "por debajo de la curva del día";
    if (e.hoy >= p) {
        nivel = 3;
        motivo = "presupuesto del día agotado";
    } else if (e.hoy >= 0.85 * p) {
        nivel = 2;
        motivo = "más del 85 % del presupuesto del día";
    } else if (e.hoy >= 1.5 * curva) {
        nivel = 2;
        motivo = "gasto muy por encima de la curva del día";
    } else if (e.enLaHora >= 6 * cuotaHora) {
        nivel = 2;
        motivo = "ráfaga: más de 6 horas de presupuesto en esta hora";
    } else if (e.hoy >= curva) {
        nivel = 1;
        motivo = "gasto por encima de la curva del día";
    } else if (e.enLaHora >= 3 * cuotaHora) {
        nivel = 1;
        motivo = "más de 3 horas de presupuesto en esta hora";
    }
    return { nivel, factor: FACTOR_POR_NIVEL[nivel], curva, motivo };
}

/** Registro del día tal como lo guarda el guardián. */
export interface RegistroDia {
    /** Día UTC (`floor(t / DIA_MS)`). */
    d: number;
    /** Peticiones del día. */
    n: number;
    /** Hora UTC (`floor(t / HORA_MS)`) a la que se refiere `nh`. */
    h?: number;
    /** Peticiones en la hora `h`. */
    nh?: number;
    /** Peticiones del día por ruta (las que más gastan). */
    r?: Record<string, number>;
}

export function leerRegistroDia(crudo: string | null | undefined): RegistroDia | null {
    if (!crudo) return null;
    try {
        const x = JSON.parse(crudo) as Partial<RegistroDia>;
        if (typeof x?.d !== "number" || typeof x?.n !== "number") return null;
        const r: Record<string, number> = {};
        if (x.r && typeof x.r === "object") {
            for (const [k, v] of Object.entries(x.r)) if (typeof v === "number" && v > 0) r[k] = v;
        }
        return {
            d: x.d,
            n: x.n,
            h: typeof x.h === "number" ? x.h : undefined,
            nh: typeof x.nh === "number" ? x.nh : undefined,
            r,
        };
    } catch {
        return null;
    }
}

/** Suma dos tablas de rutas y se queda con las `RUTAS_GUARDADAS` que más gastan. */
export function sumarRutas(a: Record<string, number> | undefined, b: Record<string, number> | undefined): Record<string, number> {
    const suma: Record<string, number> = { ...(a ?? {}) };
    for (const [k, v] of Object.entries(b ?? {})) suma[k] = (suma[k] ?? 0) + v;
    const orden = Object.entries(suma)
        .filter(([, v]) => v > 0)
        .sort((x, y) => y[1] - x[1])
        .slice(0, RUTAS_GUARDADAS);
    return Object.fromEntries(orden);
}

/** Nombres que entiende una persona para las rutas que más gastan (medidas el 2026-10-10). */
const NOMBRES: Record<string, string> = {
    "/rest/v1/rpc/merge_user_prefs": "guardado de tus preferencias",
    "/rest/v1/neuron_devices": "lista de tus neuronas (aparatos)",
    "/auth/v1/user": "comprobación de la sesión",
    "/auth/v1/token": "renovación de la sesión",
    "/rest/v1/user_settings": "lectura de tus preferencias",
    "/rest/v1/os_presencia": "presencia en vivo de tus aparatos",
    "/rest/v1/os_mesh_relay": "faros de la malla",
    "/rest/v1/os_mesh_vinculos": "vínculos de la malla",
    "/rest/v1/os_mesh_topology": "mapa de la malla",
    "/rest/v1/brain_memory_files": "memorias del cerebro",
    "/rest/v1/os_freno": "freno del proyecto",
    "/rest/v1/profiles": "tu perfil",
    "/rest/v1/notifications": "notificaciones",
    "/rest/v1/aurora_conversations": "conversaciones de Aurora",
    "/rest/v1/astraura_state": "estado de Astraura",
    "/rest/v1/astraura_mesh_nodes": "nodos de la malla de Astraura",
    "/realtime/v1/websocket": "conexión en tiempo real",
};

/** Nombre legible de una ruta (o la propia tabla si no la conocemos). */
export function nombreRuta(ruta: string): string {
    if (NOMBRES[ruta]) return NOMBRES[ruta];
    const m = /^\/rest\/v1\/(?:rpc\/)?([^/?#]+)/.exec(ruta);
    return m ? m[1].replace(/_/g, " ") : ruta;
}

export interface RutaTop {
    ruta: string;
    nombre: string;
    n: number;
}

/** La ruta que más gastó hoy según el registro compartido del aparato, o null. */
export function rutaTopDe(registro: RegistroDia | null, ahora: number): RutaTop | null {
    if (!registro || registro.d !== Math.floor(ahora / DIA_MS) || !registro.r) return null;
    let mejor: [string, number] | null = null;
    for (const e of Object.entries(registro.r)) if (!mejor || e[1] > mejor[1]) mejor = e;
    return mejor ? { ruta: mejor[0], nombre: nombreRuta(mejor[0]), n: mejor[1] } : null;
}

/** Lo mismo leyendo localStorage (para el aviso). Nunca lanza; sin almacenamiento, null. */
export function rutaTopDeHoy(ahora: number = Date.now()): RutaTop | null {
    try {
        if (typeof localStorage === "undefined") return null;
        return rutaTopDe(leerRegistroDia(localStorage.getItem(CLAVE_DIA_CONSUMO)), ahora);
    } catch {
        return null;
    }
}

export interface ResumenHoy {
    /** Peticiones de hoy en este aparato según el registro compartido (0 si no hay). */
    hoy: number;
    rutaTop: RutaTop | null;
}

/** Peticiones de hoy y la ruta que más gastó, leyendo el registro compartido. Nunca lanza. */
export function resumenDeHoy(ahora: number = Date.now()): ResumenHoy {
    try {
        if (typeof localStorage === "undefined") return { hoy: 0, rutaTop: null };
        const reg = leerRegistroDia(localStorage.getItem(CLAVE_DIA_CONSUMO));
        const hoy = reg && reg.d === Math.floor(ahora / DIA_MS) ? reg.n : 0;
        return { hoy, rutaTop: rutaTopDe(reg, ahora) };
    } catch {
        return { hoy: 0, rutaTop: null };
    }
}
