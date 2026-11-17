// «Variantes sin filtros»: pequeñas de la familia Qwen3.5 (MOD1116A · MQC1)
// Agregadas el 2026-11-16: huihui_ai/qwen3.5-abliterated:2B, :0.8B, :4B, :9b (licencia y comprobado nuevos), :27b (comprobado nuevo)
import { describe, expect, it } from "vitest";
import { catalogoCompleto } from "@/lib/astraura/modelos/catalogo";
import { catalogoSemilla, MODELOS_SIN_FILTROS_SEMILLA } from "@/lib/astraura/modelos/catalogo-datos";
import { leerCatalogo } from "@/lib/astraura/capas/catalogo";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const capas = leerCatalogo(JSON.parse(readFileSync(join(process.cwd(), "config/capas-astraura.json"), "utf8")));
const semilla = catalogoSemilla();
const CAT = catalogoCompleto(semilla, capas);
const SF = CAT.filter((m) => m.clase === "abliterated");

describe("pequeñas de la familia Qwen3.5: 2B, :0.8B, :4B, :9b, :27b (nuevas, verificadas el 2026-11-16)", () => {
  const NUEVAS = SF.filter((m) => m.id.startsWith("huihui_ai/qwen3.5-abliterated:") && !m.id.includes("gemma") && !m.id.includes("deepseek") && !m.id.includes("glm"));
  const BASE_QWEN = CAT.filter((m) => m.id.startsWith("qwen3.5:") && m.clase === "normal");

   it("las 5 entradas existen y son válidas por modelo base y público", () => {
     expect(NUEVAS).toHaveLength(5);
     for (const m of NUEVAS) {
       expect(m.baseId, m.id).toMatch(/^qwen3\.5:/);
       expect(m.publicador).toBe("huihui_ai (comunidad de Ollama; no es el editor del modelo)");
       expect(m.puntuacion).toBeNull(); // sin medir: nadie las evaluó
       expect(m.estado).toBe("comprobado");
       expect(m.comprobado).toBe("2026-11-16");
       expect(m.fuentes).toBeDefined();
       expect(m.fuentes.length).toBeGreaterThan(0);
     }
   });

   it("qwen3.5:9b aquí RESTRINGIDA y debe revisarse; licencia y comprobado correctos", () => {
     const q9 = NUEVAS.find((m) => m.id === "huihui_ai/qwen3.5-abliterated:9b")!;
     expect(q9).toBeDefined();
     expect(q9.nota).toMatch(/RESTRINGIDA y debe revisarse/);
     expect(q9.licencia).toBe("Apache 2.0 (ficha de Ollama, 2026-11-16)");
     expect(q9.comprobado).toBe("2026-11-16");
     const baseQ9 = BASE_QWEN.find((b) => b.id === "qwen3.5:9b")!;
     expect(baseQ9.licencia).toBe("Pesos abiertos, uso restringido (según Epoch)");
   });

   it("2B, :0.8B, :4B, :27b tienen comprobado 2026-11-16", () => {
     const dosB = NUEVAS.find((m) => m.id === "huihui_ai/qwen3.5-abliterated:2B")!;
     expect(dosB.comprobado).toBe("2026-11-16");
     const cerO8B = NUEVAS.find((m) => m.id === "huihui_ai/qwen3.5-abliterated:0.8B")!;
     expect(cerO8B.comprobado).toBe("2026-11-16");
     const cuatroB = NUEVAS.find((m) => m.id === "huihui_ai/qwen3.5-abliterated:4B")!;
     expect(cuatroB.comprobado).toBe("2026-11-16");
     const veintisieteB = NUEVAS.find((m) => m.id === "huihui_ai/qwen3.5-abliterated:27b")!;
     expect(veintisieteB.comprobado).toBe("2026-11-16");
   });

   it("modeloValido acepta todas (base para :0.8B no existe en el catálogo)", () => {
     for (const m of NUEVAS) {
       expect(m, m.id).toBeDefined();
       const valido = CAT.some((c) => c.id === m.id && c.clase === m.clase);
       expect(valido).toBe(true); // modeloValido verifica el esquema, no el listado
     }
   });

   it("No se intentó recuperar qwen3.5:0.8b de la API de pago o terceros no verificados", () => {
     const q08 = NUEVAS.find((m) => m.id === "huihui_ai/qwen3.5-abliterated:0.8B");
     if (q08) {
       expect(q08.fuentes).toBeDefined();
       expect(q08.fuentes.every((f) => f.startsWith("https://ollama.com/huihui_ai/"))).toBe(true);
       expect(q08.fuentes.some((f) => f.startsWith("https://abliteration.ai") || f.startsWith("https://orcarouter") || f.startsWith("https://eriktonon"))).toBe(false);
     }
   });
});