/**
 * Prueba pura del átomo «Diagrama» (Diagram Design): definición, los 45 tipos, plan
 * (misma entrada → mismo plan) y aislamiento del HTML. Sin red, sin disco y sin navegador.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { ATOMOS_PROPIOS } from "../atomos";
import {
  DIAGRAMA,
  OPCIONES_TIPO,
  OPCIONES_TIPO_AVANZADO,
  PERFILES_MARCA,
  TIPOS_DIAGRAMA,
  aislamientoDe,
  planDiagrama,
  tipoPorId,
} from "../atomos/diagrama";
import { limpiarRegistro, registrarAtomo } from "../registro-atomos";

describe("átomo diagrama · definición", () => {
  beforeEach(() => limpiarRegistro());

  it("declara el contrato de diagram-design, se registra y está en el índice", () => {
    expect(DIAGRAMA).toMatchObject({
      herramientaId: "diagram-design",
      categoria: "arquitectura",
      integracion: "iframe-aislado",
      control: "total",
      ficha: { licencia: "MIT" },
    });
    expect(DIAGRAMA.entradas).toEqual(["texto", "datos", "draw.io", "Mermaid", "Excalidraw"]);
    expect(DIAGRAMA.salidas).toEqual(["html", "svg", "png"]);
    expect(registrarAtomo(DIAGRAMA)).toEqual({ ok: true });
    expect(ATOMOS_PROPIOS).toContain(DIAGRAMA);
  });

  it("los 45 tipos están una sola vez y las dos listas caben en el registro", () => {
    expect(TIPOS_DIAGRAMA).toHaveLength(45);
    const ids = TIPOS_DIAGRAMA.map((d) => d.id);
    expect(new Set(ids).size).toBe(45);
    for (const d of TIPOS_DIAGRAMA) {
      expect(d.nombre.length).toBeGreaterThan(0);
      expect(["estructura", "proceso", "datos", "comparacion"]).toContain(d.familia);
      expect(d.referencia).toBe(`references/type-${d.id}.md`);
    }
    const cubiertos = [...OPCIONES_TIPO, ...OPCIONES_TIPO_AVANZADO.filter((x) => x !== "ninguno")];
    expect(new Set(cubiertos).size).toBe(45);
    expect(new Set(cubiertos)).toEqual(new Set(ids));
    expect(OPCIONES_TIPO.length).toBeLessThanOrEqual(32);
    expect(OPCIONES_TIPO_AVANZADO.length).toBeLessThanOrEqual(32);
    expect(DIAGRAMA.parametros.find((p) => p.id === "tipo")?.opciones).toEqual([...OPCIONES_TIPO]);
  });

  it("el plan por defecto es arquitectura clara, 1280 px, sin animación y con la marca StarSeed", () => {
    const plan = planDiagrama();
    expect(plan.tipo.id).toBe("architecture");
    expect(plan.tema).toBe("claro");
    expect(plan.animado).toBe(false);
    expect(plan.ancho).toBe(1280);
    expect(plan.perfil).toEqual({ id: "starseed", nombre: PERFILES_MARCA.starseed });
    expect(plan.entradas).toEqual([...DIAGRAMA.entradas]);
    expect(plan.salidas).toEqual(["html", "svg", "png"]);
    expect(plan.aislamiento.sandbox).toBe("");
  });

  it("elige el tipo pedido y el avanzado manda cuando no es «ninguno»", () => {
    expect(planDiagrama({ tipo: "sankey" }).tipo.id).toBe("sankey");
    expect(planDiagrama({ tipo: "sankey", "tipo-avanzado": "kanban" }).tipo.id).toBe("kanban");
    expect(planDiagrama({ tipo: "tree", "tipo-avanzado": "ninguno" }).tipo.id).toBe("tree");
    expect(planDiagrama({ tipo: "inventado", "tipo-avanzado": "ninguno" }).tipo.id).toBe("architecture");
    expect(planDiagrama({ "tipo-avanzado": "inventado" }).tipo.id).toBe("architecture");
  });

  it("acota el ancho a 320..3840 y lo alinea a la rejilla de 4 px", () => {
    expect(planDiagrama({ ancho: 100 }).ancho).toBe(320);
    expect(planDiagrama({ ancho: 9999 }).ancho).toBe(3840);
    expect(planDiagrama({ ancho: 1282 }).ancho).toBe(1280);
    expect(planDiagrama({ ancho: 1283 }).ancho).toBe(1284);
    expect(planDiagrama({ ancho: Number.NaN }).ancho).toBe(1280);
  });

  it("el tema y el perfil caen a claro y starseed si no existen", () => {
    expect(planDiagrama({ tema: "oscuro" }).tema).toBe("oscuro");
    expect(planDiagrama({ tema: "sepia" }).tema).toBe("claro");
    expect(planDiagrama({ perfil: "astraura" }).perfil).toEqual({ id: "astraura", nombre: "Astraura" });
    expect(planDiagrama({ perfil: "marca-x" }).perfil.id).toBe("starseed");
  });

  it("sin animación no ejecuta nada; con animación solo scripts inline y nunca allow-same-origin", () => {
    const quieto = planDiagrama().aislamiento;
    expect(quieto.sandbox).toBe("");
    expect(quieto.csp).not.toContain("script-src");
    const animado = planDiagrama({ animado: true });
    expect(animado.animado).toBe(true);
    expect(animado.aislamiento.sandbox).toBe("allow-scripts");
    expect(animado.aislamiento.sandbox).not.toContain("allow-same-origin");
    expect(animado.aislamiento.csp).toContain("script-src 'unsafe-inline'");
    for (const a of [quieto, animado.aislamiento]) {
      expect(a.csp).toContain("default-src 'none'");
      expect(a.csp).toContain("font-src data:");
      expect(a.csp).not.toContain("http");
      expect(a.fuentes).toBe("sistema");
      expect(a.red).toBe(false);
      expect(a.recursosExternos).toBe(false);
    }
    expect(aislamientoDe(false).sandbox).toBe("");
  });

  it("es puro: misma entrada, mismo plan y no muta la entrada", () => {
    const entrada = {
      tipo: "layers",
      "tipo-avanzado": "journey",
      tema: "oscuro",
      animado: true,
      ancho: 1600,
      perfil: "cafe",
    } as const;
    const copia = structuredClone(entrada);
    expect(planDiagrama(entrada)).toEqual(planDiagrama(entrada));
    expect(entrada).toEqual(copia);
    expect(tipoPorId("journey")?.familia).toBe("proceso");
  });
