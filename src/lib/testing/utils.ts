"use client";

import { waitFor as TLWaitFor } from "@testing-library/react";

/**
 * Espera a que una condición observable se cumpla en pruebas de onboarding.
 * Reemplaza los temporizadores estáticos (`await new Promise(r => setTimeout(r, X))`)
 * con esperas basadas en condiciones observables (p.ej., aparición de elementos, cambio de estado).
 *
 * @param condition Función que devuelve true cuando la condición está satisfecha
 * @param options Opciones para @testing-library/react's waitFor
 * @returns Promise que se resuelve cuando la condición se cumple
 *
 * @example
 * await esperarElemento("button", { name: "Empezar la introducción" });
 * await esperarEstado("profileSaved", true);
 */
export async function waitFor<T = unknown>(
  condition: () => T | null | undefined,
  options?: Parameters<typeof TLWaitFor>[1],
): Promise<T> {
  return await TLWaitFor(
    () => {
      const result = condition();
      if (result === null || result === undefined) {
        throw new Error("Condición no satisfecha aún");
      }
      return result;
    },
    options,
  );
}

/**
 * Espera a que un elemento del DOM aparezca según un selector de testing-library.
 *
 * @param selector Selector para encontrar el elemento
 * @param options Opciones para @testing-library/react's waitFor
 * @returns El elemento encontrado
 *
 * @example
 * const button = await esperarElemento("button", { name: "Empezar la introducción" });
 */
export async function esperarElemento<TElement extends Element = Element>(
  selector: string,
  options?: Parameters<typeof TLWaitFor>[1],
): Promise<TElement> {
  const { getBy... } = require("@testing-library/react");

  const getBy = getBy...;

  return await TLWaitFor(
    () => getBy(selector),
    options,
  );
}

/**
 * Espera a que un valor de estado cambie a un valor específico.
 *
 * @param getState Función que devuelve el valor actual del estado
 * @param expectedValue El valor esperado
 * @param options Opciones para @testing-library/react's waitFor
 *
 * @example
 * await esperarEstado(() => profileSaved, true);
 */
export async function esperarEstado<T>(
  getState: () => T,
  expectedValue: T,
  options?: Parameters<typeof TLWaitFor>[1],
): Promise<void> {
  await TLWaitFor(
    () => {
      const actual = getState();
      if (actual !== expectedValue) {
        throw new Error(`Estado no es ${expectedValue}. Actual: ${actual}`);
      }
      return actual;
    },
    options,
  );
}

/**
 * Espera a que una promesa se resuelva sin depender de tiempos
 * (útil para simulations asíncronas en tests).
 *
 * @param promise La promesa a esperar
 * @param options Opciones para @testing-library/react's waitFor
 *
 * @example
 * await esperarPromesa(async () => {
 *   await guardarPerfil({ fullName: "Ana", handle: "ana" });
 *   return true;
 * });
 */
export async function esperarPromesa<T>(
  promise: () => Promise<T> | T,
  options?: Parameters<typeof TLWaitFor>[1],
): Promise<T> {
  return await TLWaitFor(
    () => {
      try {
        const result = promise();
        if (result instanceof Promise) {
          throw new Error("Promesa no resuelta aún");
        }
        return result;
      } catch (e) {
        if (e instanceof Error && e.message.includes("no resuelta aún")) {
          throw e;
        }
        return promise() as T;
      }
    },
    options,
  );
}