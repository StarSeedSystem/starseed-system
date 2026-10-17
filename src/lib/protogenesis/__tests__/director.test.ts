/**
 * TESTS DE promptDirector y planificarEncargo · ProtoGenesis PG1013F
 * Cubren las reglas definidas en architecture/protogenesis.md §2
 * y architecture/protomolecula.md §3·7·8.
 */

import { describe, it, expect } from "vitest";

import {
  promptDirector,
  planificarEncargo,
} from "../director";

import type { Encargo } from "../encargo";
import type { Plan } from "../encargo";
import type { Ambito, Computo } from "@/lib/protomolecula/tipos";

// Mock de la función validarPlan para los tests
const mockValidarPlan = (plan: unknown, ctx: any) => {
  // Implementación simplificada para testing
  if (typeof plan !== "object" || plan === null || Array.isArray(plan)) {
    return { ok: false, errores: ["plan debe ser un objeto"], avisos: [] };
  }

  const p = plan as Partial<Plan>;
  if (!p.pasos || !Array.isArray(p.pasos)) {
    return { ok: false, errores: ["plan debe tener un array de pasos"], avisos: [] };
  }

  // Validación básica de pasos
  for (const paso of p.pasos) {
    if (!paso.id || typeof paso.id !== "string") {
      return { ok: false, errores: ["cada paso debe tener un id string"], avisos: [] };
    }
    if (!paso.atomo || typeof paso.atomo !== "string") {
      return { ok: false, errores: ["cada paso debe tener un atomo string"], avisos: [] };
    }
    if (!paso.titulo || typeof paso.titulo !== "string") {
      return { ok: false, errores: ["cada paso debe tener un titulo string"], avisos: [] };
    }
    if (!paso.entradas || !Array.isArray(paso.entradas)) {
      return { ok: false, errores: ["cada paso debe tener un array de entradas"], avisos: [] };
    }
    if (!paso.salida || typeof paso.salida !== "object" || !paso.salida.formato) {
      return { ok: false, errores: ["cada paso debe tener una salida con formato"], avisos: [] };
    }
    if (!paso.criterios || !Array.isArray(paso.criterios)) {
      return { ok: false, errores: ["cada paso debe tener un array de criterios"], avisos: [] };
    }
    for (const criterio of paso.criterios) {
      if (!["formato", "duracion-max", "tamano-max", "sin-secretos", "capas-presentes", "persona"].includes(criterio.tipo)) {
        return { ok: false, errores: [`tipo de criterio inválido: ${criterio.tipo}`], avisos: [] };
      }
      if (typeof criterio.texto !== "string") {
        return { ok: false, errores: ["cada criterio debe tener un texto string"], avisos: [] };
      }
    }
  }

  return { ok: true, errores: [], avisos: [] };
};

describe("promptDirector", () => {
  it("debe generar un prompt válido con un encargo y átomos", () => {
    const encargo: Encargo = {
      id: "E001",
      moleculaId: "M001",
      ambito: "personal",
      intencion: "crear una imagen con texto",
      criterios: [
        { tipo: "formato", texto: "la salida debe ser una imagen PNG" },
        { tipo: "persona", texto: "la imagen debe contener el texto especificado" }
      ],
      autor: { tipo: "persona", id: "U001" },
      origen: "texto",
      creadoEn: Date.now(),
    };

    const atomos = [
      { id: "A001", nombre: "Generador de Imágenes", entrada: ["texto"], salida: ["png"] },
      { id: "A002", nombre: "Editor de Texto", entrada: ["texto"], salida: ["texto"] }
    ];

    const prompt = promptDirector(encargo, atomos);
    
    // Verificar que contiene los elementos esperados
    expect(prompt).toContain("Eres el Director de ProtoGenesis");
    expect(prompt).toContain(encargo.intencion);
    expect(prompt).toContain(encargo.criterios[0].texto);
    expect(prompt).toContain(atomos[0].nombre);
    expect(prompt).toContain(atomos[1].nombre);
    expect(prompt).toContain('"pasos": [');
    expect(prompt).toContain('"id": "string"');
    expect(prompt).toContain('"atomo": "string"');
    expect(prompt).toContain('"titulo": "string"');
    expect(prompt).toContain('"entradas":');
    expect(prompt).toContain('"salida": {');
    expect(prompt).toContain('"depende":');
    expect(prompt).toContain('"criterios":');
    expect(prompt).toContain('"computo":');
    expect(prompt).toContain("máximo 24 pasos");
    expect(prompt).toContain("en español");
  });

  it("debe limitar la lista de átomos a 40", () => {
    const encargo: Encargo = {
      id: "E001",
      moleculaId: "M001",
      ambito: "personal",
      intencion: "crear algo",
      criterios: [{ tipo: "formato", texto: "formato válido" }],
      autor: { tipo: "persona", id: "U001" },
      origen: "texto",
      creadoEn: Date.now(),
    };

    // Crear 45 átomos
    const atomos = Array.from({ length: 45 }, (_, i) => ({
      id: `A${i}`,
      nombre: `Átomo ${i}`,
      entrada: ["entrada"],
      salida: ["salida"]
    }));

    const prompt = promptDirector(encargo, atomos);
    
    // Verificar que solo se incluyen los primeros 40
    for (let i = 0; i < 40; i++) {
      expect(prompt).toContain(`Átomo ${i}`);
    }
    
    // Verificar que no se incluyen los últimos 5
    for (let i = 40; i < 45; i++) {
      expect(prompt).not.toContain(`Átomo ${i}`);
    }
  });
});

describe("planificarEncargo", () => {
  const encargo: Encargo = {
    id: "E001",
    moleculaId: "M001",
    ambito: "personal",
    intencion: "crear una imagen con texto",
    criterios: [
      { tipo: "formato", texto: "la salida debe ser una imagen PNG" },
      { tipo: "persona", texto: "la imagen debe contener el texto especificado" }
    ],
    autor: { tipo: "persona", id: "U001" },
    origen: "texto",
    creadoEn: Date.now(),
  };

  const atomos = [
    { id: "A001", nombre: "Generador de Imágenes", entrada: ["texto"], salida: ["png"] },
    { id: "A002", nombre: "Editor de Texto", entrada: ["texto"], salida: ["texto"] }
  ];

  const ctx = {
    existeAtomo: (id: string) => atomos.some(a => a.id === id) ? "si" : "no",
    hayConversion: (de: string, a: string) => true, // Simplificado para testing
    formatoDe: (entrada: string) => entrada
  };

  it("debe devolver un plan válido cuando el modelo responde correctamente a la primera", async () => {
    const llamarMock = async (prompt: string) => {
      return `{
        "pasos": [
          {
            "id": "P1",
            "atomo": "A002",
            "titulo": "Procesar texto de entrada",
            "entradas": ["texto inicial"],
            "salida": { "formato": "texto" },
            "depende": [],
            "criterios": [{ tipo: "formato", texto: "el texto debe estar procesado correctamente" }],
            "computo": "navegador"
          },
          {
            "id": "P2",
            "atomo": "A001",
            "titulo": "Generar imagen desde texto",
            "entradas": ["texto procesado"],
            "salida": { "formato": "png" },
            "depende": ["P1"],
            "criterios": [
              { tipo: "formato", texto: "la salida debe ser una imagen PNG" },
              { tipo: "persona", texto: "la imagen debe contener el texto especificado" }
            ],
            "computo": "nube"
          }
        ]
      }`;
    };

    const resultado = await planificarEncargo(encargo, atomos, llamarMock, ctx);
    
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.plan).toBeDefined();
      expect(resultado.plan.pasos).toHaveLength(2);
      expect(resultado.plan.pasos[0].id).toBe("P1");
      expect(resultado.plan.pasos[1].id).toBe("P2");
      expect(resultado.avisos).toHaveLength(0);
    }
  });

  it("debe intentar un reintento cuando el primer respuesta tiene errores", async () => {
    let llamadaCount = 0;
    const llamarMock = async (prompt: string) => {
      llamadaCount++;
      if (llamadaCount === 1) {
        // Primera respuesta con errores (falta criterios en el segundo paso)
        return `{
          "pasos": [
            {
              "id": "P1",
              "atomo": "A002",
              "titulo": "Procesar texto de entrada",
              "entradas": ["texto inicial"],
              "salida": { "formato": "texto" },
              "depende": [],
              "criterios": [{ tipo: "formato", texto: "el texto debe estar procesado correctamente" }],
              "computo": "navegador"
            },
            {
              "id": "P2",
              "atomo": "A001",
              "titulo": "Generar imagen desde texto",
              "entradas": ["texto procesado"],
              "salida": { "formato": "png" },
              "depende": ["P1"],
              "criterios": [], // Error: falta criterios
              "computo": "nube"
            }
          ]
        }`;
      } else {
        // Segunda respuesta corregida
        return `{
          "pasos": [
            {
              "id": "P1",
              "atomo": "A002",
              "titulo": "Procesar texto de entrada",
              "entradas": ["texto inicial"],
              "salida": { "formato": "texto" },
              "depende": [],
              "criterios": [{ tipo: "formato", texto: "el texto debe estar procesado correctamente" }],
              "computo": "navegador"
            },
            {
              "id": "P2",
              "atomo": "A001",
              "titulo": "Generar imagen desde texto",
              "entradas": ["texto procesado"],
              "salida": { "formato": "png" },
              "depende": ["P1"],
              "criterios": [
                { tipo: "formato", texto: "la salida debe ser una imagen PNG" },
                { tipo: "persona", texto: "la imagen debe contener el texto especificado" }
              ],
              "computo": "nube"
            }
          ]
        }`;
      }
    };

    const resultado = await planificarEncargo(encargo, atomos, llamarMock, ctx);
    
    expect(llamadaCount).toBe(2); // Debe haber llamado dos veces
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.plan).toBeDefined();
      expect(resultado.plan.pasos).toHaveLength(2);
      expect(resultado.avisos).toHaveLength(0);
    }
  });

  it("debe fallar cuando ambos intentos producen respuestas sin JSON válido", async () => {
    const llamarMock = async (prompt: string) => {
      return "Esta no es una respuesta JSON válida";
    };

    const resultado = await planificarEncargo(encargo, atomos, llamarMock, ctx);
    
    expect(resultado.ok).toBe(false);
    expect(resultado.motivo).toContain("No se encontró JSON válido");
  });

  it("debe fallar cuando ambos intentos producen JSON inválido", async () => {
    const llamarMock = async (prompt: string) => {
      return "{ json inválido: falta cerrar llave";
    };

    const resultado = await planificarEncargo(encargo, atomos, llamarMock, ctx);
    
    expect(resultado.ok).toBe(false);
    expect(resultado.motivo).toContain("Error al parsear JSON");
  });

  it("debe fallar cuando ambos intentos producen planes que no pasan la validación", async () => {
    let llamadaCount = 0;
    const llamarMock = async (prompt: string) => {
      llamadaCount++;
      // Siempre devolver un paso con átomo "no" que es inválido
      return `{
        "pasos": [
          {
            "id": "P1",
            "atomo": "no", // Átomo inválido
            "titulo": "Paso inválido",
            "entradas": ["entrada"],
            "salida": { "formato": "png" },
            "depende": [],
            "criterios": [{ tipo: "formato", texto: "cualquier criterio" }],
            "computo": "navegador"
          }
        ]
      }`;
    };

    const resultado = await planificarEncargo(encargo, atomos, llamarMock, ctx);
    
    expect(llamadaCount).toBe(2); // Debe haber llamado dos veces
    expect(resultado.ok).toBe(false);
    expect(resultado.motivo).toContain("átomo 'no' no es válido");
  });
});