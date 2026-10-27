import { afterAll, describe, expect, it } from "vitest";
import { botPredeterminado } from "../predeterminado";
import {
  CLAVE_PREFERENCIAS,
  bloqueTono,
  preferenciasPersona,
  sanearPreferencias,
  situacionDesdeTexto,
} from "../adaptadores/tono-chat";

const BOT = botPredeterminado("perfil-tono", "cuenta-tono");
const AGENTE = { params: { energia: 100 }, emotions: {} };

const previo: Storage | undefined = globalThis.localStorage;
/** Simula el almacén del navegador sin tocar ningún módulo de Node. */
function conAlmacen(json: string | null) {
  (globalThis as { localStorage?: Storage }).localStorage =
    { getItem: () => json } as unknown as Storage;
}
afterAll(() => {
  (globalThis as { localStorage?: Storage }).localStorage = previo;
});

describe("bloque de tono del chat (BOT1011S)", () => {
  it("arranca con «TONO DEL BOT:», cabe en ≤ 6 líneas y acaba con los límites honestos", () => {
    const lineas = bloqueTono(BOT).split("\n");
    expect(lineas[0]).toBe("TONO DEL BOT:");
    expect(lineas.length).toBeLessThanOrEqual(6);
    expect(lineas[lineas.length - 1]).toContain("Eres una IA");
  });
  it.each([CLAVE_PREFERENCIAS])("la clave de preferencias es la del contrato", (clave) => {
    expect(clave).toBe("starseed.astraura.bots.preferencias.v1");
  });

  it("con agente encarnado la energía sube a «alta»; sin agente manda la base del bot", () => {
    const sin = bloqueTono(BOT, undefined, { sesion: "privada" });
    const con = bloqueTono(BOT, AGENTE, { sesion: "privada" });
    expect(sin).toContain("energía media");
    expect(con).toContain("energía alta");
  });

  it("las preferencias de la persona se aplican al bloque (rasgos fijados, sinHumor, brevedad)", () => {
    conAlmacen(JSON.stringify({ rasgos: { formalidad: 1 }, sinHumor: true, brevedad: true }));
    const b = bloqueTono(BOT);
    expect(b).toContain("formalidad alta");
    expect(b).toContain("humor baja");
    expect(b).toContain("brevedad alta");
  });

  it("preferenciasPersona lee rasgos acotados y banderas firmes de la clave propia", () => {
    conAlmacen(JSON.stringify({ sinHumor: true, brevedad: true, rasgos: { humor: 7, formalidad: -2 } }));
    const p = preferenciasPersona();
    expect(p.sinHumor).toBe(true);
    expect(p.brevedad).toBe(true);
    expect(p.rasgos?.humor).toBe(1);
    expect(p.rasgos?.formalidad).toBe(0);
  });

  it("basura en preferencias no lanza: JSON roto, tipos raros o almacén ausente", () => {
    conAlmacen("{rasgos..roto");
    expect(preferenciasPersona()).toEqual({});
    conAlmacen(JSON.stringify({ rasgos: "lo tomo como bandera", sinHumor: 0, brevedad: null }));
    expect(sanearPreferencias(preferenciasPersona())).toEqual({});
    (globalThis as { localStorage?: Storage }).localStorage = undefined;
    expect(preferenciasPersona()).toEqual({});
  });

  it("la situación viene de palabras clave: situación crisis baja el humor del bloque", () => {
    expect(situacionDesdeTexto("queremos jugar a un juego")).toBe("juego");
    expect(situacionDesdeTexto("explícame este apartado")).toBe("aprendizaje");
    expect(situacionDesdeTexto("hay plazo de entrega del trabajo")).toBe("trabajo");
    expect(situacionDesdeTexto("esto es una crisis, emergencia")).toBe("crisis");
    const crisis = bloqueTono(BOT, undefined, { sesion: "privada", situacion: "crisis" });
    expect(crisis).toContain("humor baja");
  });
});
