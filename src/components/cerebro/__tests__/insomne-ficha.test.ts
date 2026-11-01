/**
 * Rescate de la rama `nube/40695130948` (tarea VGM1016Db-d2, parte 2/2): casos
 * de la ficha insomne de la neurona que main no cubría con ese nombre. La
 * función vive hoy en `src/lib/neurons/insomne.ts` (pura); aquí se prueba la
 * parte de la ficha que registra la capacidad por plataforma.
 */
import { describe, it, expect } from "vitest";
import {
  estadoDePresencia,
  plataformaInsomne,
  type MedioAnuncio,
} from "@/components/cerebro/insomne-ficha";
import { capacidadInsomne, debeSoltarTrabajo } from "@/lib/neurons/insomne";

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

/**
 * Rescate de la rama `nube/40695130948` añade ahora los de `nube/40659574880`
 * (tarea BLD1025B-d3, parte 1/3): behaviors que main no cubría con otro nombre.
 * La rama probaba `leerNeuronaInsomne`; en main la costura pura equivalente de la
 * ficha es `estadoDePresencia` (anuncio de la presencia) + `debeSoltarTrabajo`.
 */
const AHORA = 1_000_000;

describe("plataformaInsomne · rescate BLD1025B-d3", () => {
  it("traduce Android de la neurona a la plataforma del contrato", () => {
    expect(plataformaInsomne({ platform: "Android" })).toBe("android");
  });
});

describe("anuncio de presencia y relevo de trabajo · rescate BLD1025B-d3", () => {
  function anuncio(hasta: number): MedioAnuncio[] {
    return [{ n: "m1", t: AHORA, s: { insomne: { hasta, proveedor: "insomnia" } } }];
  }

  it("un anuncio vigente está activo y no suelta trabajo cuando queda tiempo de sobra", () => {
    const hasta = AHORA + 2 * 60 * 60_000;
    const estado = estadoDePresencia(anuncio(hasta), "m1", AHORA);
    if (!estado) throw new Error("un anuncio vigente debe convertirse en estado");
    expect(estado.activo).toBe(true);
    expect(estado.hasta).toBe(new Date(hasta).toISOString());
    expect(estado.proveedor).toBe("insomnia");
    expect(debeSoltarTrabajo(estado, AHORA)).toBe(false);
  });

  it("con menos de 15 minutos sigue activo pero suelta el trabajo", () => {
    const estado = estadoDePresencia(anuncio(AHORA + 10 * 60_000), "m1", AHORA);
    if (!estado) throw new Error("un anuncio vigente debe convertirse en estado");
    expect(estado.activo).toBe(true);
    expect(debeSoltarTrabajo(estado, AHORA)).toBe(true);
  });
});
