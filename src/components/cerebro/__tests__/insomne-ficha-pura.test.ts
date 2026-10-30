/**
 * Funciones puras exportadas por insomne-ficha.tsx (INS1027D): hora, plataforma
 * y el anuncio insomne de la presencia convertido en EstadoInsomne.
 */
import { describe, it, expect } from "vitest";
import {
  horaInsomne,
  plataformaInsomne,
  estadoDePresencia,
  type MedioAnuncio,
} from "@/components/cerebro/insomne-ficha";
import { capacidadInsomne } from "@/lib/neurons/insomne";

describe("horaInsomne", () => {
  it("no inventa hora cuando no hay dato o la fecha no se entiende", () => {
    expect(horaInsomne(null)).toBe("?");
    expect(horaInsomne("esto no es una fecha")).toBe("?");
  });

  it("el ISO y el mismo instante en epoch ms dan la misma hora", () => {
    const ms = Date.UTC(2026, 9, 30, 18, 45, 0);
    const iso = new Date(ms).toISOString();
    expect(horaInsomne(iso)).toBe(horaInsomne(ms));
    expect(horaInsomne(iso)).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe("plataformaInsomne", () => {
  it("mapea la plataforma de la neurona a la del contrato", () => {
    expect(plataformaInsomne({ platform: "macOS" })).toBe("macos");
    expect(plataformaInsomne({ platform: "Linux" })).toBe("linux");
    expect(plataformaInsomne({ platform: "Windows" })).toBe("windows");
    expect(plataformaInsomne({ platform: "iPadOS" })).toBe("ios");
    expect(plataformaInsomne({ platform: "desconocido" })).toBe("navegador");
    expect(plataformaInsomne(undefined)).toBe("navegador");
  });

  it("un servidor es servidor sin importar lo que declare", () => {
    expect(plataformaInsomne({ platform: "Linux" }, "server")).toBe("servidor");
  });
});

describe("capacidadInsomne sobre la plataforma de la ficha", () => {
  it("mac sin versión no finge Insomnia: caffeinate con corriente", () => {
    const c = capacidadInsomne(plataformaInsomne({ platform: "macOS" }));
    expect(c.proveedor).toBe("caffeinate");
    expect(c.requiereCorriente).toBe(true);
  });
});

describe("estadoDePresencia", () => {
  const ahora = 500_000;

  it("elige el anuncio más nuevo de ESA neurona y no finge si no lo hay", () => {
    const medios: MedioAnuncio[] = [
      { n: "otra", t: 10, s: { insomne: { hasta: ahora + 900_000, proveedor: "insomnia" } } },
      { n: "a1", t: 10, s: { insomne: { hasta: ahora + 900_000, proveedor: "insomnia" } } },
      { n: "a1", t: 20, s: { insomne: { hasta: ahora + 3_600_000, proveedor: "caffeinate" } } },
    ];
    const e = estadoDePresencia(medios, "a1", ahora);
    expect(e).not.toBeNull();
    expect(e?.proveedor).toBe("caffeinate");
    expect(e?.activo).toBe(true);
    expect(e?.hasta).toBe(new Date(ahora + 3_600_000).toISOString());
    expect(estadoDePresencia(medios.filter((m) => m.n === "otra"), "a1", ahora)).toBeNull();
  });

  it("ignora sesiones vencidas y aparatos sin anuncio", () => {
    const medios: MedioAnuncio[] = [
      { n: "a1", t: 30 },
      { n: "a1", t: 40, s: { insomne: { hasta: ahora, proveedor: "insomnia" } } },
    ];
    expect(estadoDePresencia(medios, "a1", ahora)).toBeNull();
  });
});
