/**
 * BLE1124A · d2 — no mandar por Bluetooth lo que ya tiene enlace directo por Wi-Fi.
 *   · Puro: `filtrarSaludosConWifiDirecto` quita solo los saludos de neuronas con Wi-Fi directo; si la
 *     consulta falla, saluda igual (un error nunca deja un enlace sin ligar).
 *   · En el motor: con `enlaceWifiDirecto` en true, `refrescar()` NO manda `nl.hola` por el enlace
 *     Bluetooth; con false, sí lo manda (el enlace se liga como siempre).
 *   · Puro: `filtrarSaludosEnDescanso` quita saludos hacia enlaces en descanso tras caída (2 s, 5 s, 15 s) o mudos;
 *     si la consulta falla, saluda igual (un error nunca deja un enlace sin ligar).
 *   · Puro: `pasoMudezBle` detecta enlace mudo (envía latidos 60 s sin recibir ni un byte); un byte recibido lo despierta.
 *   · Puro: `esperaCaidaBle` aplica retroceso exponencial: 2 s, 5 s, 15 s según racha de caídas.
 *   · Puro: `saludosBle` decide a quién saludar ahora y por qué enlace (no saluda ligados < 2 min, respeta 30 s entre saludos).
 *   NODE_ENV=test npx vitest run src/lib/malla/__tests__/ble1124a.test.ts
 */
import { describe, expect, it } from "vitest";
import {
  crearRedBle,
  filtrarSaludosConWifiDirecto,
  filtrarSaludosEnDescanso,
  pasoMudezBle,
  detalleMudezBle,
  esperaCaidaBle,
  type DepsBle,
} from "@/lib/malla/bluetooth-directo-motor";
import { saludosBle, type EnlaceBleNativo, type LigaduraBle, type VinculoMinimo } from "@/lib/malla/bluetooth-directo";
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

describe("filtrarSaludosEnDescanso (puro) · BLE1124A", () => {
  it("quita saludos hacia enlaces en descanso (caída 2 s, 5 s, 15 s) y deja el resto", () => {
    const destinos = [
      { enlace: "b1", para: "n-caida" },
      { enlace: "b2", para: "n-normal" },
    ];
    const enDescanso = (enlace: string) => enlace === "b1";
    expect(filtrarSaludosEnDescanso(destinos, enDescanso)).toEqual([{ enlace: "b2", para: "n-normal" }]);
  });

  it("quita saludos hacia enlaces marcados como mudos", () => {
    const destinos = [
      { enlace: "b1", para: "n-mudo" },
      { enlace: "b2", para: "n-normal" },
    ];
    const enDescanso = (enlace: string) => enlace === "b1";
    expect(filtrarSaludosEnDescanso(destinos, enDescanso)).toEqual([{ enlace: "b2", para: "n-normal" }]);
  });

  it("si la consulta falla, saluda igual: un error nunca deja un enlace sin ligar", () => {
    const destinos = [{ enlace: "b1", para: "n-x" }];
    const r = filtrarSaludosEnDescanso(destinos, () => {
      throw new Error("estado no disponible");
    });
    expect(r).toEqual(destinos);
  });
});

describe("pasoMudezBle (puro) · AUD1117·F4", () => {
  const inicial = { desde: null, mudo: false };

  it("sin envíos ni recepciones: no cambia", () => {
    const r = pasoMudezBle(inicial, { ahora: 1_000_000, bytesEnviados: 0, bytesRecibidos: 0 });
    expect(r.mudez).toEqual({ desde: null, mudo: false });
    expect(r.cambio).toBe("nada");
  });

  it("con envíos y 0 bytes recibidos durante 60 s: queda mudo", () => {
    let m = pasoMudezBle(inicial, { ahora: 1_000_000, bytesEnviados: 100, bytesRecibidos: 0 });
    expect(m.mudez.desde).toBe(1_000_000);
    expect(m.mudez.mudo).toBe(false);
    expect(m.cambio).toBe("nada");

    m = pasoMudezBle(m.mudez, { ahora: 1_060_000, bytesEnviados: 200, bytesRecibidos: 0 });
    expect(m.mudez.mudo).toBe(true);
    expect(m.cambio).toBe("mudo");
  });

  it("un byte recibido despierta el enlace (cambio 'vuelve')", () => {
    let m = pasoMudezBle(inicial, { ahora: 1_000_000, bytesEnviados: 100, bytesRecibidos: 0 });
    m = pasoMudezBle(m.mudez, { ahora: 1_060_000, bytesEnviados: 200, bytesRecibidos: 0 });
    expect(m.mudez.mudo).toBe(true);

    m = pasoMudezBle(m.mudez, { ahora: 1_070_000, bytesEnviados: 300, bytesRecibidos: 50 });
    expect(m.mudez).toEqual({ desde: null, mudo: false });
    expect(m.cambio).toBe("vuelve");
  });

  it("si ya era mudo y llegan bytes: vuelve y reinicia", () => {
    const mudo = { desde: 1_000_000, mudo: true };
    const r = pasoMudezBle(mudo, { ahora: 1_100_000, bytesEnviados: 500, bytesRecibidos: 10 });
    expect(r.mudez).toEqual({ desde: null, mudo: false });
    expect(r.cambio).toBe("vuelve");
  });
});

describe("detalleMudezBle (puro) · AUD1117·F4", () => {
  it("enlace mudo: muestra segundos y bytes", () => {
    const txt = detalleMudezBle({ mudo: true, segundos: 45, bytesEnviados: 1024, bytesRecibidos: 0 });
    expect(txt).toContain("mudo=si");
    expect(txt).toContain("45 s");
    expect(txt).toContain("1024 B enviados");
    expect(txt).toContain("0 B recibidos");
  });

  it("enlace que vuelve: muestra bytes y que cuenta como alcanzable", () => {
    const txt = detalleMudezBle({ mudo: false, segundos: 0, bytesEnviados: 2048, bytesRecibidos: 512 });
    expect(txt).toContain("mudo=no");
    expect(txt).toContain("llegó un byte");
    expect(txt).toContain("2048 B enviados");
    expect(txt).toContain("512 B recibidos");
  });
});

describe("esperaCaidaBle (puro) · BLE1108B", () => {
  it("racha 1 → 2 s", () => {
    expect(esperaCaidaBle(1)).toBe(2_000);
  });

  it("racha 2 → 5 s", () => {
    expect(esperaCaidaBle(2)).toBe(5_000);
  });

  it("racha 3 en adelante → 15 s (tope)", () => {
    expect(esperaCaidaBle(3)).toBe(15_000);
    expect(esperaCaidaBle(10)).toBe(15_000);
    expect(esperaCaidaBle(100)).toBe(15_000);
  });

  it("racha <= 0 se trata como 1", () => {
    expect(esperaCaidaBle(0)).toBe(2_000);
    expect(esperaCaidaBle(-5)).toBe(2_000);
  });
});

describe("saludosBle (puro) · BLE1108B", () => {
  const ahora = 1_800_000_000_000;
  const yo = "n-yo";
  const vinculos: VinculoMinimo[] = [
    { neurona: "n-a", nombre: "A", huella: "fp-a" },
    { neurona: "n-b", nombre: "B", huella: "fp-b" },
  ];
  const enlaces: EnlaceBleNativo[] = [
    { id: "b1", rol: "central", vecino: "v1", neurona: "n-a", rssi: -60, paquete: 182, rtt_ms: 40, kbps: 160, pendientes: 0, bytes_enviados: 100, bytes_recibidos: 100, abierto_hace_ms: 10_000 },
    { id: "b2", rol: "periferico", vecino: "v2", neurona: null, rssi: -70, paquete: 182, rtt_ms: null, kbps: null, pendientes: 0, bytes_enviados: 0, bytes_recibidos: 0, abierto_hace_ms: 5_000 },
  ];
  const ligaduras: LigaduraBle[] = [
    { enlace: "b1", neurona: "n-a", huella: "fp-a", nombre: "A", limites: { maxCuerpo: 16384, porVentana: 120, ventanaMs: 10000 }, at: ahora - 5000 },
  ];
  const cuenta = ["n-a", "n-b", "n-c"];

  it("no saluda a neurona ya ligada hace < 2 min", () => {
    const res = saludosBle({
      enlaces,
      ligaduras,
      vinculos,
      cuenta,
      conClave: true,
      yo,
      ultimoHola: {},
      ahora,
    });
    expect(res.find((x) => x.para === "n-a")).toBeUndefined();
  });

  it("saluda a neurona anunciada en enlace sin ligar (ligadura > 2 min)", () => {
    const ligadurasViejas: LigaduraBle[] = [
      { enlace: "b1", neurona: "n-a", huella: "fp-a", nombre: "A", limites: { maxCuerpo: 16384, porVentana: 120, ventanaMs: 10000 }, at: ahora - 3 * 60_000 },
    ];
    const res = saludosBle({
      enlaces,
      ligaduras: ligadurasViejas,
      vinculos,
      cuenta,
      conClave: true,
      yo,
      ultimoHola: {},
      ahora,
    });
    expect(res.some((x) => x.enlace === "b1" && x.para === "n-a")).toBe(true);
  });

  it("en enlace sin neurona anunciada, saluda a vinculadas y cuenta (máx 6) que no estén ligadas", () => {
    const res = saludosBle({
      enlaces: [{ ...enlaces[1], id: "b3", neurona: null }],
      ligaduras: [],
      vinculos,
      cuenta,
      conClave: true,
      yo,
      ultimoHola: {},
      ahora,
    });
    const para = res.filter((x) => x.enlace === "b3").map((x) => x.para);
    expect(para).toContain("n-a");
    expect(para).toContain("n-b");
    expect(para).toContain("n-c");
  });

  it("respeta 30 s entre saludos por el mismo enlace", () => {
    const res = saludosBle({
      enlaces,
      ligaduras,
      vinculos,
      cuenta,
      conClave: true,
      yo,
      ultimoHola: { b1: ahora - 10_000 },
      ahora,
    });
    expect(res.find((x) => x.enlace === "b1")).toBeUndefined();
  });

  it("sin clave de faro, solo saluda a vinculadas (no a cuenta completa)", () => {
    const res = saludosBle({
      enlaces: [{ ...enlaces[1], id: "b3", neurona: null }],
      ligaduras: [],
      vinculos,
      cuenta,
      conClave: false,
      yo,
      ultimoHola: {},
      ahora,
    });
    const para = res.filter((x) => x.enlace === "b3").map((x) => x.para);
    expect(para).toContain("n-a");
    expect(para).toContain("n-b");
    expect(para).not.toContain("n-c");
  });

  it("no saluda a sí mismo", () => {
    const res = saludosBle({
      enlaces: [{ ...enlaces[1], id: "b3", neurona: null }],
      ligaduras: [],
      vinculos: [{ neurona: "n-yo", nombre: "Yo", huella: "fp-yo" }],
      cuenta: ["n-yo"],
      conClave: true,
      yo,
      ultimoHola: {},
      ahora,
    });
    expect(res.find((x) => x.para === "n-yo")).toBeUndefined();
  });
});
