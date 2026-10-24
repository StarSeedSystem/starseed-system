// Pruebas del aprendizaje de Laya (LYS1018M). Sin red y sin modelo: usa respuestas de ejemplo, forma JSONL.
import { describe, expect, it } from "vitest";
import { anotar, umbralRecalibrado, exportarJSONL, type RegistroAprendizaje } from "../aprendizaje-laya";

import { type Punto, type Ambito, type Estado } from "./../aprendizaje-laya";

const estadoPublico = "Texto completo de decisión pública";
const estadoPrivado = "0a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"; // huella de ejemplo

const r25 = (i: number): RegistroAprendizaje => {
  const punto: Punto = "reflejo.herramienta";
  const ambito: Ambito = "perfil";
  const resultado: Estado = i % 3 === 0 ? "aceptada" : "corregida";
  return {
    punto,
    ambito,
    p: 0.5 + i * 0.02,
    donde: "a1",
    ms: 2000 + i * 100,
    resultado,
    privado: false,
    estado: estadoPublico,
  };
};

const r35 = (i: number): RegistroAprendizaje => {
  const punto: Punto = "plan.dificultad";
  const ambito: Ambito = "cuenta";
  const resultado: Estado = i % 2 === 0 ? "escalada" : "corregida";
  return {
    punto,
    ambito,
    p: 0.7 + i * 0.01,
    donde: "mac",
    ms: 3000 + i * 200,
    resultado,
    privado: true,
    estado: estadoPrivado,
  };
};

const reg25 = Array.from({ length: 25 }, (_, i) => r25(i));
const reg35 = Array.from({ length: 35 }, (_, i) => r35(i));

const regCompleto: RegistroAprendizaje[] = [
  {
    punto: "reflejo.herramienta",
    ambito: "perfil",
    p: 0.8,
    donde: "a1",
    ms: 2000,
    resultado: "aceptada",
    privado: false,
    estado: estadoPublico,
  },
  {
    punto: "reflejo.herramienta",
    ambito: "perfil",
    p: 0.6,
    donde: "a1",
    ms: 2100,
    resultado: "corregida",
    privado: false,
    estado: estadoPublico,
  },
  {
    punto: "plan.dificultad",
    ambito: "cuenta",
    p: 0.9,
    donde: "mac",
    ms: 3000,
    resultado: "aceptada",
    privado: false,
    estado: estadoPublico,
  },
  {
    punto: "plan.dificultad",
    ambito: "cuenta",
    p: 0.3,
    donde: "mac",
    ms: 3100,
    resultado: "escalada",
    privado: false,
    estado: estadoPublico,
  },
  {
    punto: "respuesta.basta",
    ambito: "pagina",
    p: 0.7,
    donde: "a1",
    ms: 2500,
    resultado: "aceptada",
    privado: false,
    estado: estadoPublico,
  },
  {
    punto: "privacidad.subir",
    ambito: "grupo",
    p: 0.4,
    donde: "mac",
    ms: 4000,
    resultado: "corregida",
    privado: true,
    estado: estadoPrivado,
  },
];

describe("anotar", () => {
  it("agrega un nuevo caso al registro", () => {
    const reg: RegistroAprendizaje[] = [];
    const decision: {
      punto: "reflejo.herramienta";
      ambito: "perfil";
      p: number;
      donde: string;
      ms: number;
      resultado: "aceptada";
      privado: false;
      estado: string;
    } = { punto: "reflejo.herramienta", ambito: "perfil", p: 0.8, donde: "a1", ms: 2000, resultado: "aceptada", privado: false, estado: estadoPublico };
    const resultado = anotar(reg, decision);
    expect(resultado).toHaveLength(1);
    expect(resultado[0]).toMatchObject(decision);
    expect(resultado[0].estado).toBe(estadoPublico);
  });

  it("la huella privada se guarda como estado", () => {
    const reg: RegistroAprendizaje[] = [];
    const decision: {
      punto: "plan.dificultad";
      ambito: "cuenta";
      p: number;
      donde: string;
      ms: number;
      resultado: "corregida";
      privado: true;
      estado: string;
    } = { punto: "plan.dificultad", ambito: "cuenta", p: 0.5, donde: "mac", ms: 3000, resultado: "corregida", privado: true, estado: estadoPrivado };
    const resultado = anotar(reg, decision);
    expect(resultado[0].estado).toBe(estadoPrivado);
    expect(resultado[0].privado).toBe(true);
  });
});

describe("umbralRecalibrado", () => {
  it("devuelve 0.6 si hay menos de 30 casos", () => {
    const reg = Array.from({ length: 29 }, (_, i) => r25(i));
    const umbral = umbralRecalibrado(reg, "reflejo.herramienta", "perfil");
    expect(umbral).toBe(0.6);
  });

  it("calcula el umbral que minimiza correcciones con ≥30 casos", () => {
    const reg = Array.from({ length: 35 }, (_, i) => r25(i));
    const umbral = umbralRecalibrado(reg, "reflejo.herramienta", "perfil");
    expect(umbral).toBeGreaterThanOrEqual(0);
    expect(umbral).toBeLessThanOrEqual(1);
    const aceptados = reg.filter(r => r.resultado === "aceptada").length;
    expect(umbral).toBeCloseTo((reg.length - aceptados) / reg.length);
  });

  it("devuelve el umbral del catálogo si hay menos de 30 casos", () => {
    const umbral = umbralRecalibrado(regCompleto, "respuesta.basta", "pagina");
    expect(umbral).toBe(0.6);
  });
});

describe("exportarJSONL", () => {
  it("exporta solo casos no privados en formato JSONL", () => {
    const reg = regCompleto;
    const jsonl = exportarJSONL(reg);
    const lineas = jsonl.split("\n").filter(l => l.length > 0);
    expect(lineas).toHaveLength(5);
    for (const linea of lineas) {
      const obj = JSON.parse(linea);
      expect(obj.privado).toBe(false);
    }
  });

  it("devuelve cadena vacía si no hay casos no privados", () => {
    const regPrivados = reg35;
    const jsonl = exportarJSONL(regPrivados);
    expect(jsonl).toBe("");
  });

  it("devuelve cadena vacía si el registro está vacío", () => {
    const regVacio: RegistroAprendizaje[] = [];
    const jsonl = exportarJSONL(regVacio);
    expect(jsonl).toBe("");
  });
});