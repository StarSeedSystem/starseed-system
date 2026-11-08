import { afterEach, describe, expect, it, vi } from "vitest";
import {
  COMANDO_PROXY,
  EVENTO_PROXY,
  crearSincroProxy,
  estadoProxyNativo,
  olvidarProxyNativo,
  suscribirProxyNativo,
  textoVia,
  vistaIndicador,
  type EstadoProxyNativo,
  type PuenteProxy,
} from "@/lib/malla/puerta/proxy-nativo";

const estadoBase = (o: Partial<EstadoProxyNativo> = {}): EstadoProxyNativo => ({
  puerto: null,
  neurona: null,
  via: null,
  aplicado: false,
  soportado: true,
  plataforma: "macos",
  motivo: null,
  error: null,
  descargas: false,
  ...o,
});

function puenteFalso(respuesta: (args: Record<string, unknown>) => EstadoProxyNativo | null = (a) =>
  estadoBase({ puerto: (a.puerto as number | null) ?? null, aplicado: a.puerto != null, descargas: a.puerto != null })) {
  const llamadas: Array<Record<string, unknown>> = [];
  let oyente: ((p: unknown) => void) | null = null;
  const baja = vi.fn();
  const puente: PuenteProxy = {
    disponible: true,
    llamar: (async (cmd: string, args?: Record<string, unknown>) => {
      if (cmd === COMANDO_PROXY) {
        llamadas.push(args ?? {});
        const r = respuesta(args ?? {});
        return r ? { ok: true, valor: r } : { ok: false, motivo: "falló" };
      }
      return { ok: true, valor: estadoBase() };
    }) as PuenteProxy["llamar"],
    escuchar: async (ev, cb) => {
      expect(ev).toBe(EVENTO_PROXY);
      oyente = cb;
      return baja;
    },
  };
  return { puente, llamadas, baja, emitir: (p: unknown) => oyente?.(p) };
}

afterEach(() => olvidarProxyNativo());

describe("textoVia", () => {
  it("escribe la vía como en la tarjeta de Ajustes", () => {
    expect(textoVia("Bluetooth directo", 1)).toBe("Bluetooth directo, 1 salto");
    expect(textoVia("WiFi", 3)).toBe("WiFi, 3 saltos");
    expect(textoVia("", 0)).toBe("enlace");
  });
});

describe("crearSincroProxy", () => {
  it("no hace nada en la web (sin puente)", async () => {
    const s = crearSincroProxy(null);
    expect(await s.sincronizar({ puerto: 4000, neurona: "A" })).toBeNull();
    expect(await s.leer()).toBeNull();
    await expect(s.detener()).resolves.toBeUndefined();
    expect(estadoProxyNativo()).toBeNull();
  });

  it("tampoco si el puente no está disponible", async () => {
    const f = puenteFalso();
    const s = crearSincroProxy({ ...f.puente, disponible: false });
    expect(await s.sincronizar({ puerto: 4000 })).toBeNull();
    expect(f.llamadas).toHaveLength(0);
  });

  it("envía al arrancar, al cambiar de puerta y al parar, sin repetir lo idéntico", async () => {
    const f = puenteFalso();
    const s = crearSincroProxy(f.puente);
    await s.sincronizar({ puerto: 4100, neurona: "Casa", via: "Bluetooth directo, 1 salto" });
    await s.sincronizar({ puerto: 4100, neurona: "Casa", via: "Bluetooth directo, 1 salto" });
    await s.sincronizar({ puerto: 4100, neurona: "Taller", via: "WiFi" });
    await s.sincronizar({ puerto: null });
    expect(f.llamadas).toEqual([
      { puerto: 4100, neurona: "Casa", via: "Bluetooth directo, 1 salto" },
      { puerto: 4100, neurona: "Taller", via: "WiFi" },
      { puerto: null, neurona: null, via: null },
    ]);
    expect(estadoProxyNativo()?.aplicado).toBe(false);
  });

  it("no molesta a la app si nunca hubo proxy y sigue sin haberlo", async () => {
    const f = puenteFalso();
    const s = crearSincroProxy(f.puente);
    expect(await s.sincronizar({ puerto: null })).toBeNull();
    expect(f.llamadas).toHaveLength(0);
  });

  it("descarta puertos inválidos y recorta textos largos", async () => {
    const f = puenteFalso();
    const s = crearSincroProxy(f.puente);
    await s.sincronizar({ puerto: 4200, neurona: "x".repeat(300), via: "y".repeat(300) });
    expect((f.llamadas[0].neurona as string).length).toBe(80);
    expect((f.llamadas[0].via as string).length).toBe(120);
    await s.sincronizar({ puerto: -3, neurona: "z" });
    expect(f.llamadas[1]).toEqual({ puerto: null, neurona: null, via: null });
  });

  it("si falla el comando, reintenta en la siguiente señal", async () => {
    let falla = true;
    const f = puenteFalso((a) => (falla ? null : estadoBase({ puerto: a.puerto as number, aplicado: true })));
    const s = crearSincroProxy(f.puente);
    await s.sincronizar({ puerto: 4300 });
    falla = false;
    await s.sincronizar({ puerto: 4300 });
    expect(f.llamadas).toHaveLength(2);
    expect(estadoProxyNativo()?.puerto).toBe(4300);
  });

  it("serializa las peticiones: gana la última", async () => {
    const f = puenteFalso();
    const s = crearSincroProxy(f.puente);
    await Promise.all([s.sincronizar({ puerto: 4401 }), s.sincronizar({ puerto: 4402 }), s.sincronizar({ puerto: null })]);
    expect(f.llamadas.map((l) => l.puerto)).toEqual([4401, 4402, null]);
    expect(estadoProxyNativo()?.puerto).toBeNull();
  });

  it("sigue el evento puerta://estado y avisa a los suscritos", async () => {
    const f = puenteFalso();
    const s = crearSincroProxy(f.puente);
    await s.leer();
    const cb = vi.fn();
    const baja = suscribirProxyNativo(cb);
    f.emitir(estadoBase({ puerto: 4500, aplicado: true }));
    expect(estadoProxyNativo()?.puerto).toBe(4500);
    expect(cb).toHaveBeenCalled();
    f.emitir({ basura: true });
    expect(estadoProxyNativo()?.puerto).toBe(4500);
    baja();
  });

  it("al detener quita el proxy y deja de escuchar", async () => {
    const f = puenteFalso();
    const s = crearSincroProxy(f.puente);
    await s.sincronizar({ puerto: 4600, neurona: "A" });
    await s.detener();
    expect(f.llamadas.at(-1)).toEqual({ puerto: null, neurona: null, via: null });
    expect(f.baja).toHaveBeenCalled();
  });
});

describe("vistaIndicador", () => {
  const puerta = {
    nativo: true,
    proxyLocal: 4000 as number | null,
    internetPor: { nombre: "Casa de Ana", enlace: "Bluetooth directo", saltos: 1 },
    puertas: [] as Array<{ nombre: string; enlace: string; saltos: number }>,
  };

  it("no aparece en la web ni con internet propio", () => {
    expect(vistaIndicador({ ...puerta, nativo: false }, null).visible).toBe(false);
    expect(vistaIndicador({ ...puerta, proxyLocal: null }, null).visible).toBe(false);
  });

  it("dice «Internet por: …» con la neurona y la vía", () => {
    const v = vistaIndicador(puerta, estadoBase({ puerto: 4000, aplicado: true }));
    expect(v).toMatchObject({ visible: true, tono: "ok", texto: "Internet por: Casa de Ana (vía Bluetooth directo, 1 salto)" });
  });

  it("usa la primera puerta si aún no hay elegida", () => {
    const v = vistaIndicador({ ...puerta, internetPor: null, puertas: [{ nombre: "Taller", enlace: "WiFi", saltos: 0 }] }, null);
    expect(v.texto).toBe("Internet por: Taller (vía WiFi)");
  });

  it("explica con claridad cuando la plataforma no puede", () => {
    const v = vistaIndicador(puerta, estadoBase({ soportado: false, motivo: "Requiere macOS 14 o superior." }));
    expect(v.tono).toBe("aviso");
    expect(v.detalle).toBe("Requiere macOS 14 o superior.");
  });

  it("avisa si la app soporta el proxy pero falló al aplicarlo", () => {
    const v = vistaIndicador(puerta, estadoBase({ error: "tiempo agotado" }));
    expect(v).toMatchObject({ tono: "aviso", detalle: "tiempo agotado" });
  });
});
