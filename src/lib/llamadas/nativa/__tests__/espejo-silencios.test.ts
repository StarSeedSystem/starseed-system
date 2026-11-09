import { describe, expect, it, vi } from "vitest";
import { crearEspejoSilencios } from "../espejo-silencios";
import { crearSilencio, serializarSilencios, type Silencio } from "../../silencio-llamadas";

const AHORA = 1_800_000_000_000;
const local = crearSilencio({ ambito: "persona", clave: "u1", duracion: "1h", ahora: AHORA, id: "a" })!;
const nativo = crearSilencio({ ambito: "medio", clave: "internet", duracion: "8h", ahora: AHORA, id: "b" })!;

describe("espejo de silencios", () => {
  it("manda la lista y adopta la fusión de Rust", async () => {
    let guardado: readonly Silencio[] = [];
    const llamar = vi.fn(async () => ({ ok: true, valor: serializarSilencios([local, nativo]) }));
    const e = crearEspejoSilencios({ llamar, leer: () => [local], guardar: (l) => { guardado = l; }, suscribir: () => () => {}, ahora: () => AHORA });
    expect(await e.sincronizar()).toBe(true);
    expect(llamar).toHaveBeenCalledTimes(1);
    expect(guardado.map((s) => s.id).sort()).toEqual(["a", "b"]);
    e.parar();
  });
  it("si Rust no contesta no lanza", async () => {
    const e = crearEspejoSilencios({ llamar: async () => ({ ok: false }), leer: () => [local], guardar: () => {}, suscribir: () => () => {}, ahora: () => AHORA });
    expect(await e.sincronizar()).toBe(false);
    e.parar();
  });
});
