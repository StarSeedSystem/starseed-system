import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { mediosDeEstado, type PresenciaMedio } from "../presencia";

const base = { n: "n1", m: "m1", tipo: "web", etiqueta: "web", visible: true, desde: "", s: {} } as unknown as PresenciaMedio;
const fuente = readFileSync(join(__dirname, "..", "presencia.ts"), "utf8");

describe("presencia: la posición exacta NO viaja por el canal público (MAP1114D)", () => {
  it("el código del canal `neur:<token>` no importa ni nombra nada de la posición", () => {
    expect(fuente).not.toMatch(/senales\/geo|almacen-posicion|anuncioParaMiCuenta|AnuncioPosicion|precisionM|canal-posicion/);
    expect(fuente).toContain("`neur:${token}`"); // el tema no cambió
  });

  it("el anuncio de presencia no tiene campo de posición; una neurona antigua se lee igual", () => {
    const [m] = mediosDeEstado({ x: [{ ...base, t: 5, c: ["capa:local"] } as never] });
    expect((m as unknown as Record<string, unknown>).g).toBeUndefined();
    expect(m.c).toEqual(["capa:local"]);
  });
});
