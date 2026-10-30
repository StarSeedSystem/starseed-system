/**
 * Rescate de la rama `nube/40695130948` (tarea VGM1016Db-d2, parte 2/2): casos
 * de la ficha insomne de la neurona que main no cubría con ese nombre. La
 * función vive hoy en `src/lib/neurons/insomne.ts` (pura); aquí se prueba la
 * parte de la ficha que registra la capacidad por plataforma.
 */
import { describe, it, expect } from "vitest";
import {
  plataformaInsomne,
  estadoDePresencia,
  type MedioAnuncio,
} from "@/components/cerebro/insomne-ficha";
import { capacidadInsomne } from "@/lib/neurons/insomne";

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

describe("plataformaInsomne · rescate rama nube/40659574880", () => {
  it("mapea también Android al contrato", () => {
    // Rescate: main probaba macOS/Linux/Windows/iPadOS, no Android.
    expect(plataformaInsomne({ platform: "Android" })).toBe("android");
  });
});

describe("capacidadInsomne · Mac compatible sin sesión", () => {
  it("una Mac Apple Silicon (26) usa Insomnia aunque no tenga sesión", () => {
    const AHORA = 500_000;
    const medios: MedioAnuncio[] = [];
    const plataforma = plataformaInsomne({ platform: "macOS" });
    // Sin anuncio de presencia no se finge una sesión activa…
    expect(estadoDePresencia(medios, "n1", AHORA)).toBeNull();
    // …y el proveedor elegido es el medido por la plataforma: Insomnia.
    const capacidad = capacidadInsomne(plataforma, "26.3.1 arm64");
    expect(capacidad.proveedor).toBe("insomnia");
    expect(capacidad.disponible).toBe(true);
  });
});
