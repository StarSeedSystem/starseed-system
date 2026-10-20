import { describe, expect, it } from "vitest";
import {
  ESTILOS,
  FICHAS,
  PALETAS,
  avanceParticula,
  calidadPorRendimiento,
  colorEnPaleta,
  curvaOrganica,
  energia,
  estiloValido,
  formaParaModo,
  periodos,
  registroParaModo,
  registroPorRuta,
} from "../coreografia";

describe("coreografía de la orbe 4D", () => {
  it("el registro sigue al contexto del OS", () => {
    expect(registroPorRuta("/genesis?pestana=procesos")).toBe("genesis");
    expect(registroPorRuta("/agent")).toBe("astraura");
    expect(registroPorRuta("/red-mesh")).toBe("malla");
    expect(registroPorRuta("/escritorios")).toBe("trinity");
    expect(registroPorRuta("/")).toBe("trinity");
    expect(registroPorRuta("/protomolecula")).toBe("protomolecula");
    expect(registroPorRuta("/network/politics")).toBe("protomolecula");
    expect(registroPorRuta(null)).toBe("trinity");
  });

  it("cada modo pide su forma; en reposo manda la secuencia del estilo", () => {
    const s = ESTILOS.expresiva.secuencia;
    expect(formaParaModo("cargando", s, 3, false)).toBe("semilla");
    expect(formaParaModo("creando", s, 3, false)).toBe("matriz");
    expect(formaParaModo("hablando", s, 3, false)).toBe("jitterbug");
    expect(formaParaModo("transformando", s, 0, true)).toBe("modelo");
    expect(formaParaModo("transformando", s, 0, false)).toBe(s[0]);
    expect(formaParaModo("reposo", s, s.length + 2, false)).toBe(s[2]);
    expect(formaParaModo("reposo", s, -1, false)).toBe(s[s.length - 1]);
  });

  it("crear es alquimia y hablar es la voz de Astraura", () => {
    expect(registroParaModo("creando", "genesis")).toBe("alquimia");
    expect(registroParaModo("hablando", "protomolecula")).toBe("astraura");
    expect(registroParaModo("hablando", "malla")).toBe("malla");
  });

  it("la energía sube con la atención, la voz y el arrastre y tiene techo φ²", () => {
    const quieta = energia("reposo", 0, 0, 0);
    expect(energia("atento", 1, 0, 0)).toBeGreaterThan(quieta);
    expect(energia("reposo", 0, 1, 0)).toBeGreaterThan(quieta);
    expect(energia("creando", 1, 1, 1)).toBeLessThanOrEqual(2.6181);
    expect(periodos(2, 1).jitterbug).toBeCloseTo(6.5, 9);
  });

  it("la curva orgánica va de 0 a 1 sin pasarse y las partículas llegan todas", () => {
    expect(curvaOrganica(0)).toBeCloseTo(0, 6);
    expect(curvaOrganica(1)).toBeCloseTo(1, 6);
    expect(curvaOrganica(0.5)).toBeGreaterThan(0.5);
    for (let i = 0; i < 144; i++) expect(avanceParticula(1, i)).toBeCloseTo(1, 6);
    expect(avanceParticula(0, 7)).toBeCloseTo(0, 6);
  });

  it("solo colores de la marca y estilos con números de Fibonacci", () => {
    for (const p of Object.values(PALETAS)) for (const c of [...p.colores, p.brillo, p.halo]) expect(c).toMatch(/^#[0-9A-F]{6}$/);
    expect([ESTILOS.sobria.particulas, ESTILOS.expresiva.particulas, ESTILOS.experimental.particulas]).toEqual([89, 144, 233]);
    const c = colorEnPaleta(PALETAS.trinity, 0);
    expect(c.map((x) => Math.round(x * 255))).toEqual([0, 127, 255]);
    expect(estiloValido("experimental")).toBe("experimental");
    expect(estiloValido("raro")).toBe("expresiva");
    expect(Object.keys(FICHAS)).toHaveLength(8);
  });

  it("con cuadros lentos baja la calidad sola", () => {
    expect(calidadPorRendimiento(16, 144)).toEqual({ particulas: 144, caras: true, halo: true });
    expect(calidadPorRendimiento(28, 233).particulas).toBe(89);
    expect(calidadPorRendimiento(40, 144)).toEqual({ particulas: 55, caras: false, halo: false });
  });
});
