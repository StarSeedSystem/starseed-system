// Selector contextual por agente/bot, señales y capas: pruebas (AST1123B). Módulo puro.
import { describe, expect, it } from "vitest";
import type { ModeloLocal, PerfilNeurona } from "../tipos";
import {
  AmbitoCapa,
  Entidad,
  SenalesRed,
  crearSenalesRed,
  tipoEntidad,
  tipoAmbitoCapa,
  seleccionarModeloContextual,
  ContextoSelector,
} from "../selector-contextual";
import { tipoFuenteRadar, CandidatoRadar } from "../radar-internet";

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

const modeloAbliterated: ModeloLocal = {
  ...modeloLocal,
  id: "huihui_ai/inkling-uncensored:q4",
  etiqueta: "Inkling-2-Mini Uncensored Q4",
  clase: "abliterated",
  preferente: false,
  puntuacion: null,
  baseId: "inkling-mini:q4",
  publicador: "huihui_ai",
  fuentes: ["https://ollama.com/huihui_ai/inkling-uncensored"],
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

const candidatosBase: readonly CandidatoRadar[] = [
  { modelo: modeloLocal, fuente: "local", preferido: false, puntuacion: { eci: 77, encaje: 60, capacidades: 55, preferencia: 0, total: 64 } },
  { modelo: modeloPreferente, fuente: "preferente", preferido: true, puntuacion: { eci: 79, encaje: 100, capacidades: 45, preferencia: 15, total: 78 } },
  { modelo: modeloAbliterated, fuente: "ollama", preferido: false, puntuacion: { eci: 0, encaje: 60, capacidades: 55, preferencia: 0, total: 45 } },
  { modelo: capaNeedle, fuente: "capa-astraura", preferido: false, puntuacion: { eci: 55, encaje: 100, capacidades: 0, preferencia: 0, total: 62 } },
];

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

const ctxBase: ContextoSelector = {
  entidad: "usuario",
  ambito: "privada",
  senales: crearSenalesRed({ local: true, mallaP2p: false, bluetooth: false, internet: true }),
  perfilNeurona: mac8,
  candidatos: [],
};

describe("tipos y constructores", () => {
  it("tipoEntidad acepta solo valores válidos", () => {
    expect(tipoEntidad("agente")).toBe("agente");
    expect(tipoEntidad("bot")).toBe("bot");
    expect(tipoEntidad("usuario")).toBe("usuario");
  });

  it("tipoAmbitoCapa acepta solo valores válidos", () => {
    expect(tipoAmbitoCapa("publica")).toBe("publica");
    expect(tipoAmbitoCapa("privada")).toBe("privada");
    expect(tipoAmbitoCapa("compartida")).toBe("compartida");
  });

  it("crearSenalesRed construye objeto con valores por defecto falsos", () => {
    const s = crearSenalesRed({});
    expect(s.local).toBe(false);
    expect(s.mallaP2p).toBe(false);
    expect(s.bluetooth).toBe(false);
    expect(s.internet).toBe(false);
  });

  it("crearSenalesRed respeta valores pasados", () => {
    const s = crearSenalesRed({ local: true, internet: true });
    expect(s.local).toBe(true);
    expect(s.internet).toBe(true);
    expect(s.mallaP2p).toBe(false);
    expect(s.bluetooth).toBe(false);
  });
});

describe("seleccionarModeloContextual", () => {
  it("devuelve el modelo preferente que cabe en ámbito privado con internet", () => {
    const resultado = seleccionarModeloContextual({
      ...ctxBase,
      candidatos: candidatosBase,
    });
    expect(resultado.modelo).not.toBeNull();
    expect(resultado.modelo?.id).toBe("inkling-mini:q4");
    expect(resultado.fuente).toBe("preferente");
    expect(resultado.privacidadRespetada).toBe(true);
  });

  it("NUNCA elige variante abliterated en selección automática (ámbito privado)", () => {
    const candidatosConAbliterated: readonly CandidatoRadar[] = [
      { modelo: modeloAbliterated, fuente: "ollama", preferido: false, puntuacion: { eci: 0, encaje: 60, capacidades: 55, preferencia: 0, total: 90 } }, // Puntuación alta artificial
      { modelo: modeloPreferente, fuente: "preferente", preferido: true, puntuacion: { eci: 79, encaje: 100, capacidades: 45, preferencia: 15, total: 78 } },
    ];
    const resultado = seleccionarModeloContextual({
      ...ctxBase,
      candidatos: candidatosConAbliterated,
    });
    expect(resultado.modelo?.clase).toBe("normal");
    expect(resultado.modelo?.id).toBe("inkling-mini:q4");
  });

  it("NUNCA elige variante abliterated en ámbito público", () => {
    const candidatosConAbliterated: readonly CandidatoRadar[] = [
      { modelo: modeloAbliterated, fuente: "ollama", preferido: false, puntuacion: { eci: 0, encaje: 60, capacidades: 55, preferencia: 0, total: 90 } },
      { modelo: modeloLocal, fuente: "local", preferido: false, puntuacion: { eci: 77, encaje: 60, capacidades: 55, preferencia: 0, total: 64 } },
    ];
    const resultado = seleccionarModeloContextual({
      ...ctxBase,
      ambito: "publica",
      candidatos: candidatosConAbliterated,
    });
    expect(resultado.modelo?.clase).toBe("normal");
    expect(resultado.modelo?.id).toBe("qwen3.5:9b");
  });

  it("NUNCA elige variante abliterated en ámbito compartido", () => {
    const candidatosConAbliterated: readonly CandidatoRadar[] = [
      { modelo: modeloAbliterated, fuente: "ollama", preferido: false, puntuacion: { eci: 0, encaje: 60, capacidades: 55, preferencia: 0, total: 90 } },
      { modelo: modeloLocal, fuente: "local", preferido: false, puntuacion: { eci: 77, encaje: 60, capacidades: 55, preferencia: 0, total: 64 } },
    ];
    const resultado = seleccionarModeloContextual({
      ...ctxBase,
      ambito: "compartida",
      candidatos: candidatosConAbliterated,
    });
    expect(resultado.modelo?.clase).toBe("normal");
  });

  it("en móvil sin internet ni malla, solo elige capas locales (Needle)", () => {
    const candidatosMovil: readonly CandidatoRadar[] = [
      { modelo: modeloLocal, fuente: "local", preferido: false, puntuacion: { eci: 77, encaje: 0, capacidades: 55, preferencia: 0, total: 0 } }, // encaje 0 = no cabe
      { modelo: capaNeedle, fuente: "capa-astraura", preferido: false, puntuacion: { eci: 55, encaje: 100, capacidades: 0, preferencia: 0, total: 62 } },
    ];
    const resultado = seleccionarModeloContextual({
      ...ctxBase,
      perfilNeurona: movil4,
      senales: crearSenalesRed({ local: true, internet: false, mallaP2p: false }),
      candidatos: candidatosMovil,
    });
    expect(resultado.modelo?.id).toBe("needle3-reflejo");
    expect(resultado.fuente).toBe("capa-astraura");
  });

  it("para agente en ámbito compartido, prefiere modelo con herramientas si cabe", () => {
    const candidatosAgente: readonly CandidatoRadar[] = [
      { modelo: { ...modeloLocal, herramientas: true }, fuente: "local", preferido: false, puntuacion: { eci: 77, encaje: 60, capacidades: 80, preferencia: 0, total: 70 } },
      { modelo: { ...modeloPreferente, herramientas: false }, fuente: "preferente", preferido: true, puntuacion: { eci: 79, encaje: 100, capacidades: 45, preferencia: 15, total: 78 } },
    ];
    const resultado = seleccionarModeloContextual({
      ...ctxBase,
      entidad: "agente",
      ambito: "compartida",
      candidatos: candidatosAgente,
    });
    // El modelo con herramientas debe ser preferido para agentes en ámbito compartido
    expect(resultado.modelo?.herramientas).toBe(true);
  });

  it("para bot en ámbito público, prefiere modelo con herramientas y visión", () => {
    const modeloVision: ModeloLocal = {
      ...modeloLocal,
      id: "llava:7b",
      etiqueta: "LLaVA 7B",
      vision: true,
      herramientas: true,
      puntuacion: { ...modeloLocal.puntuacion!, eci: 128.5 },
      memoriaMinGb: 6,
      memoriaComodaGb: 9,
    };
    const candidatosBot: readonly CandidatoRadar[] = [
      { modelo: modeloLocal, fuente: "local", preferido: false, puntuacion: { eci: 77, encaje: 60, capacidades: 55, preferencia: 0, total: 64 } },
      { modelo: modeloVision, fuente: "ollama", preferido: false, puntuacion: { eci: 71, encaje: 100, capacidades: 75, preferencia: 0, total: 76 } },
    ];
    const resultado = seleccionarModeloContextual({
      ...ctxBase,
      entidad: "bot",
      ambito: "publica",
      candidatos: candidatosBot,
    });
    expect(resultado.modelo?.vision).toBe(true);
    expect(resultado.modelo?.herramientas).toBe(true);
  });

  it("sin candidatos válidos devuelve null y privacidadRespetada true", () => {
    const resultado = seleccionarModeloContextual({
      ...ctxBase,
      candidatos: [],
    });
    expect(resultado.modelo).toBeNull();
    expect(resultado.privacidadRespetada).toBe(true);
    expect(resultado.razon).toContain("sin candidatos");
  });

  it("respeta señales de red: sin internet no elige fuentes externas", () => {
    const candidatosMix: readonly CandidatoRadar[] = [
      { modelo: modeloPreferente, fuente: "preferente", preferido: true, puntuacion: { eci: 79, encaje: 100, capacidades: 45, preferencia: 15, total: 78 } },
      { modelo: modeloLocal, fuente: "openrouter", preferido: false, puntuacion: { eci: 85, encaje: 100, capacidades: 60, preferencia: 0, total: 82 } },
    ];
    const resultado = seleccionarModeloContextual({
      ...ctxBase,
      senales: crearSenalesRed({ local: true, internet: false }),
      candidatos: candidatosMix,
    });
    // Debe elegir la fuente local/preferente, no openrouter (externo)
    expect(resultado.fuente).not.toBe("openrouter");
  });

  it("con malla P2P activa, considera fuente malla como local", () => {
    const candidatosMalla: readonly CandidatoRadar[] = [
      { modelo: modeloPreferente, fuente: "capa-astraura", preferido: false, puntuacion: { eci: 55, encaje: 100, capacidades: 0, preferencia: 0, total: 62 } },
      { modelo: modeloLocal, fuente: "local", preferido: false, puntuacion: { eci: 77, encaje: 60, capacidades: 55, preferencia: 0, total: 64 } },
    ];
    const resultado = seleccionarModeloContextual({
      ...ctxBase,
      senales: crearSenalesRed({ local: true, mallaP2p: true, internet: false }),
      candidatos: candidatosMalla,
    });
    expect(resultado.modelo).not.toBeNull();
  });
});

describe("integración con radar-internet", () => {
  it("usa tipoFuenteRadar para clasificar fuentes", () => {
    expect(tipoFuenteRadar("local")).toBe("instalado");
    expect(tipoFuenteRadar("capa-astraura")).toBe("capa-astraura");
    expect(tipoFuenteRadar("openrouter")).toBe("openrouter");
  });
});