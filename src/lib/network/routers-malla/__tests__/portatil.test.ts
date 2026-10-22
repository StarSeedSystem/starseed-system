import { describe, it, expect } from "vitest";

import type { EntradaTabla } from "../compatibilidad-openwrt";
import {
  TIPOS_PORTATIL,
  coordinacionPortatil,
  factorAmortiguacion,
  compatibilidadPortatil,
  resumenSinSim,
  tipoPuertaDeModem,
  puertaDesdeSim,
  cupoDePuerta,
  salidaAInternet,
  type RouterPortatil,
} from "../portatil";
import type { PuertaInternet, Solicitante } from "../../../malla/cristal/puertas-internet";
import type { ClaseDato } from "../../../malla/cristal/tipos";

function portatil(extra: Partial<RouterPortatil> = {}): RouterPortatil {
  return { id: "t1", tipo: "viaje-openwrt", bateriaPct: null, cargando: false, ...extra };
}

const tabla: EntradaTabla[] = [
  {
    fabricante: "GL.iNet",
    modelo: "Beryl",
    target: "mediatek/filogic",
    perfil: "glinet_gl-mt3000",
    soportado: true,
  },
];

describe("TIPOS_PORTATIL", () => {
  it("contiene los tres tipos del contrato", () => {
    expect(TIPOS_PORTATIL).toEqual(["viaje-openwrt", "viaje-otro", "mifi-operador"]);
  });
});

describe("coordinacionPortatil", () => {
  it("6 si está cargando, aunque la batería sea baja", () => {
    expect(coordinacionPortatil(portatil({ cargando: true, bateriaPct: 5 }))).toBe(6);
  });
  it("6 con batería desconocida (null)", () => {
    expect(coordinacionPortatil(portatil({ bateriaPct: null }))).toBe(6);
  });
  it("6 con batería ≥ 50 %, 4 entre 20 y 50 %, 3 por debajo de 20 %", () => {
    expect(coordinacionPortatil(portatil({ bateriaPct: 50 }))).toBe(6);
    expect(coordinacionPortatil(portatil({ bateriaPct: 20 }))).toBe(4);
    expect(coordinacionPortatil(portatil({ bateriaPct: 19 }))).toBe(3);
  });
});

describe("factorAmortiguacion", () => {
  it("quieto y estable: máximo 0.6", () => {
    expect(factorAmortiguacion(portatil(), 0)).toBeCloseTo(0.6);
  });
  it("volatilidad 1: 0; la volatilidad se acota a 0–1", () => {
    expect(factorAmortiguacion(portatil(), 1)).toBe(0);
    expect(factorAmortiguacion(portatil(), 5)).toBe(0);
    expect(factorAmortiguacion(portatil(), -1)).toBeCloseTo(0.6);
  });
  it("moviéndose rebate a la mitad y nunca pasa de 0.6", () => {
    expect(factorAmortiguacion(portatil({ moviendose: true }), 0)).toBeCloseTo(0.3);
    expect(factorAmortiguacion(portatil({ moviendose: true }), 0.5)).toBeCloseTo(0.15);
  });
});

describe("compatibilidadPortatil", () => {
  const modelo = (tipo: RouterPortatil["tipo"]) => ({
    fabricante: "GL.iNet",
    modelo: "Beryl",
    tipo,
  });

  it("viaje-openwrt: soportado sin flashear, con sus pasos y aviso", () => {
    const r = compatibilidadPortatil(modelo("viaje-openwrt"), tabla);
    expect(r.estado).toBe("soportado-sin-flashear");
    expect(r.enlace).toBeNull();
    expect(r.pasos).toHaveLength(3);
    expect(r.aviso).toContain("No hace falta flashear");
  });

  it("mifi-operador sin entrada soportada: bloqueado-operador con la alternativa", () => {
    const r = compatibilidadPortatil(
      { fabricante: "Operador", modelo: "MiFi X", tipo: "mifi-operador" },
      tabla,
    );
    expect(r.estado).toBe("bloqueado-operador");
    expect(r.pasos.join(" ")).toContain("Wi‑Fi (modo cliente) o por USB");
  });

  it("viaje-otro delega en la tabla: soportado con enlace cuando consta", () => {
    const r = compatibilidadPortatil(modelo("viaje-otro"), tabla);
    expect(r.estado).toBe("soportado");
    expect(r.enlace).toContain("firmware-selector.openwrt.org");
  });

  it("viaje-otro no listado: desconocido", () => {
    const r = compatibilidadPortatil(
      { fabricante: "Marca", modelo: "Raro", tipo: "viaje-otro" },
      tabla,
    );
    expect(r.estado).toBe("desconocido");
  });
});

describe("resumenSinSim", () => {
  it("explica que sin SIM es un titanio igual (la malla va por Wi‑Fi)", () => {
    const texto = resumenSinSim(portatil({ modem: null }));
    expect(texto).toContain("Sin SIM");
    expect(texto).toContain("Wi‑Fi");
    expect(texto).not.toContain("puerta a internet opcional");
  });

  it("con SIM: la menciona como puerta opcional", () => {
    const texto = resumenSinSim(
      portatil({ modem: { generacion: "4g", conSim: true } }),
    );
    expect(texto).toContain("puerta a internet opcional");
  });
});

describe("tipoPuertaDeModem — el módem y la única lista de tipos del contrato", () => {
  it("4g y 5g mapean a los tipos de puerta declarados (§8.1)", () => {
    expect(tipoPuertaDeModem(portatil({ modem: { generacion: "4g", conSim: true } }))).toBe("movil-4g");
    expect(tipoPuertaDeModem(portatil({ modem: { generacion: "5g", conSim: true } }))).toBe("movil-5g");
  });

  it("sin SIM no hay puerta: la malla va por las radios y el módem se queda apagado", () => {
    expect(tipoPuertaDeModem(portatil({ modem: { generacion: "5g", conSim: false } }))).toBeNull();
    expect(tipoPuertaDeModem(portatil({ modem: null }))).toBeNull();
  });
});

describe("puertaDesdeSim — la declaración pasa SIEMPRE por la lista blanca (§8.1)", () => {
  const declaracion = (extra: Partial<Parameters<typeof puertaDesdeSim>[0]> = {}): PuertaInternet =>
    puertaDesdeSim({
      id: "p1", neurona: "t1", cuenta: "c1", generacion: "4g",
      bajadaKbps: 5000, subidaKbps: 1000, latenciaMs: 60,
      topeMensualMb: 1000, usadoMesMb: 200,
      compartir: "mi-cuenta",
      sim: { iccid: "893401234567890", imsi: "214070123456", pin: "1234", telefono: "+34600111222" },
      ...extra,
    });

  it("la tesela jamás lleva ICCID, IMSI, PIN ni teléfono de la SIM", () => {
    const p = declaracion();
    expect(p).toMatchObject({ id: "p1", neurona: "t1", tipo: "movil-4g", medida: true });
    expect(p).not.toHaveProperty("iccid");
    expect(p).not.toHaveProperty("imsi");
    expect(p).not.toHaveProperty("pin");
    expect(p).not.toHaveProperty("telefono");
  });

  it("conserva solo los campos de la interfaz, con la reserva editable y los grupos", () => {
    expect(declaracion()).toMatchObject({
      cuenta: "c1", bajadaKbps: 5000, subidaKbps: 1000, latenciaMs: 60,
      medida: true, topeMensualMb: 1000, usadoMesMb: 200, compartir: "mi-cuenta",
    });
    expect(declaracion({ reservaDuenoPct: 40, grupos: ["g1"] })).toMatchObject({
      reservaDuenoPct: 40, grupos: ["g1"],
    });
  });

  it("5g declara movil-5g; sin tope la puerta no es medida", () => {
    expect(declaracion({ generacion: "5g" }).tipo).toBe("movil-5g");
    expect(declaracion({ topeMensualMb: undefined }).medida).toBe(false);
  });
});

describe("cupoDePuerta — permiso y restante para otros juntos (§8.1)", () => {
  const puerta: PuertaInternet = {
    id: "p1", neurona: "t1", cuenta: "c1", tipo: "movil-4g",
    bajadaKbps: 5000, subidaKbps: 1000, latenciaMs: 60,
    medida: true, topeMensualMb: 1000, usadoMesMb: 200, compartir: "mi-cuenta",
  };
  const duena: Solicitante = { cuenta: "c1", vinculado: false, grupos: [] };
  const ajena: Solicitante = { cuenta: "c2", vinculado: false, grupos: [] };

  it("el dueño puede aunque comparta con nadie; el restante para otros queda calculado igual", () => {
    expect(cupoDePuerta(puerta, duena)).toEqual({
      ok: true, motivo: "Dueño dentro de su tope", restanteParaOtrosMb: 600,
    });
  });

  it("a los demás los manda el «compartir» y el restante que dejan la reserva del dueño", () => {
    const publica = { ...puerta, compartir: "publico" as const };
    expect(cupoDePuerta(publica, ajena)).toEqual({
      ok: true, motivo: "Permitido según configuración de compartir", restanteParaOtrosMb: 600,
    });
    const porLasNubes = { ...publica, usadoMesMb: 900 };
    expect(cupoDePuerta(porLasNubes, ajena).ok).toBe(false);
    expect(cupoDePuerta(porLasNubes, ajena).motivo).toContain("No queda datos disponibles");
    expect(cupoDePuerta(publica, ajena).restanteParaOtrosMb).toBe(600);
  });

  it("sin medida ni tope no hay restante que calcular", () => {
    const libre = { ...puerta, medida: false, topeMensualMb: undefined };
    expect(cupoDePuerta(libre, ajena).restanteParaOtrosMb).toBeNull();
  });
});

describe("salidaAInternet — la salida del titanio según §8.1", () => {
  const s: Solicitante = { cuenta: "c1", vinculado: false, grupos: [] };
  const puerta = (id: string, latenciaMs: number): PuertaInternet => ({
    id, neurona: "t1", cuenta: "c1", tipo: "wifi-externa",
    bajadaKbps: 5000, subidaKbps: 5000, latenciaMs,
    medida: false, compartir: "publico",
  });
  const args = (puertas: PuertaInternet[], actual?: string) => ({
    clase: "publico" as ClaseDato,
    necesitaInternet: true,
    puertas,
    solicitante: s,
    actual,
  });

  it("lo interno y lo privado entre neuronas NUNCA usan una puerta: va por la malla P2P", () => {
    expect(salidaAInternet({ ...args([puerta("a", 100)]), clase: "interno" })).toEqual({
      puerta: null, motivo: "va por la malla P2P: no necesita salir a internet",
    });
    expect(salidaAInternet({ ...args([puerta("a", 100)]), clase: "privado" }).puerta).toBeNull();
  });

  it("si no necesita internet tampoco sale por ninguna puerta", () => {
    expect(salidaAInternet({ ...args([puerta("a", 100)]), necesitaInternet: false })).toEqual({
      puerta: null, motivo: "va por la malla P2P: no necesita salir a internet",
    });
  });

  it("elige la permitida de menor coste (latencia y ancho medidos)", () => {
    expect(salidaAInternet(args([puerta("lenta", 900), puerta("rapida", 10)])).puerta?.id).toBe("rapida");
  });

  it("histéresis del 20 %: conserva la actual si no cuesta mucho más, y cambia si cuesta mucho", () => {
    const similar = salidaAInternet(args([puerta("mejor", 10), puerta("actual", 12)], "actual"));
    expect(similar.puerta?.id).toBe("actual");
    expect(similar.motivo).toBe("Manteniendo puerta actual por histéresis");

    const cara = salidaAInternet(args([puerta("mejor", 10), puerta("actual", 900)], "actual"));
    expect(cara.puerta?.id).toBe("mejor");
    expect(cara.motivo).toBe("Puerta de menor coste seleccionada");
  });

  it("no elige puertas para las que el solicitante no tiene permiso", () => {
    const cerrada = { ...puerta("cerrada", 10), cuenta: "c9", compartir: "nadie" as const };
    const r = salidaAInternet(args([cerrada]));
    expect(r.puerta).toBeNull();
    expect(r.motivo).toBe("No hay puertas permitidas para el solicitante");
  });
});
