"use client";

/**
 * El gobernador vivo del fondo animado (2026-09-24). Ver `calidad-fondo.ts` para el porqué.
 *
 * (2026-09-25) Alex: «el fondo no carga la animación completa, se repite en las mismas
 * partes… lo que me refería de la adaptación de calidad no era de longitud, era de
 * calidad de píxeles». La primera versión también tocaba el RITMO (renderMode «manual»
 * con fotogramas pedidos a mano) y paraba/reanudaba la escena al ocultarse la pestaña;
 * `play()` de Spline vuelve a lanzar los eventos de inicio, así que cada vez que la
 * ventana quedaba tapada la animación arrancaba de nuevo y solo se veía su principio.
 * Ahora SOLO se cambia la resolución: la escena corre entera, a su ritmo y sin reinicios.
 * (Con la pestaña oculta el navegador ya congela su requestAnimationFrame: no gasta.)
 *
 * Se engancha a la Application de Spline ya cargada y:
 *   · fija la resolución de render (setPixelRatio del renderer), nunca el ritmo;
 *   · mide la fluidez de TODA la página (rAF + tareas largas del hilo principal) y baja
 *     de nivel en cuanto el sistema se atasca, y sube solo si sobra durante 15 s;
 *   · atiende límites temporales del sistema (evento `starseed:fondo-limite`, p. ej. la
 *     voz de Astraura mientras habla);
 *   · respeta la preferencia del usuario (Ajustes → Rendimiento → Calidad del fondo).
 *
 * Todo con defensas: si el runtime de Spline cambia sus internos, simplemente se deja de
 * escalar la resolución y la escena sigue como siempre.
 */

import {
    CLAVE_PREFERENCIA,
    EVENTO_CAMBIO,
    EVENTO_LIMITE,
    PERFILES,
    escalaEfectiva,
    esCalidad,
    gobernar,
    leerPreferencia,
    masLigera,
    techoYArranque,
    type Capacidades,
    type CalidadFondo,
    type EstadoGobernador,
    type PreferenciaCalidadFondo,
} from "@/lib/perf/calidad-fondo";

/** Lo mínimo que usamos de la Application de @splinetool/runtime. */
export interface AppSplineMinima {
    renderMode?: "auto" | "manual" | "continuous";
    requestRender?: () => void;
    stop?: () => void;
    play?: () => void;
    isStopped?: boolean;
}

export interface EstadoFondoVivo {
    calidad: CalidadFondo;
    techo: CalidadFondo;
    preferencia: PreferenciaCalidadFondo;
    motivo: string;
    escala: number;
    fps: number;
    fpsPagina: number;
    limite: { calidad: CalidadFondo; motivo: string } | null;
    pausado: boolean;
    /** Hay una cortina Trinity o un diálogo modal delante: la calidad no se toca. */
    congelado?: boolean;
}

declare global {
    interface Window {
        __starseedFondo?: EstadoFondoVivo & { fijar: (p: PreferenciaCalidadFondo) => void };
    }
}

function leerCapacidades(): Capacidades {
    const nav = navigator as Navigator & {
        deviceMemory?: number;
        connection?: { saveData?: boolean };
    };
    let gpu: string | undefined;
    try {
        const c = document.createElement("canvas");
        const gl = (c.getContext("webgl") || c.getContext("experimental-webgl")) as WebGLRenderingContext | null;
        if (gl) {
            const ext = gl.getExtension("WEBGL_debug_renderer_info");
            gpu = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || "");
            gl.getExtension("WEBGL_lose_context")?.loseContext();
        }
    } catch {
        /* sin WebGL de sonda: se decide con lo demás */
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const perfAttr = document.documentElement.getAttribute("data-perf");
    return {
        memoriaGb: typeof nav.deviceMemory === "number" ? nav.deviceMemory : undefined,
        nucleos: typeof nav.hardwareConcurrency === "number" ? nav.hardwareConcurrency : undefined,
        tactil: window.matchMedia?.("(pointer: coarse)").matches ?? false,
        gpu,
        pixelesAlta: window.innerWidth * window.innerHeight * dpr * dpr,
        ahorro: Boolean(nav.connection?.saveData),
        perf: perfAttr === "mid" || perfAttr === "eco" || perfAttr === "high" ? perfAttr : undefined,
    };
}

function leerPreferenciaGuardada(): PreferenciaCalidadFondo {
    try {
        return leerPreferencia(window.localStorage.getItem(CLAVE_PREFERENCIA));
    } catch {
        return "auto";
    }
}

export function guardarPreferenciaFondo(p: PreferenciaCalidadFondo): void {
    try {
        window.localStorage.setItem(CLAVE_PREFERENCIA, p);
    } catch {
        /* navegador sin almacenamiento: vale para esta sesión vía el evento */
    }
    try {
        window.dispatchEvent(new CustomEvent(EVENTO_LIMITE, { detail: { preferencia: p } }));
    } catch {
        /* noop */
    }
}

/**
 * Pide al fondo un techo temporal. `calidad: null` lo retira. Lo usa, p. ej., la voz de
 * Astraura mientras habla, para que el audio no compita con el fondo por la máquina.
 */
export function pedirLimiteFondo(motivo: string, calidad: CalidadFondo | null, ms = 10_000): void {
    try {
        window.dispatchEvent(new CustomEvent(EVENTO_LIMITE, { detail: { motivo, calidad, ms } }));
    } catch {
        /* SSR o navegador sin CustomEvent */
    }
}

/**
 * ¿Hay una cortina Trinity o un diálogo modal tapando el fondo?
 * (2026-09-25) Alex, en la app de Android: «al abrir el Exocortex la difuminación del
 * fondo aparece parpadeando». Medido: con el Exocortex abierto la página bajaba a ~20 fps
 * por el desenfoque del propio panel, y el gobernador reaccionaba bajando la resolución
 * del fondo dos veces (0,75 → 0,5 → 0,35). Cada cambio redimensiona el lienzo, y detrás
 * del cristal eso se ve como un parpadeo. Con un panel delante los fps no hablan del
 * equipo, así que la calidad se congela hasta que se cierre.
 */
export function hayPanelDelante(doc: Document | null = typeof document !== "undefined" ? document : null): boolean {
    if (!doc) return false;
    return Boolean(doc.querySelector('[data-trinity-curtain], [role="dialog"][aria-modal="true"]'));
}

/**
 * Cambia la resolución de render del renderer de Spline sin tocar el tamaño CSS.
 * El renderer de Spline ignora setSize con el mismo tamaño, así que se fuerza el
 * redimensionado. Devuelve false si los internos no están donde esperamos.
 */
export function aplicarEscala(app: unknown, escala: number): boolean {
    const r = (app as { _renderer?: Record<string, unknown> })?._renderer as
        | {
              setPixelRatio?: (v: number) => void;
              setSize?: (w: number, h: number, estilo?: boolean) => void;
              viewportWidth?: number;
              viewportHeight?: number;
          }
        | undefined;
    if (!r || typeof r.setPixelRatio !== "function" || typeof r.setSize !== "function") return false;
    try {
        r.setPixelRatio(escala);
        const w = r.viewportWidth;
        const h = r.viewportHeight;
        if (typeof w === "number" && typeof h === "number" && w > 0 && h > 0) {
            r.viewportWidth = -1; // fuerza el redimensionado del búfer con la nueva escala
            r.setSize(w, h, false);
        }
        return true;
    } catch {
        return false;
    }
}

/** Engancha el gobernador a una Application de Spline. Devuelve la función de limpieza. */
export function gobernarFondoSpline(app: AppSplineMinima): () => void {
    const caps = leerCapacidades();
    const { techo, arranque, motivo: motivoEquipo } = techoYArranque(caps);
    let preferencia = leerPreferenciaGuardada();
    let gob: EstadoGobernador = {
        actual: preferencia === "auto" ? arranque : preferencia,
        ultimoCambio: performance.now(),
        holguraDesde: null,
    };
    const limites = new Map<string, { calidad: CalidadFondo; hasta: number }>();
    let pausado = document.hidden;
    let escalaAplicada = 0;
    let raf = 0;
    const intervalos: number[] = [];
    let ultimoFrame = 0;
    let tareasLargas = 0;
    let refresco = 60;
    let fpsPagina = 60;
    let motivo = motivoEquipo;

    const limiteVigente = (ahora: number): { calidad: CalidadFondo; motivo: string } | null => {
        let peor: { calidad: CalidadFondo; motivo: string } | null = null;
        for (const [m, l] of limites) {
            if (l.hasta <= ahora) {
                limites.delete(m);
                continue;
            }
            if (!peor || masLigera(peor.calidad, l.calidad) === l.calidad) peor = { calidad: l.calidad, motivo: m };
        }
        return peor;
    };

    const publicar = () => {
        const perfil = PERFILES[gob.actual];
        const lim = limiteVigente(performance.now());
        const estado: EstadoFondoVivo = {
            calidad: gob.actual,
            techo,
            preferencia,
            motivo: lim ? `${motivo} · límite: ${lim.motivo}` : motivo,
            escala: escalaAplicada,
            fps: perfil.fps,
            fpsPagina: Math.round(fpsPagina),
            limite: lim,
            pausado,
            congelado: hayPanelDelante(),
        };
        window.__starseedFondo = { ...estado, fijar: (p) => fijar(p) };
        try {
            window.dispatchEvent(new CustomEvent(EVENTO_CAMBIO, { detail: estado }));
        } catch {
            /* noop */
        }
    };

    const aplicar = () => {
        const perfil = PERFILES[gob.actual];
        const escala = escalaEfectiva(perfil, window.devicePixelRatio || 1);
        if (Math.abs(escala - escalaAplicada) > 0.01) {
            if (aplicarEscala(app, escala)) escalaAplicada = escala;
        }
        publicar();
    };

    const fijar = (p: PreferenciaCalidadFondo) => {
        preferencia = p;
        const ahora = performance.now();
        const lim = limiteVigente(ahora);
        const base = p === "auto" ? gob.actual : p;
        gob = { actual: lim ? masLigera(base, lim.calidad) : base, ultimoCambio: ahora, holguraDesde: null };
        motivo = p === "auto" ? motivoEquipo : "elegida en Ajustes";
        aplicar();
    };

    // ── Medición: rAF de la página entera + tareas largas ──
    const bucle = (t: number) => {
        if (ultimoFrame) {
            const d = t - ultimoFrame;
            if (d > 0 && d < 1000) {
                intervalos.push(d);
                if (intervalos.length > 240) intervalos.shift();
            }
        }
        ultimoFrame = t;
        raf = requestAnimationFrame(bucle);
    };
    raf = requestAnimationFrame(bucle);

    let observador: PerformanceObserver | null = null;
    try {
        observador = new PerformanceObserver((lista) => {
            tareasLargas += lista.getEntries().length;
        });
        observador.observe({ entryTypes: ["longtask"] });
    } catch {
        observador = null; // Safari/Firefox: sin longtask, se decide solo con los fps
    }

    const evaluar = () => {
        if (pausado || intervalos.length < 20) {
            tareasLargas = 0;
            return;
        }
        if (hayPanelDelante()) {
            // Lo medido con el panel delante no vale ni para bajar ni para subir.
            tareasLargas = 0;
            intervalos.length = 0;
            publicar();
            return;
        }
        const ordenados = [...intervalos].sort((a, b) => a - b);
        // Refresco de la pantalla: el mejor 10 % de los intervalos.
        const mejor = ordenados[Math.floor(ordenados.length * 0.1)] || 16.7;
        refresco = Math.round(1000 / mejor);
        const media = intervalos.reduce((a, b) => a + b, 0) / intervalos.length;
        fpsPagina = 1000 / media;
        const ahora = performance.now();
        const lim = limiteVigente(ahora);
        const antes = gob.actual;
        if (preferencia === "auto") {
            gob = gobernar(gob, { fpsPagina, tareasLargas, refresco }, techo, lim?.calidad ?? null, ahora);
            if (gob.actual !== antes) {
                motivo =
                    lim && gob.actual === lim.calidad
                        ? `límite: ${lim.motivo}`
                        : `ajuste en vivo (la página iba a ${Math.round(fpsPagina)} fps)`;
            }
        } else {
            const deseada = lim ? masLigera(preferencia, lim.calidad) : preferencia;
            if (deseada !== gob.actual) gob = { actual: deseada, ultimoCambio: ahora, holguraDesde: null };
        }
        tareasLargas = 0;
        intervalos.length = 0;
        if (gob.actual !== antes) aplicar();
        else publicar();
    };
    const intervalo = window.setInterval(evaluar, 2_000);

    // Solo para no medir con la pestaña oculta: la escena NUNCA se para ni se reanuda
    // (reanudar la reiniciaba desde el principio).
    const alCambiarVisibilidad = () => {
        pausado = document.hidden;
        intervalos.length = 0;
        ultimoFrame = 0;
        publicar();
    };
    document.addEventListener("visibilitychange", alCambiarVisibilidad);

    const alLimite = (e: Event) => {
        const d = (e as CustomEvent).detail as
            | { motivo?: string; calidad?: CalidadFondo | null; ms?: number; preferencia?: PreferenciaCalidadFondo }
            | undefined;
        if (!d) return;
        if (d.preferencia) {
            fijar(d.preferencia);
            return;
        }
        const m = d.motivo || "sistema";
        if (d.calidad && esCalidad(d.calidad)) {
            limites.set(m, { calidad: d.calidad, hasta: performance.now() + Math.max(1_000, d.ms ?? 10_000) });
            const lim = limiteVigente(performance.now());
            if (lim && masLigera(gob.actual, lim.calidad) !== gob.actual) {
                gob = { actual: lim.calidad, ultimoCambio: performance.now(), holguraDesde: null };
                motivo = `límite: ${lim.motivo}`;
                aplicar();
            }
        } else {
            limites.delete(m);
        }
    };
    window.addEventListener(EVENTO_LIMITE, alLimite);

    const alCambiarPreferenciaEnOtraPestana = (e: StorageEvent) => {
        if (e.key === CLAVE_PREFERENCIA) fijar(leerPreferencia(e.newValue));
    };
    window.addEventListener("storage", alCambiarPreferenciaEnOtraPestana);

    // Si una versión anterior dejó la escena en modo «manual», vuelve a su ritmo propio.
    try {
        if (app.renderMode === "manual") app.renderMode = "auto";
    } catch {
        /* noop */
    }
    aplicar();

    return () => {
        cancelAnimationFrame(raf);
        window.clearInterval(intervalo);
        observador?.disconnect();
        document.removeEventListener("visibilitychange", alCambiarVisibilidad);
        window.removeEventListener(EVENTO_LIMITE, alLimite);
        window.removeEventListener("storage", alCambiarPreferenciaEnOtraPestana);
        if (window.__starseedFondo) delete window.__starseedFondo;
    };
}
