/**
 * StarSeed XR · MEDIDOR DE FOTOGRAMAS Y DERIVA DE NIVEL (XR1010AE, contrato §3 d).
 * Módulo PURO: el reloj entra como dato (cada fotograma es un `dt` en ms). Sin navegador ni WebGL.
 * - `crearMedidor(ventana = 90)`: ventana deslizante con descarte de absurdos (> `TOPE_FOTOGRAMA_MS`).
 * - `derivarTermica`: NO existe API de temperatura en la web; se INFIERE de fotogramas lentos sostenidos.
 * - `evolucionarCalidad`: repasa los fotogramas por el núcleo puro (`siguienteCalidad`); `auto` decide.
 */
import type { CambioCalidad, EstadoCalidad, PerfilDispositivo } from "@/lib/xr/calidad";
import { estadoInicialCalidad, nivelInicial, siguienteCalidad, perfilDeNivel } from "@/lib/xr/calidad";
import { indiceNivel, type NivelCalidad } from "@/lib/xr/tipos";
import type { PerfilCalidad } from "@/lib/xr/calidad-perfiles";
/** Fotograma admitido: por encima da igual a «pestaña en segundo plano» o corte del compositor. */
export const TOPE_FOTOGRAMA_MS = 250;
/** Intervalo entre tomas del bucle (2 Hz). */
export const INTERVALO_TOMA_MS = 500;
export interface Periodo {
    /** Duración del fotograma (ms) y tiempo acumulado de los admitidos desde el arranque. */
    dt: number;
    t: number;
}
export interface MedidorFotogramas {
    registrar(dtMs: number): void;
    /** Media y percentil 95 (rango más cercano) de la ventana; 0 si está vacía. */
    media(): number;
    p95(): number;
    /** Presupuesto del fotograma en ms, con el mismo freno que el núcleo (`1000 / max(30, hz)`). */
    presupuesto(hz: number): number;
    /** Tiempo acumulado admitido (ms) y fotogramas registrados desde (t posterior a) `marca`. */
    t(): number;
    desde(marca: number): Periodo[];
    /** Cuántos fotogramas hay en la ventana. */
    tamanio(): number;
}
export function crearMedidor(ventana = 90): MedidorFotogramas {
    const cola: Periodo[] = [];
    const limite = Math.max(1, Math.floor(ventana));
    let t = 0;
    return {
        registrar(dtMs) {
            if (!Number.isFinite(dtMs) || dtMs <= 0 || dtMs > TOPE_FOTOGRAMA_MS) return;
            t += dtMs;
            cola.push({ dt: dtMs, t });
            if (cola.length > limite) cola.splice(0, cola.length - limite);
        },
        media() {
            if (cola.length === 0) return 0;
            let suma = 0;
            for (const p of cola) suma += p.dt;
            return suma / cola.length;
        },
        p95() {
            if (cola.length === 0) return 0;
            const orden = cola.map((p) => p.dt).sort((a, b) => a - b);
            return orden[Math.min(orden.length - 1, Math.max(0, Math.ceil(orden.length * 0.95) - 1))];
        },
        presupuesto(hz) {
            return 1000 / Math.max(30, hz);
        },
        t() {
            return t;
        },
        desde(marca) {
            return cola.filter((p) => p.t > marca);
        },
        tamanio() {
            return cola.length;
        },
    };
}
export type Termica = "nominal" | "fair" | "serious";
/** `auto` deja decidir al núcleo; un nivel fijo congela la calidad (la persona manda, §3 d.5). */
export type ModoCalidad = "auto" | NivelCalidad;
/** Muestras recientes del tiempo medio frente al presupuesto (una por toma): «temperatura» inferida. */
export function derivarTermica(historial: ReadonlyArray<{ ms: number; presupuestoMs: number }>): Termica {
    if (historial.length < 4) return "nominal"; // un pico no es un sobrecalentamiento
    const proporcion = historial.filter((h) => h.ms > h.presupuestoMs).length / historial.length;
    if (proporcion >= 0.6) return "serious";
    if (proporcion >= 0.25) return "fair";
    return "nominal";
}
/** Aviso breve que dice POR QUÉ cambió el nivel o el refresco («Bajé a baja: los fotogramas tardan …»). */
export function avisoDeCambio(c: CambioCalidad): string {
    if (c.tipo === "refresco") return `Refresco: ${c.de} → ${c.a}. ${c.motivo}`;
    const direccion = indiceNivel(c.a as NivelCalidad) < indiceNivel(c.de as NivelCalidad) ? "Bajé" : "Subí";
    return `${direccion} a ${c.a}: ${c.motivo}`;
}
/** Arranque: `modo` fijo arranca y se congela (techo = ese mismo nivel); `auto` parte de `nivelInicial`. */
export function estadoArranque(modo: ModoCalidad, dispositivo: PerfilDispositivo): EstadoCalidad {
    if (modo !== "auto") return { ...estadoInicialCalidad(modo), techo: modo };
    return estadoInicialCalidad(nivelInicial(dispositivo));
}
/** Con nivel fijo devuelven ese nivel; con auto, el del dispositivo al arrancar la sesión. */
export const perfilArranque = (modo: ModoCalidad, dispositivo: PerfilDispositivo): PerfilCalidad =>
    perfilDeNivel(modo !== "auto" ? modo : nivelInicial(dispositivo));
export interface TomaCalidad {
    t: number;
    periodos: readonly Periodo[];
    /** Refresco objetivo actual y los soportados por la sesión (`supportedFrameRates`). */
    refrescoHz: number;
    soportados: readonly number[];
}
export interface EvolucionCalidad {
    estado: EstadoCalidad;
    /** El ÚLTIMO cambio de los fotogramas procesados (`siguienteCalidad`), si lo hubo. */
    cambio: CambioCalidad | null;
}
/**
 * Repasa cada fotograma registrado desde la última toma por la máquina de estados del núcleo.
 * Con un nivel fijo no se consulta: el estado queda tal cual y nunca cambia.
 */
export function evolucionarCalidad(modo: ModoCalidad, toma: TomaCalidad, estado: EstadoCalidad): EvolucionCalidad {
    if (modo !== "auto") return { estado, cambio: null };
    let estadoAhora = estado;
    let cambio: CambioCalidad | null = null;
    for (const p of toma.periodos) {
        const r = siguienteCalidad(estadoAhora, { t: p.t, dt: p.dt }, toma.refrescoHz, toma.soportados);
        estadoAhora = r.estado;
        cambio = r.cambio ?? cambio;
    }
    return { estado: estadoAhora, cambio };
}
