/**
 * FEED1108A: `/red-feed` ya no es una página, solo redirige a Señales (panel de llegadas)
 * para que enlaces antiguos, marcadores y apps instaladas no den 404.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const redirect = vi.hoisted(() => vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); }));
vi.mock("next/navigation", () => ({ redirect }));

import RedFeedPage from "../page";
import { RUTA_SENALES_LLEGADAS, pideVistaLlegadas } from "@/lib/senales/destinos";

describe("/red-feed · redirección", () => {
  beforeEach(() => { redirect.mockClear(); });

  it("redirige a Señales con el panel de llegadas", () => {
    expect(() => RedFeedPage()).toThrow("NEXT_REDIRECT:/senales?vista=llegadas");
    expect(redirect).toHaveBeenCalledWith(RUTA_SENALES_LLEGADAS);
  });

  it("el destino pide la vista de llegadas", () => {
    expect(pideVistaLlegadas(RUTA_SENALES_LLEGADAS.split("?")[1])).toBe(true);
    expect(pideVistaLlegadas("?vista=llegadas")).toBe(true);
    expect(pideVistaLlegadas("?vista=otra")).toBe(false);
    expect(pideVistaLlegadas(null)).toBe(false);
  });
});
