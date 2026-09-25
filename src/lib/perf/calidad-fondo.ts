/**
 * Calidad adaptativa del fondo animado (2026-09-24).
 * ─────────────────────────────────────────────────────────────────────────────
 * Alex: «haz 2 o 3 versiones de calidades más bajas de la animación del fondo que se
 * adapten a las capacidades de cada medio… para que no haga más lento el resto del
 * sistema, incluso en tiempo real… encima ya hay una difuminación, analiza las calidades
 * que no se vean pixeladas».
 *
 * Medido en la Mac (M1, pantalla 1234×964 CSS a DPR 2): la escena Spline se pintaba a
 * 2468×1928 = 4,8 millones de píxeles, 60 veces por segundo, siempre. Pero la escena es
 * un degradado líquido muy suave (sin bordes duros) y además se ve difuminada: no tiene
 * detalle que necesite esa resolución. Pintar menos píxeles y subirlos con el escalado
 * bilineal del navegador no deja escalones visibles mientras el paso entre muestras
 * quede por debajo del radio del difuminado que ya tiene la imagen.
 *
 * Por eso los niveles bajan la RESOLUCIÓN (píxeles de render por píxel CSS) y el RITMO
 * (fotogramas por segundo), nunca el encuadre: el lienzo sigue ocupando lo mismo.
 *
 *   alta    → como antes: resolución nativa del monitor (máx. 2), sin tope de fps.
 *   media   → 0,75 px por px CSS · 30 fps   (≈14 % de los píxeles de «alta» en retina)
 *   baja    → 0,5  px por px CSS · 24 fps   (≈6 %)
 *   mínima  → 0,35 px por px CSS · 15 fps   (≈3 %)
 *   pausa   → sin pintar (pestaña oculta, o el sistema lo pide): queda el último fotograma.
 *
 * PURO (sin DOM): la parte viva está en `useCalidadFondo` / `SplineBackground`.
 */

export type CalidadFondo = "alta" | "media" | "baja" | "minima";
export type PreferenciaCalidadFondo = "auto" | CalidadFondo;

/** De más rica a más ligera. */
export const NIVELES: readonly CalidadFondo[] = ["alta", "media", "baja", "minima"] as const;

export interface PerfilCalidad {
    /** Píxeles de render por píxel CSS. `null` = el del monitor (devicePixelRatio, máx. 2). */
    escala: number | null;
    /** Tope de fotogramas por segundo. `0` = sin tope (lo que dé la pantalla). */
    fps: number;
    etiqueta: string;
    descripcion: string;
}

export const PERFILES: Record<CalidadFondo, PerfilCalidad> = {
    alta: {
        escala: null,
        fps: 0,
        etiqueta: "Alta",
        descripcion: "Resolución completa del monitor y máxima fluidez.",
    },
    media: {
        escala: 0.75,
        fps: 30,
        etiqueta: "Media",
        descripcion: "Idéntica a simple vista con el difuminado; una séptima parte del trabajo en pantallas retina.",
    },
    baja: {
        escala: 0.5,
        fps: 24,
        etiqueta: "Baja",
        descripcion: "Para equipos modestos o cuando el sistema está ocupado.",
    },
    minima: {
        escala: 0.35,
        fps: 15,
        etiqueta: "Mínima",
        descripcion: "Lo justo para que el fondo siga vivo sin quitarle nada al resto.",
    },
};

/** Clave de la preferencia del usuario (Ajustes → Rendimiento). Solo este dispositivo. */
export const CLAVE_PREFERENCIA = "starseed.fondo.calidad.v1";
/** Evento para que otros módulos pidan un techo temporal (voz, trabajo pesado…). */
export const EVENTO_LIMITE = "starseed:fondo-limite";
/** Evento que emite el fondo cuando cambia de calidad (para Ajustes / depuración). */
export const EVENTO_CAMBIO = "starseed:fondo-calidad";

export function esCalidad(v: unknown): v is CalidadFondo {
    return typeof v === "string" && (NIVELES as readonly string[]).includes(v);
}

export function indice(c: CalidadFondo): number {
    return NIVELES.indexOf(c);
}

/** La más ligera de las dos. */
export function masLigera(a: CalidadFondo, b: CalidadFondo): CalidadFondo {
    return indice(a) >= indice(b) ? a : b;
}

export function bajarUno(c: CalidadFondo): CalidadFondo {
    return NIVELES[Math.min(NIVELES.length - 1, indice(c) + 1)];
}

export function subirUno(c: CalidadFondo, techo: CalidadFondo): CalidadFondo {
    const siguiente = NIVELES[Math.max(0, indice(c) - 1)];
    // Nunca por encima del techo del dispositivo.
    return indice(siguiente) < indice(techo) ? techo : siguiente;
}

/** Resolución efectiva de render para un perfil en un monitor dado. */
export function escalaEfectiva(perfil: PerfilCalidad, dpr: number): number {
    const nativa = Math.min(Math.max(dpr || 1, 1), 2);
    if (perfil.escala === null) return nativa;
    // Nunca por encima de la nativa (en un monitor DPR 1, «media» no sube a 0,75→… sí baja).
    return Math.min(perfil.escala, nativa);
}

export interface Capacidades {
    /** GB de memoria (navigator.deviceMemory; ausente = desconocida). */
    memoriaGb?: number;
    /** Núcleos lógicos (navigator.hardwareConcurrency). */
    nucleos?: number;
    /** Puntero grueso (táctil). */
    tactil?: boolean;
    /** Nombre de la GPU (WEBGL_debug_renderer_info), si se pudo leer. */
    gpu?: string;
    /** Píxeles CSS de la ventana × DPR² (lo que costaría «alta»). */
    pixelesAlta?: number;
    /** Ahorro de datos / batería baja sin cargar. */
    ahorro?: boolean;
    /** Nivel aplicado por el sistema de rendimiento del OS ('high' | 'mid' | 'eco'). */
    perf?: "high" | "mid" | "eco";
}

/** GPU por software o muy modesta: nunca «alta» ni «media». */
const GPU_SOFTWARE = /swiftshader|llvmpipe|software|basic render|microsoft basic/i;
const GPU_MODESTA = /mali-[gt]\d{2}\b|adreno \(tm\) [3-5]\d\d|powervr|intel\(r\) (hd|uhd) graphics [2-6]\d{2}\b|intel hd/i;

/**
 * Techo (lo máximo que se le permite) y arranque (por dónde empieza) según el equipo.
 * Arrancar un nivel por debajo del techo y subir si sobra es más barato que empezar
 * alto y dar tirones mientras el gobernador reacciona.
 */
export function techoYArranque(c: Capacidades): { techo: CalidadFondo; arranque: CalidadFondo; motivo: string } {
    const motivos: string[] = [];
    let techo: CalidadFondo = "alta";
    const bajarTecho = (a: CalidadFondo, m: string) => {
        if (indice(a) > indice(techo)) {
            techo = a;
            motivos.push(m);
        }
    };
    if (c.perf === "mid") bajarTecho("media", "equipo de gama media");
    if (c.gpu && GPU_SOFTWARE.test(c.gpu)) bajarTecho("minima", "GPU por software");
    else if (c.gpu && GPU_MODESTA.test(c.gpu)) bajarTecho("baja", "GPU modesta");
    if (typeof c.memoriaGb === "number" && c.memoriaGb <= 4) bajarTecho("baja", `${c.memoriaGb} GB de memoria`);
    if (typeof c.nucleos === "number" && c.nucleos <= 4) bajarTecho("media", `${c.nucleos} núcleos`);
    if (c.tactil && (c.memoriaGb ?? 8) <= 6) bajarTecho("media", "móvil o tableta");
    if (c.ahorro) bajarTecho("baja", "ahorro de energía o de datos");
    // Pantallas enormes (4K o más a resolución nativa): «alta» costaría demasiado.
    if ((c.pixelesAlta ?? 0) > 8_000_000) bajarTecho("media", "pantalla muy grande");
    // Se arranca uno por debajo del techo (salvo que el techo ya sea lo mínimo) y se sube
    // si el gobernador ve que sobra.
    const arranque = techo === "alta" ? "media" : techo === "minima" ? "minima" : bajarUno(techo);
    return { techo, arranque, motivo: motivos.join(" · ") || "equipo sin límites conocidos" };
}

/** Lo que el gobernador mide en cada ventana de observación. */
export interface Muestra {
    /** Fotogramas por segundo reales de la página (rAF), no solo del fondo. */
    fpsPagina: number;
    /** Tareas largas (>50 ms) del hilo principal en la ventana. */
    tareasLargas: number;
    /** Frecuencia de la pantalla estimada (60, 120…). */
    refresco: number;
}

export interface EstadoGobernador {
    actual: CalidadFondo;
    /** ms del último cambio (para no dar bandazos). */
    ultimoCambio: number;
    /** ms desde que las muestras vienen holgadas sin interrupción. */
    holguraDesde: number | null;
}

export const ESPERA_ENTRE_CAMBIOS_MS = 3_000;
export const HOLGURA_PARA_SUBIR_MS = 15_000;

/**
 * Decide el siguiente nivel. Baja en cuanto la página entera (no el fondo) deja de ir
 * fluida o el hilo principal se atasca; sube solo tras 15 s seguidos de holgura, un
 * nivel cada vez, y nunca por encima del techo ni del límite que pida el sistema.
 */
export function gobernar(
    estado: EstadoGobernador,
    m: Muestra,
    techo: CalidadFondo,
    limite: CalidadFondo | null,
    ahora: number,
): EstadoGobernador {
    const tope = limite ? masLigera(techo, limite) : techo;
    // Un límite nuevo del sistema se aplica al instante (voz, trabajo pesado…).
    if (indice(estado.actual) < indice(tope)) {
        return { actual: tope, ultimoCambio: ahora, holguraDesde: null };
    }
    const objetivo = Math.min(m.refresco || 60, 60);
    const atascada = m.fpsPagina < objetivo * 0.75 || m.tareasLargas >= 2;
    const holgada = m.fpsPagina >= objetivo * 0.95 && m.tareasLargas === 0;
    const puedeCambiar = ahora - estado.ultimoCambio >= ESPERA_ENTRE_CAMBIOS_MS;

    if (atascada) {
        if (puedeCambiar && estado.actual !== "minima") {
            return { actual: bajarUno(estado.actual), ultimoCambio: ahora, holguraDesde: null };
        }
        return { ...estado, holguraDesde: null };
    }
    if (holgada) {
        const desde = estado.holguraDesde ?? ahora;
        if (ahora - desde >= HOLGURA_PARA_SUBIR_MS && puedeCambiar && indice(estado.actual) > indice(tope)) {
            return { actual: subirUno(estado.actual, tope), ultimoCambio: ahora, holguraDesde: null };
        }
        return { ...estado, holguraDesde: desde };
    }
    // Ni atascada ni holgada: se mantiene, pero la cuenta de holgura vuelve a empezar.
    return { ...estado, holguraDesde: null };
}

/** Lee la preferencia guardada; cualquier cosa rara = automática. */
export function leerPreferencia(valor: string | null | undefined): PreferenciaCalidadFondo {
    return valor === "auto" || esCalidad(valor) ? (valor as PreferenciaCalidadFondo) : "auto";
}
