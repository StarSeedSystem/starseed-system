import { describe, it, expect } from "vitest";
import {
  capacidadInsomne,
  politicaInsomne,
  debeSoltarTrabajo,
  estadoDesdeSesionInsomnia,
  esMacInsomnie,
  type EstadoInsomne,
} from "../insomne";

const AHORA = Date.parse("2026-10-27T12:00:00.000Z");

function estado(parches: Partial<EstadoInsomne>): EstadoInsomne {
  return {
    activo: true,
    hasta: "2026-10-27T13:00:00.000Z",
    proveedor: "insomnia",
    motivo: "sesión de prueba",
    ...parches,
  };
}

describe("capacidadInsomne", () => {
  it("macOS 26+ arm64 → Insomnia", () => {
    const c = capacidadInsomne("macos", "26.3.1 arm64");
    expect(c.proveedor).toBe("insomnia");
    expect(c.conPantallaCerrada).toBe(true);
    expect(c.soloConCorriente).toBe(false);
  });

  it("macOS 26+ sin arch (Intel u desconocido) → caffeinate, no finge", () => {
    expect(capacidadInsomne("macos", "26.3.1").proveedor).toBe("caffeinate");
  });

  it("macOS más vieja incluso con arm → caffeinate", () => {
    expect(capacidadInsomne("macos", "15.1 arm64").proveedor).toBe("caffeinate");
  });

  it("macOS sin versión → caffeinate que solo vale con corriente", () => {
    const c = capacidadInsomne("macos");
    expect(c.proveedor).toBe("caffeinate");
    expect(c.soloConCorriente).toBe(true);
  });

  it("linux → systemd-inhibit", () => {
    const c = capacidadInsomne("linux");
    expect(c.proveedor).toBe("systemd-inhibit");
    expect(c.conPantallaCerrada).toBe(true);
  });

  it("windows → powercfg", () => {
    expect(capacidadInsomne("windows").proveedor).toBe("powercfg");
  });

  it("servidor → siempre encendido", () => {
    const c = capacidadInsomne("servidor");
    expect(c.proveedor).toBe("siempre");
    expect(c.conPantallaCerrada).toBe(true);
  });

  it("web y pwa → wake-lock, solo con la pestaña a la vista", () => {
    for (const p of ["web", "pwa"] as const) {
      const c = capacidadInsomne(p);
      expect(c.proveedor).toBe("wake-lock");
      expect(c.conPantallaCerrada).toBe(false);
      expect(c.soloVisible).toBe(true);
    }
  });

  it("android e ios → no compatible, y se dice", () => {
    for (const p of ["android", "ios"] as const) {
      const c = capacidadInsomne(p);
      expect(c.proveedor).toBe("no");
      expect(c.conPantallaCerrada).toBe(false);
      expect(c.motivo).toContain("no compatible");
    }
  });
});

describe("esMacInsomnie", () => {
  it("reconoce Apple Silicon 26+ con varias escrituras del arch", () => {
    expect(esMacInsomnie("26.3.1 arm64")).toBe(true);
    expect(esMacInsomnie("26.3.1 (arm64)")).toBe(true);
    expect(esMacInsomnie("26.3.1 aarch64")).toBe(true);
    expect(esMacInsomnie("26.3.1 M4")).toBe(true);
  });

  it("rechaza Intel, versiones viejas y basura", () => {
    expect(esMacInsomnie("15.1 arm64")).toBe(false);
    expect(esMacInsomnie("26.3.1 x86_64")).toBe(false);
    expect(esMacInsomnie("")).toBe(false);
  });
});

describe("politicaInsomne", () => {
  it("todo encendido por defecto", () => {
    expect(politicaInsomne).toEqual({
      agentes: true,
      programados: true,
      malla: true,
      servidorCerebro: true,
      biblioteca: true,
    });
  });
});

describe("debeSoltarTrabajo", () => {
  it("con la sesión sana y 60 min por delante no suelta", () => {
    expect(debeSoltarTrabajo(estado({}), AHORA)).toBe(false);
  });

  it("suelta si quedan menos de 15 min", () => {
    expect(debeSoltarTrabajo(estado({ hasta: "2026-10-27T12:14:59.999Z" }), AHORA)).toBe(true);
  });

  it("con exactamente 15 min todavía no suelta", () => {
    expect(debeSoltarTrabajo(estado({ hasta: "2026-10-27T12:15:00.001Z" }), AHORA)).toBe(false);
  });

  it("suelta con batería por debajo del 15 % sin cargar, pero no cargando ni en el 15 % justo", () => {
    expect(debeSoltarTrabajo(estado({ bateria: { porcentaje: 14, cargando: false } }), AHORA)).toBe(true);
    expect(debeSoltarTrabajo(estado({ bateria: { porcentaje: 14, cargando: true } }), AHORA)).toBe(false);
    expect(debeSoltarTrabajo(estado({ bateria: { porcentaje: 15, cargando: false } }), AHORA)).toBe(false);
  });

  it("suelta con calor crítico, y el calor serio no alcanza", () => {
    expect(debeSoltarTrabajo(estado({ calor: "critico" }), AHORA)).toBe(true);
    expect(debeSoltarTrabajo(estado({ calor: "serio" }), AHORA)).toBe(false);
  });

  it("sesión inactiva o vencida: devolver lo que tenía", () => {
    expect(debeSoltarTrabajo(estado({ activo: false }), AHORA)).toBe(true);
  });

  it("un servidor siempre encendido nunca suelta por esta razón", () => {
    const servidor = estado({ proveedor: "siempre", activo: false, calor: "critico", bateria: { porcentaje: 5, cargando: false } });
    expect(debeSoltarTrabajo(servidor, AHORA)).toBe(false);
  });

  it("sin hasta legible: soltar por prudencia", () => {
    expect(debeSoltarTrabajo(estado({ hasta: "no-es-una-fecha" }), AHORA)).toBe(true);
  });
});

describe("estadoDesdeSesionInsomnia", () => {
  it("sesión vigente → activa con su hora de fin en ISO", () => {
    const e = estadoDesdeSesionInsomnia(
      { startedAt: "2026-10-27T10:00:00.000Z", endsAt: "2026-10-27T20:00:00.000Z", extensions: [] },
      AHORA,
    );
    expect(e.activo).toBe(true);
    expect(e.hasta).toBe("2026-10-27T20:00:00.000Z");
    expect(e.proveedor).toBe("insomnia");
    expect(e.motivo).toContain("10:00:00");
  });

  it("sesión vencida → inactiva", () => {
    const e = estadoDesdeSesionInsomnia({ startedAt: "2026-10-27T09:00:00.000Z", endsAt: "2026-10-27T11:00:00.000Z" }, AHORA);
    expect(e.activo).toBe(false);
    expect(e.hasta).toBeUndefined();
  });

  it("fin justo el ahora ya cuenta como vencida", () => {
    const e = estadoDesdeSesionInsomnia({ endsAt: "2026-10-27T12:00:00.000Z" }, AHORA);
    expect(e.activo).toBe(false);
  });

  it("json ilegible, sin endsAt o nulo → inactiva sin lanzar", () => {
    for (const crudo of [null, "nada", 42, {}, { endsAt: 7 }]) {
      const e = estadoDesdeSesionInsomnia(crudo, AHORA);
      expect(e.activo).toBe(false);
      expect(e.proveedor).toBe("insomnia");
    }
  });
});
