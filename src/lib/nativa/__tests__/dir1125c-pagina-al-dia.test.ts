/** DIR1125C · la página que se quedó con la capa anterior tras un relevo se pone al día sola (y nunca en bucle). */
import { describe, expect, it } from "vitest";
import type { EstadoServidorLocal } from "../estado-servidor-local";
import { decidirPonerseAlDia, MAX_INTENTOS_AL_DIA } from "../relevo-capa";
import { mirarPaginaAlDia, type DepsAlDia } from "../relevo-capa-cliente";

// Lo medido en la Maggabox el 25-11 a las 02:06Z: la página en e55edbf853, el servidor local ya en 0d0498cd4e.
const VIEJA = "mwvcv6xv-gpzi8z/e55edbf853";
const NUEVA = "mwvgzqsm-u8ywii/0d0498cd4e";
const estado = (o: Partial<EstadoServidorLocal> = {}): EstadoServidorLocal => ({ fase: "local", web_corre: NUEVA, ...o });
const libre = { enLlamada: false, escribiendo: false, intentos: 0 };

describe("DIR1125C · ¿la página corre lo que sirve el servidor local?", () => {
  it("página en la capa anterior y servidor en la nueva: recargar", () => {
    const r = decidirPonerseAlDia(VIEJA, estado(), libre);
    expect(r.accion).toBe("recargar");
    expect(r.clave).toBe(`${VIEJA}>${NUEVA}`);
  });
  it("misma web: nada (mismo id, mismo commit compilado dos veces, sha más corto o sin sha)", () => {
    expect(decidirPonerseAlDia(NUEVA, estado(), libre).accion).toBe("nada");
    expect(decidirPonerseAlDia("otroid-123456/0d0498cd4e", estado(), libre).accion).toBe("nada");
    expect(decidirPonerseAlDia("mwvgzqsm-u8ywii/0d0498c", estado(), libre).accion).toBe("nada");
    expect(decidirPonerseAlDia("mwvgzqsm-u8ywii", estado(), libre).accion).toBe("nada");
  });
  it("sin datos comparables no se adivina: nada", () => {
    for (const propia of [null, undefined, "", "desconocida", "?"]) expect(decidirPonerseAlDia(propia, estado(), libre).accion).toBe("nada");
    expect(decidirPonerseAlDia(VIEJA, estado({ web_corre: null }), libre).accion).toBe("nada");
    expect(decidirPonerseAlDia(VIEJA, estado({ web_corre: "?" }), libre).accion).toBe("nada");
    expect(decidirPonerseAlDia(VIEJA, null, libre).accion).toBe("nada");
  });
  it("solo con el servidor local sirviendo: arrancando, reiniciando o en la web publicada no se toca", () => {
    for (const fase of ["arrancando", "reiniciando", "web-publicada", "sin-internet", "apagado"]) {
      expect(decidirPonerseAlDia(VIEJA, estado({ fase }), libre).accion).toBe("nada");
    }
  });
  it("nunca en llamada ni escribiendo: esperar", () => {
    expect(decidirPonerseAlDia(VIEJA, estado(), { ...libre, enLlamada: true }).accion).toBe("esperar");
    expect(decidirPonerseAlDia(VIEJA, estado(), { ...libre, escribiendo: true }).accion).toBe("esperar");
  });
  it("tope: tras dos recargas por la misma diferencia se rinde (nunca un bucle)", () => {
    expect(MAX_INTENTOS_AL_DIA).toBe(2);
    expect(decidirPonerseAlDia(VIEJA, estado(), { ...libre, intentos: 1 }).accion).toBe("recargar");
    expect(decidirPonerseAlDia(VIEJA, estado(), { ...libre, intentos: 2 }).accion).toBe("rendirse");
    expect(decidirPonerseAlDia(VIEJA, estado(), { enLlamada: true, escribiendo: false, intentos: 2 }).accion).toBe("rendirse");
  });
});

function montar(o: { propia?: string; calienta?: boolean; enLlamada?: () => boolean } = {}) {
  const mem = new Map<string, string>();
  const lineas: string[] = [];
  const cuenta = { recargas: 0, calentadas: 0 };
  const deps: DepsAlDia = {
    propia: () => o.propia ?? VIEJA,
    medir: async () => ({ enLlamada: o.enLlamada?.() ?? false, escribiendo: false }),
    almacen: () => ({ getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) }),
    calentar: async () => {
      cuenta.calentadas += 1;
      return o.calienta ?? true;
    },
    recargar: () => {
      cuenta.recargas += 1;
    },
    anotar: (t) => void lineas.push(t),
  };
  return { deps, lineas, cuenta, o };
}

describe("DIR1125C · la página se pone al día sola", () => {
  it("atrasada: calienta el servidor, lo deja dicho y recarga una vez", async () => {
    const m = montar();
    expect(await mirarPaginaAlDia(estado(), m.deps)).toBe("recargar");
    expect(m.cuenta).toEqual({ recargas: 1, calentadas: 1 });
    expect(m.lineas).toEqual([`pagina-atrasada mia=${VIEJA} sirve=${NUEVA} accion=recargar intento=1`]);
  });
  it("si tras recargar sigue atrasada: un segundo intento y después se rinde, diciéndolo una sola vez", async () => {
    const m = montar();
    expect(await mirarPaginaAlDia(estado(), m.deps)).toBe("recargar");
    expect(await mirarPaginaAlDia(estado(), m.deps)).toBe("recargar");
    expect(await mirarPaginaAlDia(estado(), m.deps)).toBe("rendirse");
    expect(await mirarPaginaAlDia(estado(), m.deps)).toBe("rendirse");
    expect(m.cuenta.recargas).toBe(2);
    expect(m.lineas.filter((l) => l.includes("accion=rendirse"))).toEqual([`pagina-atrasada mia=${VIEJA} sirve=${NUEVA} accion=rendirse intentos=2`]);
  });
  it("una capa aún más nueva es otra diferencia: vuelve a tener sus dos intentos", async () => {
    const m = montar();
    await mirarPaginaAlDia(estado(), m.deps);
    await mirarPaginaAlDia(estado(), m.deps);
    expect(await mirarPaginaAlDia(estado({ web_corre: "mwvzzzzz-abcdef/1234567890" }), m.deps)).toBe("recargar");
    expect(m.cuenta.recargas).toBe(3);
  });
  it("si el servidor no contesta no recarga ni gasta intento; cuando contesta, sí", async () => {
    const m = montar({ calienta: false });
    expect(await mirarPaginaAlDia(estado(), m.deps)).toBe("esperar");
    expect(m.cuenta.recargas).toBe(0);
    m.o.calienta = true;
    expect(await mirarPaginaAlDia(estado(), m.deps)).toBe("recargar");
    expect(m.lineas.at(-1)).toContain("intento=1");
  });
  it("al día: ni calienta ni recarga", async () => {
    const m = montar({ propia: NUEVA });
    expect(await mirarPaginaAlDia(estado(), m.deps)).toBe("nada");
    expect(m.cuenta).toEqual({ recargas: 0, calentadas: 0 });
    expect(m.lineas).toEqual([]);
  });
  it("una llamada que empieza mientras se calienta el servidor para la recarga", async () => {
    let veces = 0;
    const m = montar({ enLlamada: () => (veces += 1) > 1 });
    expect(await mirarPaginaAlDia(estado(), m.deps)).toBe("esperar");
    expect(m.cuenta).toEqual({ recargas: 0, calentadas: 1 });
  });
});
