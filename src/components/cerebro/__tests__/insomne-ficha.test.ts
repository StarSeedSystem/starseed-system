/**
 * Rescate de la rama `nube/40695130948` (tarea VGM1016Db-d2, parte 2/2): casos
 * de la ficha insomne de la neurona que main no cubría con ese nombre. La
 * función vive hoy en `src/lib/neurons/insomne.ts` (pura); aquí se prueba la
 * parte de la ficha que registra la capacidad por plataforma.
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

  it("traduce Android a la plataforma del contrato", () => {
    // Rescate rama nube/40659574880: el resto del mapeo (macOS/Linux/Windows/
    // iPadOS) ya está pinado en insomne-ficha-pura.test.ts; Android no.
    expect(plataformaInsomne({ platform: "Android" })).toBe("android");
  });
});
