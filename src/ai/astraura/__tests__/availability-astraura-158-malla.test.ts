/**
 * (Ola 367) Disponibilidad de la fuente `astraura-158-malla`: lista SOLO si
 * `servidoresAstrauraMalla()` devuelve al menos un peer — sin el motor de la
 * malla montado (como en este test, sin DOM) esa lista está vacía, así que la
 * fuente sale «no lista» con el motivo honesto que enseña el selector.
 */
import { describe, expect, it } from "vitest";
import { detectAvailability } from "@/ai/astraura/availability";
import { ASTRAURA_158_MALLA_SOURCE_ID } from "@/ai/astraura/free-catalog";

describe("disponibilidad de astraura-158-malla", () => {
  it('sin peers de la malla sirviendo Astraura ⇒ no lista, "Ninguna neurona de tu malla ofrece Astraura ahora."', async () => {
    const lista = await detectAvailability(true);
    const malla = lista.find((a) => a.source.id === ASTRAURA_158_MALLA_SOURCE_ID);
    expect(malla).toBeTruthy();
    expect(malla!.ready).toBe(false);
    expect(malla!.reason).toBe("Ninguna neurona de tu malla ofrece Astraura ahora.");
  });
});
