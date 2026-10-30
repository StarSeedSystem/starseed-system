/**
 * Rescate de la rama `nube/40695130948` (tarea VGM1016Db-d2, parte 2/2): casos
 * de la ficha insomne de la neurona que main no cubría con ese nombre. La
 * función vive hoy en `src/lib/neurons/insomne.ts` (pura); aquí se prueba la
 * parte de la ficha que registra la capacidad por plataforma.
 */
import { describe, it, expect } from "vitest";
import { plataformaInsomne } from "@/components/cerebro/insomne-ficha";
import { capacidadInsomne } from "@/lib/neurons/insomne";

describe("capacidadInsomne · ficha", () => {
  // Rescate de la rama nube/40659574880 (parte 3/3): el mapeo de Android del
  // navegador a la plataforma del contrato no lo cubría ninguna prueba.
  it("traduce la plataforma del navegador Android a la del contrato", () => {
    const p = plataformaInsomne({ platform: "Android" });
    expect(p).toBe("android");
    expect(capacidadInsomne(p).disponible).toBe(false);
  });

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
});
