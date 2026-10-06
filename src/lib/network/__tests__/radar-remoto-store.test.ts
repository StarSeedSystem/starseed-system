/**
 * Pruebas del almacén puro del radar remoto: frescura, caducidad, tope y
 * suscripción. Todo en memoria, sin red ni disco.
 */
import { describe, it, expect, beforeEach } from "vitest";
import type { ResumenRadar } from "../radar-por-malla";
import { RADAR_RESUMEN_TTL_MS } from "../radar-por-malla";
import {
  recibirResumen,
  resumenesRemotos,
  viaDe,
  setResumenLocal,
  getResumenLocal,
  suscribirRadarRemoto,
  limpiarRadarRemoto,
} from "../radar-remoto-store";

function resumen(neuronId: string, nombre: string, at: number): ResumenRadar {
  return { v: 1, neuronId, nombre, at, senales: [] };
}

beforeEach(() => {
  limpiarRadarRemoto();
});

describe("recibirResumen / resumenesRemotos", () => {
  it("el más nuevo gana para la misma neurona", () => {
    recibirResumen(resumen("n1", "alfa", 1000), "p2p");
    recibirResumen(resumen("n1", "alfa-nueva", 2000), "federacion");
    const lista = resumenesRemotos(3000);
    expect(lista).toHaveLength(1);
    expect(lista[0]?.nombre).toBe("alfa-nueva");
    expect(viaDe("n1")).toBe("federacion");
  });

  it("un resumen más viejo no pisa al más nuevo", () => {
    recibirResumen(resumen("n1", "alfa-nueva", 2000), "federacion");
    recibirResumen(resumen("n1", "alfa", 1000), "p2p");
    expect(resumenesRemotos(3000)[0]?.nombre).toBe("alfa-nueva");
    expect(viaDe("n1")).toBe("federacion");
  });

  it("ordena los vigentes por nombre", () => {
    recibirResumen(resumen("n1", "zeta", 1000), "p2p");
    recibirResumen(resumen("n2", "beta", 1000), "p2p");
    const lista = resumenesRemotos(2000);
    expect(lista.map((r) => r.nombre)).toEqual(["beta", "zeta"]);
  });

  it("descarta los caducados (edad > TTL o del futuro)", () => {
    const ahora = RADAR_RESUMEN_TTL_MS + 2_000;
    recibirResumen(resumen("n1", "vieja", 0), "p2p");
    recibirResumen(resumen("n2", "futura", ahora + 60_000), "p2p");
    recibirResumen(resumen("n3", "vigente", ahora - 1_000), "p2p");
    const lista = resumenesRemotos(ahora);
    expect(lista.map((r) => r.nombre)).toEqual(["vigente"]);
  });

  it("respeta el tope de 16 neuronas expulsando la más vieja", () => {
    for (let i = 0; i < 16; i++) {
      recibirResumen(resumen(`n${i}`, `neurona-${String(i).padStart(2, "0")}`, 1000 + i), "p2p");
    }
    recibirResumen(resumen("nueva", "zz-nueva", 5000), "federacion");
    const lista = resumenesRemotos(6000);
    expect(lista).toHaveLength(16);
    expect(lista.some((r) => r.neuronId === "n0")).toBe(false);
    expect(lista.some((r) => r.neuronId === "nueva")).toBe(true);
  });

  it("al llegar al tope, actualizar una existente no expulsa a nadie", () => {
    for (let i = 0; i < 16; i++) {
      recibirResumen(resumen(`n${i}`, `neurona-${String(i).padStart(2, "0")}`, 1000), "p2p");
    }
    recibirResumen(resumen("n5", "neurona-05b", 2000), "federacion");
    expect(resumenesRemotos(3000)).toHaveLength(16);
    expect(viaDe("n5")).toBe("federacion");
  });
});

describe("resumen local", () => {
  it("guarda y devuelve el último resumen local", () => {
    expect(getResumenLocal()).toBeNull();
    setResumenLocal(resumen("yo", "esta", 1000));
    setResumenLocal(resumen("yo", "esta-2", 2000));
    expect(getResumenLocal()?.nombre).toBe("esta-2");
  });
});

describe("suscripción", () => {
  it("avisa al recibir, al fijar el local y al limpiar; el desuscriptor calla", () => {
    let avisos = 0;
    const off = suscribirRadarRemoto(() => {
      avisos++;
    });
    recibirResumen(resumen("n1", "alfa", 1000), "p2p");
    setResumenLocal(resumen("yo", "esta", 1000));
    limpiarRadarRemoto();
    expect(avisos).toBe(3);
    off();
    recibirResumen(resumen("n2", "beta", 1000), "p2p");
    expect(avisos).toBe(3);
  });
});
