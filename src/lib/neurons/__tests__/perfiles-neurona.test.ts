import { describe, expect, it } from "vitest";
import { CLAVES_PERFIL, cambiosSeguros, guardadasDe, previoDe, proponerPerfil, sinPisar, tipoDeAparato, type EntradaAparato } from "../perfiles-neurona";

const PERMISOS = ["compute", "storage", "sync", "agent", "senses", "wake", "terminal", "control", "admin", "screenVoice", "fileRequests"];

describe("NEU1126C · perfiles de neurona", () => {
  it("teléfono → ahorro de batería, relé cargando y Wi‑Fi, sin servidor", () => {
    const p = proponerPerfil({ tipo: "mobile", so: "Android", medio: "android", bateria: { nivel: 0.5 } });
    expect(p.id).toBe("ahorro-bateria");
    expect(p.cambios).toMatchObject({ releCuando: "cargando-wifi", offerStorage: false, offerCompute: false, role: "cerebro" });
    expect(p.porque.length).toBeGreaterThan(1);
  });

  it("tableta → estación de la casa", () => {
    expect(proponerPerfil({ tipo: "tablet", medio: "pwa" }).id).toBe("estacion-casa");
  });

  it("portátil → trabajo, relé enchufado", () => {
    const p = proponerPerfil({ tipo: "laptop", so: "macOS", medio: "escritorio", memoriaGb: 16 });
    expect(p).toMatchObject({ id: "trabajo", cambios: { releCuando: "cargando", offerCompute: true } });
  });

  it("servidor → relé siempre, almacén, cómputo y respaldo", () => {
    const p = proponerPerfil({ tipo: "server", medio: "escritorio", memoriaGb: 32, discoGb: 500 });
    expect(p.cambios).toMatchObject({ releCuando: "siempre", offerStorage: true, offerCompute: true, syncBrains: true, role: "servidor" });
  });

  it("siempre encendido y sin batería se reconoce como servidor", () => {
    expect(tipoDeAparato({ tipo: "desktop", siempreEncendido: true })).toBe("servidor");
    expect(tipoDeAparato({ tipo: "desktop" })).toBe("escritorio");
  });

  it("poco disco o poca memoria quitan almacén o cómputo", () => {
    const p = proponerPerfil({ tipo: "server", memoriaGb: 2, discoGb: 10 });
    expect(p.cambios).toMatchObject({ offerCompute: false, offerStorage: false });
  });

  it("en un navegador no se propone relé", () => {
    const p = proponerPerfil({ tipo: "laptop", medio: "web" });
    expect(p.cambios.releCuando).toBeUndefined();
  });

  it("ningún perfil toca permisos de control, terminal o administración", () => {
    const entradas: EntradaAparato[] = [
      { tipo: "mobile" }, { tipo: "tablet" }, { tipo: "laptop" }, { tipo: "desktop" }, { tipo: "server" }, {},
    ];
    for (const e of entradas) {
      const claves = Object.keys(proponerPerfil(e).cambios);
      for (const k of claves) expect(CLAVES_PERFIL as readonly string[]).toContain(k);
      for (const k of PERMISOS) expect(claves).not.toContain(k);
    }
  });

  it("cambiosSeguros descarta cualquier clave de permisos", () => {
    expect(cambiosSeguros({ agent: true, terminal: true, role: "ambos", releCuando: "siempre" })).toEqual({ role: "ambos", releCuando: "siempre" });
  });

  it("no pisa lo que la persona ya guardó y deja deshacer", () => {
    const cambios = { offerStorage: false, role: "cerebro" as const };
    const guardadas = { role: "servidor" };
    expect(sinPisar(cambios, guardadas)).toEqual({ offerStorage: false });
    expect(previoDe({ offerStorage: false }, guardadas)).toEqual({ offerStorage: null });
  });

  it("guardadasDe lee solo lo guardado y tolera JSON roto", () => {
    expect(guardadasDe(JSON.stringify({ settings: { a: { role: "cerebro" } } }), "a")).toEqual({ role: "cerebro" });
    expect(guardadasDe("{", "a")).toEqual({});
    expect(guardadasDe(null, "a")).toEqual({});
  });
});
