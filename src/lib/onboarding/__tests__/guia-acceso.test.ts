// GUI1021I · puerta común `abrirGuia` y reglas del modo invitado. El evento se
// compara leyendo el texto de `aurora-guide.tsx` (sin importar el componente).
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

const leer = (ruta: string) => readFileSync(join(process.cwd(), ruta), "utf-8");
const VALOR_AURORA = /OPEN_GUIDE_EVENT\s*=\s*"([^"]+)"/.exec(
  leer("src/components/onboarding/aurora-guide.tsx"),
)?.[1];
const VALOR_MODULO = /EVENTO_ABRIR_GUIA\s*=\s*"([^"]+)"/.exec(
  leer("src/lib/onboarding/guia-acceso.ts"),
)?.[1];

describe("EVENTO_ABRIR_GUIA", () => {
  it("es la misma puerta que OPEN_GUIDE_EVENT de aurora-guide", () => {
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
    const detalles: Array<Record<string, unknown>> = [];
    const ventana = new EventTarget();
    ventana.addEventListener(EVENTO_ABRIR_GUIA, (e) =>
      detalles.push((e as CustomEvent).detail as Record<string, unknown>));
    vi.stubGlobal("window", ventana);
    const ok = abrirGuia({ desde: "bienvenida", temaInicial: "malla" });
    vi.unstubAllGlobals();
    expect(ok).toBe(true);
    expect(detalles).toEqual([{ desde: "bienvenida", temaInicial: "malla" }]);
  });

  it("sin tema inicial, el detalle lleva solo el origen", () => {
    const detalles: Array<Record<string, unknown>> = [];
    const ventana = new EventTarget();
    ventana.addEventListener(EVENTO_ABRIR_GUIA, (e) =>
      detalles.push((e as CustomEvent).detail as Record<string, unknown>));
    expect(abrirGuia({ desde: "aviso" }, ventana)).toBe(true);
    expect(detalles).toEqual([{ desde: "aviso" }]);
  });

  afterEach(() => vi.unstubAllGlobals());
});

describe("modoGuia", () => {
  it("sesión → cuenta, sin sesión → invitado", () => {
    expect(modoGuia(true)).toBe("cuenta");
    expect(modoGuia(false)).toBe("invitado");
  });
});

describe("accionesDelPaso", () => {
  it("en invitado no hay «Ir» ni «Hazlo por mí»: la etiqueta honesta los reserva", () => {
    const paso = accionesDelPaso("invitado");
    expect(paso.puedeIr).toBe(false);
    expect(paso.puedeHazloPorMi).toBe(false);
    expect(paso.etiqueta).toBe("Disponible al entrar");
    expect(paso.etiqueta).toBe(ETIQUETA_SOLO_CUENTA);
  });

  it("con cuenta, acciones reales y sin etiqueta sustituta", () => {
    expect(accionesDelPaso("cuenta")).toEqual({ puedeIr: true, puedeHazloPorMi: true, etiqueta: null });
  });
});

describe("zGuia", () => {
  it("desde una ventana de acceso pinta por encima, con o sin sesión", () => {
    for (const desde of ["login", "bienvenida", "aviso"] as const) {
      expect(zGuia(desde, true)).toBe(Z_GUIA_SOBRE_ACCESO);
      expect(zGuia(desde, false)).toBe(Z_GUIA_SOBRE_ACCESO);
    }
  });

  it("sin sesión también desde botón o Ajustes; con sesión, capa de hoy", () => {
    expect(zGuia("boton", false)).toBe(Z_GUIA_SOBRE_ACCESO);
    expect(zGuia("ajustes", false)).toBe(Z_GUIA_SOBRE_ACCESO);
    expect(zGuia("boton", true)).toBe(Z_GUIA_HOY);
    expect(zGuia("ajustes", true)).toBe(Z_GUIA_HOY);
  });
});

describe("unirVistas", () => {
  it("lo visto como invitado se une a la marca de la cuenta sin perder ni repetir", () => {
    expect(unirVistas(["malla", "protomolecula"], ["protomolecula", "genesis"])).toEqual([
      "protomolecula",
      "genesis",
      "malla",
    ]);
  });

  it("soporta listas vacías, huecos y espacios (idempotente)", () => {
    expect(unirVistas([], [])).toEqual([]);
    expect(unirVistas([" genesis "], [null as unknown as string, "genesis"])).toEqual(["genesis"]);
    const contado = unirVistas(["malla", "genesis"], ["genesis"]);
    expect(unirVistas(contado, contado)).toEqual(contado);
  });
});

describe("pureza del módulo", () => {
  it("no importa node:*, ni Supabase, ni componentes; solo tipos puros", () => {
    const fuente = leer("src/lib/onboarding/guia-acceso.ts");
    expect(fuente).not.toMatch(/from\s+"node:/);
    expect(fuente).not.toContain("createClient");
    expect(fuente).not.toMatch(/from\s+"@\/components\//);
    const deValor = fuente
      .split("\n")
      .filter((l) => /^\s*import\s/.test(l) && !/^\s*import\s+type\s/.test(l));
    expect(deValor).toEqual([]);
  });
});
