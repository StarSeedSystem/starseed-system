/**
 * Prueba pura de la puerta común de la guía (GUI1021K2 · §5).
 * `abrirGuia` es una función pura: solo lanza un CustomEvent.
 */
import { describe, it, expect, vi } from "vitest";
import { EVENTO_ABRIR_GUIA, abrirGuia, ORIGENES_GUIA } from "../guia-acceso";
import type { PeticionGuia } from "../guia-acceso";

describe("abrirGuia (puerta común)", () => {
  it("lanza el evento con el detalle correcto y devuelve true", () => {
    const recibido: PeticionGuia[] = [];
    const objetivo = {
      dispatchEvent: vi.fn((e: Event) => {
        recibido.push((e as CustomEvent<PeticionGuia>).detail);
        return true;
      }),
    } as unknown as EventTarget;

    const ok = abrirGuia({ desde: "bienvenida" }, objetivo);
    expect(ok).toBe(true);
    expect(recibido).toHaveLength(1);
    expect(recibido[0]).toEqual({ desde: "bienvenida" });
    expect(objetivo.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: { desde: "bienvenida" },
        type: EVENTO_ABRIR_GUIA,
      }),
    );
  });

  it("incluye el tema inicial cuando se pasa", () => {
    const recibido: PeticionGuia[] = [];
    const objetivo = {
      dispatchEvent: vi.fn((e: Event) => {
        recibido.push((e as CustomEvent<PeticionGuia>).detail);
        return true;
      }),
    } as unknown as EventTarget;

    abrirGuia({ desde: "login", temaInicial: "genesis" }, objetivo);
    expect(recibido[0]).toEqual({ desde: "login", temaInicial: "genesis" });
  });

  it("devuelve false sin objetivo (servidor)", () => {
    const ok = abrirGuia({ desde: "ajustes" }, null);
    expect(ok).toBe(false);
  });

  it("cada origen está cubierto", () => {
    for (const desde of ORIGENES_GUIA) {
      const recibido: PeticionGuia[] = [];
      const objetivo = {
        dispatchEvent: vi.fn((e: Event) => {
          recibido.push((e as CustomEvent<PeticionGuia>).detail);
          return true;
        }),
      } as unknown as EventTarget;
      const ok = abrirGuia({ desde }, objetivo);
      expect(ok).toBe(true);
      expect(recibido[0].desde).toBe(desde);
    }
  });
});
