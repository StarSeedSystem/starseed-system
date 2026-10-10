import { describe, expect, it } from "vitest";
import { AJUSTES, estadoInicialCalidad, nivelInicial, perfilDeNivel, refrescoInferior, siguienteCalidad, type EstadoCalidad } from "../calidad";
import { NIVELES_CALIDAD, indiceNivel } from "../tipos";

describe("nivelInicial", () => {
  it("Quest 3 sube y Quest 2 baja respecto a la base de Quest", () => {
    const q = nivelInicial({ plataforma: "quest" });
    expect(indiceNivel(nivelInicial({ plataforma: "quest", modelo: "quest-3" }))).toBe(indiceNivel(q) + 1);
    expect(indiceNivel(nivelInicial({ plataforma: "quest", modelo: "quest-2" }))).toBe(indiceNivel(q) - 1);
  });
  it("el gpuTier no manda en un visor autónomo, sí en un escritorio", () => {
    expect(nivelInicial({ plataforma: "quest", gpuTier: 0 })).toBe(nivelInicial({ plataforma: "quest" }));
    expect(indiceNivel(nivelInicial({ plataforma: "escritorio", gpuTier: 3 }))).toBeGreaterThan(indiceNivel(nivelInicial({ plataforma: "escritorio", gpuTier: 0 })));
  });
  it("poca memoria, batería baja y calor bajan; nunca sale del rango", () => {
    const n = nivelInicial({ plataforma: "quest", memoriaGB: 2, bateria: 0.1, cargando: false, termica: "critical" });
    expect(NIVELES_CALIDAD).toContain(n);
    expect(n).toBe("minima");
    expect(nivelInicial({ plataforma: "escritorio", gpuTier: 3, modelo: null })).not.toBeUndefined();
  });
  it("cada nivel tiene un perfil y los perfiles crecen", () => {
    const esc = NIVELES_CALIDAD.map((n) => perfilDeNivel(n).escalaResolucion);
    expect([...esc].sort((a, b) => a - b)).toEqual(esc);
    expect(perfilDeNivel("minima").foveacion).toBeGreaterThan(perfilDeNivel("maxima").foveacion);
  });
});

/** Alimenta fotogramas de `dtMs` durante `segundos` y devuelve el estado final y los cambios habidos. */
function correr(e: EstadoCalidad, t0: number, segundos: number, dtMs: number, hz = 72, soportados: number[] = []) {
  let estado = e;
  const cambios: { t: number; tipo: string; de: string; a: string }[] = [];
  let t = t0;
  for (let i = 0; i < (segundos * 1000) / dtMs; i += 1) {
    t += dtMs;
    const r = siguienteCalidad(estado, { t, dt: dtMs }, hz, soportados);
    estado = r.estado;
    if (r.cambio) cambios.push({ t, tipo: r.cambio.tipo, de: r.cambio.de, a: r.cambio.a });
  }
  return { estado, cambios, t };
}

describe("histéresis de la calidad dinámica", () => {
  const lento = 1000 / 72 * 1.6; // 22 ms: no llega al fotograma de 72 Hz (13,9 ms)
  const holgado = 1000 / 72 * 0.4;

  it("durante la gracia inicial no cambia nada, aunque vaya lento", () => {
    const r = correr(estadoInicialCalidad("alta"), 0, (AJUSTES.graciaMs - 200) / 1000, lento);
    expect(r.cambios).toHaveLength(0);
  });
  it("si va lento, baja un nivel y dice por qué", () => {
    const r = correr(estadoInicialCalidad("alta"), 0, 6, lento);
    expect(r.cambios[0]).toMatchObject({ tipo: "nivel", de: "alta", a: "media" });
  });
  it("tras bajar hay cerrojo: no vuelve a subir aunque vaya sobrado", () => {
    const bajado = correr(estadoInicialCalidad("alta"), 0, 6, lento);
    const luego = correr(bajado.estado, bajado.t, 12, holgado);
    expect(luego.cambios.filter((c) => c.a === "alta")).toHaveLength(0);
  });
  it("con holgura sostenida y cerrojo vencido sube, pero nunca por encima del techo", () => {
    const e = { ...estadoInicialCalidad("baja"), nivel: "minima" as const };
    const r = correr(e, 0, 120, holgado);
    const niveles = r.cambios.map((c) => c.a);
    expect(niveles).toContain("baja");
    expect(niveles).toContain("media");
    expect(niveles).not.toContain("alta");
  });
  it("no oscila: un tirón puntual no baja, y alternar lento/holgado cada segundo no produce vaivén", () => {
    let e = estadoInicialCalidad("media");
    let t = 0;
    const cambios: string[] = [];
    for (let s = 0; s < 60; s += 1) {
      const dt = s % 2 === 0 ? lento : holgado;
      for (let i = 0; i < 72; i += 1) {
        t += dt;
        const r = siguienteCalidad(e, { t, dt }, 72, []);
        e = r.estado;
        if (r.cambio) cambios.push(`${r.cambio.de}>${r.cambio.a}`);
      }
    }
    expect(cambios.length).toBeLessThanOrEqual(2);
  });
  it("tres bajadas en un minuto activan el cerrojo largo", () => {
    let e = estadoInicialCalidad("maxima");
    let t = 0;
    let largo = false;
    for (let i = 0; i < 4000 && !largo; i += 1) {
      t += lento;
      const r = siguienteCalidad(e, { t, dt: lento }, 72, []);
      e = r.estado;
      if (e.bajadas.length >= AJUSTES.bajadasParaCerrojoLargo) largo = e.cerrojoHasta - t > AJUSTES.cerrojoTrasBajarMs;
    }
    expect(largo).toBe(true);
  });
  it("en el nivel mínimo y aun así lento, baja el refresco al siguiente que ofrece el visor", () => {
    const e = estadoInicialCalidad("minima");
    const r = correr(e, 0, 8, 1000 / 90 * 1.7, 90, [72, 80, 90]);
    expect(r.cambios.find((c) => c.tipo === "refresco")).toMatchObject({ de: "90 Hz", a: "80 Hz" });
  });
  it("refrescoInferior devuelve null si ya es el más bajo", () => {
    expect(refrescoInferior(72, [72, 90])).toBeNull();
    expect(refrescoInferior(120, [72, 90, 120])).toBe(90);
  });
  it("un dt absurdo (pestaña dormida) no tira la calidad", () => {
    const r = siguienteCalidad(estadoInicialCalidad("alta"), { t: 10_000, dt: 5000 }, 72, []);
    expect(r.cambio).toBeNull();
  });
});
