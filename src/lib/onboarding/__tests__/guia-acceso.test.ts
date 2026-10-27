/**
 * Guía de acceso · pruebas de `guia-acceso.ts` (rescate RTAGF1023G).
 * Casos adaptados de la rama archivada `nube/40288124804` a la API de hoy.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EVENTO_ABRIR_GUIA,
  abrirGuia,
  type PeticionGuia,
} from "../guia-acceso";

const RAIZ = process.cwd();
const leerRelativo = (ruta: string) => readFileSync(join(RAIZ, ruta), "utf8");
const fuenteAuroraGuia = leerRelativo("src/components/onboarding/aurora-guide.tsx");

/** Un destino falso que captura los CustomEvent que le llegan. */
function destinoQueCaptura(detalles: Array<Record<string, unknown>>): EventTarget {
  const objetivo = new EventTarget();
  objetivo.addEventListener(EVENTO_ABRIR_GUIA, (evento) => {
    const detalle = (evento as CustomEvent<Record<string, unknown>>).detail;
    detalles.push({ ...detalle });
  });
  return objetivo;
}

describe("guia-acceso", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("coincide con `OPEN_GUIDE_EVENT` de aurora-guide, leído del texto del archivo", () => {
    const declarado = /OPEN_GUIDE_EVENT\s*=\s*"([^"]+)"/.exec(fuenteAuroraGuia);
    expect(declarado, "aurora-guide declara su evento").toBeTruthy();
    const { EVENTO_ABRIR_GUIA: OPEN_GUIDE_EVENT_DE_AURORA } = { EVENTO_ABRIR_GUIA: declarado![1] };
    expect(OPEN_GUIDE_EVENT_DE_AURORA).toBe("starseed:open-guide");
    expect(EVENTO_ABRIR_GUIA).toBe(OPEN_GUIDE_EVENT_DE_AURORA);
  });

  it("sin dónde lanzar el evento devuelve false y no lanza", () => {
    vi.stubGlobal("window", undefined);
    expect(() => abrirGuia({ desde: "login" })).not.toThrow();
    expect(abrirGuia({ desde: "login" })).toBe(false);
  });

});

  it("con origen y tema inicial", () => {
    const detalles: Array<Record<string, unknown>> = [];
    const ventana = destinoQueCaptura(detalles);
    vi.stubGlobal("window", ventana);
    const peticion: PeticionGuia = { desde: "bienvenida", temaInicial: "malla" };
    expect(abrirGuia(peticion)).toBe(true);
    expect(detalles).toEqual([{ desde: "bienvenida", temaInicial: "malla" }]);
  });

  it("sin tema inicial, el detalle lleva solo el origen", () => {
    const detalles: Array<Record<string, unknown>> = [];
    const ventana = destinoQueCaptura(detalles);
    expect(abrirGuia({ desde: "aviso" }, ventana)).toBe(true);
    expect(detalles).toEqual([{ desde: "aviso" }]);
  });

  it("no importa nada de valor en tiempo de ejecución", () => {
    const fuente = leerRelativo("src/lib/onboarding/guia-acceso.ts");
    const deValor = fuente
      .split("\n")
      .filter((linea) => /^\s*import\s/.test(linea) && !/^\s*import\s+type\s/.test(linea));
    expect(deValor, "solo imports de tipo").toEqual([]);
  });

