/** Pruebas de datosInsomneFicha (INS1027D): puro, entrada → salida, sin reloj real ni red. */
import { describe, it, expect } from "vitest";
import { datosInsomneFicha, ETIQUETAS_SIGUE } from "@/components/cerebro/insomne-ficha";

const AHORA = Date.parse("2026-10-27T20:00:00.000Z");
const FIN = Date.parse("2026-10-27T21:30:00.000Z");

const hora = (ms: number) => new Date(ms).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

describe("datosInsomneFicha · Mac compatible", () => {
  it("GPU Apple ⇒ proveedor Insomnia; con anuncio futuro, activa hasta la hora", () => {
    const d = datosInsomneFicha(
      { plataforma: "macOS", gpu: "Apple M2", insomne: { hasta: FIN, proveedor: "insomnia" } },
      AHORA,
    );
    expect(d.capacidad.proveedor).toBe("insomnia");
    expect(d.compatible).toBe(true);
    expect(d.activo).toBe(true);
    expect(d.hastaTexto).toBe(hora(FIN));
    expect(d.sigue).toEqual(Object.values(ETIQUETAS_SIGUE));
  });

  it("sin anuncio de presencia: compatible y sin sesión", () => {
    const d = datosInsomneFicha({ plataforma: "macOS", gpu: "Apple M3" }, AHORA);
    expect(d.compatible).toBe(true);
    expect(d.activo).toBe(false);
    expect(d.hastaTexto).toBeNull();
  });

  it("anuncio vencido: compatible pero sin sesión activa", () => {
    const d = datosInsomneFicha(
      { plataforma: "macOS", gpu: "Apple M1", insomne: { hasta: Date.parse("2026-10-27T08:00:00.000Z"), proveedor: "insomnia" } },
      AHORA,
    );
    expect(d.compatible).toBe(true);
    expect(d.activo).toBe(false);
    expect(d.hastaTexto).toBeNull();
  });
});

describe("datosInsomneFicha · no compatibles", () => {
  it("Mac SIN GPU Apple detectada ⇒ caffeinate y no compatible", () => {
    const d = datosInsomneFicha({ plataforma: "macOS" }, AHORA);
    expect(d.capacidad.proveedor).toBe("caffeinate");
    expect(d.compatible).toBe(false);
  });

  it("móviles: proveedor «no» y motivo honesto", () => {
    const d = datosInsomneFicha({ plataforma: "Android" }, AHORA);
    expect(d.capacidad.proveedor).toBe("no");
    expect(d.compatible).toBe(false);
    expect(d.capacidad.motivo).toContain("pantalla apagada");
  });

  it("navegador/PWA: Wake Lock, solo pestaña visible", () => {
    const d = datosInsomneFicha({ plataforma: "pwa", gpu: "NVIDIA GeForce" }, AHORA);
    expect(d.capacidad.proveedor).toBe("wake-lock");
    expect(d.capacidad.soloVisible).toBe(true);
    expect(d.compatible).toBe(false);
  });

  it("servidor: ya está siempre encendido (no entra como insomne)", () => {
    const d = datosInsomneFicha({ plataforma: "servidor" }, AHORA);
    expect(d.capacidad.proveedor).toBe("siempre");
    expect(d.compatible).toBe(false);
  });
});

describe("datosInsomneFicha · plataformas servidas", () => {
  it("Linux: systemd-inhibit compatible sin sesión declarada", () => {
    const d = datosInsomneFicha({ plataforma: "Linux" }, AHORA);
    expect(d.capacidad.proveedor).toBe("systemd-inhibit");
    expect(d.compatible).toBe(true);
    expect(d.activo).toBe(false);
  });

  it("Windows: powercfg compatible", () => {
    const d = datosInsomneFicha({ plataforma: "Windows" }, AHORA);
    expect(d.capacidad.proveedor).toBe("powercfg");
    expect(d.compatible).toBe(true);
  });
});
