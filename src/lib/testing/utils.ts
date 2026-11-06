/**
 * Ayudas de ESPERA OBSERVABLE para pruebas (src/lib/testing).
 *
 * SOLO PARA PRUEBAS: sustituyen los temporizadores estáticos
 * (`await new Promise((r) => setTimeout(r, ms))`) usados a mano en las pruebas
 * de onboarding por condiciones observables —aparición o desaparición de un
 * elemento, un cambio de estado—, de modo que la suite no dependa de la
 * velocidad de la máquina. Componentes de producción nunca deben importar
 * este módulo.
 */

import { waitFor } from "@testing-library/react";

/** Opciones de espera: plazo máximo y frecuencia de comprobación, en ms. */
export type OpcionesEspera = {
    /** Plazo máximo de espera en ms (defecto: 5 s, el de testing-library). */
    timeoutMs?: number;
    /** Frecuencia de comprobación en ms (defecto: la de testing-library, 50). */
    intervaloMs?: number;
};

/** Traduce las opciones al formato de `waitFor` de testing-library. */
function opcionesAnte({ timeoutMs, intervaloMs }: OpcionesEspera = {}): Parameters<typeof waitFor>[1] {
    return {
        ...(timeoutMs === undefined ? null : { timeout: timeoutMs }),
        ...(intervaloMs === undefined ? null : { interval: intervaloMs }),
    } as NonNullable<Parameters<typeof waitFor>[1]>;
}

/**
 * Espera a que `condicion` devuelva algo que no sea `null`/`undefined` y
 * devuelve ese valor (el elemento aparecido, el estado nuevo, la promesa ya
 * resuelta…).
 */
export async function hastaQue<T>(
    condicion: () => T | null | undefined,
    opciones?: OpcionesEspera,
): Promise<T> {
    return waitFor<T>(() => {
        const valor = condicion();
        if (valor === null || valor === undefined) {
            throw new Error("La condición aún no se cumple");
        }
        return valor;
    }, opcionesAnte(opciones));
}

/**
 * Espera a que el elemento o estado que devuelve `obtener` desaparezca. Es la
 * cara contraria de `hastaQue`: se usa para las ventanas que se cierran y la
 * Bienvenida que se retira.
 */
export async function hastaQueYaNo<T>(
    obtener: () => T | null | undefined,
    opciones?: OpcionesEspera,
): Promise<void> {
    await waitFor(() => {
        if (obtener() !== null && obtener() !== undefined) {
            throw new Error("El elemento sigue presente");
        }
    }, opcionesAnte(opciones));
}
