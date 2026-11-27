/**
 * RST1116A · regla pura de la fuente de pantalla: lo que se pide («auto» | «proyeccion»), lo que
 * contesta el aparato («accesibilidad» | «proyeccion» | null), el veredicto (¿se cumplió?) y el rótulo
 * para la persona. Sin red, sin disco, sin `node:*`.
 */

export type FuentePedida = "auto" | "proyeccion";

export const FUENTE_DEFECTO: FuentePedida = "auto";

export type FuenteReal = "accesibilidad" | "proyeccion";

export function fuentePedidaValida(x: unknown): FuentePedida {
    return x === "proyeccion" ? "proyeccion" : "auto";
}

export interface VeredictoFuente {
    cumplida: boolean;
    aviso: string | null;
}

export function veredictoFuente(pedida: FuentePedida, real: FuenteReal | null): VeredictoFuente {
    if (pedida === "auto") {
        return { cumplida: true, aviso: null };
    }
    if (real === null) {
        return { cumplida: false, aviso: null };
    }
    if (real === "proyeccion") {
        return { cumplida: true, aviso: null };
    }
    return {
        cumplida: false,
        aviso:
            "Pediste la pantalla fluida, pero este aparato la está mandando por accesibilidad (menos fluida). Hace falta la proyección de pantalla en ese aparato.",
    };
}

export function rotuloFuente(real: FuenteReal | null): string {
    if (real === "proyeccion") return "Pantalla fluida (proyección)";
    if (real === "accesibilidad") return "Pantalla por accesibilidad";
    return "Pantalla: aún sin fuente";
}

// ── CTL1118F · la pantalla fluida es lo de siempre ───────────────────────────────────────────────

/** Cuánto espera el aparato a que su persona conteste el diálogo de la pantalla fluida antes de dejarlo estar (sigue con accesibilidad). */
export const ESPERA_FLUIDA_MS = 90_000;
/** Cada cuánto mira si la persona ya dio el «Sí» (una lectura de capacidades; no vuelve a preguntar nada). */
export const SONDEO_FLUIDA_MS = 1500;

export function fuenteRealValida(x: unknown): FuenteReal | null {
    return x === "proyeccion" || x === "accesibilidad" ? x : null;
}

/** `control_capacidades().pantalla.proyeccion`: el «Sí» de ESTA sesión está dado en el aparato. */
export function proyeccionConcedida(cap: unknown): boolean {
    const p = cap && typeof cap === "object" ? (cap as { pantalla?: unknown }).pantalla : undefined;
    return !!p && typeof p === "object" && (p as { proyeccion?: unknown }).proyeccion === true;
}

/** `control_capacidades().pantalla.fuente_activa`: la fuente que escribe cuadros AHORA según el aparato (null: no lo dijo o ninguna). */
export function fuenteActivaDe(cap: unknown): FuenteReal | null {
    const p = cap && typeof cap === "object" ? (cap as { pantalla?: unknown }).pantalla : undefined;
    return p && typeof p === "object" ? fuenteRealValida((p as { fuente_activa?: unknown }).fuente_activa) : null;
}

/**
 * ¿Hay que pedir la pantalla fluida? Solo si va por accesibilidad, UNA vez por sesión por sí solo (`pedidas` = las ya hechas) y, además,
 * cada vez que la persona lo pida (`manual`). Nunca en bucle: sin «Sí» el aparato sigue con accesibilidad.
 */
export function debePedirFluida(real: FuenteReal | null, pedidas: number, manual: boolean): boolean {
    return real === "accesibilidad" && (manual || pedidas === 0);
}

/** Los cuadros por segundo tal como se enseñan: medidos, con un decimal por debajo de 10 y sin decimales por encima. */
export function textoFps(fps: number | undefined): string | null {
    if (fps === undefined || !Number.isFinite(fps) || fps < 0) return null;
    return fps < 10 ? fps.toFixed(1).replace(".", ",") : String(Math.round(fps));
}

/** «Pantalla por accesibilidad · 2,9 cuadros/s»: la fuente REAL y lo medido; sin número, solo la fuente. */
export function rotuloFuenteMedida(real: FuenteReal | null, fps?: number): string {
    const f = textoFps(fps);
    return f === null || real === null ? rotuloFuente(real) : `${rotuloFuente(real)} · ${f} cuadros/s`;
}

/** Una línea para quien manda cuando la pantalla va por accesibilidad: la fluida se acepta EN el aparato (nadie la acepta por la persona). */
export function ayudaFluida(real: FuenteReal | null): string | null {
    return real === "accesibilidad" ? "Va por accesibilidad (pocos cuadros por segundo). En el aparato se puede aceptar la pantalla fluida." : null;
}

/** CTL1124C: si el aparato es Linux y no tiene WebRTC utilizable, la pantalla no se para por «sin oferta»;
 *  sigue sirviendo cuadros por la malla (misma vía que el Mac controlado). Pura: sin E/S, sin red. */
export function esModoMalla(sistemaOperativo: string, hayWebRtc: boolean): boolean {
    return sistemaOperativo === "linux" && !hayWebRtc;
}

/** CTL1124C: tiempo de gracia (ms) antes de exigir malla en Linux sin WebRTC. */
export const GRACIA_MALLA_MS = 30_000;

/** CTL1124C: vigencia de la malla (ms) tras la última petición; sin peticiones se para con «sin-malla». */
export const VIGENCIA_MALLA_MS = 8_000;

// ── CTL1124G · la pantalla que no da ni el cuadro inicial ────────────────────────────────────────

/** Cuánto se espera al PRIMER cuadro de una fuente antes de darla por parada (la accesibilidad tarda ~340 ms). */
export const ESPERA_PRIMER_CUADRO_MS = 4_000;
/** Con algún cuadro ya visto, cuánto silencio se tolera antes de volver a darla por parada (la quieta también late). */
export const SILENCIO_CUADRO_MS = 4_500;

/** Texto claro para la persona: la fluida se acepta EN el aparato y nadie la acepta por ella. */
export const AVISO_PANTALLA_FLUIDA =
    "La pantalla por accesibilidad no está dando imagen. En la tableta, abre «Compartir pantalla» y acepta la pantalla fluida (proyección) para verla; nadie puede aceptarla por ti.";

export type EstadoCuadros = "sin-fuente" | "esperando" | "dando" | "parada" | "pausa";

export interface MedidaCuadros {
    /** La fuente REAL que escribe cuadros ahora (null: aún no hay ninguna). */
    fuente: FuenteReal | null;
    /** Cuadros pintados en esta pantalla. */
    cuadros: number;
    /** ms desde que se pidió la pantalla. */
    desdeInicioMs: number;
    /** ms desde el último cuadro (null si no ha llegado ninguno). */
    desdeUltimoMs: number | null;
    /** La pausa local detiene los cuadros a propósito: no es una pantalla rota. */
    pausada?: boolean;
}

/** Salud de los cuadros: esperando el inicial, dando imagen, parada (0 cuadros/s) o en pausa local. */
export function estadoCuadros(m: MedidaCuadros, primerMs = ESPERA_PRIMER_CUADRO_MS, silencioMs = SILENCIO_CUADRO_MS): EstadoCuadros {
    if (m.fuente === null) return "sin-fuente";
    if (m.pausada === true) return "pausa";
    if (!(m.cuadros > 0)) return m.desdeInicioMs >= primerMs ? "parada" : "esperando";
    if (m.desdeUltimoMs !== null && m.desdeUltimoMs >= silencioMs) return "parada";
    return "dando";
}

/** El aviso de la fluida sale UNA vez, solo por accesibilidad y solo si la pantalla está parada. */
export function debeAvisarPantallaFluida(fuente: FuenteReal | null, estado: EstadoCuadros, yaPedida: boolean): boolean {
    return fuente === "accesibilidad" && estado === "parada" && !yaPedida;
}

/** Lo que se le puede decir a la persona en la ventana (null: nada que decir). */
export function textoCuadros(fuente: FuenteReal | null, estado: EstadoCuadros): string | null {
    if (fuente !== "accesibilidad") return null;
    if (estado === "parada") return AVISO_PANTALLA_FLUIDA;
    if (estado === "esperando") return "Esperando la primera imagen de la pantalla por accesibilidad…";
    return null;
}

/** Una línea del registro cuando la fuente no está dando imagen (nunca el contenido, solo conteos). */
export function lineaSinCuadros(estado: EstadoCuadros, fuente: FuenteReal | null, cuadros: number): string {
    const n = Number.isFinite(cuadros) ? Math.max(0, Math.trunc(cuadros)) : 0;
    return `control-fuente paso=sin-cuadros estado=${estado} cuadros=${n} fuente=${fuente ?? "ninguna"} sigue=accesibilidad`;
}

/** Una línea del registro cuando la persona no aceptó la pantalla fluida: nadie la acepta por ella. */
export function lineaProyeccionNoAceptada(cuadros: number, estado: EstadoCuadros): string {
    const n = Number.isFinite(cuadros) ? Math.max(0, Math.trunc(cuadros)) : 0;
    return `control-fuente paso=fluida-no-aceptada resultado=sin-respuesta-de-la-persona motivo=sin-consentimiento cuadros=${n} estado=${estado} sigue=accesibilidad`;
}

// ── CTL1126Css · paso a pantalla fluida en segundos y ventana con el modo real ───────────────────

/** Por debajo de esta luminancia media (0–255) un cuadro se toma por negro (el que llega al arrancar la proyección). */
export const LUMINANCIA_NEGRO = 6;

/**
 * El «Sí» de la persona ya está dado en el aparato pero la fuente que escribe cuadros sigue siendo accesibilidad:
 * hay que pasar a proyección YA (en la lectura siguiente), sin esperar al fin del plazo ni a otra orden.
 */
export function debePasarAProyeccion(cap: unknown, real: FuenteReal | null): boolean {
    return real === "accesibilidad" && proyeccionConcedida(cap);
}

/** La fuente que manda para la ventana: lo que dice el aparato ahora; si no dijo nada, lo último conocido. */
export function fuenteVigente(cap: unknown, ultima: FuenteReal | null): FuenteReal | null {
    return fuenteActivaDe(cap) ?? ultima;
}

/** El botón «Pedir la pantalla fluida» solo existe mientras la pantalla va por accesibilidad. */
export function mostrarBotonFluida(real: FuenteReal | null): boolean {
    return real === "accesibilidad";
}

/** ¿Un cuadro con esta luminancia media (0–255) es negro? Sin dato válido no se da por negro. */
export function esCuadroNegro(luminanciaMedia: number | undefined): boolean {
    return luminanciaMedia !== undefined && Number.isFinite(luminanciaMedia) && luminanciaMedia < LUMINANCIA_NEGRO;
}

/**
 * Qué hacer con el cuadro que llega. Tras un cambio de fuente, un cuadro negro no se pinta mientras haya uno bueno
 * guardado: se mantiene el último bueno hasta que llegue uno con imagen. Fuera de un cambio se pinta siempre.
 */
export function decidirCuadro(e: { cambiandoFuente: boolean; luminanciaMedia?: number; hayCuadroBueno: boolean }): "pintar" | "mantener" {
    return e.cambiandoFuente && e.hayCuadroBueno && esCuadroNegro(e.luminanciaMedia) ? "mantener" : "pintar";
}

