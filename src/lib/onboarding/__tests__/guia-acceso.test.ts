// Guía sin cuenta · el módulo puro `guia-acceso.ts` completo (GUI1021Id parte 2
// + GUI1021Ib parte 1), probado aquí en Node. El nombre del evento se compara
// leyendo el TEXTO de `aurora-guide.tsx`, sin importarlo (no se monta React).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EVENTO_ABRIR_GUIA,
  Z_GUIA_GUARDADA,
  Z_GUIA_SOBRE_ACCESO,
  abrirGuia,
  accionesDelPaso,
  modoGuia,
  unirVistas,
  zGuia,
} from "../guia-acceso";

const leer = (ruta: string) => readFileSync(join(process.cwd(), ruta), "utf8");

/** El evento que el componente escucha, extraído de su código fuente (sin montarlo). */
const eventoDeAurora = /OPEN_GUIDE_EVENT\s*=\s*"([^"]+)"/.exec(
  leer("src/components/onboarding/aurora-guide.tsx"),
)?.[1];

/** Un destino capturador: guarda el detalle de cada evento sin difundirlo. */
const capturador = (detalles: Array<Record<string, unknown>>): EventTarget => {
  const objetivo = new EventTarget();
  objetivo.addEventListener(EVENTO_ABRIR_GUIA, (e) =>
    detalles.push((e as CustomEvent).detail as Record<string, unknown>));
  return objetivo;
};

describe("EVENTO_ABRIR_GUIA · la misma puerta que escucha la guía", () => {
  it("coincide con OPEN_GUIDE_EVENT de aurora-guide, leído de su texto", () => {
    expect(eventoDeAurora).toBe("starseed:open-guide");
    expect(EVENTO_ABRIR_GUIA).toBe(eventoDeAurora);
  });
});

describe("abrirGuia · la puerta única", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sin window (SSR, Node) no lanza, no despacha nada y dice false", () => {
    expect(typeof window).toBe("undefined");
    expect(() => abrirGuia({ desde: "login" })).not.toThrow();
    expect(abrirGuia({ desde: "login" })).toBe(false);
  });

  it("despacha el evento con el detalle: origen y tema inicial", () => {
    const detalles: Array<Record<string, unknown>> = [];
    vi.stubGlobal("window", capturador(detalles));
    expect(abrirGuia({ desde: "bienvenida", temaInicial: "malla" })).toBe(true);
    expect(detalles).toEqual([{ desde: "bienvenida", temaInicial: "malla" }]);
  });

  it("sin tema inicial, el detalle lleva solo el origen", () => {
    const detalles: Array<Record<string, unknown>> = [];
    expect(abrirGuia({ desde: "aviso" }, capturador(detalles))).toBe(true);
    expect(detalles).toEqual([{ desde: "aviso" }]);
  });
});

describe("modoGuia · invitado o cuenta", () => {
  it("sin sesión es invitado; con sesión, cuenta; si aún no se sabe, cuenta (no se quita nada)", () => {
    expect(modoGuia(false)).toBe("invitado");
    expect(modoGuia(true)).toBe("cuenta");
    expect(modoGuia(null)).toBe("cuenta");
  });
});

describe("accionesDelPaso · qué se ve en cada modo", () => {
  it("en invitado no hay «Ir» ni «Hazlo por mí» y queda «Disponible al entrar»", () => {
    expect(accionesDelPaso("invitado")).toEqual({
      puedeIr: false,
      puedeHacerPorMi: false,
      etiquetaSinCuenta: "Disponible al entrar",
    });
  });

  it("con cuenta no hace falta etiqueta", () => {
    expect(accionesDelPaso("cuenta")).toEqual({
      puedeIr: true,
      puedeHacerPorMi: true,
      etiquetaSinCuenta: null,
    });
  });
});

describe("zGuia · por encima del acceso o el valor de hoy", () => {
  it("desde una ventana de acceso siempre 240, por encima de AuthGate y la bienvenida", () => {
    expect(zGuia("login", true)).toBe(Z_GUIA_SOBRE_ACCESO);
    expect(zGuia("login", false)).toBe(Z_GUIA_SOBRE_ACCESO);
    expect(zGuia("bienvenida", null)).toBe(Z_GUIA_SOBRE_ACCESO);
    expect(Z_GUIA_SOBRE_ACCESO).toBe(240);
  });

  it("sin sesión, 240 donde haga falta; con sesión o sin saberlo, el valor de hoy", () => {
    expect(zGuia("ajustes", false)).toBe(Z_GUIA_SOBRE_ACCESO);
    expect(zGuia("aviso", true)).toBe(Z_GUIA_GUARDADA);
    expect(zGuia("boton", null)).toBe(Z_GUIA_GUARDADA);
    expect(Z_GUIA_GUARDADA).toBe(95);
  });
});

describe("unirVistas · lo visto como invitado se une a la marca de la cuenta", () => {
  it("gana primero lo de la cuenta y los ids nuevos del aparato se unen sin duplicar ni perder nada", () => {
    expect(unirVistas(["orbe", "malla"], ["malla", "escritorio"])).toEqual(["malla", "escritorio", "orbe"]);
    expect(unirVistas(["a", "a", "b"], ["b"])).toEqual(["b", "a"]);
  });

  it("acepta faltantes por cualquiera de las dos partes", () => {
    expect(unirVistas(["orbe"], null)).toEqual(["orbe"]);
    expect(unirVistas(null, ["malla"])).toEqual(["malla"]);
    expect(unirVistas(null, null)).toEqual([]);
  });
});

describe("pureza · módulo sin Node, sin Supabase, sin componentes", () => {
  it("ningún import de valor en tiempo de ejecución", () => {
    const fuente = leer("src/lib/onboarding/guia-acceso.ts");
    expect(fuente).not.toMatch(/(from\s+"node:|createClient|from\s+"@\/components)/);
    const deValor = fuente
      .split("\n")
      .filter((l) => /^\s*import\s/.test(l) && !/^\s*import\s+type\s/.test(l));
    expect(deValor, "solo imports de tipo").toEqual([]);
  });
});
