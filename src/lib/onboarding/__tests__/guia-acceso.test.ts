/**
 * GUI1021I · La puerta común y las reglas puras del modo invitado (§5).
 *
 * El nombre del evento se comprueba leyendo el TEXTO del archivo (y el de `aurora-guide.tsx`),
 * sin importarlo — importar ese componente tiraría a la prueba por sus hooks. El resto es
 * TypeScript puro: entrada → salida, sin red, sin disco.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  accionesDelPaso,
  abrirGuia,
  EVENTO_ABRIR_GUIA,
  ETIQUETA_INVITADO,
  modoGuia,
  unirVistas,
  Z_GUIA_HOY,
  Z_GUIA_SOBRE_ACCESO,
  zGuia,
  type PeticionGuia,
} from "../guia-acceso";

/** Lee un archivo del repo como texto plano (para los nombres de evento). */
function fuente(relativa: string): string {
  return readFileSync(path.join(process.cwd(), relativa), "utf8");
}

describe("EVENTO_ABRIR_GUIA · el evento de siempre", () => {
  it("se llama starseed:open-guide, igual que OPEN_GUIDE EVENT de aurora-guide", () => {
    const nombre = /EVENTO_ABRIR_GUIA = "([^"]+)"/.exec(fuente("src/lib/onboarding/guia-acceso.ts"))?.[1];
    expect(nombre).toBe("starseed:open-guide");
    const nombreAurora = /OPEN_GUIDE_EVENT = "([^"]+)"/.exec(
      fuente("src/components/onboarding/aurora-guide.tsx"),
    )?.[1];
    expect(nombreAurora).toBe(nombre);
  });
});

describe("abrirGuia · la puerta común", () => {
  it("despacha el evento con el detalle pedido en un destino inyectado", () => {
    const destino = new EventTarget();
    const oir = vi.fn((e: Event) => (e as CustomEvent<PeticionGuia>).detail);
    destino.addEventListener(EVENTO_ABRIR_GUIA, oir);
    expect(abrirGuia({ desde: "login", temaInicial: "malla" }, destino)).toBe(true);
    expect(oir.mock.results[0].value).toEqual({ desde: "login", temaInicial: "malla" });
  });

  it("sin window (servidor) no hace nada y nunca lanza", () => {
    expect(abrirGuia({ desde: "boton" })).toBe(false);
    expect(abrirGuia({ desde: "boton" }, null)).toBe(false);
  });
});

describe("modoGuia · compte o invitado", () => {});
