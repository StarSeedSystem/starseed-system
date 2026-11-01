/**
 * Rescate de las ramas de la nube: casos de la ficha insomne de la neurona que
 * main no cubría con ese nombre (VGM1016Db-d2 parte 2/2; RTBLD1025B-d3, rama
 * `nube/40659574880`). La función vive hoy en `src/lib/neurons/insomne.ts`
 * (pura); aquí se prueba la parte de la ficha que registra la capacidad por
 * plataforma y el mapeo de plataformas, hoy en `insomne-ficha.tsx`.
 */
import { describe, it, expect } from "vitest";
import { capacidadInsomne } from "@/lib/neurons/insomne";
import { plataformaInsomne } from "@/components/cerebro/insomne-ficha";

describe("capacidadInsomne · ficha", () => {
  it("un servidor no depende de la plataforma que declare", () => {
    expect(capacidadInsomne("server").proveedor).toBe("siempre");
    expect(capacidadInsomne("vps").proveedor).toBe("siempre");
    expect(capacidadInsomne("server").disponible).toBe(true);
  });

  it("lo que no reconoce no se inventa una capacidad", () => {
    const d = capacidadInsomne("linux-morado-9000");
    expect(d.proveedor).toBe("no");
    expect(d.disponible).toBe(false);
    expect(d.motivo).toContain("no reconocida");
  });

  it("Android se mapea a la plataforma móvil del contrato", () => {
    expect(plataformaInsomne({ platform: "Android" })).toBe("android");
  });

  it("una plataforma vacía no se inventa: cae a navegador", () => {
    expect(plataformaInsomne({ platform: "" })).toBe("navegador");
  });
});
