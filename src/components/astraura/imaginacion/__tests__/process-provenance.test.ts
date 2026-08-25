/**
 * Tests de la capa PURA de procedencia de un proceso onírico
 * (`./process-provenance`): lectura defensiva de los 4 campos que el
 * cliente aún no tipa en `Astraura158ProcessType` (`generated_by`,
 * `personality`, `agents`, `memory_items`) y el etiquetado honesto que
 * decide qué insignia/tono pinta cada uno. Sin DOM (entorno `node` de
 * Vitest) — el módulo bajo prueba no importa React ni JSX a propósito.
 */
import { describe, expect, it } from "vitest";
import type { Astraura158ProcessType } from "@/lib/astraura/astraura-158-client";
import {
  generatedByBadgeMeta, memoryOriginLabel, memorySourceMeta, participantLabel,
  processAgents, processGeneratedBy, processMemoryItems, processPersonality,
  type ProcessMemoryItem, type ProcessParticipant,
} from "@/components/astraura/imaginacion/process-provenance";

/** Construye un `Astraura158ProcessType` con campos extra sin tipar del
 *  backend — mismo idioma que el resto del repo (p. ej.
 *  `astraura-158-notify.test.ts`): `as unknown as T`. */
function pt(extra: Record<string, unknown> = {}): Astraura158ProcessType {
  return { id: "proc-1", name: "Proceso de prueba", ...extra } as unknown as Astraura158ProcessType;
}

describe("processGeneratedBy", () => {
  it("campo ausente ⇒ undefined (backend viejo, sin insignia)", () => {
    expect(processGeneratedBy(pt())).toBeUndefined();
  });

  it("lee 'llm' y 'template' tal cual", () => {
    expect(processGeneratedBy(pt({ generated_by: "llm" }))).toBe("llm");
    expect(processGeneratedBy(pt({ generated_by: "template" }))).toBe("template");
  });

  it("valor inesperado (no 'llm' ni 'template') ⇒ undefined, nunca se inventa una etiqueta", () => {
    expect(processGeneratedBy(pt({ generated_by: "quien-sabe" }))).toBeUndefined();
    expect(processGeneratedBy(pt({ generated_by: null }))).toBeUndefined();
    expect(processGeneratedBy(pt({ generated_by: 42 }))).toBeUndefined();
  });
});

describe("processPersonality", () => {
  it("campo ausente ⇒ undefined", () => {
    expect(processPersonality(pt())).toBeUndefined();
  });

  it("objeto real ⇒ se devuelve tal cual", () => {
    expect(processPersonality(pt({ personality: { id: "aurora", name: "Aurora" } }))).toEqual({ id: "aurora", name: "Aurora" });
  });

  it("valor deformado (no-objeto) ⇒ undefined, nunca lanza", () => {
    expect(processPersonality(pt({ personality: null }))).toBeUndefined();
    expect(processPersonality(pt({ personality: "aurora" }))).toBeUndefined();
    expect(processPersonality(pt({ personality: 7 }))).toBeUndefined();
    expect(processPersonality(pt({ personality: ["aurora"] }))).toBeUndefined();
  });
});

describe("processAgents / processMemoryItems (normalización de listas)", () => {
  it("campo ausente (undefined/null) ⇒ undefined — no se pinta nada", () => {
    expect(processAgents(pt())).toBeUndefined();
    expect(processAgents(pt({ agents: null }))).toBeUndefined();
    expect(processMemoryItems(pt())).toBeUndefined();
    expect(processMemoryItems(pt({ memory_items: null }))).toBeUndefined();
  });

  it("array vacío ⇒ [] real, se distingue de 'campo ausente'", () => {
    expect(processAgents(pt({ agents: [] }))).toEqual([]);
    expect(processMemoryItems(pt({ memory_items: [] }))).toEqual([]);
  });

  it("valor no-array (string/objeto suelto) ⇒ undefined", () => {
    expect(processAgents(pt({ agents: "no-soy-un-array" }))).toBeUndefined();
    expect(processAgents(pt({ agents: { id: "a" } }))).toBeUndefined();
  });

  it("filtra elementos que no son objetos reales, conserva los válidos, nunca lanza", () => {
    expect(processAgents(pt({ agents: [{ id: "a" }, null, "basura", 3, { id: "b" }] })))
      .toEqual([{ id: "a" }, { id: "b" }]);
    expect(processMemoryItems(pt({ memory_items: [null, { id: "m1", source: "mem0" }] })))
      .toEqual([{ id: "m1", source: "mem0" }]);
  });
});

describe("generatedByBadgeMeta", () => {
  it("'llm' ⇒ insignia esmeralda de modelo real", () => {
    const meta = generatedByBadgeMeta("llm");
    expect(meta?.label).toBe("Generado por: modelo real");
    expect(meta?.tone).toContain("emerald");
  });

  it("'template' ⇒ insignia ámbar de plantilla", () => {
    const meta = generatedByBadgeMeta("template");
    expect(meta?.label).toBe("Plantilla");
    expect(meta?.tone).toContain("amber");
  });

  it("undefined ⇒ null (no pintar nada)", () => {
    expect(generatedByBadgeMeta(undefined)).toBeNull();
  });
});

describe("memorySourceMeta", () => {
  it("sin fuente (undefined/vacío/solo espacios) ⇒ lo dice explícitamente", () => {
    expect(memorySourceMeta(undefined).label).toBe("Fuente sin especificar");
    expect(memorySourceMeta("").label).toBe("Fuente sin especificar");
    expect(memorySourceMeta("   ").label).toBe("Fuente sin especificar");
  });

  it("reconoce mem0 (insensible a mayúsculas)", () => {
    expect(memorySourceMeta("mem0").label).toBe("mem0");
    expect(memorySourceMeta("MEM0").label).toBe("mem0");
  });

  it("reconoce documento/vector/indexer", () => {
    expect(memorySourceMeta("document").label).toBe("Documento indexado");
    expect(memorySourceMeta("documento").label).toBe("Documento indexado");
    expect(memorySourceMeta("vector_store").label).toBe("Documento indexado");
  });

  it("reconoce grafo/graph", () => {
    expect(memorySourceMeta("graph").label).toBe("Grafo de conocimiento");
    expect(memorySourceMeta("knowledge_graph").label).toBe("Grafo de conocimiento");
    expect(memorySourceMeta("grafo").label).toBe("Grafo de conocimiento");
  });

  it("fuente real no reconocida ⇒ se muestra TAL CUAL, nunca se oculta ni se disfraza de otra", () => {
    const meta = memorySourceMeta("sql_datastore");
    expect(meta.label).toBe("sql_datastore");
    expect(meta.tone).toContain("white");
  });

  it("ninguna de las 3 fuentes reales reutiliza el ámbar/esmeralda de generated_by", () => {
    expect(memorySourceMeta("mem0").tone).not.toContain("amber");
    expect(memorySourceMeta("document").tone).not.toContain("amber");
    expect(memorySourceMeta("document").tone).not.toContain("emerald");
    expect(memorySourceMeta("graph").tone).not.toContain("amber");
  });
});

describe("memoryOriginLabel", () => {
  const item = (extra: Partial<ProcessMemoryItem>): ProcessMemoryItem => ({ ...extra });

  it("sin cerebro ni servidor ⇒ undefined, no se inventa origen", () => {
    expect(memoryOriginLabel(item({}))).toBeUndefined();
  });

  it("cerebro de origen ⇒ 'Cerebro: <nombre>'", () => {
    expect(memoryOriginLabel(item({ brain: { name: "Génesis" } }))).toBe("Cerebro: Génesis");
  });

  it("servidor de origen ⇒ 'Servidor: <nombre>'", () => {
    expect(memoryOriginLabel(item({ server: { name: "mi-neurona" } }))).toBe("Servidor: mi-neurona");
  });

  it("nombre en blanco se ignora y cae al siguiente candidato", () => {
    expect(memoryOriginLabel(item({ brain: { name: "   " }, server: { name: "srv-1" } }))).toBe("Servidor: srv-1");
  });

  it("si hay ambos, el cerebro tiene precedencia", () => {
    expect(memoryOriginLabel(item({ brain: { name: "B" }, server: { name: "S" } }))).toBe("Cerebro: B");
  });
});

describe("participantLabel", () => {
  it("sin participante ⇒ el fallback dado", () => {
    expect(participantLabel(undefined, "Agente sin nombre")).toBe("Agente sin nombre");
  });

  it("prioriza el nombre", () => {
    const p: ProcessParticipant = { id: "agent-1", name: "Hermes" };
    expect(participantLabel(p, "Agente sin nombre")).toBe("Hermes");
  });

  it("nombre en blanco ⇒ cae al id", () => {
    const p: ProcessParticipant = { id: "agent-1", name: "   " };
    expect(participantLabel(p, "Agente sin nombre")).toBe("agent-1");
  });

  it("sin nombre ni id ⇒ el fallback, nunca cadena vacía", () => {
    const p: ProcessParticipant = { id: "", name: "" };
    expect(participantLabel(p, "Agente sin nombre")).toBe("Agente sin nombre");
  });
});
