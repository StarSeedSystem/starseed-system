import { describe, it, expect } from "vitest";

import {
  capacidadInsomne,
  debeSoltarTrabajo,
  estadoDesdeSesionInsomnia,
  politicaInsomne,
} from "../../../lib/neurons/insomne";

const AHORA = Date.parse("2026-10-27T12:00:00.000Z");

describe("capacidadInsomne · ficha de la neurona insomne", () => {
  it("un servidor no depende de la plataforma que declare", () => {
    expect(capacidadInsomne("server").proveedor).toBe("siempre");
    expect(capacidadInsomne("vps").proveedor).toBe("siempre");
    expect(capacidadInsomne("server").disponible).toBe(true);
  });

  it("lo que no reconoce no se inventa", () => {
    for (const plataforma of ["", "FreeBSD", "ChromeOS"]) {
      const capacidad = capacidadInsomne(plataforma);
      expect(capacidad.proveedor).toBe("no");
      expect(capacidad.disponible).toBe(false);
      expect(capacidad.motivo).toContain("no reconocida");
    }
  });

  it("una Mac Apple Silicon compatible usa Insomnia aunque no tenga sesión", () => {
    const capacidad = capacidadInsomne("macos", "26.3.1 arm64");
    expect(capacidad.proveedor).toBe("insomnia");
    expect(capacidad.disponible).toBe(true);

    const estado = estadoDesdeSesionInsomnia({}, AHORA);
    expect(estado.activo).toBe(false);
  });

  it("una Mac Intel solo puede con caffeinate y corriente", () => {
    const capacidad = capacidadInsomne("macos", "26.3.1 x86_64");
    expect(capacidad.proveedor).toBe("caffeinate");
    expect(capacidad.disponible).toBe(false);
    expect(capacidad.requiereCorriente).toBe(true);
  });

  it("Linux y servidor tienen su propio proveedor", () => {
    expect(capacidadInsomne("linux").proveedor).toBe("systemd-inhibit");
    expect(capacidadInsomne("linux").disponible).toBe(true);
    expect(capacidadInsomne("server").proveedor).toBe("siempre");
  });

  it("la señal de presencia marca la sesión activa y hasta cuándo", () => {
    const hasta = new Date(AHORA + 2 * 60 * 60_000).toISOString();
    const estado = estadoDesdeSesionInsomnia({ endsAt: hasta }, AHORA);
    expect(estado.activo).toBe(true);
    expect(estado.hasta).toBe(hasta);
    expect(estado.proveedor).toBe("insomnia");
    expect(debeSoltarTrabajo(estado, AHORA)).toBe(false);
  });

  it("una sesión vencida no se finge activa", () => {
    const hasta = new Date(AHORA - 1_000).toISOString();
    const estado = estadoDesdeSesionInsomnia({ endsAt: hasta }, AHORA);
    expect(estado.activo).toBe(false);
    expect(estado.motivo).toContain("vencida");
    expect(debeSoltarTrabajo(estado, AHORA)).toBe(true);
  });

  it("suelta el trabajo cuando quedan menos de 15 minutos", () => {
    const hasta = new Date(AHORA + 10 * 60_000).toISOString();
    const estado = estadoDesdeSesionInsomnia({ endsAt: hasta }, AHORA);
    expect(estado.activo).toBe(true);
    expect(debeSoltarTrabajo(estado, AHORA)).toBe(true);
  });

  it("aplica la política parcial sin apagar lo demás", () => {
    const politica = politicaInsomne({ agentes: false });
    expect(politica.agentes).toBe(false);
    expect(politica.malla).toBe(true);
    expect(politica.biblioteca).toBe(true);
  });
});
