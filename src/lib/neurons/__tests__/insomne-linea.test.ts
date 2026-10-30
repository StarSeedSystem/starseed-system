import { describe, it, expect } from "vitest";
import { lineaEstadoInsomne, insomniaInstalada, horaInsomnia, FICHA_INSOMNIA_URL, type LineaEstadoInsomne } from "../insomne-linea";
import type { EstadoInsomne } from "../insomne";

function estado(extra: Partial<EstadoInsomne> = {}): EstadoInsomne {
  return {
    activo: true,
    hasta: "2026-10-27T13:45:00.000Z",
    proveedor: "insomnia",
    motivo: "sesión de Insomnia activa",
    ...extra,
  };
}

describe("insomniaInstalada", () => {
  it("solo la sesion de Insomnia cuenta como instalada", () => {
    expect(insomniaInstalada(estado())).toBe(true);
    expect(insomniaInstalada(estado({ proveedor: "no", activo: false }))).toBe(false);
    expect(insomniaInstalada(estado({ proveedor: "caffeinate" }))).toBe(false);
  });
});

describe("horaInsomnia", () => {
  it("da HH:MM desde un ISO y null si falta o esta roto", () => {
    expect(horaInsomnia("2026-10-27T13:45:00.000Z")).toMatch(/^\d{2}:\d{2}$/);
    expect(horaInsomnia(null)).toBeNull();
    expect(horaInsomnia("no-es-un-instante")).toBeNull();
  });
});

describe("lineaEstadoInsomne", () => {
  it("sesion activa: hasta las HH:MM con Insomnia, sin ficha", () => {
    const linea: LineaEstadoInsomne = lineaEstadoInsomne(estado());
    expect(linea.texto).toMatch(/^sesión activa de Insomnia, siempre disponible hasta las \d{2}:\d{2}$/);
    expect(linea.texto).toContain("Insomnia");
    expect(linea.ficha).toBe(false);
  });

  it("sesion activa sin hora legible: se dice tal cual, sin inventar", () => {
    const linea = lineaEstadoInsomne(estado({ hasta: null }));
    expect(linea.texto).toBe("sesión activa de Insomnia, siempre disponible");
    expect(linea.ficha).toBe(false);
  });

  it("sin sesion: instalada pero sin sesion, sin ficha", () => {
    const linea = lineaEstadoInsomne(estado({ activo: false, hasta: "2026-10-27T09:00:00.000Z", motivo: "sesión de Insomnia vencida" }));
    expect(linea.texto).toContain("sin sesión activa");
    expect(linea.ficha).toBe(false);
  });

  it("Insomnia no instalada: ficha a true y texto claro", () => {
    const linea = lineaEstadoInsomne(estado({ activo: false, hasta: null, proveedor: "no", motivo: "Insomnia no está instalada o no tiene sesión" }));
    expect(linea.texto).toContain("no está instalada");
    expect(linea.ficha).toBe(true);
    expect(FICHA_INSOMNIA_URL).toContain("https://github.com/krishhgg/Insomnia");
  });
});
