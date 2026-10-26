/**
 * GUI1021I (Ola 1021G, §5 de architecture/guias-introduccion.md) — puerta
 * común `abrirGuia` y reglas del modo invitado. Todo son funciones puras: la
 * coincidencia del evento se comprueba LEYENDO el texto de
 * `aurora-guide.tsx` (sin importarlo, para no tirar el componente al grafo de
 * la prueba) y el despacho se comprueba con un `EventTarget` de verdad como
 * `window` (sin jsdom, sin archivos del navegador).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EVENTO_ABRIR_GUIA,
  ETIQUETA_SOLO_CUENTA,
  Z_GUIA_HOY,
  Z_GUIA_SOBRE_ACCESO,
  abrirGuia,
  accionesDelPaso,
  modoGuia,
  unirVistas,
  zGuia,
} from "../guia-acceso";

const RAIZ = join(__dirname, "..", "..", "..", "..");
const leer = (ruta: string) => readFileSync(join(RAIZ, ruta), "utf-8");

const VALOR_AURORA = /OPEN_GUIDE_EVENT\s*=\s*"([^"]+)"/.exec(
  leer("src/components/onboarding/aurora-guide.tsx"),
)?.[1];
const VALOR_MODULO = /EVENTO_ABRIR_GUIA\s*=\s*"([^"]+)"/.exec(
  leer("src/lib/onboarding/guia-acceso.ts"),
)?.[1];

describe("EVENTO_ABRIR_GUIA", () => {
  it("es la misma puerta que OPEN_GUIDE_EVENT de aurora-guide (leído del texto, sin importarlo)", () => {
    expect(VALOR_AURORA).toBe("starseed:open-guide");
    expect(VALOR_MODULO).toBe(VALOR_AURORA);
  });
});

describe("abrirGuia", () => {
  it("sin window (SSR, Node) no lanza y no despacha nada", () => {
    expect(typeof window).toBe("undefined");
    expect(() => abrirGuia({ desde: "login" })).not.toThrow();
    expect(abrirGuia({ desde: "login" })).toBe(false);
  });

  it("despacha el evento de siempre con el detalle (desde y temaInicial)", () => {
    const recibidas: string[] = [];
    const detalles: Array<Record<string, unknown>> = [];
    const ventana = new EventTarget();
    ventana.addEventListener(EVENTO_ABRIR_GUIA, (e) => {
      recibidas.push(e.type);
      detalles.push((e as CustomEvent).detail as Record<string, unknown>);
    });
    vi.stubGlobal("window", ventana);
    const ok = abrirGuia({ desde: "bienvenida", temaInicial: "malla" });
    vi.unstubAllGlobals();
    expect(ok).toBe(true);
    expect(recibidas).toEqual(["starseed:open-guide"]);
    expect(detalles).toEqual([{ desde: "bienvenida", temaInicial: "malla" }]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });
});

describe("modoGuia", () => {
  it("sesión → cuenta, sin sesión → invitado", () => {
    expect(modoGuia(true)).toBe("cuenta");
    expect(modoGuia(false)).toBe("invitado");
  });
});

describe("accionesDelPaso", () => {
  it("en invitado no hay «Ir» ni «Hazlo por mí»: la etiqueta honesta los reserva a la cuenta", () => {
    const paso = accionesDelPaso("invitado");
    expect(paso.puedeIr).toBe(false);
    expect(paso.puedeHazloPorMi).toBe(false);
    expect(paso.etiqueta).toBe("Disponible al entrar");
    expect(paso.etiqueta).toBe(ETIQUETA_SOLO_CUENTA);
  });

  it("con cuenta, la guía de siempre: acciones reales y sin etiqueta sustituta", () => {
    expect(accionesDelPaso("cuenta")).toEqual({
      puedeIr: true,
      puedeHazloPorMi: true,
      etiqueta: null,
    });
  });
});

describe("zGuia", () => {
  it("desde cualquier ventana de acceso, pinta por encima de AuthGate y la bienvenida", () => {
    for (const desde of ["login", "bienvenida", "aviso"] as const) {
      expect(zGuia(desde, true)).toBe(Z_GUIA_SOBRE_ACCESO);
      expect(zGuia(desde, false)).toBe(Z_GUIA_SOBRE_ACCESO);
    }
  });

  it("sin sesión también, aunque se abra desde un botón o Ajustes", () => {
    expect(zGuia("boton", false)).toBe(Z_GUIA_SOBRE_ACCESO);
    expect(zGuia("ajustes", false)).toBe(Z_GUIA_SOBRE_ACCESO);
  });

  it("con sesión, abierta a mano o desde Ajustes, queda en su capa de HOY", () => {
    expect(zGuia("boton", true)).toBe(Z_GUIA_HOY);
    expect(zGuia("ajustes", true)).toBe(Z_GUIA_HOY);
  });

  it("con la sesión aún desconocida (null/undefined), también pinta por encima de todo (§6.3)", () => {
    expect(zGuia("ajustes", null)).toBe(Z_GUIA_SOBRE_ACCESO);
    expect(zGuia("boton", undefined)).toBe(Z_GUIA_SOBRE_ACCESO);
  });
});

describe("modo desconocido", () => {
  it("mientras no se sepa si hay sesión (null/undefined), no se le quita nada: solo un «no» claro es invitado (§6.3)", () => {
    expect(modoGuia(null)).toBe("cuenta");
    expect(modoGuia(undefined)).toBe("cuenta");
  });
});

describe("unirVistas", () => {
  it("lo visto como invitado se une a la marca de la cuenta sin perder nada ni repetir", () => {
    expect(unirVistas(["malla", "protomolecula"], ["protomolecula", "genesis"])).toEqual([
      "protomolecula",
      "genesis",
      "malla",
    ]);
  });

  it("soporta listas vacías, huecos y espacios (idempotente)", () => {
    expect(unirVistas([], [])).toEqual([]);
    expect(unirVistas([" genesis "], [null as unknown as string, "genesis"])).toEqual(["genesis"]);
    const contado = unirVistas([Z_GUIA_HOY, Z_GUIA_SOBRE_ACCESO].map(String), []);
    const otraVez = unirVistas(contado, contado);
    expect(otraVez).toEqual(contado);
  });

  it("acepta marcas que aún no existen (null/undefined) sin romper ni perder", () => {
    expect(unirVistas(null, undefined)).toEqual([]);
    expect(unirVistas(["malla"], null)).toEqual(["malla"]);
    expect(unirVistas(null, ["genesis"])).toEqual(["genesis"]);
  });
});

describe("pureza del módulo", () => {
  it("guia-acceso.ts no importa node:*, ni Supabase, ni componentes", () => {
    const fuente = leer("src/lib/onboarding/guia-acceso.ts");
    expect(fuente).not.toMatch(/from\s+"node:/);
    expect(fuente).not.toMatch(/from\s+"(?!node:)[^"]*"/);
    expect(fuente).not.toContain("createClient");
  });
});


