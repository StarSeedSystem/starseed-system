import { describe, it, expect } from "vitest";
import {
  capacidadInsomne,
  politicaInsomne,
  POLITICA_INSOMNE_DEFECTO,
  debeSoltarTrabajo,
  estadoDesdeSesionInsomnia,
  type EstadoInsomne,
} from "../insomne";

const AHORA = Date.parse("2026-10-27T12:00:00.000Z");

function estado(extra: Partial<EstadoInsomne> = {}): EstadoInsomne {
  return {
    activo: true,
    hasta: "2026-10-27T13:00:00.000Z",
    proveedor: "insomnia",
    motivo: "prueba",
    ...extra,
  };
}

describe("capacidadInsomne", () => {
  it("macOS 26 arm64 usa Insomnia", () => {
    expect(capacidadInsomne("macos", "26.3.1 arm64").proveedor).toBe("insomnia");
    expect(capacidadInsomne("macos-arm64", "26.3.1").proveedor).toBe("insomnia");
  });
  it("macOS anterior o Intel cae a caffeinate con corriente", () => {
    expect(capacidadInsomne("macos", "15.7").proveedor).toBe("caffeinate");
    expect(capacidadInsomne("macos", "26.3.1 x86_64").requiereCorriente).toBe(true);
  });
  it("linux, windows y servidor tienen proveedor propio", () => {
    expect(capacidadInsomne("linux").proveedor).toBe("systemd-inhibit");
    expect(capacidadInsomne("windows").proveedor).toBe("powercfg");
    expect(capacidadInsomne("servidor").proveedor).toBe("siempre");
  });
  it("web solo con la pestaña visible y móvil no", () => {
    const web = capacidadInsomne("web");
    expect(web.proveedor).toBe("wake-lock");
    expect(web.soloVisible).toBe(true);
    expect(capacidadInsomne("android").proveedor).toBe("no");
    expect(capacidadInsomne("ios").disponible).toBe(false);
  });
});

describe("politicaInsomne", () => {
  it("todo encendido por defecto", () => {
    expect(politicaInsomne()).toEqual(POLITICA_INSOMNE_DEFECTO);
    expect(Object.values(politicaInsomne()).every(Boolean)).toBe(true);
  });
  it("permite apagar una capacidad sin tocar las demás", () => {
    const p = politicaInsomne({ malla: false });
    expect(p.malla).toBe(false);
    expect(p.agentes).toBe(true);
  });
});

describe("debeSoltarTrabajo", () => {
  it("suelta cuando la sesión ya no está activa", () => {
    expect(debeSoltarTrabajo(estado({ activo: false }), AHORA)).toBe(true);
  });
  it("suelta si quedan menos de 15 minutos", () => {
    expect(debeSoltarTrabajo(estado({ hasta: "2026-10-27T12:14:00.000Z" }), AHORA)).toBe(true);
    expect(debeSoltarTrabajo(estado({ hasta: "2026-10-27T12:16:00.000Z" }), AHORA)).toBe(false);
  });
  it("suelta con batería baja solo si no está cargando", () => {
    expect(debeSoltarTrabajo(estado({ bateria: 14 }), AHORA)).toBe(true);
    expect(debeSoltarTrabajo(estado({ bateria: 14, cargando: true }), AHORA)).toBe(false);
    expect(debeSoltarTrabajo(estado({ bateria: 15 }), AHORA)).toBe(false);
  });
  it("suelta con calor crítico pero no con calor serio", () => {
    expect(debeSoltarTrabajo(estado({ calor: "critico" }), AHORA)).toBe(true);
    expect(debeSoltarTrabajo(estado({ calor: "serio" }), AHORA)).toBe(false);
  });
});

describe("estadoDesdeSesionInsomnia", () => {
  it("lee una sesión vigente", () => {
    const e = estadoDesdeSesionInsomnia({ endsAt: "2026-10-27T13:00:00Z" }, AHORA);
    expect(e.activo).toBe(true);
    expect(e.hasta).toBe("2026-10-27T13:00:00Z");
    expect(e.proveedor).toBe("insomnia");
  });
  it("una sesión vencida queda inactiva", () => {
    const e = estadoDesdeSesionInsomnia({ endsAt: "2026-10-27T11:00:00Z" }, AHORA);
    expect(e.activo).toBe(false);
    expect(e.motivo).toContain("vencida");
  });
  it("las extensiones alargan la hora de fin", () => {
    const e = estadoDesdeSesionInsomnia(
      { endsAt: "2026-10-27T12:30:00Z", extensions: ["2026-10-27T12:45:00Z", "2026-10-27T13:30:00Z"] },
      AHORA,
    );
    expect(e.activo).toBe(true);
    expect(e.hasta).toBe("2026-10-27T13:30:00Z");
  });
  it("sin datos legibles no finge una sesión", () => {
    const e = estadoDesdeSesionInsomnia({ endsAt: "no-es-fecha" }, AHORA);
    expect(e).toMatchObject({ activo: false, hasta: null, proveedor: "no" });
  });
});
