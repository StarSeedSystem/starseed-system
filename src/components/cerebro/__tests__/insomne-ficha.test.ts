import { describe, it, expect } from "vitest";
import { esMacAppleSilicon, leerNeuronaInsomne, plataformaInsomne } from "../insomne-ficha";

const AHORA = Date.parse("2026-10-28T12:00:00Z");
const MAC = { platform: "macOS", gpuRenderer: "Apple M2", gpuVendor: "Apple" };
const INTEL = { platform: "macOS", gpuRenderer: "Intel Iris Plus", gpuVendor: "Intel" };

describe("plataformaInsomne", () => {
  it("traduce las plataformas del navegador a las del contrato", () => {
    expect(plataformaInsomne("macOS")).toBe("macos");
    expect(plataformaInsomne("iPadOS")).toBe("ios");
    expect(plataformaInsomne("Android")).toBe("android");
    expect(plataformaInsomne("Windows")).toBe("windows");
    expect(plataformaInsomne("Linux")).toBe("linux");
  });

  it("un servidor no depende de la plataforma: ya está siempre encendido", () => {
    expect(plataformaInsomne("Linux", "server")).toBe("servidor");
  });

  it("lo que no reconoce no se inventa", () => {
    expect(plataformaInsomne("")).toBe("otro");
    expect(plataformaInsomne("FreeBSD")).toBe("freebsd");
  });
});

describe("esMacAppleSilicon", () => {
  it("detecta Apple Silicon por el GPU medido en el navegador", () => {
    expect(esMacAppleSilicon(MAC)).toBe(true);
    expect(esMacAppleSilicon({ platform: "macOS", gpuRenderer: "Apple M3 Pro" })).toBe(true);
    expect(esMacAppleSilicon({ platform: "macOS", gpuRenderer: "Apple GPU", gpuVendor: "Apple Inc." })).toBe(true);
  });

  it("no confunde una Mac Intel ni otra plataforma con Apple Silicon", () => {
    expect(esMacAppleSilicon(INTEL)).toBe(false);
    expect(esMacAppleSilicon({ platform: "Linux", gpuRenderer: "Apple M2" })).toBe(false);
  });
});

describe("leerNeuronaInsomne", () => {
  it("una Mac Apple Silicon compatible usa Insomnia aunque no tenga sesión", () => {
    const l = leerNeuronaInsomne({ kind: "laptop", capabilities: MAC }, AHORA);
    expect(l.capacidad.proveedor).toBe("insomnia");
    expect(l.capacidad.disponible).toBe(true);
    expect(l.estado.activo).toBe(false);
  });

  it("una Mac Intel solo puede con caffeinate y corriente", () => {
    const l = leerNeuronaInsomne({ capabilities: INTEL }, AHORA);
    expect(l.capacidad.proveedor).toBe("caffeinate");
    expect(l.capacidad.disponible).toBe(false);
    expect(l.capacidad.requiereCorriente).toBe(true);
  });

  it("Linux y servidor tienen su propio proveedor", () => {
    expect(leerNeuronaInsomne({ capabilities: { platform: "Linux" } }, AHORA).capacidad.proveedor).toBe("systemd-inhibit");
    expect(leerNeuronaInsomne({ kind: "server", capabilities: { platform: "Linux" } }, AHORA).capacidad.proveedor).toBe("siempre");
  });

  it("la señal de presencia marca la sesión activa y hasta cuándo", () => {
    const hasta = AHORA + 2 * 60 * 60_000;
    const l = leerNeuronaInsomne({ capabilities: MAC, insomne: { hasta, proveedor: "insomnia" } }, AHORA);
    expect(l.estado.activo).toBe(true);
    expect(l.estado.hasta).toBe(new Date(hasta).toISOString());
    expect(l.estado.proveedor).toBe("insomnia");
    expect(l.soltarTrabajo).toBe(false);
  });

  it("una sesión vencida no se finge activa", () => {
    const l = leerNeuronaInsomne({ capabilities: MAC, insomne: { hasta: AHORA - 1_000, proveedor: "insomnia" } }, AHORA);
    expect(l.estado.activo).toBe(false);
    expect(l.estado.hasta).toBeNull();
    expect(l.soltarTrabajo).toBe(false);
  });

  it("suelta el trabajo cuando quedan menos de 15 minutos", () => {
    const l = leerNeuronaInsomne({
      capabilities: MAC,
      insomne: { hasta: AHORA + 10 * 60_000, proveedor: "insomnia" },
    }, AHORA);
    expect(l.estado.activo).toBe(true);
    expect(l.soltarTrabajo).toBe(true);
  });

  it("aplica la política parcial sin apagar lo demás", () => {
    const l = leerNeuronaInsomne({ capabilities: MAC, politica: { agentes: false } }, AHORA);
    expect(l.politica.agentes).toBe(false);
    expect(l.politica.malla).toBe(true);
    expect(l.politica.biblioteca).toBe(true);
  });
});
