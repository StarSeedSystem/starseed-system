/**
 * GUI1021I (Ola 1021G, §5 de `architecture/guias-introduccion.md`) — puerta
 * común `abrirGuia` y reglas del modo invitado.
 *
 * Todo son funciones puras y un `EventTarget` inyectado: nada de red, Supabase
 * ni jsdom. La coincidencia del evento se comprueba LEYENDO el texto de
 * `aurora-guide.tsx` (sin importarlo, para no meter el componente cliente en el
 * grafo de la prueba).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EVENTO_ABRIR_GUIA,
  ETIQUETA_SOLO_CUENTA,
  ORIGENES_GUIA,
  VENTANAS_ACCESO,
  Z_GUIA_HOY,
  Z_GUIA_SOBRE_ACCESO,
  abrirGuia,
  accionesDelPaso,
  modoGuia,
  unirVistas,
  zGuia,
} from "../guia-acceso";

const RAIZ = process.cwd();
const leer = (ruta: string) => readFileSync(join(RAIZ, ruta), "utf-8");

const VALOR_AURORA = /OPEN_GUIDE_EVENT\s*=\s*"([^"]+)"/.exec(
  leer("src/components/onboarding/aurora-guide.tsx"),
)?.[1];

describe("EVENTO_ABRIR_GUIA", () => {
  it("es la misma puerta que OPEN_GUIDE_EVENT de aurora-guide (leído del texto, sin importarlo)", () => {
    expect(VALOR_AURORA).toBe("starseed:open-guide");
    expect(EVENTO_ABRIR_GUIA).toBe(VALOR_AURORA);
  });

  it("los cinco orígenes del contrato están, y las tres ventanas de acceso son suyas", () => {
    expect([...ORIGENES_GUIA]).toEqual(["login", "bienvenida", "ajustes", "aviso", "boton"]);
    for (const ventana of VENTANAS_ACCESO) expect(ORIGENES_GUIA).toContain(ventana);
  });
});

describe("abrirGuia", () => {
  it("sin window (SSR, Node) no lanza y no despacha nada", () => {
    expect(typeof window).toBe("undefined");
    expect(() => abrirGuia({ desde: "login" })).not.toThrow();
    expect(abrirGuia({ desde: "login" })).toBe(false);
    expect(abrirGuia({ desde: "login" }, null)).toBe(false);
  });

  it("despacha el evento de siempre con el detalle: desde y temaInicial solo si hay", () => {
    const destino = new EventTarget();
    const detalles: unknown[] = [];
    destino.addEventListener(EVENTO_ABRIR_GUIA, (e) =>
      detalles.push((e as CustomEvent).detail),
    );
    expect(abrirGuia({ desde: "bienvenida", temaInicial: "malla" }, destino)).toBe(true);
    expect(abrirGuia({ desde: "login" }, destino)).toBe(true);
    expect(detalles).toEqual([{ desde: "bienvenida", temaInicial: "malla" }, { desde: "login" }]);
  });

  it("si el destino falla al despachar, devuelve false y no lanza", () => {
    const roto = { dispatchEvent: () => { throw new Error("bloqueado"); } } as unknown as EventTarget;
    expect(abrirGuia({ desde: "aviso" }, roto)).toBe(false);
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
  it("desde cualquier ventana de acceso pinta por encima de AuthGate y la bienvenida", () => {
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
});

describe("unirVistas", () => {
  it("lo visto como invitado se une a la marca de la cuenta sin perder nada ni repetir", () => {
    expect(unirVistas(["malla", "protomolecula"], ["protomolecula", "genesis"])).toEqual([
      "protomolecula",
      "genesis",
      "malla",
    ]);
  });

  it("soporta listas vacías, espacios y huecos (y es idempotente)", () => {
    expect(unirVistas([], [])).toEqual([]);
    expect(unirVistas([" genesis "], [null as unknown as string, "genesis"])).toEqual(["genesis"]);
    const visto = unirVistas(["malla", "genesis"], ["genesis"]);
    expect(unirVistas(visto, visto)).toEqual(visto);
  });

  it("no muta las listas que recibe", () => {
    const local = ["malla"];
    const cuenta = ["genesis"];
    unirVistas(local, cuenta);
    expect(local).toEqual(["malla"]);
    expect(cuenta).toEqual(["genesis"]);
  });
});

describe("pureza del módulo", () => {
  it("guia-acceso.ts no importa node:*, ni Supabase, ni componentes", () => {
    const fuente = leer("src/lib/onboarding/guia-acceso.ts");
    expect(fuente).not.toMatch(/from\s+"node:/);
    expect(fuente).not.toContain('from "@/');
    expect(fuente).not.toContain('from "./');
    expect(fuente).not.toContain("createClient");
  });
});
