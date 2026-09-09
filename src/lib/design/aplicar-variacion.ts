/**
 * Aplicar la variación al fondo real — Ola 304 · Tarea zU8.
 *
 * Puente PURO entre `variacionPara()` (zU4) y la apariencia real del OS:
 * traduce una `VariacionVisual` al parche `background.living` de
 * `AppearanceConfig`, decide SI conviene reaccionar a un cambio de contexto
 * y pone un suelo de 20 s entre transiciones. Vivo no es epiléptico.
 *
 * NADA de `Date.now()`, `Math.random()` ni `window` aquí: todo llega por
 * parámetro, o el test no puede existir. Tampoco se secuestra el fondo que
 * la persona eligió a mano: solo se entrega el bloque `living`.
 */

import type { DeepPartial, AppearanceConfig } from "@/context/appearance-context";
import type { ContextoVisual, VariacionVisual } from "@/lib/design/variaciones-contexto";

/** Suelo de milisegundos entre transiciones del fondo vivo. */
export const MINIMO_ENTRE_CAMBIOS_MS = 20_000;

/** Franja del día: agrupa la hora para no reaccionar a cada minuto. */
export type FranjaHoraria = "madrugada" | "manana" | "tarde" | "noche";

/** Normaliza la hora local a un rango 0–24 estable. */
function horaNormalizada(hora: number): number {
    const h = hora % 24;
    return h < 0 ? h + 24 : h;
}

export function franjaHoraria(hora: number): FranjaHoraria {
    const h = Math.floor(horaNormalizada(hora));
    if (h < 6) return "madrugada";
    if (h < 12) return "manana";
    if (h < 20) return "tarde";
    return "noche";
}

export function parcheDeVariacion(v: VariacionVisual): DeepPartial<AppearanceConfig> {
    return {
        background: {
            living: {
                variant: v.variante,
                speed: v.velocidad,
                intensity: v.intensidad,
                colors: [...v.acentos],
                autoCycleSec: v.cicloSegundos,
            },
        },
    };
}

/**
 * Claves del contexto que importan para el fondo. La `semilla` y la hora
 * exacta NO importan: la primera es estable por definición y la segunda se
 * compara por FRANJA (`franjaHoraria`), no por minuto.
 */
function importa(a: ContextoVisual, b: ContextoVisual): boolean {
    return (
        a.area !== b.area ||
        a.tema !== b.tema ||
        franjaHoraria(a.horaLocal) !== franjaHoraria(b.horaLocal) ||
        a.densidadInformacion !== b.densidadInformacion ||
        a.movimientoReducido !== b.movimientoReducido
    );
}

export function debeReaccionar(
    anterior: ContextoVisual | null,
    actual: ContextoVisual
): boolean {
    if (anterior === null) return true;
    return importa(anterior, actual);
}

/**
 * Suelo de 20 s entre transiciones. Si `ahora` llega por detrás de
 * `ultimoAt` (reloj ajustado hacia atrás) la diferencia es negativa y no
 * habría forma de esperarla: se permite el cambio y el llamador vuelve a
 * anclar en el reloj nuevo.
 */
export function puedeCambiarAhora(ultimoAt: number, ahora: number): boolean {
    if (ahora < ultimoAt) return true;
    return ahora - ultimoAt >= MINIMO_ENTRE_CAMBIOS_MS;
}
