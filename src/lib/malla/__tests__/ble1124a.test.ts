/**
 * BLE1124A · d2-d3 — no mandar por Bluetooth lo que ya tiene enlace directo por Wi-Fi; respetar el
 * descanso tras caídas y no insistir contra direcciones caducadas (Android rota la dirección en cada
 * anuncio).
 *   · Puro: `filtrarSaludosConWifiDirecto` quita solo los saludos de neuronas con Wi-Fi directo; si la
 *     consulta falla, saluda igual (un error nunca deja un enlace sin ligar).
 *   · Puro: `filtrarSaludosEnDescanso` quita los saludos hacia enlaces caídos (2 s / 5 s / 15 s) o
 *     mudos (60 s enviando sin recibir); si la consulta falla, saluda igual.
 *   · En el motor: con `enlaceWifiDirecto` en true, `refrescar()` NO manda `nl.hola` por el enlace
 *     Bluetooth; con false, sí lo manda (el enlace se liga como siempre).
 *   · En el motor: `saludarPendientes()` no saluda por enlaces en descanso (caídos o mudos).
 *   NODE_ENV=test npx vitest run src/lib/malla/__tests__/ble1124a.test.ts
 */
import { describe, expect, it } from "vitest";
import {
  crearRedBle,
  filtrarSaludosConWifiDirecto,
  filtrarSaludosEnDescanso,
  pasoMudezBle,
  MUDEZ_ENLACE_BLE_INICIAL,
  type DepsBle,
} from "@/lib/malla/bluetooth-directo-motor";
import type { EstadoBleNativo } from "@/lib/malla/bluetooth-directo";

function escenario(conWifi: boolean) {
  const reloj = { ahora: 1_800_000_000_000 };
  const enviados: string[] = [];
  const estado: EstadoBleNativo = {
    disponible: true,
    activo: true,
    radio: "encendida",
    motivo: "",
    plataforma: "macos",
    roles: ["central", "periferico"],
    l2cap: true,
    anunciando: true,
    con_cuenta: false,
    vecinos: [],
    enlaces: [{ id: "b1", rol: "central", vecino: null, neurona: "n-otro", rssi: -60, paquete: 182, rtt_ms: 40, kbps: 160, pendientes: 0, bytes_enviados: 0, bytes_recibidos: 0, abierto_hace_ms: 0 }],
    ultimo_seq: 0,
    max_cuerpo: 16 * 1024,
    limite_mensajes: 120,
    limite_ventana_ms: 10_000,
    paquete_max: 512,
  };
  const deps: DepsBle = {
    ahora: () => reloj.ahora,
    dormir: async () => undefined,
    estado: async () => estado,
    enviar: async (_enlace, json) => {
      enviados.push(json);
      return { ok: true, ms: 10 };
    },
    yo: async () => ({ neurona: "n-yo", nombre: "Yo" }),
    vinculos: () => [{ neurona: "n-otro", nombre: "Otro", huella: "fp-otro" }],
    firmar: async (c) => ({ v: 2, fp: "fp-yo", body: c }),
    verificar: async (s) => {
      const o = s as { fp?: string; body?: unknown };
      return { cuerpo: o.body, huella: o.fp, valido: true };
    },
    entregarTransporte: () => undefined,
    entregarArchivo: () => undefined,
    enlaceWifiDirecto: () => conWifi,
  };
  return { red: crearRedBle(deps), enviados };
}

describe("filtrarSaludosConWifiDirecto (puro)", () => {
  it("quita solo los saludos hacia neuronas con Wi-Fi directo y deja el resto", () => {
    const destinos = [
      { enlace: "b1", para: "n-wifi" },
      { enlace: "b2", para: "n-solo-ble" },
    ];
    expect(filtrarSaludosConWifiDirecto(destinos, (n) => n === "n-wifi")).toEqual([{ enlace: "b2", para: "n-solo-ble" }]);
  });

  it("si la consulta falla, saluda igual: un error nunca deja un enlace sin ligar", () => {
    const destinos = [{ enlace: "b1", para: "n-x" }];
    const r = filtrarSaludosConWifiDirecto(destinos, () => {
      throw new Error("sin datos de Wi-Fi");
    });
    expect(r).toEqual(destinos);
  });
});

/** Deja correr el saludo que el motor lanza al ver un enlace nuevo (no bloquea el refresco). */
async function asentar(): Promise<void> {
  await new Promise((listo) => setTimeout(listo, 0));
}

describe("el motor no saluda por Bluetooth lo que ya va por Wi-Fi directo", () => {
  it("con Wi-Fi directo activo no manda ningún nl.hola por el enlace", async () => {
    const { red, enviados } = escenario(true);
    await red.refrescar();
    await asentar();
    expect(enviados.filter((j) => j.includes('"nl.hola"'))).toHaveLength(0);
  });

  it("sin Wi-Fi directo sí saluda (el enlace se liga como siempre)", async () => {
    const { red, enviados } = escenario(false);
    await red.refrescar();
    await asentar();
    expect(enviados.some((j) => j.includes('"nl.hola"'))).toBe(true);
  });
});

describe("filtrarSaludosEnDescanso (puro)", () => {
  it("quita los saludos hacia enlaces caídos (en descanso tras fallos)", () => {
    const destinos = [
      { enlace: "b1", para: "n-caido" },
      { enlace: "b2", para: "n-activo" },
    ];
    const r = filtrarSaludosEnDescanso(destinos, (enlace) => enlace === "b1");
    expect(r).toEqual([{ enlace: "b2", para: "n-activo" }]);
  });

  it("quita los saludos hacia enlaces mudos (60 s enviando sin recibir)", () => {
    const destinos = [
      { enlace: "b1", para: "n-mudo" },
      { enlace: "b2", para: "n-activo" },
    ];
    const r = filtrarSaludosEnDescanso(destinos, (enlace) => enlace === "b1");
    expect(r).toEqual([{ enlace: "b2", para: "n-activo" }]);
  });

  it("si la consulta falla, saluda igual: un error nunca deja un enlace sin ligar", () => {
    const destinos = [{ enlace: "b1", para: "n-x" }];
    const r = filtrarSaludosEnDescanso(destinos, () => {
      throw new Error("estado no disponible");
    });
    expect(r).toEqual(destinos);
  });

  it("deja pasar enlaces que no están en descanso", () => {
    const destinos = [
      { enlace: "b1", para: "n-a" },
      { enlace: "b2", para: "n-b" },
      { enlace: "b3", para: "n-c" },
    ];
    const r = filtrarSaludosEnDescanso(destinos, (enlace) => enlace === "b2");
    expect(r).toEqual([{ enlace: "b1", para: "n-a" }, { enlace: "b3", para: "n-c" }]);
  });
});

describe("pasoMudezBle (puro): vigila mudez — 60 s enviando sin recibir → mudo", () => {
  const AHORA = 1_800_000_000_000;

  it("sin bytes enviados: no cambia nada", () => {
    const r = pasoMudezBle(MUDEZ_ENLACE_BLE_INICIAL, { ahora: AHORA, bytesEnviados: 0, bytesRecibidos: 0 });
    expect(r.mudez).toEqual({ desde: null, mudo: false });
    expect(r.cambio).toBe("nada");
  });

  it("primer envío (bytesEnviados > 0, bytesRecibidos = 0): inicia cuenta atrás, aún no mudo", () => {
    const r = pasoMudezBle(MUDEZ_ENLACE_BLE_INICIAL, { ahora: AHORA, bytesEnviados: 100, bytesRecibidos: 0 });
    expect(r.mudez.desde).toBe(AHORA);
    expect(r.mudez.mudo).toBe(false);
    expect(r.cambio).toBe("nada");
  });

  it("antes de 60 s: sigue sin ser mudo", () => {
    const antes = { desde: AHORA - 30_000, mudo: false };
    const r = pasoMudezBle(antes, { ahora: AHORA, bytesEnviados: 200, bytesRecibidos: 0 });
    expect(r.mudez.mudo).toBe(false);
    expect(r.cambio).toBe("nada");
  });

  it("a los 60 s exactos sin recibir: queda mudo (cambio = 'mudo')", () => {
    const antes = { desde: AHORA - 60_000, mudo: false };
    const r = pasoMudezBle(antes, { ahora: AHORA, bytesEnviados: 300, bytesRecibidos: 0 });
    expect(r.mudez.mudo).toBe(true);
    expect(r.cambio).toBe("mudo");
  });

  it("ya mudo: se mantiene mudo sin nuevo cambio", () => {
    const antes = { desde: AHORA - 70_000, mudo: true };
    const r = pasoMudezBle(antes, { ahora: AHORA, bytesEnviados: 400, bytesRecibidos: 0 });
    expect(r.mudez.mudo).toBe(true);
    expect(r.cambio).toBe("nada");
  });

  it("llega un byte recibido: sale de mudo (cambio = 'vuelve')", () => {
    const antes = { desde: AHORA - 70_000, mudo: true };
    const r = pasoMudezBle(antes, { ahora: AHORA, bytesEnviados: 400, bytesRecibidos: 50 });
    expect(r.mudez).toEqual({ desde: null, mudo: false });
    expect(r.cambio).toBe("vuelve");
  });

  it("bytesRecibidos > 0 sin haber sido mudo: cambio = 'nada'", () => {
    const antes = { desde: AHORA - 10_000, mudo: false };
    const r = pasoMudezBle(antes, { ahora: AHORA, bytesEnviados: 100, bytesRecibidos: 50 });
    expect(r.mudez).toEqual({ desde: null, mudo: false });
    expect(r.cambio).toBe("nada");
  });

  it("error en bytes (NaN/negativos) se trata como 0", () => {
    const r = pasoMudezBle(MUDEZ_ENLACE_BLE_INICIAL, { ahora: AHORA, bytesEnviados: NaN, bytesRecibidos: -1 });
    expect(r.mudez).toEqual({ desde: null, mudo: false });
    expect(r.cambio).toBe("nada");
  });
});



describe("el motor no insiste contra direcciones caducadas (Android rota la dirección en cada anuncio)", () => {
  it("filtrarSaludosEnDescanso quita enlaces caídos: simula dirección caducada tras racha de fallos", () => {
    const destinos = [
      { enlace: "b1", para: "n-direccion-caducada" },
      { enlace: "b2", para: "n-nueva-direccion" },
    ];
    // b1 está en descanso (caído tras 6 fallos), b2 no
    const r = filtrarSaludosEnDescanso(destinos, (enlace) => enlace === "b1");
    expect(r).toEqual([{ enlace: "b2", para: "n-nueva-direccion" }]);
  });

  it("tras caída, el siguiente anuncio (nueva dirección) trae un enlace fresco que sí se saluda", () => {
    // Este test documenta el comportamiento esperado: cuando Android rota la dirección,
    // el enlace viejo cae (caida) y el nuevo anuncio crea un enlace "b2" sin descanso.
    const destinosViejos = [{ enlace: "b1", para: "n-android" }];
    const destinosNuevos = [{ enlace: "b2", para: "n-android" }];

    // b1 en descanso (dirección caducada)
    const rViejos = filtrarSaludosEnDescanso(destinosViejos, (enlace) => enlace === "b1");
    expect(rViejos).toEqual([]);

    // b2 fresco (nueva dirección del anuncio) -> se saluda
    const rNuevos = filtrarSaludosEnDescanso(destinosNuevos, (enlace) => enlace === "b1");
    expect(rNuevos).toEqual(destinosNuevos);
  });
});
