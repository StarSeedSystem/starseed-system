import { describe, expect, it } from "vitest";
import { ORDEN_POR_DEFECTO, alternarOculto, esOrdenDeFabricaAntiguo, moverModulo, resolverOrden, seccionInicial } from "../orden-modulos";

describe("resolverOrden", () => {
  it("sin nada guardado devuelve el orden de fábrica, que empieza por Inicio", () => {
    expect(resolverOrden(undefined)).toEqual([...ORDEN_POR_DEFECTO]);
    expect(resolverOrden(undefined)[0]).toBe("quick");
  });

  it("el orden de fábrica antiguo (nadie lo eligió) se sustituye por el nuevo", () => {
    expect(esOrdenDeFabricaAntiguo(["system", "quick", "home", "notif"])).toBe(true);
    expect(esOrdenDeFabricaAntiguo(["system", "quick", "conexiones", "home", "notif"])).toBe(true);
    expect(resolverOrden(["system", "quick", "home", "notif"])).toEqual([...ORDEN_POR_DEFECTO]);
    expect(resolverOrden(["system", "quick", "conexiones", "home", "notif"])).toEqual([...ORDEN_POR_DEFECTO]);
  });

  it("un orden elegido por la persona se respeta y las secciones nuevas se añaden al final", () => {
    const elegido = ["notif", "quick", "home", "system", "conexiones"];
    expect(esOrdenDeFabricaAntiguo(elegido)).toBe(false);
    expect(resolverOrden(elegido)).toEqual(["notif", "quick", "home", "system", "conexiones", "grabar"]);
  });

  it("descarta ids desconocidos y repetidos", () => {
    expect(resolverOrden(["grabar", "nada", "grabar", "quick"])).toEqual(["grabar", "quick", "home", "conexiones", "notif", "system"]);
  });

  it("tolera valores raros guardados", () => {
    expect(resolverOrden("quick" as unknown as string[])).toEqual([...ORDEN_POR_DEFECTO]);
    expect(resolverOrden([1, null, "home"] as unknown as string[])[0]).toBe("home");
  });

  it("siempre contiene cada sección exactamente una vez", () => {
    for (const guardado of [undefined, [], ["system"], ["x", "y"], [...ORDEN_POR_DEFECTO].reverse()]) {
      const r = resolverOrden(guardado as string[] | undefined);
      expect([...r].sort()).toEqual([...ORDEN_POR_DEFECTO].sort());
    }
  });
});

describe("moverModulo", () => {
  const base = ["a", "b", "c"];
  it("intercambia con el vecino", () => {
    expect(moverModulo(base, "b", -1)).toEqual(["b", "a", "c"]);
    expect(moverModulo(base, "b", 1)).toEqual(["a", "c", "b"]);
  });
  it("en los extremos o con un id desconocido no cambia nada y no muta el original", () => {
    expect(moverModulo(base, "a", -1)).toEqual(base);
    expect(moverModulo(base, "c", 1)).toEqual(base);
    expect(moverModulo(base, "z", 1)).toEqual(base);
    expect(base).toEqual(["a", "b", "c"]);
  });
});

describe("alternarOculto", () => {
  it("oculta y vuelve a mostrar", () => {
    expect(alternarOculto([], "home", 6)).toEqual({ ocultos: ["home"], aplicado: true });
    expect(alternarOculto(["home", "notif"], "home", 6)).toEqual({ ocultos: ["notif"], aplicado: true });
  });
  it("nunca deja el panel sin ninguna sección", () => {
    const r = alternarOculto(["a", "b"], "c", 3);
    expect(r.aplicado).toBe(false);
    expect(r.ocultos).toEqual(["a", "b"]);
  });
});

describe("seccionInicial", () => {
  it("abre en Inicio si se ve; si no, en la primera visible", () => {
    expect(seccionInicial(["grabar", "quick"])).toBe("quick");
    expect(seccionInicial(["grabar", "home"])).toBe("grabar");
    expect(seccionInicial([])).toBe("quick");
  });
});
