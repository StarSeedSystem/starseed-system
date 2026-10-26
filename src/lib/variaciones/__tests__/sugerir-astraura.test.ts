import { describe, it, expect } from "vitest";
import { sugerirVariaciones, evaluarPruebaAdn, CANTIDAD_SUGERENCIAS, ESCALERA_LOCAL_PRIMERO, type PeticionAstraura, type RespuestaAstraura, type CandidataVariacion } from "../sugerir-astraura";

const adn = {
  nombre: "Astraura",
  pruebas: [
    { id: "p3", comprobacion: "sin text-white", auto: true },
    { id: "p5", comprobacion: "max 3 tamanos", auto: true },
    { id: "p6", comprobacion: "cuerpo <=65 chars", auto: true },
    { id: "p7", comprobacion: "sin adorno", auto: false },
  ],
};
const capturado = { tamanos: [12, 13], texto: "Cristal técnico" };
const candidata = (titulo: string, payload: unknown): CandidataVariacion => ({ titulo, payload, etiquetas: ["aurora"], licencia: "MIT" });

function routerFalso(variaciones: CandidataVariacion[], via = "Astraura local") {
  const peticiones: PeticionAstraura[] = [];
  const enrutador = async (p: PeticionAstraura): Promise<RespuestaAstraura> => {
    peticiones.push(p);
    return { ok: true, variaciones, via };
  };
  return { enrutador, peticiones };
}

describe("sugerirVariaciones", () => {
  it("pide 3 variaciones con la escalera local primero y sin pago", async () => {
    const { enrutador, peticiones } = routerFalso([]);
    await sugerirVariaciones("widget:clima", { payload: capturado }, { enrutador });
    expect(peticiones[0].cantidad).toBe(CANTIDAD_SUGERENCIAS);
    expect(peticiones[0].escalera).toEqual([...ESCALERA_LOCAL_PRIMERO]);
    expect(peticiones[0].escalera).not.toContain("pago");
    expect(peticiones[0].familia).toBe("widget");
    expect(peticiones[0].permitirPago).toBe(false);
  });

  it("solo añade el peldaño de pago cuando se permite", async () => {
    const { enrutador, peticiones } = routerFalso([]);
    await sugerirVariaciones("widget:clima", { payload: capturado }, { enrutador, permitirPago: true });
    expect(peticiones[0].escalera).toContain("pago");
    expect(peticiones[0].escalera.at(-1)).toBe("pago");
  });

  it("devuelve solo las que pasan el validador y el ADN, con su motivo", async () => {
    const { enrutador } = routerFalso([
      candidata("Buena", { tamanos: [12, 13], texto: "Cristal" }),
      candidata("Demasiados tamaños", { tamanos: [10, 11, 12, 13], texto: "Cristal" }),
      candidata("Texto largo", { tamanos: [12], texto: "Un cuerpo de texto largo y legible ".repeat(3) }),
    ]);
    const res = await sugerirVariaciones("widget:clima", { payload: capturado, adn }, { enrutador, ahora: () => 123 });
    expect(res.ok).toBe(true);
    expect(res.variaciones).toHaveLength(1);
    expect(res.variaciones[0].titulo).toBe("Buena");
    expect(res.variaciones[0].motivo).toContain("Astraura");
    expect(res.variaciones[0].pruebas).toEqual(["p3", "p5", "p6"]);
    expect(res.variaciones[0].sugeridaEn).toBe(123);
    expect(res.descartadas.map((d) => d.titulo)).toEqual(["Demasiados tamaños", "Texto largo"]);
    expect(res.descartadas[1].motivos[0]).toContain("ADN Astraura p6");
  });

  it("descarta por el validador (secretos y URLs no https) sin romperse", async () => {
    const { enrutador } = routerFalso([
      candidata("Token", { texto: "sk-fake123def456ghi789", tamanos: [12] }),
      candidata("Http", { enlace: "http://example.com/x.json", tamanos: [12] }),
    ]);
    const res = await sugerirVariaciones("widget:clima", { payload: capturado, adn }, { enrutador });
    expect(res.ok).toBe(false);
    expect(res.variaciones).toHaveLength(0);
    expect(res.descartadas).toHaveLength(2);
    expect(res.descartadas[0].motivos.join(" ")).toMatch(/Privacidad|token/i);
    expect(res.descartadas[1].motivos.join(" ")).toMatch(/Url/i);
  });

  it("marca el código con aislamiento", async () => {
    const { enrutador } = routerFalso([candidata("Código", { html: "<span>φ</span>", tamanos: [12] })]);
    const res = await sugerirVariaciones("herramienta:photocraft", { payload: capturado, codigo: true, adn }, { enrutador });
    expect(res.variaciones[0].requiereAislamiento).toBe(true);
  });

  it("no llama al enrutador si el estado capturado ya lleva secretos", async () => {
    let llamadas = 0;
    const enrutador = async (): Promise<RespuestaAstraura> => { llamadas += 1; return { ok: true, variaciones: [] }; };
    const res = await sugerirVariaciones("widget:clima", { payload: { "starseed.dock.items.v2": {} } }, { enrutador });
    expect(llamadas).toBe(0);
    expect(res.ok).toBe(false);
    expect(res.motivo).toContain("no se puede publicar");
  });

  it("propaga el fallo del enrutador y una respuesta sin variaciones válidas", async () => {
    const fallo = await sugerirVariaciones("widget:clima", { payload: capturado }, { enrutador: async () => ({ ok: false, motivo: "429: sin cuota" }) });
    expect(fallo.ok).toBe(false);
    expect(fallo.motivo).toBe("429: sin cuota");
    const vacio = await sugerirVariaciones("widget:clima", { payload: capturado, adn }, { enrutador: routerFalso([]).enrutador });
    expect(vacio.ok).toBe(false);
    expect(vacio.motivo).toContain("ninguna variación");
  });

  it("rechaza claves que no son <familia>:<id> sin llamar a Astraura", async () => {
    let llamadas = 0;
    const enrutador = async (): Promise<RespuestaAstraura> => { llamadas += 1; return { ok: true, variaciones: [] }; };
    const res = await sugerirVariaciones("clima", { payload: capturado }, { enrutador });
    expect(llamadas).toBe(0);
    expect(res.motivo).toContain("<familia>:<id>");
  });
});

describe("evaluarPruebaAdn", () => {
  it("mide tamaños, radio, contraste y negativas; lo no medible no aplica", () => {
    expect(evaluarPruebaAdn({ id: "a", comprobacion: "max 3 tamanos" }, { tamanos: [10, 11, 12, 13] })).toMatchObject({ aplica: true, pasa: false });
    expect(evaluarPruebaAdn({ id: "b", comprobacion: "radio 0.85rem" }, { radio: 0.85 })).toMatchObject({ aplica: true, pasa: true });
    expect(evaluarPruebaAdn({ id: "c", comprobacion: "contraste >=4.5:1" }, { colores: ["#0B0F14", "#E5E7EB"] })).toMatchObject({ aplica: true, pasa: true });
    expect(evaluarPruebaAdn({ id: "d", comprobacion: "sin neon" }, { estilos: ["neon suave"] })).toMatchObject({ aplica: true, pasa: false });
    expect(evaluarPruebaAdn({ id: "f", comprobacion: "sin text-white" }, { texto: "text-white" })).toMatchObject({ aplica: true, pasa: false });
    expect(evaluarPruebaAdn({ id: "e", comprobacion: "gesto sagrado" }, {})).toMatchObject({ aplica: false, pasa: true });
  });
});
