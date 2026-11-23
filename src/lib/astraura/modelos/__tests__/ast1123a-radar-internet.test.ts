// Radar comparativo unificado: pruebas (AST1123A). Módulo puro.
import { describe, expect, it } from "vitest";
import type { ModeloLocal, PerfilNeurona, Veredicto } from "../tipos";
import { CandidatoRadar, calcularPuntuacionRadar, compararRadar, explicarGanador, filtrarPorEncaje, tipoFuenteRadar } from "../radar-internet";

// Catálogo mínimo de prueba
const modeloLocal: ModeloLocal = {
  id: "qwen3.5:9b",
  etiqueta: "qwen3.5:9b",
  familia: "Qwen3.5",
  editor: "Qwen",
  clase: "normal",
  tipo: "estandar",
  runtimes: ["ollama"],
  descargaGb: 6.6,
  contextoK: 256,
  herramientas: true,
  vision: true,
  razonamiento: false,
  licencia: "Apache-2.0",
  puntuacion: { eci: 139.35, fecha: "2026-01-15", nombreEpoch: "Qwen3.5-9B", fuente: "epoch.ai", comprobado: "2026-11-10" },
  estado: "comprobado",
  comprobado: "2026-11-10",
  fuentes: ["https://ollama.com/library/qwen3.5"],
  preferente: false,
  memoriaMinGb: 7,
  memoriaComodaGb: 12,
};

const modeloPreferente: ModeloLocal = {
  ...modeloLocal,
  id: "inkling-mini:q4",
  etiqueta: "Inkling-2-Mini Q4_K_M",
  familia: "Inkling",
  editor: "Unsloth",
  descargaGb: 4.2,
  preferente: true,
  puntuacion: { ...modeloLocal.puntuacion!, eci: 142.1 },
  memoriaMinGb: 5,
  memoriaComodaGb: 8,
};

const modeloVision: ModeloLocal = {
  ...modeloLocal,
  id: "llava:7b",
  etiqueta: "LLaVA 7B",
  familia: "LLaVA",
  editor: "Microsoft",
  descargaGb: 4.8,
  vision: true,
  herramientas: false,
  puntuacion: { ...modeloLocal.puntuacion!, eci: 128.5 },
  memoriaMinGb: 6,
  memoriaComodaGb: 9,
};

const modeloContexto1M: ModeloLocal = {
  ...modeloLocal,
  id: "qwen3.5:27b-1m",
  etiqueta: "Qwen3.5 27B 1M",
  descargaGb: 16.5,
  contextoK: 1024,
  puntuacion: { ...modeloLocal.puntuacion!, eci: 143.97 },
  memoriaMinGb: 10,
  memoriaComodaGb: 15,
};

const capaNeedle: ModeloLocal = {
  id: "needle3-reflejo",
  etiqueta: "Needle Reflejo",
  familia: "Needle",
  editor: "Astraura",
  clase: "normal",
  tipo: "needle",
  papel: "reflejo",
  runtimes: ["needle-nativo", "needle-wasm"],
  descargaGb: 0.15,
  contextoK: null,
  herramientas: false,
  vision: false,
  razonamiento: false,
  licencia: "MIT",
  puntuacion: null,
  estado: "comprobado",
  comprobado: "2026-11-23",
  fuentes: ["https://github.com/astraura/capas"],
  memoriaMinGb: 0.5,
  memoriaComodaGb: 1,
};

// Perfiles de neurona de prueba
const mac8: PerfilNeurona = {
  id: "mac8",
  nombre: "MacBook 8 GB",
  chip: "apple-silicon",
  plataforma: "tauri",
  ramGb: 8,
  ramFiable: true,
  vramGb: null,
  discoLibreGb: 50,
  enchufada: true,
  runtimes: ["ollama", "needle-nativo", "needle-wasm"],
  iaMalla: false,
  enLinea: true,
  puedeInstalarOllama: false,
};

const pc16: PerfilNeurona = {
  id: "pc16",
  nombre: "PC 16 GB RTX 4070",
  chip: "nvidia",
  plataforma: "tauri",
  ramGb: 16,
  ramFiable: true,
  vramGb: 12,
  discoLibreGb: 200,
  enchufada: true,
  runtimes: ["ollama", "llama-cpp", "needle-nativo", "needle-wasm"],
  iaMalla: false,
  enLinea: true,
  puedeInstalarOllama: false,
};

const movil4: PerfilNeurona = {
  id: "movil4",
  nombre: "Móvil 4 GB",
  chip: "android-soc",
  plataforma: "android",
  ramGb: 4,
  ramFiable: true,
  vramGb: null,
  discoLibreGb: 5,
  enchufada: false,
  runtimes: ["needle-wasm"],
  iaMalla: false,
  enLinea: true,
  puedeInstalarOllama: false,
};

const candidatosBase = [
  { modelo: modeloLocal, fuente: "local" as const, preferido: false },
  { modelo: modeloPreferente, fuente: "preferente" as const, preferido: true },
  { modelo: modeloVision, fuente: "ollama" as const, preferido: false },
  { modelo: modeloContexto1M, fuente: "huggingface" as const, preferido: false },
  { modelo: capaNeedle, fuente: "capa-astraura" as const, preferido: false },
];

describe("tipoFuenteRadar", () => {
  it("clasifica correctamente cada origen", () => {
    expect(tipoFuenteRadar("local")).toBe("instalado");
    expect(tipoFuenteRadar("preferente")).toBe("curado");
    expect(tipoFuenteRadar("ollama")).toBe("ollama");
    expect(tipoFuenteRadar("huggingface")).toBe("huggingface");
    expect(tipoFuenteRadar("openrouter")).toBe("openrouter");
    expect(tipoFuenteRadar("nim")).toBe("nim");
    expect(tipoFuenteRadar("servidor-propio")).toBe("servidor-propio");
    expect(tipoFuenteRadar("capa-astraura")).toBe("capa-astraura");
  });
});

describe("filtrarPorEncaje", () => {
  it("filtra modelos que no caben en la neurona", () => {
    const filtrados = filtrarPorEncaje(candidatosBase, mac8);
    expect(filtrados.length).toBe(4);
    expect(filtrados.find((c) => c.modelo.id === "qwen3.5:27b-1m")).toBeUndefined();
  });

  it("en móvil solo pasan Needle y capas ligeras", () => {
    const filtrados = filtrarPorEncaje(candidatosBase, movil4);
    expect(filtrados.every((c) => c.modelo.runtimes.includes("needle-wasm"))).toBe(true);
    expect(filtrados.length).toBe(1);
    expect(filtrados[0].modelo.id).toBe("needle3-reflejo");
  });

  it("en PC con GPU pasan los modelos Ollama y llama-cpp", () => {
    const filtrados = filtrarPorEncaje(candidatosBase, pc16);
    expect(filtrados.length).toBe(5);
  });
});

describe("calcularPuntuacionRadar", () => {
  it("puntuación base = ECI normalizado (0-100)", () => {
    const p = calcularPuntuacionRadar(modeloLocal, mac8, false);
    expect(p.eci).toBeCloseTo(77, 0);
  });

  it("modelo preferente suma bonus", () => {
    const pNormal = calcularPuntuacionRadar(modeloLocal, mac8, false);
    const pPref = calcularPuntuacionRadar(modeloPreferente, mac8, true);
    expect(pPref.total).toBeGreaterThan(pNormal.total);
  });

  it("capacidad de herramientas suma puntos", () => {
    const pConHerr = calcularPuntuacionRadar(modeloLocal, mac8, false);
    const pSinHerr = calcularPuntuacionRadar({ ...modeloLocal, herramientas: false }, mac8, false);
    expect(pConHerr.capacidades).toBeGreaterThan(pSinHerr.capacidades);
  });

  it("capacidad de visión suma puntos", () => {
    const pConVis = calcularPuntuacionRadar(modeloVision, mac8, false);
    const pSinVis = calcularPuntuacionRadar({ ...modeloVision, vision: false }, mac8, false);
    expect(pConVis.capacidades).toBeGreaterThan(pSinVis.capacidades);
  });

  it("contexto 1M suma puntos extra", () => {
    const pNormal = calcularPuntuacionRadar(modeloLocal, mac8, false);
    const p1M = calcularPuntuacionRadar(modeloContexto1M, mac8, false);
    expect(p1M.capacidades).toBeGreaterThan(pNormal.capacidades);
  });

  it("encaje hardware: recomendado = 100, justo = 60, no-cabe = 0", () => {
    const pRec = calcularPuntuacionRadar(modeloPreferente, mac8, false);
    const pJust = calcularPuntuacionRadar(modeloLocal, mac8, false);
    expect(pRec.encaje).toBe(100);
    expect(pJust.encaje).toBeLessThanOrEqual(60);
  });

  it("sin puntuación ECI usa heurística por tamaño y tipo", () => {
    const p = calcularPuntuacionRadar(capaNeedle, mac8, false);
    expect(p.eci).toBeGreaterThan(0);
    expect(p.eci).toBeLessThan(100);
  });
});

describe("compararRadar", () => {
  it("ordena por puntuación total descendente", () => {
    const ordenados = compararRadar(candidatosBase, mac8);
    expect(ordenados[0].puntuacion.total).toBeGreaterThanOrEqual(ordenados[1].puntuacion.total);
    expect(ordenados[1].puntuacion.total).toBeGreaterThanOrEqual(ordenados[2].puntuacion.total);
  });

  it("el modelo preferente que cabe gana en Mac 8 GB", () => {
    const ordenados = compararRadar(candidatosBase, mac8);
    const ganador = ordenados[0];
    expect(ganador.modelo.id).toBe("inkling-mini:q4");
    expect(ganador.preferido).toBe(true);
  });

  it("en móvil gana Needle (único que cabe)", () => {
    const ordenados = compararRadar(candidatosBase, movil4);
    expect(ordenados[0].modelo.id).toBe("needle3-reflejo");
  });
});

describe("explicarGanador", () => {
  it("devuelve frase en español con la razón", () => {
    const ordenados = compararRadar(candidatosBase, mac8);
    const explicacion = explicarGanador(ordenados[0], mac8);
    expect(explicacion).toContain("Inkling-2-Mini");
    expect(explicacion).toContain("preferente");
    expect(explicacion).toContain("cabe holgado");
  });

  it("explica cuando gana por encaje en dispositivo limitado", () => {
    const ordenados = compararRadar(candidatosBase, movil4);
    const explicacion = explicarGanador(ordenados[0], movil4);
    expect(explicacion).toContain("Needle");
    expect(explicacion).toContain("cabe holgado");
    expect(explicacion).toContain("capa");
  });

  it("menciona capacidades clave (herramientas, visión, contexto)", () => {
    const candsVision = candidatosBase.filter((c) => c.modelo.vision);
    const ordenados = compararRadar(candsVision, pc16);
    const explicacion = explicarGanador(ordenados[0], pc16);
    expect(explicacion).toContain("visión");
  });
});