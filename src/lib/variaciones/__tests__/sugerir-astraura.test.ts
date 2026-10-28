// Pruebas de las sugerencias de Astraura: módulo puro, motor falso, sin red ni disco.
import { describe, it, expect } from "vitest";
import { CUANTAS_SUGERIDAS, pruebasAdnGeneral, sugerirVariaciones } from "../sugerir-astraura";
import type { AdnContexto, MotorAstraura, VariacionCandidata } from "../sugerir-astraura";

/** Un peldaño falso que registra lo que se le pide y contesta con lo suyo (o se cae). */
function motor(id: string, peldano: number, candidatas: VariacionCandidata[] | Error, registro?: string[]): MotorAstraura {
  return {
    id, peldano,
    generarVariaciones: async (pedido) => {
      registro?.push(`${id}:${pedido.cuantas}:${pedido.familia}:${JSON.stringify(pedido.contexto)}`);
      if (candidatas instanceof Error) throw candidatas;
      return candidatas;
    },
  };
}

/** El ADN de StarSeed OS, lo que lee el módulo (memory/diseno/adn/starseed-os/dna.json). */
const ADN_OS: AdnContexto = {
  slug: "starseed-os",
  paleta: [{ rol: "anchor", hex: "#DC143C" }, { rol: "neutro", hex: "#F8F9FA" }],
};

const VALIDA_UNO: VariacionCandidata = { titulo: "La píldora respira", payload: { acento: "#DC143C", superficie: "--surface-cristal" }, etiquetas: ["píldora"] };

describe("sugerirVariaciones", () => {
  it("una clave que no es clave de elemento devuelve el motivo y no llama a nada", async () => {
    const marcas: string[] = [];
    const r = await sugerirVariaciones("no vale ¡!", {}, { motores: [motor("local", 1, [VALIDA_UNO], marcas)] });
    expect(r).toMatchObject({ ok: false, desechadas: 0 });
    if (!r.ok) expect(r.motivo).toMatch(/no es una clave de elemento/i);
    expect(marcas).toEqual([]);
  });

  it("el peldaño local (1) manda: la nube ni responde, y el pedido lleva familia, contexto y las 3", async () => {
    const marcas: string[] = [], nube: string[] = [];
    const r = await sugerirVariaciones("tema:synthwave-horizon", { cristal: 18 }, {
      motores: [motor("astraura-nube", 5, [VALIDA_UNO], nube), motor("astraura-158-local", 1, [VALIDA_UNO], marcas)], adn: ADN_OS,
    });
    expect(r).toMatchObject({ ok: true, motor: "astraura-158-local", desechadas: 0 });
    expect(r.ok && r.variaciones[0].motivo).toMatch(/Astraura \(astraura-158-local, peldaño 1\).*ADN «starseed-os»/);
    expect(marcas).toEqual(["astraura-158-local:3:tema:{\"cristal\":18}"]);
    expect(nube).toEqual([]);
  });

  it("ante un peldaño caído hay relevo en la escalera: el siguiente responde, sin insistir", async () => {
    const marcas: string[] = [], nube: string[] = [];
    const r = await sugerirVariaciones("widget:clima", null, {
      motores: [motor("astraura-158-local", 1, new Error("429"), marcas), motor("astraura-nube", 2, [VALIDA_UNO], nube)],
    });
    expect(r).toMatchObject({ ok: true, motor: "astraura-nube" });
    expect(marcas).toEqual([]);
    expect(nube).toEqual(["astraura-nube:3:widget:null"]);
  });

  it("el relevo salta la lista vacía y una escalera entera caída no sugiere nada", async () => {
    const vacio = await sugerirVariaciones("fondo:aurora", null, {
      motores: [motor("local", 1, []), motor("nube", 2, [VALIDA_UNO])], adn: ADN_OS,
    });
    expect(vacio).toMatchObject({ ok: true, motor: "nube" });
    const caida = await sugerirVariaciones("fondo:aurora", null, {
      motores: [motor("local", 1, new Error("402")), motor("nube", 2, [])],
    });
    expect(caida).toMatchObject({ ok: false, desechadas: 0 });
    if (!caida.ok) expect(caida.motivo).toMatch(/Astraura: ninguna sugerencia disponible/);
  });

  it("desecha lo que no pasa validar.ts ni las pruebas del ADN, y cuenta lo desechado", async () => {
    const conToken: VariacionCandidata = { titulo: "Trae la clave", payload: { apikey: "Bearer abort9zz01234" } };
    const hexSuelto: VariacionCandidata = { titulo: "Neón libre", payload: { color: "#FF11AA" } };
    const r = await sugerirVariaciones("tema:synthwave-horizon", null, {
      motores: [motor("local", 1, [conToken, hexSuelto, VALIDA_UNO])], adn: ADN_OS,
    });
    expect(r).toMatchObject({ ok: true, desechadas: 2 });
    if (r.ok) expect(r.variaciones).toEqual([
      expect.objectContaining({ titulo: "La píldora respira", motor: "local", payload: { acento: "#DC143C", superficie: "--surface-cristal" } }),
    ]);
  });

  it("si nadie pasa, el motivo dice el último peldaño probado; sin ADN solo manda validar", async () => {
    const rechazado: VariacionCandidata = { titulo: "Neón libre", payload: { color: "#FF11AA" } };
    const todoRechazado = await sugerirVariaciones("tema:synthwave-horizon", null, {
      motores: [motor("local", 1, [rechazado, rechazado])], adn: ADN_OS,
    });
    expect(todoRechazado).toMatchObject({ ok: false, desechadas: 2 });
    if (!todoRechazado.ok) expect(todoRechazado.motivo).toMatch(/falla el ADN.*hex suelto/);
    const sinAdn = await sugerirVariaciones("tema:synthwave-horizon", null, { motores: [motor("local", 1, [rechazado])] });
    expect(sinAdn).toMatchObject({ ok: true, motor: "local" });
  });

  it("se pide tres y nunca más: la escalera generosa se corta y las pruebas propias valen", async () => {
    expect(CUANTAS_SUGERIDAS).toBe(3);
    const generosas: VariacionCandidata[] = [1, 2, 3, 4, 5].map((n) => ({ titulo: `Variación ${n}`, payload: { accento: "#DC143C" } }));
    const r = await sugerirVariaciones("tema:tokyo-midnight", null, {
      motores: [motor("local", 1, generosas)], adn: ADN_OS,
      probarAdn: (payload) => ((payload as { accento?: string }).accento === "#DC143C" ? [] : ["no encaja"]),
    });
    expect(r.ok && r.variaciones.map((v) => v.titulo).join(",")).toBe("Variación 1,Variación 2,Variación 3");
  });
});

describe("pruebasAdnGeneral", () => {
  it("los hex de la paleta pasan y los sueltos vuelven con el motivo del ADN", () => {
    expect(pruebasAdnGeneral({ a: "#DC143C", centro: "--surface-cristal" }, ADN_OS)).toEqual([]);
    expect(pruebasAdnGeneral({ a: "#FF11AA", b: "#dc143c" }, ADN_OS)).toEqual([
      "Adn: «#FF11AA» hex suelto fuera de la paleta del ADN; usa tokens o la paleta del contexto",
    ]);
  });

  it("sin paleta no juzga y como mucho cuatro sueltos, aunque el payload traiga más", () => {
    expect(pruebasAdnGeneral("#FF11AA", { slug: "genesis" })).toEqual([]);
    const goteo = { lista: Array.from({ length: 9 }, (_n, i) => `#A0000${i}`) };
    expect(pruebasAdnGeneral(goteo, ADN_OS).length).toBeLessThanOrEqual(4);
  });
});
