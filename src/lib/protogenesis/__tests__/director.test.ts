/**
 * TESTS · Director (PG1013F)
 * Cubre funciones puras: promptDirector y planificarEncargo con llamar falso.
 */
import { describe, it, expect } from "vitest";
import { promptDirector, planificarEncargo, AtomoInfo } from "../director";
import type { Encargo, Plan } from "../encargo";

describe("promptDirector", () => {
  it("debe generar un prompt con los átomos acotados a 40", () => {
    const encargo: Encargo = {
      id: "E1",
      moleculaId: "M1",
      ambito: "personal",
      intencion: "crear una escena 3D con sonido",
      criterios: [{ tipo: "formato", texto: "glTF" }],
      autor: { tipo: "persona", id: "U1" },
      origen: "texto",
      creadoEn: 0,
    };
    const atomos: AtomoInfo[] = [
      { id: "a1", nombre: "Editor 3D", entrada: ["json"], salida: ["glb"] },
    ];
    const prompt = promptDirector(encargo, atomos);
    expect(prompt).toContain('"pasos"');
    expect(prompt).toContain("crear una escena 3D con sonido");
    expect(prompt).toContain("a1");
  });

  it("debe limitar la lista a 40 átomos", () => {
    const encargo: Encargo = {
      id: "E2", moleculaId: "M2", ambito: "personal", intencion: "prueba",
      criterios: [{ tipo: "formato", texto: "x" }],
      autor: { tipo: "agente", id: "A1" }, origen: "agente", creadoEn: 0,
    };
    const atomos = Array.from({ length: 50 }, (_, i) => ({
      id: `a${i}`, nombre: `Atomo ${i}`, entrada: ["f"], salida: ["f"],
    }));
    const prompt = promptDirector(encargo, atomos);
    expect(prompt).toContain("a39");
    expect(prompt).not.toContain("a49");
  });
});

describe("planificarEncargo", () => {
  const ctx = {
    existeAtomo: (id: string) => (id === "a1" || id === "a2" ? "si" : "no") as "si" | "solo-enlace" | "no",
    hayConversion: () => true,
    formatoDe: (e: string) => e,
  };

  const encargo: Encargo = {
    id: "E1", moleculaId: "M1", ambito: "personal",
    intencion: "crear un paso",
    criterios: [{ tipo: "formato", texto: "json" }],
    autor: { tipo: "persona", id: "U1" },
    origen: "texto", creadoEn: 0,
  };

  const atomos: AtomoInfo[] = [
    { id: "a1", nombre: "Herramienta", entrada: ["json"], salida: ["json"] },
  ];

  it("debe aceptar un plan válido a la primera", async () => {
    const planValido: Plan = {
      encargoId: "E1",
      pasos: [
        {
          id: "P1", atomo: "a1", titulo: "Paso 1",
          entradas: [], salida: { formato: "json" }, depende: [],
          criterios: [{ tipo: "formato", texto: "json" }],
        },
      ],
    };
    const llamar = async (_p: string) => JSON.stringify(planValido);
    const result = await planificarEncargo(encargo, atomos, llamar, ctx);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.plan.pasos).toHaveLength(1);
      expect(result.avisos).toHaveLength(0);
    }
  });

  it("debe reintentar con errores y luego aceptar", async () => {
    const planValido: Plan = {
      encargoId: "E1",
      pasos: [
        {
          id: "P1", atomo: "a1", titulo: "Paso 1",
          entradas: [], salida: { formato: "json" }, depende: [],
          criterios: [{ tipo: "formato", texto: "json" }],
        },
      ],
    };
    let llamadas = 0;
    const llamar = async (_p: string) => {
      llamadas++;
      if (llamadas === 1) {
        return JSON.stringify({ pasos: [{ id: "P1", atomo: "no", titulo: "x", entradas: [], salida: { formato: "json" }, depende: [], criterios: [{ tipo: "formato", texto: "json" }] }] });
      }
      return JSON.stringify(planValido);
    };
    const result = await planificarEncargo(encargo, atomos, llamar, ctx);
    expect(llamadas).toBe(2);
    expect(result.ok).toBe(true);
  });

  it("debe devolver ok false tras dos intentos fallidos", async () => {
    let llamadas = 0;
    const llamar = async (_p: string) => {
      llamadas++;
      return JSON.stringify({ pasos: [{ id: "P1", atomo: "no", titulo: "x", entradas: [], salida: { formato: "json" }, depende: [], criterios: [{ tipo: "formato", texto: "json" }] }] });
    };
    const result = await planificarEncargo(encargo, atomos, llamar, ctx);
    expect(llamadas).toBe(2);
    expect(result.ok).toBe(false);
  });

  it("debe devolver ok false cuando no hay bloque JSON", async () => {
    let llamadas = 0;
    const llamar = async (_p: string) => {
      llamadas++;
      return "respuesta sin json";
    };
    const result = await planificarEncargo(encargo, atomos, llamar, ctx);
    expect(llamadas).toBe(2);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.motivo).toContain("JSON");
    }
  });
});
