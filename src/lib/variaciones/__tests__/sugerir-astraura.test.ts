import { describe, it, expect } from "vitest";
import { sugerirVariaciones, evaluarPruebaAdn, type AdnContexto, type PeticionAstraura, type VariacionSugerida } from "../sugerir-astraura";

const ADN: AdnContexto = {
  meta: { slug: "astraura", nombre: "Astraura" },
  prohibiciones: ["hex sueltos"],
  pruebas: [
    { id: "p1", comprobacion: "acento cian <15%", auto: true },
    { id: "p7", comprobacion: "contraste >=4.5:1", auto: true },
    { id: "p8", comprobacion: "dianas >=44px", auto: false },
  ],
};
const METRICAS = { acento_porcentaje: 12, contraste: 5 };
const variacion = (extra: Partial<VariacionSugerida> = {}): VariacionSugerida => ({
  titulo: "Cristal cian", payload: { radio: 12, color: "var(--primary)" }, metricas: METRICAS, ...extra,
});
function falso(respuesta: unknown, adn: AdnContexto | null = ADN) {
  const peticiones: PeticionAstraura[] = [];
  const deps = { adn, enrutador: async (p: PeticionAstraura) => { peticiones.push(p); return respuesta; } };
  return { peticiones, deps };
}
const contexto = { payload: { radio: 12, color: "var(--primary)" }, etiquetas: [" cristal "] };

describe("sugerirVariaciones", () => {
  it("acepta solo las que pasan el validador y el ADN, y explica cada descarte", async () => {
    const { deps, peticiones } = falso([
      variacion(),
      variacion({ titulo: "Con secreto", payload: { token: "sk-fake123def456ghi789" } }),
      variacion({ titulo: "Bajo contraste", payload: { radio: 4 }, metricas: { acento_porcentaje: 12, contraste: 2 } }),
    ]);
    const r = await sugerirVariaciones("widget:clima", contexto, deps);
    expect(r.ok).toBe(true);
    expect(r.sugerencias).toHaveLength(1);
    expect(r.sugerencias[0].variacion.titulo).toBe("Cristal cian");
    expect(r.sugerencias[0].motivo).toContain("Astraura");
    expect(r.descartadas).toHaveLength(2);
    expect(r.descartadas[0].motivos.join(" ")).toMatch(/Privacidad|token/i);
    expect(r.descartadas[1].motivos.join(" ")).toContain("contraste");
    expect(peticiones[0]).toMatchObject({ clave: "widget:clima", familia: "widget", cuantas: 3, codigo: false, etiquetas: ["cristal"] });
    expect(peticiones[0].adn).toMatchObject({ slug: "astraura", prohibiciones: ["hex sueltos"] });
  });

  it("lee la respuesta del modelo cuando viene en prosa con un bloque JSON", async () => {
    const texto = "Claro:\n```json\n[" + JSON.stringify(variacion()) + "]\n```";
    const { deps } = falso(texto);
    const r = await sugerirVariaciones("tema:aurora", { payload: { fondo: "cristal" } }, deps);
    expect(r.ok).toBe(true);
    expect(r.sugerencias[0].variacion.titulo).toBe("Cristal cian");
  });

  it("no llama al enrutador con una clave inválida ni sin payload capturado", async () => {
    const { deps, peticiones } = falso([]);
    expect((await sugerirVariaciones("no-es-clave", contexto, deps)).ok).toBe(false);
    expect((await sugerirVariaciones("widget:clima", { payload: undefined }, deps)).ok).toBe(false);
    expect(peticiones).toHaveLength(0);
  });

  it("no rompe si el enrutador falla y lo cuenta como error", async () => {
    const deps = { enrutador: async () => { throw new Error("429 sin cuota"); } };
    const r = await sugerirVariaciones("widget:clima", contexto, deps);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("no respondió");
    expect(r.motivo).toContain("429");
  });

  it("en un contexto privado no envía el payload capturado", async () => {
    const { deps, peticiones } = falso([]);
    await sugerirVariaciones("mensaje:editor", { payload: { texto: "privado" }, privado: true }, deps);
    expect(peticiones[0]).toMatchObject({ privado: true, payload: null });
  });

  it("las familias de código exigen aislamiento y el tope es de tres", async () => {
    const codigo = variacion({ payload: { html: "<p>hola</p>" }, metricas: METRICAS });
    const { deps } = falso([codigo, codigo, codigo, variacion({ titulo: "Otra", payload: { radio: 4 } })]);
    const r = await sugerirVariaciones("atomo:video-html", { payload: { html: "<p>x</p>" }, codigo: true }, deps);
    expect(r.sugerencias[0].requiereAislamiento).toBe(true);
    expect(r.sugerencias[0].motivo).toContain("aislada");
    expect(r.sugerencias.length + r.descartadas.length).toBe(3);
    expect(r.descartadas.some((d) => d.motivos.some((m) => m.includes("Duplicada")))).toBe(true);
  });

  it("una prueba automática sin métrica descarta la variación; la manual no bloquea", async () => {
    const { deps } = falso([variacion({ metricas: { contraste: 5 } })]);
    const r = await sugerirVariaciones("widget:clima", contexto, deps);
    expect(r.ok).toBe(false);
    expect(r.descartadas[0].motivos.join(" ")).toContain("no se pudo medir");
  });
});

describe("evaluarPruebaAdn", () => {
  it("mide p2 a p8 con las métricas del ADN", () => {
    const casos = [
      [{ id: "p2", comprobacion: "max 3 tamanos" }, { numero_tamanos: 4 }, false],
      [{ id: "p3", comprobacion: "titular/cuerpo >=6" }, { ratio_titular_cuerpo: 7 }, true],
      [{ id: "p4", comprobacion: "texto >=28px" }, { tamanio_minimo_texto: 20 }, false],
      [{ id: "p5", comprobacion: "cuerpo <=65 caracteres" }, { longitud_maxima_linea: 40 }, true],
      [{ id: "p6", comprobacion: "jugada rara 1 vez" }, { jugada_rara_veces: 2 }, false],
      [{ id: "p7", comprobacion: "contraste >=4.5:1" }, { contraste: 5 }, true],
      [{ id: "p8", comprobacion: "dianas >=44px" }, { tamanio_minimo_diana: 30 }, false],
    ] as const;
    for (const [prueba, metricas, pasa] of casos) {
      const motivo = evaluarPruebaAdn({ ...prueba, auto: true }, metricas);
      if (pasa) expect(motivo).toBeNull(); else expect(motivo).toContain("Prueba");
    }
  });
  it("acepta el rango de acento y rechaza una prueba automática desconocida", () => {
    expect(evaluarPruebaAdn({ id: "p1", comprobacion: "acento 20-30%", auto: true }, { acento_porcentaje: 25 })).toBeNull();
    expect(evaluarPruebaAdn({ id: "p9", comprobacion: "otra cosa", auto: true }, {})).toContain("sin comprobador");
  });
});
