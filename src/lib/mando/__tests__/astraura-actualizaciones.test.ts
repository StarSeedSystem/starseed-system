import { describe, it, expect } from "vitest";
import {
  leerEstados,
  filas,
  avisosPendientes,
  ultimoCicloNocturno,
  type EntradaEstados,
} from "../astraura-actualizaciones";

const NEEDLE_FIXTURE = {
  instalado: "v3.1.0",
  pypi: "3.1.0",
  pesos_sha: "abc1234",
  siguiente_mayor: { needle4: true },
  fecha: "2026-09-20 06:00",
};

const BITNET_FIXTURE = {
  upstream: { motor_commit: "def5678", modelo_sha: "7890abc" },
  instalado: { modelo_mb: 4700, modelo_fecha: "2026-09-19" },
  avisos: ["Motor BitNet con nuevos commits upstream"],
};

const MANIFIESTO_FIXTURE = {
  actual: "adaptador-20260920",
  sha: "999aaa",
  t: "2026-09-20T04:10:00",
  experiencias: 120,
  exactitud_dorado: 0.95,
  estado: "activo",
};

const LOG_SIX_LINES = [
  "2026-09-20 04:10:00 Inicio ciclo nocturno de aprendizaje",
  "2026-09-20 04:10:05 Procesando 120 experiencias acumuladas",
  "2026-09-20 04:10:20 Entrenando adaptador de agudeza colectiva",
  "2026-09-20 04:10:45 Evaluando exactitud en set dorado...",
  "2026-09-20 04:10:50 Set dorado exactitud: 0.95 (supera umbral 0.90)",
  "2026-09-20 04:10:55 Adaptador publicado con exito",
].join("\n");

describe("astraura-actualizaciones", () => {
  const entradaCompleta: EntradaEstados = {
    needle: NEEDLE_FIXTURE,
    bitnet: BITNET_FIXTURE,
    manifiesto: MANIFIESTO_FIXTURE,
    logAprendizaje: LOG_SIX_LINES,
  };

  it("leerEstados procesa fixtures correctamente", () => {
    const s = leerEstados(entradaCompleta);
    expect(s.hayNeedle).toBe(true);
    expect(s.hayBitnet).toBe(true);
    expect(s.hayManifiesto).toBe(true);
    expect(s.needle.n4).toBe(true);
  });

  it("filas retorna 4 filas con nombres exactos de sistemas", () => {
    const res = filas(entradaCompleta);
    expect(res).toHaveLength(4);
    expect(res[0].sistema).toBe("Needle 3");
    expect(res[1].sistema).toBe("BitNet 1.58");
    expect(res[2].sistema).toBe("Adaptador colectivo");
    expect(res[3].sistema).toBe("Repo Astraura");
    expect(res[0].accion).toBe("aviso: decide Alex");
    expect(res[3].accion).toBe("se actualiza solo");
  });

  it("avisosPendientes detecta alertas de needle4, bitnet y manifiesto", () => {
    const avisos = avisosPendientes(entradaCompleta);
    expect(avisos.some((a) => a.includes("Needle 4"))).toBe(true);
    expect(avisos.some((a) => a.includes("Motor BitNet"))).toBe(true);
    expect(avisos.some((a) => a.includes("Pesos BitNet"))).toBe(true);
  });

  it("avisosPendientes detecta adaptador rechazado", () => {
    const avisos = avisosPendientes({
      manifiesto: { estado: "rechazado" },
    });
    expect(avisos).toContain("Adaptador colectivo rechazado por el set dorado");
  });

  it("ultimoCicloNocturno analiza las lineas de log correctamente", () => {
    const info = ultimoCicloNocturno(LOG_SIX_LINES);
    expect(info.t).toBe("2026-09-20 04:10:00");
    expect(info.resultado).toBe("publicado");
    expect(info.detalle).toContain("Adaptador publicado");
  });

  it("ultimoCicloNocturno detecta maquina ahogada y descartado", () => {
    const logAhogada = "2026-09-20 04:10:00 Error: máquina ahogada por memoria OOM";
    expect(ultimoCicloNocturno(logAhogada).resultado).toBe("máquina ahogada");

    const logDescartado = "2026-09-20 04:10:00 Adaptador descartado por fallar set dorado";
    expect(ultimoCicloNocturno(logDescartado).resultado).toBe("descartado");

    const logSinExp = "2026-09-20 04:10:00 0 experiencias acumuladas";
    expect(ultimoCicloNocturno(logSinExp).resultado).toBe("sin experiencias");
  });
});
