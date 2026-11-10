// ════════════════════════════════════════════════════════════════
// StarSeed OS — El ojo del símbolo: mirada y parpadeo (ESC1110B)
// ----------------------------------------------------------------
// Lógica PURA (sin three ni React), probada sin navegador.
//
// Mirada. El ojo gira como un globo detrás de la almendra: el iris (con su
// brillo) rota alrededor de un centro escondido detrás del disco, hacia el
// puntero en cualquier punto del escritorio (o hacia donde se toca). Límites
// naturales: ±14° de guiñada y ±8° de cabeceo. La saturación es suave
// (tanh): cerca del ojo sigue fino, lejos ya mira «del todo». Tras 2,5 s sin
// entrada vuelve al frente.
//
// Parpadeo. Un clic o un toque (sin arrastre) baja el párpado sobre la
// almendra: 80 ms cerrando + 110 ms abriendo = 190 ms. Ocioso: un parpadeo
// tranquilo cada 5–10 s. Nunca a mitad de un arrastre.
// ════════════════════════════════════════════════════════════════

/** Límites de giro del ojo (rad). */
export const LIMITES_OJO = { guinada: (14 * Math.PI) / 180, cabeceo: (8 * Math.PI) / 180 } as const;
/** Sin entrada durante este tiempo (ms), la mirada vuelve al frente. */
export const REPOSO_MIRADA_MS = 2500;
/** Constante de tiempo del seguimiento (s): ~0,12 s, natural y sin temblor. */
export const TAU_MIRADA = 0.12;

export interface Mirada {
    /** −1 (izquierda) … 1 (derecha). */
    x: number;
    /** −1 (abajo) … 1 (arriba). */
    y: number;
}

export const MIRADA_FRENTE: Mirada = { x: 0, y: 0 };

/**
 * Hacia dónde mira el ojo según el puntero. `dx`, `dy` = distancia en px de
 * pantalla del centro del ojo al puntero (y crece hacia abajo, como en el
 * DOM); `escala` = distancia a la que la mirada llega al ~76 % (tanh 1).
 * Devuelve una dirección acotada a la elipse unidad.
 */
export function objetivoMirada(dx: number, dy: number, escala: number): Mirada {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return MIRADA_FRENTE;
    const s = Math.max(1, Number.isFinite(escala) ? escala : 1);
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-6) return MIRADA_FRENTE;
    const fuerza = Math.tanh(dist / s);
    const x = (dx / dist) * fuerza;
    const y = (-dy / dist) * fuerza;
    const n = Math.hypot(x, y);
    return n > 1 ? { x: x / n, y: y / n } : { x, y };
}

/** Ángulos de giro (rad) para una mirada. */
export function angulosMirada(m: Mirada): { guinada: number; cabeceo: number } {
    const x = Math.max(-1, Math.min(1, m.x));
    const y = Math.max(-1, Math.min(1, m.y));
    return { guinada: x * LIMITES_OJO.guinada, cabeceo: y * LIMITES_OJO.cabeceo };
}

/** Acerca la mirada actual al objetivo con suavizado exponencial (independiente de los fps). */
export function seguirMirada(actual: Mirada, objetivo: Mirada, dt: number, tau = TAU_MIRADA): Mirada {
    const k = 1 - Math.exp(-Math.max(0, dt) / Math.max(1e-3, tau));
    return { x: actual.x + (objetivo.x - actual.x) * k, y: actual.y + (objetivo.y - actual.y) * k };
}

/** Objetivo efectivo: el del puntero, o el frente si lleva un rato sin entrada. */
export function objetivoConReposo(objetivo: Mirada, msSinEntrada: number): Mirada {
    return msSinEntrada > REPOSO_MIRADA_MS ? MIRADA_FRENTE : objetivo;
}

/** ¿Ya está quieta (para dejar de pintar)? */
export function miradaQuieta(actual: Mirada, objetivo: Mirada): boolean {
    return Math.abs(actual.x - objetivo.x) < 1e-3 && Math.abs(actual.y - objetivo.y) < 1e-3;
}

// ── Parpadeo ─────────────────────────────────────────────────────

export const PARPADEO = { cierreMs: 80, aperturaMs: 110, ociosoMinMs: 5000, ociosoMaxMs: 10000 } as const;
/** Más de esto (px) entre bajar y subir el dedo es un arrastre, no un clic. */
export const UMBRAL_ARRASTRE_PX = 6;

export interface EstadoParpadeo {
    /** Instante (ms) en que empezó el parpadeo en curso; null = ojo abierto. */
    inicio: number | null;
    /** Próximo parpadeo ocioso (ms); null = sin parpadeo ocioso. */
    proximoOcioso: number | null;
}

export function estadoParpadeoInicial(ahora: number, ocioso: boolean, azar: () => number = Math.random): EstadoParpadeo {
    return { inicio: null, proximoOcioso: ocioso ? siguienteOcioso(ahora, azar) : null };
}

export function siguienteOcioso(ahora: number, azar: () => number = Math.random): number {
    const r = Math.min(1, Math.max(0, azar()));
    return ahora + PARPADEO.ociosoMinMs + r * (PARPADEO.ociosoMaxMs - PARPADEO.ociosoMinMs);
}

/** Pide un parpadeo. Si ya hay uno en curso, no lo reinicia (sin tartamudeo). */
export function pedirParpadeo(e: EstadoParpadeo, ahora: number): EstadoParpadeo {
    if (e.inicio !== null && ahora - e.inicio < PARPADEO.cierreMs + PARPADEO.aperturaMs) return e;
    return { ...e, inicio: ahora };
}

/**
 * Cierre del párpado (0 abierto … 1 cerrado) en el instante `ahora`, y el
 * estado siguiente (el parpadeo ocioso se dispara aquí).
 */
export function avanzarParpadeo(
    e: EstadoParpadeo,
    ahora: number,
    azar: () => number = Math.random,
): { estado: EstadoParpadeo; cierre: number } {
    let estado = e;
    if (estado.inicio === null && estado.proximoOcioso !== null && ahora >= estado.proximoOcioso) {
        estado = { inicio: ahora, proximoOcioso: siguienteOcioso(ahora, azar) };
    }
    if (estado.inicio === null) return { estado, cierre: 0 };
    const t = ahora - estado.inicio;
    const total = PARPADEO.cierreMs + PARPADEO.aperturaMs;
    if (t >= total || t < 0) return { estado: { ...estado, inicio: null }, cierre: 0 };
    // Cierra acelerando (como un párpado real) y abre frenando.
    const cierre = t < PARPADEO.cierreMs
        ? Math.pow(t / PARPADEO.cierreMs, 1.6)
        : 1 - Math.pow((t - PARPADEO.cierreMs) / PARPADEO.aperturaMs, 0.8);
    return { estado, cierre: Math.min(1, Math.max(0, cierre)) };
}

/** ¿Hay un parpadeo en curso? */
export function parpadeando(e: EstadoParpadeo): boolean {
    return e.inicio !== null;
}

/** Un clic o toque es un parpadeo solo si no fue un arrastre. */
export function esClic(dx: number, dy: number): boolean {
    return Math.hypot(dx, dy) <= UMBRAL_ARRASTRE_PX;
}
