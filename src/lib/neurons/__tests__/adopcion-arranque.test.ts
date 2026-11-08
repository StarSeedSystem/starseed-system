/**
 * (NEU1108A) Antes de crear su fila, un medio nuevo (reinstalación, cambio de origen a 127.0.0.1) adopta
 * en silencio la neurona que ya era SU aparato, solo con una prueba fuerte e inequívoca. Con el caso real
 * de la tableta del 08-11.
 *   NODE_ENV=test npx vitest run src/lib/neurons/__tests__/adopcion-arranque.test.ts
 */
import { describe, expect, it } from "vitest";
import { decidirAdopcionArranque, type FilaArranque } from "../adopcion-arranque";
import type { AparatoRegistro } from "../aparato-registro";

const AHORA = Date.parse("2026-11-08T01:20:00Z");
const NUEVA = "26f5a00d-0000-4000-8000-000000000008";
const HUELLA = "a1a1a1a1b2b2b2b2";
const YO: AparatoRegistro = { v: 1, medio: "android", app: "os", so: "android", equipo: "Samsung SM-X205", huella: HUELLA, version: "0.5.0" };

const BOARD: FilaArranque = { id: "e0b9faf2-0000-4000-8000-000000000001", capabilities: { platform: "Android" }, last_seen_at: "2026-11-08T00:52:00Z" };
const DROID: FilaArranque = { id: "659d5e03-0000-4000-8000-000000000003", capabilities: { platform: "Android" }, last_seen_at: "2026-11-06T20:10:00Z" };
const MAC: FilaArranque = { id: "62d50afc-0000-4000-8000-000000000002", capabilities: { platform: "macOS", aparato: { v: 1, so: "macos", equipo: "MaggaBook", huella: "0123456789abcdef" } }, last_seen_at: "2026-11-08T01:19:00Z" };
const conAparato = (f: FilaArranque, ap: Record<string, unknown>): FilaArranque => ({ ...f, capabilities: { ...(f.capabilities as object), aparato: ap } });

describe("decidirAdopcionArranque", () => {
  it("la tableta reinstalada con la pista de su app de Android adopta «Maggaboard» y no nace fila nueva", () => {
    const d = decidirAdopcionArranque({ yoId: NUEVA, aparato: YO, filas: [BOARD, DROID, MAC], idAnterior: BOARD.id, ahora: AHORA });
    expect(d).toEqual({ adoptar: BOARD.id, motivo: "pista-migracion", candidatas: [BOARD.id] });
  });

  it("sin pista, con la huella que guardó la app en la fila: la misma huella en una sola neurona", () => {
    const board = conAparato(BOARD, { v: 1, so: "android", equipo: "Samsung SM-X205", huella: HUELLA });
    const droid = conAparato(DROID, { v: 1, so: "android", equipo: "Samsung SM-A536B", huella: "ffffffff00000000" });
    expect(decidirAdopcionArranque({ yoId: NUEVA, aparato: YO, filas: [board, droid, MAC], ahora: AHORA })).toMatchObject({ adoptar: board.id, motivo: "misma-huella" });
  });

  it("como estaba la cuenta el 08-11 (ninguna fila con el aparato) y sin pista: no se adopta nada, decide la ventana", () => {
    expect(decidirAdopcionArranque({ yoId: NUEVA, aparato: YO, filas: [BOARD, DROID, MAC], ahora: AHORA })).toMatchObject({ adoptar: null, motivo: "sin-pruebas" });
  });

  it("si la pista apunta a una fila de OTRO aparato (huella guardada distinta), no se adopta", () => {
    const otra = conAparato(BOARD, { v: 1, so: "android", equipo: "Samsung SM-X205", huella: "ffffffff00000000" });
    expect(decidirAdopcionArranque({ yoId: NUEVA, aparato: YO, filas: [otra], idAnterior: otra.id, ahora: AHORA })).toMatchObject({
      adoptar: null,
      motivo: "pista-de-otro-aparato",
    });
  });

  it("una pista a una fila absorbida lleva a la que se quedó (alias o marca `fusionada`)", () => {
    const vieja: FilaArranque = { id: "viejo-0001", capabilities: { platform: "Android", fusionada: { en: BOARD.id, ts: 1 } } };
    expect(decidirAdopcionArranque({ yoId: NUEVA, aparato: YO, filas: [vieja, BOARD], idAnterior: vieja.id, ahora: AHORA }).adoptar).toBe(BOARD.id);
    expect(decidirAdopcionArranque({ yoId: NUEVA, aparato: YO, filas: [BOARD], idAnterior: "otro-viejo", alias: { "otro-viejo": { a: BOARD.id } }, ahora: AHORA }).adoptar).toBe(BOARD.id);
  });

  it("ambigua (la misma huella en dos neuronas vigentes): no se toca nada", () => {
    const a = conAparato(BOARD, { v: 1, so: "android", huella: HUELLA });
    const b = conAparato(DROID, { v: 1, so: "android", huella: HUELLA });
    expect(decidirAdopcionArranque({ yoId: NUEVA, aparato: YO, filas: [a, b], ahora: AHORA })).toMatchObject({ adoptar: null, motivo: "ambigua" });
  });

  it("el mismo equipo sin huella: solo si es una sola neurona y no está en línea ahora", () => {
    const yo: AparatoRegistro = { v: 1, so: "macos", equipo: "MaggaBook" };
    const macSinHuella = conAparato({ ...MAC, last_seen_at: "2026-11-07T10:00:00Z" }, { v: 1, so: "macos", equipo: "MaggaBook.local" });
    expect(decidirAdopcionArranque({ yoId: NUEVA, aparato: yo, filas: [macSinHuella], ahora: AHORA })).toMatchObject({ adoptar: MAC.id, motivo: "mismo-equipo" });
    const enLinea = { ...macSinHuella, last_seen_at: "2026-11-08T01:15:00Z" };
    expect(decidirAdopcionArranque({ yoId: NUEVA, aparato: yo, filas: [enLinea], ahora: AHORA })).toMatchObject({ adoptar: null, motivo: "ambigua" });
  });

  it("este medio ya tiene su fila: nada que adoptar; datos raros: nunca lanza", () => {
    expect(decidirAdopcionArranque({ yoId: BOARD.id, aparato: YO, filas: [BOARD], idAnterior: DROID.id, ahora: AHORA }).motivo).toBe("ya-registrada");
    expect(decidirAdopcionArranque({ yoId: NUEVA, aparato: null, filas: [], ahora: AHORA }).motivo).toBe("sin-filas");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(decidirAdopcionArranque({ yoId: NUEVA, aparato: YO, filas: [null as any, { id: 5 } as any], ahora: AHORA }).adoptar).toBeNull();
  });
});
