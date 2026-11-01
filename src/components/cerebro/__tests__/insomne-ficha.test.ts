/**
 * Rescate de las ramas `nube/40695130948` y `nube/40659574880`: casos de la
 * ficha insomne de la neurona que main no cubría con ese nombre. La función
 * vive hoy en `src/lib/neurons/insomne.ts` (pura); aquí se prueba la parte de
 * la ficha que traduce la plataforma y registra la capacidad.
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
});

describe("plataformaInsomne · Android en la ficha", () => {
  it("Android tiene plataforma propia y la ficha no le promete insomnio", () => {
    const plataforma = plataformaInsomne({ platform: "Android" });
    expect(plataforma).toBe("android");
    const d = capacidadInsomne(plataforma);
    expect(d.proveedor).toBe("no");
    expect(d.disponible).toBe(false);
  });
});
