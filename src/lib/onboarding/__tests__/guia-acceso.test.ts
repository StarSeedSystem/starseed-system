import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EVENTO_ABRIR_GUIA,
  Z_GUIA_GUARDADA,
  Z_GUIA_SOBRE_ACCESO,
  abrirGuia,
  accionesDelPaso,
  modoGuia,
  unirVistas,
  zGuia,
  type PeticionGuia,
} from "../guia-acceso";

function oir(destino: EventTarget): { eventos: unknown[] } {
  const eventos: unknown[] = [];
  destino.addEventListener(EVENTO_ABRIR_GUIA, (e) => eventos.push((e as CustomEvent<PeticionGuia>).detail));
  return { eventos };
}

describe("modoGuia · invitado o cuenta", () => {
  it("sin sesión es invitado; con sesión, cuenta; si aún no se sabe, cuenta (no se quita nada)", () => {
    expect(modoGuia(false)).toBe("invitado");
    expect(modoGuia(true)).toBe("cuenta");
    expect(modoGuia(null)).toBe("cuenta");
  });
});

describe("accionesDelPaso · qué se ve en cada modo", () => {
  it("en invitado no hay «Ir» ni «Hazlo por mí» y queda «Disponible al entrar»", () => {
    const paso = accionesDelPaso("invitado");
    expect(paso).toEqual({ puedeIr: false, puedeHacerPorMi: false, etiquetaSinCuenta: "Disponible al entrar" });
  });

  it("con cuenta no hace falta etiqueta", () => {
    expect(accionesDelPaso("cuenta")).toEqual({ puedeIr: true, puedeHacerPorMi: true, etiquetaSinCuenta: null });
  });
});

describe("zGuia · por encima del acceso o el valor de hoy", () => {
  it("desde login y bienvenida va por encima de cualquier ventana de acceso (240)", () => {
    expect(zGuia("login", false)).toBe(240);
    expect(zGuia("bienvenida", true)).toBe(240);
    expect(zGuia("login", null)).toBe(240);
    expect(Z_GUIA_SOBRE_ACCESO).toBe(240);
  });

  it("sin sesión, 240 donde haga falta; con sesión desde resto de sitios, el valor de hoy (95)", () => {
    expect(zGuia("ajustes", false)).toBe(240);
    expect(zGuia("aviso", true)).toBe(Z_GUIA_GUARDADA);
    expect(zGuia("boton", true)).toBe(Z_GUIA_GUARDADA);
    expect(zGuia("boton", null)).toBe(Z_GUIA_GUARDADA);
    expect(Z_GUIA_GUARDADA).toBe(95);
  });
});

describe("unirVistas · sin perder lo visto como invitado", () => {
  it("lo de la cuenta va primero y los ids nuevos del aparato se unen sin duplicar", () => {
    expect(unirVistas(["orbe", "malla"], ["malla", "escritorio"])).toEqual(["malla", "escritorio", "orbe"]);
    expect(unirVistas(["a", "a", "b"], ["b"])).toEqual(["b", "a"]);
  });

  it("acepta faltantes por cualquiera de las dos partes", () => {
    expect(unirVistas(["orbe"], null)).toEqual(["orbe"]);
    expect(unirVistas(null, ["malla"])).toEqual(["malla"]);
    expect(unirVistas(null, null)).toEqual([]);
  });
});

describe("abrirGuia · la puerta común", () => {
  it("lanza el mismo evento que escucha la guía de Aurora", () => {
    const fuente = readFileSync(join(process.cwd(), "src/components/onboarding/aurora-guide.tsx"), "utf8");
    expect(/OPEN_GUIDE_EVENT = "([^"]+)"/.exec(fuente)?.[1]).toBe(EVENTO_ABRIR_GUIA);
  });

  it("despacha el evento con el detalle pedido en un destino inyectado y devuelve true", () => {
    const destino = new EventTarget();
    const { eventos } = oir(destino);
    expect(abrirGuia({ desde: "aviso", temaInicial: "malla" }, destino)).toBe(true);
    expect(eventos).toEqual([{ desde: "aviso", temaInicial: "malla" }]);
    eventos.length = 0;
    expect(abrirGuia({ desde: "boton" }, destino)).toBe(true);
    expect(eventos).toEqual([{ desde: "boton" }]);
  });

  it("sin ventana ni destino no hace nada y devuelve false", () => {
    expect(abrirGuia({ desde: "login" }, null)).toBe(false);
  });
});
