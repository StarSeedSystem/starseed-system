/**
 * CAMR · planificador multirtrayecto — §3 del contrato. Funciones puras,
 * sin red ni hardware: enlaces falsos.
 */
import { describe, expect, it } from "vitest";

import {
  LARGO_ALCANCE,
  cuotaAgotada,
  fragmentosPorMtu,
  planificar,
  type CuotasPlan,
  type MetricasPlan,
  type PaquetePlan,
} from "../planificador";
import type {
  ClaseTrafico,
  EnlaceFisico,
  Medicion,
  ParametrosRadio,
} from "../tipos";

const med = (parcial: Partial<Medicion>): Medicion => ({
  rssiDbm: null,
  snrDb: null,
  ber: null,
  ruidoDbm: null,
  latenciaMs: null,
  perdida: null,
  tiempoAireUsado: null,
  vecinos: 0,
  anchoBandaKbps: null,
  at: 0,
  ...parcial,
});

/** Enlace falso configurable; `medir`/`enviar` nunca tocan nada real. */
function enlace(parcial: Partial<EnlaceFisico> & { id: string }): EnlaceFisico {
  return {
    tecnologia: "80211s",
    banda: "wifi-5g",
    frecuenciaMhz: 5785,
    capacidadKbps: 54_000,
    mtu: 1500,
    cifradoPermitido: true,
    estado: "activo",
    medir: () => med({}),
    aplicar: (_p: ParametrosRadio, _o: { seco: boolean }) => Promise.resolve({ ok: true }),
    enviar: (_p: Uint8Array, _c: ClaseTrafico) => Promise.resolve({ ok: true }),
    ...parcial,
  };
}

const paquete = (bytes: number, cifrado = false): PaquetePlan => ({ bytes, cifrado });

const metricas = (m: Record<string, Medicion> = {}, res?: MetricasPlan["resiliencia"]): MetricasPlan => ({
  medicion: m,
  resiliencia: res,
});

const cuotasLibres = (): CuotasPlan => ({ cupoMs: {}, consumidoMs: {} });

describe("fragmentosPorMtu", () => {
  it("trocea al cruzar tecnologías por el MTU del enlace", () => {
    expect(fragmentosPorMtu(0, 1500)).toBe(0);
    expect(fragmentosPorMtu(100, 1500)).toBe(1);
    expect(fragmentosPorMtu(1501, 1500)).toBe(2);
    expect(fragmentosPorMtu(3000, 1500)).toBe(2);
    expect(fragmentosPorMtu(1024, 250)).toBe(5); // LoRa
  });
});

describe("cuotaAgotada", () => {
  it("nodo sin cupo declarado nunca está agotado", () => {
    expect(cuotaAgotada("x", cuotasLibres())).toBe(false);
  });

  it("agotado cuando el consumo alcanza el cupo", () => {
    const c: CuotasPlan = { cupoMs: { a: 100 }, consumidoMs: { a: 100 } };
    expect(cuotaAgotada("a", c)).toBe(true);
  });
});

describe("planificar · filtros duros", () => {
  it("descarta enlaces caidos o desconectados", () => {
    const enlaces = [
      enlace({ id: "caido", estado: "caido" }),
      enlace({ id: "muerto", estado: "desconectado" }),
      enlace({ id: "vivo" }),
    ];
    const rutas = planificar(paquete(100), "mensajes", enlaces, metricas(), cuotasLibres());
    expect(rutas.map((r) => r.enlaceId)).toEqual(["vivo"]);
  });

  it("nunca manda tráfico cifrado por bandas de radioaficionado", () => {
    const enlaces = [
      enlace({ id: "ham", tecnologia: "rns", banda: "ham-2m", cifradoPermitido: false }),
      enlace({ id: "wifi" }),
    ];
    const rutas = planificar(paquete(100, true), "mensajes", enlaces, metricas(), cuotasLibres());
    expect(rutas.map((r) => r.enlaceId)).toEqual(["wifi"]);
  });

  it("tampoco aunque el enlace mintiera con cifradoPermitido", () => {
    const enlaces = [
      enlace({ id: "ham", tecnologia: "rns", banda: "ham-70cm", cifradoPermitido: true }),
      enlace({ id: "wifi" }),
    ];
    // §5: la regulación manda sobre el estado declarado del enlace.
    const rutas = planificar(paquete(100, true), "mensajes", enlaces, metricas(), cuotasLibres());
    expect(rutas.map((r) => r.enlaceId)).toEqual(["wifi"]);
  });

  it("el tráfico en claro sí puede ir por bandas ham", () => {
    const enlaces = [
      enlace({ id: "ham", tecnologia: "rns", banda: "ham-2m", cifradoPermitido: false }),
    ];
    const rutas = planificar(paquete(100, false), "mensajes", enlaces, metricas(), cuotasLibres());
    expect(rutas.map((r) => r.enlaceId)).toEqual(["ham"]);
  });

  it("la clase masiva no va por LoRa salvo `forzar`", () => {
    const largo = [...LARGO_ALCANCE][0];
    const enlaces = [enlace({ id: "lora", tecnologia: largo, capacidadKbps: 20 })];
    expect(
      planificar(paquete(10_000), "masivo", enlaces, metricas(), cuotasLibres()),
    ).toEqual([]);
    const forzado = planificar(paquete(10_000), "masivo", enlaces, metricas(), cuotasLibres(), {
      forzarLoraMasivo: true,
    });
    expect(forzado.map((r) => r.enlaceId)).toEqual(["lora"]);
  });
});

describe("planificar · equidad de tiempo de aire", () => {
  const enlaces = [enlace({ id: "a" }), enlace({ id: "b" })];
  const c: CuotasPlan = { cupoMs: { a: 50 }, consumidoMs: { a: 60 } };

  it("saca del reparto al nodo con el cupo agotado", () => {
    const rutas = planificar(paquete(100), "masivo", enlaces, metricas(), c);
    expect(rutas.every((r) => r.enlaceId !== "a")).toBe(true);
  });

  it("las emergencias (control-critico) saltan el cupo", () => {
    const rutas = planificar(paquete(100), "control-critico", enlaces, metricas(), c);
    expect(rutas.some((r) => r.enlaceId === "a")).toBe(true);
  });
});

describe("planificar · política por clase", () => {
  it("tiempo-real: elige la menor latencia", () => {
    const enlaces = [enlace({ id: "lento" }), enlace({ id: "rapido" })];
    const m = metricas({
      lento: med({ latenciaMs: 120 }),
      rapido: med({ latenciaMs: 8 }),
    });
    const rutas = planificar(paquete(100), "tiempo-real", enlaces, m, cuotasLibres());
    expect(rutas[0].enlaceId).toBe("rapido");
  });

  it("masivo: ordena por mayor capacidad y trocea por MTU", () => {
    const enlaces = [
      enlace({ id: "wifi", capacidadKbps: 54_000, mtu: 1500 }),
      enlace({ id: "lenta", tecnologia: "yggdrasil", capacidadKbps: 1_000, mtu: 1300 }),
    ];
    const rutas = planificar(paquete(4_500), "masivo", enlaces, metricas(), cuotasLibres());
    expect(rutas[0].enlaceId).toBe("wifi");
    expect(rutas[0].fragmentos).toBe(3);
    expect(rutas[1].fragmentos).toBe(4);
  });

  it("control-critico: dos caminos cuando existen, redundante marcado", () => {
    const enlaces = [
      enlace({ id: "rns", tecnologia: "rns" }),
      enlace({ id: "wifi" }),
      enlace({ id: "otra", tecnologia: "batman" }),
    ];
    const m = metricas(
      {
        rns: med({ latenciaMs: 300, anchoBandaKbps: 15 }),
        wifi: med({ latenciaMs: 10, anchoBandaKbps: 40_000 }),
        otra: med({ latenciaMs: 20, anchoBandaKbps: 5_000 }),
      },
      {
        rns: { ema: 0.95, n: 40 },
        wifi: { ema: 0.5, n: 40 },
        otra: { ema: 0.6, n: 40 },
      },
    );
    const rutas = planificar(paquete(64), "control-critico", enlaces, m, cuotasLibres());
    expect(rutas).toHaveLength(2);
    expect(rutas[0].enlaceId).toBe("rns"); // resiliencia pondera más
    expect(rutas[0].motivo).toContain("primario");
    expect(rutas[1].motivo).toContain("redundante");
    expect(rutas[1].tecnologia).not.toBe(rutas[0].tecnologia);
  });

  it("control-critico: con un solo enlace devuelve solo el primario", () => {
    const enlaces = [enlace({ id: "unico", tecnologia: "rns" })];
    const rutas = planificar(paquete(64), "control-critico", enlaces, metricas(), cuotasLibres());
    expect(rutas).toHaveLength(1);
    expect(rutas[0].enlaceId).toBe("unico");
  });

  it("mensajes: mejor equilibrio por métrica híbrida", () => {
    const enlaces = [
      enlace({ id: "bueno" }),
      enlace({ id: "malo", estado: "degradado" }),
    ];
    const m = metricas({
      bueno: med({ latenciaMs: 30, anchoBandaKbps: 20_000, tiempoAireUsado: 0.1 }),
      malo: med({ latenciaMs: 900, anchoBandaKbps: 100, tiempoAireUsado: 0.9 }),
    });
    const rutas = planificar(paquete(100), "mensajes", enlaces, m, cuotasLibres());
    expect(rutas[0].enlaceId).toBe("bueno");
  });
});

describe("planificar · caída de enlace", () => {
  it("reelege al siguiente cuando el preferido cae", () => {
    const enlaces = [enlace({ id: "a", estado: "caido" }), enlace({ id: "b" })];
    const rutas = planificar(paquete(100), "tiempo-real", enlaces, metricas(), cuotasLibres());
    expect(rutas).toHaveLength(1);
    expect(rutas[0].enlaceId).toBe("b");
  });

  it("sin ningún enlace disponible devuelve lista vacía", () => {
    const enlaces = [enlace({ id: "a", estado: "caido" }), enlace({ id: "b", estado: "desconectado" })];
    expect(planificar(paquete(100), "mensajes", enlaces, metricas(), cuotasLibres())).toEqual([]);
    expect(planificar(paquete(100), "control-critico", enlaces, metricas(), cuotasLibres())).toEqual([]);
  });

  it("control-critico pierde la redundancia al caerse un camino", () => {
    const enlaces = [
      enlace({ id: "uno", tecnologia: "rns" }),
      enlace({ id: "dos", estado: "caido" }),
    ];
    const rutas = planificar(paquete(64), "control-critico", enlaces, metricas(), cuotasLibres());
    expect(rutas).toHaveLength(1);
    expect(rutas[0].enlaceId).toBe("uno");
  });
});
