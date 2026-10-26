// Guía sin cuenta · parte 2 de 2 (GUI1021Id): la puerta común `abrirGuia` y las
// reglas del modo invitado (§5 de `architecture/guias-introduccion.md`). Módulo
// puro `guia-acceso.ts`, probado aquí en Node. El nombre del evento se compara
// leyendo el TEXTO de `aurora-guide.tsx`, sin importarlo (no se monta React).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EVENTO_ABRIR_GUIA, ETIQUETA_SOLO_CUENTA, Z_GUIA_HOY, Z_GUIA_SOBRE_ACCESO,
  abrirGuia, accionesDelPaso, modoGuia, unirVistas, zGuia,
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

describe("modo y acciones · en invitado se reserva a la cuenta", () => {
  it("sesión → cuenta, sin sesión → invitado; nada intermedio", () => {
    expect(modoGuia(true)).toBe("cuenta");
    expect(modoGuia(false)).toBe("invitado");
  });

  it("sin «Ir» ni «Hazlo por mí»: la etiqueta honesta lo dice", () => {
    const paso = accionesDelPaso("invitado");
    expect(paso).toEqual({ puedeIr: false, puedeHazloPorMi: false, etiqueta: ETIQUETA_SOLO_CUENTA });
    expect(paso.etiqueta).toBe("Disponible al entrar");
  });

  it("con cuenta, acciones reales y sin etiqueta sustituta", () => {
    expect(accionesDelPaso("cuenta")).toEqual({ puedeIr: true, puedeHazloPorMi: true, etiqueta: null });
  });
});

describe("zGuia · por encima de las ventanas de acceso", () => {
  it("desde login, bienvenida o aviso, con o sin sesión, pinta por encima", () => {
    for (const desde of ["login", "bienvenida", "aviso"] as const) {
      expect(zGuia(desde, true)).toBe(Z_GUIA_SOBRE_ACCESO);
      expect(zGuia(desde, false)).toBe(Z_GUIA_SOBRE_ACCESO);
    }
  });

  it("sin sesión también desde botón o Ajustes; con ella, la capa de hoy", () => {
    expect(zGuia("boton", false)).toBe(Z_GUIA_SOBRE_ACCESO);
    expect(zGuia("ajustes", false)).toBe(Z_GUIA_SOBRE_ACCESO);
    expect(zGuia("boton", true)).toBe(Z_GUIA_HOY);
    expect(zGuia("ajustes", true)).toBe(Z_GUIA_HOY);
  });
});

describe("unirVistas · lo de la cuenta primero, lo nuevo del aparato detrás", () => {
  it("une lo visto como invitado con la cuenta, sin perder ni repetir", () => {
    expect(unirVistas(["malla", "protomolecula"], ["protomolecula", "genesis"])).toEqual([
      "protomolecula", "genesis", "malla",
    ]);
  });

  it("vacíos y claves con espacios; repetir la unión no la cambia", () => {
    expect(unirVistas([], [])).toEqual([]);
    expect(unirVistas([" malla "], [])).toEqual(["malla"]);
    const unidas = unirVistas(["malla", "genesis"], ["genesis"]);
    expect(unirVistas(unidas, unidas)).toEqual(unidas);
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
