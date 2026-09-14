/**
 * Ficha de una puerta de visto bueno: qué hace esa rama, a qué afecta y si
 * puede aprobarse sola. Módulo PURO — sin fs, sin fetch, sin `Date.now()`:
 * el reloj entra por parámetro para que todo sea comprobable.
 *
 * El criterio de `traducirVeredicto` es copia literal de
 * `scripts/puente/aprobacion_logica.py`, que es la fuente de verdad. Se decide
 * por CAMPOS (`revisor`, `faltan`, `motivo_vb`) y NUNCA por la prosa de `nota`:
 * el 2026-09-12 el director aprobaba sola cualquier rama cuya nota contuviera
 * «revisión ok», y ese «ok» se escribía con que el revisor hubiese contestado
 * algo, no porque la revisión fuese buena.
 */

/** Lo que una rama toca, con su recuento de líneas. */
export interface ArchivoTocado { ruta: string; mas: number; menos: number }

export type Riesgo = "alto" | "medio" | "bajo";

/** Un archivo traducido a área, explicación y riesgo. */
export interface Efecto { area: string; detalle: string; riesgo: Riesgo }

/** El porqué de la puerta, en campos: si `verde`, puede abrirse sola. */
export interface Veredicto {
    revisor: string;
    motivoVb: string;
    faltan: string[];
    verde: boolean;
    porQueNo: string;
}

export interface FichaAprobacion {
    id: string;
    titulo: string;
    descripcion: string;
    rama: string;
    sha: string;
    archivos: ArchivoTocado[];
    lineas: number;
    veredicto: Veredicto;
    efectos: Efecto[];
    repercusiones: string[];
    dependientes: string[];
    minutosEsperando: number;
}

/** Lo único que se abre solo: el trámite que la cola pide como política. */
export const MOTIVO_RUTINA = "pedido por la cola";
const REVISOR_RESPONDIO = "respondio";
const REVISOR_BLOQUEANTE = "bloqueante";

function esPrueba(ruta: string): boolean {
    return (
        ruta.includes("__tests__/") ||
        ruta.endsWith(".test.ts") ||
        ruta.endsWith(".test.tsx") ||
        /(^|\/)test_[^/]*\.py$/.test(ruta)
    );
}

/**
 * Traduce una ruta a área, detalle y riesgo.
 *
 * La regla de pruebas va PRIMERO a propósito: `scripts/puente/test_x.py` es una
 * prueba, no un cambio en los directores, y pintarla de rojo alto haría que el
 * rojo dejara de significar nada.
 */
export function clasificarEfecto(ruta: string): Efecto {
    if (esPrueba(ruta)) {
        return { area: "Pruebas", detalle: "prueba: no cambia el comportamiento", riesgo: "bajo" };
    }
    if (ruta.startsWith("scripts/puente/") || ruta.startsWith("scripts/enjambre/")) {
        return { area: "Directores y enjambre", detalle: "manda sobre las demás tareas", riesgo: "alto" };
    }
    if (ruta.startsWith("src/app/api/")) {
        return { area: "API del Mando", detalle: "escribe en disco y ejecuta órdenes", riesgo: "alto" };
    }
    if (ruta.startsWith("src/lib/")) {
        return { area: "Lógica del Mando", detalle: "cálculo que alimenta la interfaz", riesgo: "medio" };
    }
    if (ruta.startsWith("src/components/") || ruta.startsWith("src/app/")) {
        return { area: "Interfaz", detalle: "lo que se ve, sin efectos fuera", riesgo: "bajo" };
    }
    return { area: "Otros", detalle: "fuera de las áreas conocidas", riesgo: "medio" };
}

function comoLista(v: unknown): string[] {
    return Array.isArray(v) ? v.map((x) => String(x)) : [];
}

/** Verde = no queda ninguna razón para no aprobarla sola. Decide por campos. */
export function traducirVeredicto(entrada: Record<string, unknown>): Veredicto {
    const revisor = typeof entrada.revisor === "string" ? entrada.revisor : "";
    const motivoVb = typeof entrada.motivo_vb === "string" ? entrada.motivo_vb : "";
    const faltan = comoLista(entrada.faltan);
    const base = { revisor, motivoVb, faltan };

    if (!revisor) {
        return { ...base, verde: false, porQueNo: "sin veredicto en campo propio: la mira una persona" };
    }
    if (revisor === REVISOR_BLOQUEANTE) {
        return { ...base, verde: false, porQueNo: "la revisión es bloqueante" };
    }
    if (revisor !== REVISOR_RESPONDIO) {
        return { ...base, verde: false, porQueNo: `no hubo revisor (${revisor})` };
    }
    if (faltan.length > 0) {
        return { ...base, verde: false, porQueNo: `alcance incompleto: faltan ${faltan.slice(0, 6).join(", ")}` };
    }
    if (!motivoVb.startsWith(MOTIVO_RUTINA)) {
        return {
            ...base,
            verde: false,
            porQueNo: `la puerta se levantó por «${motivoVb.slice(0, 80)}», no por política de la cola`,
        };
    }
    return { ...base, verde: true, porQueNo: "" };
}

/** Frases cortas, listas para enseñar, sin duplicados y en orden estable. */
export function repercusionesDe(efectos: Efecto[], dependientes: string[]): string[] {
    const fuera: string[] = [];
    const añadir = (f: string) => { if (!fuera.includes(f)) fuera.push(f); };

    if (efectos.some((e) => e.area === "Directores y enjambre" && e.riesgo === "alto")) {
        añadir("Cambia quien manda sobre las demás tareas: un fallo aquí para el enjambre entero.");
    }
    if (efectos.some((e) => e.area === "API del Mando" && e.riesgo === "alto")) {
        añadir("Añade o cambia una orden que el Mando puede ejecutar en tu Mac.");
    }
    if (dependientes.length > 0) {
        añadir(`Desbloquea ${dependientes.length} tarea(s): ${dependientes.join(", ")}.`);
    }
    if (efectos.length > 0 && efectos.every((e) => e.riesgo === "bajo")) {
        añadir("Cambio contenido: interfaz y pruebas, sin efectos sobre el enjambre.");
    }
    return fuera;
}

/**
 * «YYYY-MM-DD HH:MM:SS» en hora local → minutos de espera.
 * `ahora` llega en milisegundos (como `Date.now()`), nunca se lee del reloj aquí.
 */
export function minutosDesde(t: unknown, ahora: number): number {
    if (typeof t !== "string" || !t.trim()) return 0;
    const ms = new Date(t.trim().replace(" ", "T")).getTime();
    if (!Number.isFinite(ms)) return 0;
    return Math.max(0, Math.floor((ahora - ms) / 60000));
}

export interface DatosFicha {
    id: string;
    titulo?: string;
    descripcion?: string;
    rama?: string;
    sha?: string;
    archivos?: ArchivoTocado[];
    entrada?: Record<string, unknown>;
    dependientes?: string[];
    t?: string;
}

/** Ensambla la ficha. Lo que falta se dice que falta; no se inventa. */
export function construirFicha(datos: DatosFicha, ahora: number): FichaAprobacion {
    const archivos = datos.archivos ?? [];
    const efectos = archivos.map((a) => clasificarEfecto(a.ruta));
    const dependientes = datos.dependientes ?? [];
    return {
        id: datos.id,
        titulo: datos.titulo || datos.id,
        descripcion: datos.descripcion || "Sin ficha en las colas: tarea creada sobre la marcha.",
        rama: datos.rama || `ola/${datos.id}`,
        sha: datos.sha ?? "",
        archivos,
        lineas: archivos.reduce((n, a) => n + a.mas + a.menos, 0),
        veredicto: traducirVeredicto(datos.entrada ?? {}),
        efectos,
        repercusiones: repercusionesDe(efectos, dependientes),
        dependientes,
        minutosEsperando: minutosDesde(datos.t, ahora),
    };
}
