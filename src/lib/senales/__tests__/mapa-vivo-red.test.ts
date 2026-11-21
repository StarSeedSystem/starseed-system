import { describe, it, expect } from "vitest";
import type { SenalEspectro } from "@/lib/senales/espectro/modelo";
import type { EstadoLectura } from "@/lib/senales/espectro/leer-senales";
import type { MapaVivoRed } from "@/lib/senales/tipos-vivo";
import type { DetectedSignal } from "@/ai/astraura/mesh/signals";

function senalPublicada(overrides: Partial<SenalEspectro> = {}): SenalEspectro {
  return {
    id: `pub-${Date.now()}-${Math.random()}`,
    medio: "wifi",
    banda: "2.4 GHz",
    frecuenciaKhz: 2437000,
    anchoKhz: 20000,
    fuerzaDbm: -45,
    calidad: 0.8,
    origen: "medida",
    capa: "publica",
    fuente: "publicada por su dueño",
    medidoEn: Date.now(),
    zona: "A1",
    vinculo: { tipo: "antena", id: "uid-ajeno-1" },
    compatibles: [],
    ...overrides,
  };
}

function senalPropiaDirectLink(overrides: Partial<SenalEspectro> = {}): SenalEspectro {
  return {
    id: `local-${Date.now()}-${Math.random()}`,
    medio: "malla",
    banda: "local",
    frecuenciaKhz: null,
    anchoKhz: null,
    fuerzaDbm: null,
    calidad: 0.9,
    origen: "medida",
    capa: "propia",
    fuente: "enlace directo sin internet",
    medidoEn: Date.now(),
    zona: null,
    vinculo: { tipo: "neurona", id: "uid-propio" },
    compatibles: [],
    ...overrides,
  };
}

function detectedSignalDirectLink(overrides: Partial<DetectedSignal> = {}): DetectedSignal {
  return {
    id: `local-${Date.now()}-${Math.random()}`,
    antenna: "account",
    antennaLabel: "account",
    signalType: "Neurona StarSeed",
    label: "Enlace directo",
    detail: "enlace directo sin internet",
    quality: 0.9,
    qualityDetail: "calidad",
    metrics: [],
    compatible: true,
    compatDetail: "compat",
    starseed: { via: "direct-link", sourceId: "uid-propio", name: "Mi aparato", ownAccount: true, capabilities: [] },
    placement: { angleRad: 0, radiusFrac: 0.5, accuracyFrac: 0.1, mode: "rf", distanceM: 100, accuracyM: 10, detail: "colocación" },
    lastHeard: Date.now(),
    actions: [],
    simulated: false,
    color: "#34d399",
    ...overrides,
  };
}

describe("construirMapaVivoRed: combinación de señales propias y publicadas", () => {
  it("con dos cuentas publicando, salen las dos y otrasCuentasPublicando = 2", () => {
    const pub1 = senalPublicada({ id: "pub-1", vinculo: { tipo: "antena", id: "uid-cuenta-1" } });
    const pub2 = senalPublicada({ id: "pub-2", vinculo: { tipo: "antena", id: "uid-cuenta-2" } });
    const publicadasSenales = [pub1, pub2];
    const publicadasEstado: EstadoLectura = "ok";
    const publicadasMotivo = undefined;
    const vivoExtras: readonly DetectedSignal[] = [];

    const red = construirMapaVivoRed(publicadasSenales, publicadasEstado, publicadasMotivo, vivoExtras);

    expect(red.senales.length).toBe(2);
    expect(red.otrasCuentasPublicando).toBe(2);
    expect(red.estado).toBe("ok");
    expect(red.motivo).toBeUndefined();
  });

  it("con una cuenta publicando y una señal propia direct-link, salen ambas y otrasCuentasPublicando = 1", () => {
    const pub1 = senalPublicada({ id: "pub-1", vinculo: { tipo: "antena", id: "uid-cuenta-1" } });
    const propia = senalPropiaDirectLink({ id: "local-1" });
    const publicadasSenales = [pub1];
    const publicadasEstado: EstadoLectura = "ok";
    const publicadasMotivo = undefined;
    const vivoExtras = [detectedSignalDirectLink({ id: "local-1" })];

    const red = construirMapaVivoRed(publicadasSenales, publicadasEstado, publicadasMotivo, vivoExtras);

    expect(red.senales.length).toBe(2);
    expect(red.senales.some((s) => s.id === "pub-1")).toBe(true);
    expect(red.senales.some((s) => s.id === "local-1")).toBe(true);
    expect(red.otrasCuentasPublicando).toBe(1);
  });

  it("sin tabla (estado sin-tabla), el motivo dice que las señales públicas no están activadas", () => {
    const publicadasSenales: SenalEspectro[] = [];
    const publicadasEstado: EstadoLectura = "sin-tabla";
    const publicadasMotivo = "la tabla os_senales_publicas no existe en este proyecto";
    const vivoExtras: readonly DetectedSignal[] = [];

    const red = construirMapaVivoRed(publicadasSenales, publicadasEstado, publicadasMotivo, vivoExtras);

    expect(red.estado).toBe("sin-tabla");
    expect(red.motivo).toBe("las señales públicas aún no están activadas en este servidor");
    expect(red.senales.length).toBe(0);
    expect(red.otrasCuentasPublicando).toBe(0);
  });

  it("lectura ok pero vacía (nadie más publicó), el motivo dice que nadie más ha publicado", () => {
    const publicadasSenales: SenalEspectro[] = [];
    const publicadasEstado: EstadoLectura = "ok";
    const publicadasMotivo = undefined;
    const vivoExtras: readonly DetectedSignal[] = [];

    const red = construirMapaVivoRed(publicadasSenales, publicadasEstado, publicadasMotivo, vivoExtras);

    expect(red.estado).toBe("ok");
    expect(red.motivo).toBe("nadie más ha publicado en esta capa todavía");
    expect(red.senales.length).toBe(0);
    expect(red.otrasCuentasPublicando).toBe(0);
  });

  it("lectura ok con señales pero motivo previo, no sobrescribe el motivo", () => {
    const pub1 = senalPublicada({ id: "pub-1", vinculo: { tipo: "antena", id: "uid-cuenta-1" } });
    const publicadasSenales = [pub1];
    const publicadasEstado: EstadoLectura = "ok";
    const publicadasMotivo = "motivo previo";
    const vivoExtras: readonly DetectedSignal[] = [];

    const red = construirMapaVivoRed(publicadasSenales, publicadasEstado, publicadasMotivo, vivoExtras);

    expect(red.motivo).toBe("motivo previo");
  });

  it("estado error, mantiene el motivo del error", () => {
    const publicadasSenales: SenalEspectro[] = [];
    const publicadasEstado: EstadoLectura = "error";
    const publicadasMotivo = "permission denied";
    const vivoExtras: readonly DetectedSignal[] = [];

    const red = construirMapaVivoRed(publicadasSenales, publicadasEstado, publicadasMotivo, vivoExtras);

    expect(red.estado).toBe("error");
    expect(red.motivo).toBe("permission denied");
  });

  it("cuenta cuentas distintas aunque haya varias señales de la misma cuenta", () => {
    const pub1 = senalPublicada({ id: "pub-1", vinculo: { tipo: "antena", id: "uid-cuenta-1" } });
    const pub2 = senalPublicada({ id: "pub-2", vinculo: { tipo: "antena", id: "uid-cuenta-1" } });
    const pub3 = senalPublicada({ id: "pub-3", vinculo: { tipo: "antena", id: "uid-cuenta-2" } });
    const publicadasSenales = [pub1, pub2, pub3];
    const publicadasEstado: EstadoLectura = "ok";
    const publicadasMotivo = undefined;
    const vivoExtras: readonly DetectedSignal[] = [];

    const red = construirMapaVivoRed(publicadasSenales, publicadasEstado, publicadasMotivo, vivoExtras);

    expect(red.senales.length).toBe(3);
    expect(red.otrasCuentasPublicando).toBe(2);
  });

  it("señales sin vinculo no cuentan como otras cuentas", () => {
    const pub1 = senalPublicada({ id: "pub-1", vinculo: { tipo: "antena", id: "uid-cuenta-1" } });
    const pub2 = { ...senalPublicada({ id: "pub-2" }), vinculo: undefined };
    const publicadasSenales = [pub1, pub2];
    const publicadasEstado: EstadoLectura = "ok";
    const publicadasMotivo = undefined;
    const vivoExtras: readonly DetectedSignal[] = [];

    const red = construirMapaVivoRed(publicadasSenales, publicadasEstado, publicadasMotivo, vivoExtras);

    expect(red.senales.length).toBe(2);
    expect(red.otrasCuentasPublicando).toBe(1);
  });

  it("varias señales propias direct-link se incluyen todas", () => {
    const pub1 = senalPublicada({ id: "pub-1", vinculo: { tipo: "antena", id: "uid-cuenta-1" } });
    const propia1 = detectedSignalDirectLink({ id: "local-1", starseed: { via: "direct-link", sourceId: "uid-propio", name: "Aparato 1", ownAccount: true, capabilities: [] } });
    const propia2 = detectedSignalDirectLink({ id: "local-2", starseed: { via: "direct-link", sourceId: "uid-propio", name: "Aparato 2", ownAccount: true, capabilities: [] } });
    const publicadasSenales = [pub1];
    const publicadasEstado: EstadoLectura = "ok";
    const publicadasMotivo = undefined;
    const vivoExtras = [propia1, propia2];

    const red = construirMapaVivoRed(publicadasSenales, publicadasEstado, publicadasMotivo, vivoExtras);

    expect(red.senales.length).toBe(3);
    expect(red.senales.filter((s) => s.capa === "propia").length).toBe(2);
    expect(red.otrasCuentasPublicando).toBe(1);
  });

  it("señales en vivoExtras que no son direct-link no se incluyen en red", () => {
    const pub1 = senalPublicada({ id: "pub-1", vinculo: { tipo: "antena", id: "uid-cuenta-1" } });
    const otraSenal = detectedSignalDirectLink({ id: "otra", starseed: { via: "neuron-registry", sourceId: "n1", name: "Otro", ownAccount: true, capabilities: [] } });
    const publicadasSenales = [pub1];
    const publicadasEstado: EstadoLectura = "ok";
    const publicadasMotivo = undefined;
    const vivoExtras = [otraSenal];

    const red = construirMapaVivoRed(publicadasSenales, publicadasEstado, publicadasMotivo, vivoExtras);

    expect(red.senales.length).toBe(1);
    expect(red.senales[0].id).toBe("pub-1");
  });
});

function senalDirectLinkToEspectro(s: DetectedSignal): SenalEspectro {
  const calidad = s.quality;
  const rttMetric = s.metrics.find((m) => m.label === "Latencia");
  const rttMs = rttMetric ? Number.parseFloat(rttMetric.value.replace(" ms", "")) : null;
  return {
    id: s.id,
    medio: "malla",
    banda: "local",
    frecuenciaKhz: null,
    anchoKhz: null,
    fuerzaDbm: null,
    calidad,
    origen: rttMs != null ? "medida" : "estimada",
    capa: "propia",
    fuente: "enlace directo sin internet",
    medidoEn: s.lastHeard,
    zona: null,
    vinculo: s.starseed?.sourceId ? { tipo: "neurona", id: s.starseed.sourceId } : undefined,
    compatibles: [],
  };
}

function construirMapaVivoRed(
  publicadasSenales: SenalEspectro[],
  publicadasEstado: EstadoLectura,
  publicadasMotivo: string | undefined,
  vivoExtras: readonly DetectedSignal[]
): MapaVivoRed {
  const senalesPropias = vivoExtras
    .filter((s) => s.starseed?.via === "direct-link")
    .map(senalDirectLinkToEspectro);
  const todas = [...publicadasSenales, ...senalesPropias];
  const otrasCuentas = new Set(publicadasSenales.map((s) => s.vinculo?.id).filter((id): id is string => !!id)).size;
  let motivo = publicadasMotivo;
  if (publicadasEstado === "ok" && publicadasSenales.length === 0 && !motivo) {
    motivo = "nadie más ha publicado en esta capa todavía";
  } else if (publicadasEstado === "sin-tabla") {
    motivo = "las señales públicas aún no están activadas en este servidor";
  }
  return {
    senales: todas,
    estado: publicadasEstado,
    motivo,
    otrasCuentasPublicando: otrasCuentas,
  };
}