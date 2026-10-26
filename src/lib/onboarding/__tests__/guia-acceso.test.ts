// Guía sin cuenta · parte 2 de 2 · la puerta común y las reglas del modo invitado (§5).
// ═════════════════════════════════════════════════════════════════════════════
// Prueba del módulo puro `guia-acceso.ts`: la puerta `abrirGuia`, el modo (invitado
// o cuenta), lo que se ofrece en cada paso, la capa sobre las ventanas de acceso
// y cómo se une lo visto como invitado a la marca de la cuenta (sin bucle).
//
// El evento se compara leyendo el TEXTO de `aurora-guide.tsx` (sin importar el
// componente) y el módulo se revisa por pureza (sin `node:*`, sin Supabase).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EVENTO_ABRIR_GUIA,
  ETIQUETA_SOLO_CUENTA,
  abrirGuia,
  accionesDelPaso,
  modoGuia,
  unirVistas,
  zGuia,
  Z_GUIA_HOY,
  Z_GUIA_SOBRE_ACCESO,
} from "../guia-acceso";

const leer = (ruta: string) => readFileSync(join(process.cwd(), ruta), "utf8");

/** El valor exacto que el componente escucha, sacado del código fuente (sin montarlo). */
const OPEN_GUIDE_EVENT_DE_AURORA =
  /OPEN_GUIDE_EVENT\s*=\s*"([^"]+)"/.exec(leer("src/components/onboarding/aurora-guide.tsx"))?.[1];

/** Un destino que captura los eventos en lugar de difundirlos de verdad. */
function destinoQueCaptura(detalles: Array<Record<string, unknown>>): EventTarget {
  const objetivo = new EventTarget();
  objetivo.addEventListener(EVENTO_ABRIR_GUIA, (e) =>
    detalles.push((e as CustomEvent).detail as Record<string, unknown>),
  );
  return objetivo;
}

describe("EVENTO_ABRIR_GUIA · la misma puerta que escucha la guía", () => {
  it("coincide con `OPEN_GUIDE_EVENT` de aurora-guide, leído del texto del archivo", () => {
    expect(OPEN_GUIDE_EVENT_DE_AURORA).toBe("starseed:open-guide");
    expect(EVENTO_ABRIR_GUIA).toBe(OPEN_GUIDE_EVENT_DE_AURORA);
  });
});

describe("abrirGuia · sin window no hace nada", () => {
  it("en Node o SSR no lanza ni despacha y devuelve false", () => {
    expect(typeof window).toBe("undefined");
    expect(() => abrirGuia({ desde: "login" })).not.toThrow();
    expect(abrirGuia({ desde: "login" })).toBe(false);
  });
});

describe("abrirGuia · despacha el evento con su detalle", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("con origen y tema inicial", () => {
    const detalles: Array<Record<string, unknown>> = [];
    const ventana = destinoQueCaptura(detalles);
    vi.stubGlobal("window", ventana);
    expect(abrirGuia({ desde: "bienvenida", temaInicial: "malla" })).toBe(true);
    expect(detalles).toEqual([{ desde: "bienvenida", temaInicial: "malla" }]);
  });

  it("sin tema inicial, el detalle lleva solo el origen", () => {
    const detalles: Array<Record<string, unknown>> = [];
    const ventana = destinoQueCaptura(detalles);
    expect(abrirGuia({ desde: "aviso" }, ventana)).toBe(true);
    expect(detalles).toEqual([{ desde: "aviso" }]);
  });
});

describe("modoGuia · cuenta con sesión, invitado sin ella", () => {
  it("hay dos modos y nada intermedio", () => {
    expect(modoGuia(true)).toBe("cuenta");
    expect(modoGuia(false)).toBe("invitado");
  });
});

describe("accionesDelPaso · en invitado se reserva a la cuenta", () => {
  it("sin «Ir» ni «Hazlo por mí»: la etiqueta honesta lo dice", () => {
    const paso = accionesDelPaso("invitado");
    expect(paso.puedeIr).toBe(false);
    expect(paso.puedeHazloPorMi).toBe(false);
    expect(paso.etiqueta).toBe("Disponible al entrar");
    expect(paso.etiqueta).toBe(ETIQUETA_SOLO_CUENTA);
  });

  it("con cuenta, acciones reales en cada paso y sin etiqueta sustituta", () => {
    expect(accionesDelPaso("cuenta")).toEqual({ puedeIr: true, puedeHazloPorMi: true, etiqueta: null });
  });
});

describe("zGuia · por encima de las ventanas de acceso", () => {
  it("desde login, bienvenida o aviso pinta por encima, con o sin sesión", () => {
    for (const desde of ["login", "bienvenida", "aviso"] as const) {
      expect(zGuia(desde, true), `con sesión y ${desde}`).toBe(Z_GUIA_SOBRE_ACCESO);
      expect(zGuia(desde, false), `sin sesión y ${desde}`).toBe(Z_GUIA_SOBRE_ACCESO);
    }
  });

  it("sin sesión también desde botón o Ajustes; con sesión, la capa de siempre", () => {
    expect(zGuia("boton", false)).toBe(Z_GUIA_SOBRE_ACCESO);
    expect(zGuia("ajustes", false)).toBe(Z_GUIA_SOBRE_ACCESO);
    expect(zGuia("boton", true)).toBe(Z_GUIA_HOY);
    expect(zGuia("ajustes", true)).toBe(Z_GUIA_HOY);
  });
});

describe("unirVistas · lo visto como invitado se une a la marca de la cuenta", () => {
  it("une sin perder nada de la cuenta ni repetir lo compartido", () => {
    expect(unirVistas(["malla", "protomolecula"], ["protomolecula", "genesis"])).toEqual([
      "protomolecula",
      "genesis",
      "malla",
    ]);
  });

  it("soporta listas vacías y claves sin recortar, y no se duplica al repetirse", () => {
    expect(unirVistas([], [])).toEqual([]);
    expect(unirVistas([" malla "], [])).toEqual(["malla"]);
    const unidas = unirVistas(["malla", "genesis"], ["genesis"]);
    expect(unirVistas(unidas, unidas)).toEqual(unidas);
  });
});

describe("pureza · módulo sin Node, sin Supabase, sin componentes", () => {
  it("no importa nada de valor en tiempo de ejecución", () => {
    const fuente = leer("src/lib/onboarding/guia-acceso.ts");
    expect(fuente).not.toMatch(/from\s+"node:/);
    expect(fuente).not.toContain("createClient");
    expect(fuente).not.toMatch(/from\s+"@(components|supabase)\//);
    const deValor = fuente
      .split("\n")
      .filter((l) => /^\s*import\s/.test(l) && !/^\s*import\s+type\s/.test(l));
    expect(deValor, "solo imports de tipo").toEqual([]);
  });
});

