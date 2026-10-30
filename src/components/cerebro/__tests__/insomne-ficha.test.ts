/**
 * Rescate de la rama `nube/40695130948` (tarea VGM1016Db-d2, parte 2/2): casos
 * de la ficha insomne de la neurona que main no cubría con ese nombre. La
 * función vive hoy en `src/lib/neurons/insomne.ts` (pura); aquí se prueba la
 * parte de la ficha que registra la capacidad por plataforma.
 */
import { describe, it, expect } from "vitest";
import { capacidadInsomne } from "@/lib/neurons/insomne";
import { plataformaInsomne } from "@/components/cerebro/insomne-ficha";

describe("plataformaInsomne · rescate rama nube/40659574880", () => {
  it("traduce Android a la plataforma del contrato", () => {
    expect(plataformaInsomne({ platform: "Android" })).toBe("android");
  });

  it("lo que no reconoce no se inventa: cae en navegador (contrato de hoy)", () => {
    // La rama esperaba «freebsd», pero main normaliza a propósito cualquier
    // plataforma no listada a «navegador»: se pina ese comportamiento. Si
    // sobra distinguir FreeBSD, el arreglo va en insomne-ficha.tsx.
    expect(plataformaInsomne({ platform: "FreeBSD" })).toBe("navegador");
    expect(plataformaInsomne({ platform: "" })).toBe("navegador");
  });
});

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
});
