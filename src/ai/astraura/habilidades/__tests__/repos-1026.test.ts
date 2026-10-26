// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CAPACIDADES_CONOCIDAS, validarAgenteGrupo } from "@/lib/agents/agentes-grupo";
import { findPackage, install, uninstall } from "@/lib/library/packages";
import {
  activeCapabilityIds,
  SKILL_CAPABILITIES,
  skillsSystemPrompt,
} from "../../skills";
import { contarPalabras } from "../diagramas";
import {
  CAPACIDADES_REPOS_1026,
  HABILIDAD_CONOCIMIENTO_WEKNORA,
  HABILIDAD_GRABAR_PANTALLA,
  HABILIDAD_PROYECTOS_OPENPROJECT,
  HABILIDADES_REPOS_1026,
  IDS_CAPACIDADES_REPOS_1026,
  MAX_PALABRAS_RESUMEN,
  MAX_PALABRAS_TARJETA,
} from "../repos-1026";

const RAIZ = path.resolve(__dirname, "../../../../..");

afterEach(() => localStorage.clear());

describe("repos 1026 · las tres habilidades", () => {
  it("son tres, con los ids acordados", () => {
    expect(IDS_CAPACIDADES_REPOS_1026).toEqual(["grabar-pantalla", "conocimiento-weknora", "proyectos-openproject"]);
    expect(HABILIDADES_REPOS_1026).toHaveLength(3);
  });

  it("respetan los límites de palabras de las capas pequeñas (60 y 120)", () => {
    expect(MAX_PALABRAS_TARJETA).toBe(60);
    expect(MAX_PALABRAS_RESUMEN).toBe(120);
    for (const h of HABILIDADES_REPOS_1026) {
      const tarjeta = contarPalabras(h.tarjeta);
      const resumen = contarPalabras(h.resumen);
      expect(tarjeta, `${h.id} tarjeta`).toBeGreaterThan(30);
      expect(tarjeta, `${h.id} tarjeta`).toBeLessThanOrEqual(MAX_PALABRAS_TARJETA);
      expect(resumen, `${h.id} resumen`).toBeGreaterThan(tarjeta);
      expect(resumen, `${h.id} resumen`).toBeLessThanOrEqual(MAX_PALABRAS_RESUMEN);
    }
  });

  it("dicen cuándo aplican en una sola frase y qué NO hacen hoy", () => {
    for (const h of HABILIDADES_REPOS_1026) {
      expect(h.cuando.startsWith("Cuando "), h.id).toBe(true);
      expect(h.cuando.endsWith("."), h.id).toBe(true);
      expect(h.cuando.slice(0, -1), h.id).not.toMatch(/[.!?]\s/);
      expect(h.limite.length, h.id).toBeGreaterThan(20);
    }
  });

  it("cada una cuelga de su ficha de la Biblioteca, con el mismo repo y la misma licencia", () => {
    for (const h of HABILIDADES_REPOS_1026) {
      const ficha = findPackage(h.fichaId);
      expect(ficha, h.fichaId).toBeDefined();
      expect(ficha?.payload.upstream, h.fichaId).toBe(h.repo);
      const spdx = (texto: string) => texto.split(/[\s(]/)[0];
      expect(spdx(String(ficha?.payload.licencia)), h.fichaId).toBe(spdx(h.licencia));
    }
  });
});

describe("repos 1026 · son capacidades vivas de Aurora", () => {
  it("están en el manifiesto, sin repetir ningún id, y entran por su ficha", () => {
    const ids = SKILL_CAPABILITIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of CAPACIDADES_REPOS_1026) {
      const viva = SKILL_CAPABILITIES.find((x) => x.id === c.id);
      expect(viva, c.id).toBeDefined();
      expect(viva?.packageIds?.[0]?.startsWith("lib-"), c.id).toBe(true);
      expect(viva?.defaultOn, c.id).toBeFalsy();
    }
  });

  it("también están en el vocabulario de agentes de grupo, que las acepta por su nombre", () => {
    for (const id of IDS_CAPACIDADES_REPOS_1026) expect(CAPACIDADES_CONOCIDAS).toContain(id);
    const propuesta = {
      id: "agente-archivista",
      name: "Archivista del grupo",
      persona: "Responde con los documentos del grupo y dice de dónde salen.",
      capabilities: ["conocimiento-weknora", "proyectos-openproject", "grabar-pantalla"],
      visibility: "public",
      version: "1.0.0",
      createdAt: 1,
      updatedAt: 2,
      grupoId: "grupo-huerto",
      creadoPor: "alex",
      rolesQuePuedenInvocar: ["miembro"],
      memoriaAlcance: "grupo",
      limites: { invocacionesPorHora: 30, capacidades: ["conocimiento-weknora"], puedeSalirAInternet: false, puedeEscribir: false },
    };
    expect(validarAgenteGrupo(propuesta).problemas).toEqual([]);
    const { agente, problemas } = validarAgenteGrupo({ ...propuesta, capabilities: ["conocimiento-weknora", "inventada-por-un-modelo"] });
    expect(agente).toBeNull();
    expect(problemas.join(" ")).toMatch(/inventada-por-un-modelo/);
    expect(problemas.join(" ")).not.toMatch(/conocimiento-weknora/);
  });

  it("se activan al instalar la ficha y se apagan al desinstalarla", async () => {
    for (const [ficha, id] of [
      ["lib-cap", "grabar-pantalla"],
      ["lib-weknora", "conocimiento-weknora"],
      ["lib-openproject", "proyectos-openproject"],
    ] as const) {
      expect(activeCapabilityIds(), `${id} antes`).not.toContain(id);
      const res = await install(findPackage(ficha)!);
      expect(res.ok, ficha).toBe(true);
      expect(activeCapabilityIds(), `${id} instalada`).toContain(id);
      expect(skillsSystemPrompt([id])).toContain(HABILIDADES_REPOS_1026.find((h) => h.id === id)!.nombre);
      await uninstall(ficha);
      expect(activeCapabilityIds(), `${id} desinstalada`).not.toContain(id);
    }
  });
});

describe("repos 1026 · los textos no prometen lo que no hacen", () => {
  it("Cap: Aurora no graba; solo se pide abrir la sección y, si nadie escucha, se dice", () => {
    const r = HABILIDAD_GRABAR_PANTALLA.resumen;
    expect(r).toContain("starseed:abrir-grabar");
    expect(r).toMatch(/si nadie escucha todavía, dilo/);
    expect(r).toMatch(/Tú nunca grabas ni afirmas haber grabado/);
    expect(r).toMatch(/AGPL-3\.0/);
    expect(r).toMatch(/licencia de pago/);
    expect(HABILIDAD_GRABAR_PANTALLA.tarjeta).toMatch(/Tú nunca grabas/);
    expect(HABILIDAD_GRABAR_PANTALLA.limite).toMatch(/hoy ninguna herramienta de Aurora la invoca/);
  });

  it("WeKnora y OpenProject: hoy no hay instancia ni herramienta, y mandan a las variables por su NOMBRE", () => {
    for (const [h, url, clave] of [
      [HABILIDAD_CONOCIMIENTO_WEKNORA, "WEKNORA_URL", "WEKNORA_API_KEY"],
      [HABILIDAD_PROYECTOS_OPENPROJECT, "OPENPROJECT_URL", "OPENPROJECT_API_KEY"],
    ] as const) {
      for (const texto of [h.tarjeta, h.resumen]) {
        expect(texto, h.id).toMatch(/Hoy (NO|no) hay/);
        expect(texto, h.id).toMatch(/no finjas consultar/i);
        expect(texto, h.id).toContain(url);
        expect(texto, h.id).toContain(clave);
      }
      expect(h.resumen, h.id).toMatch(/solo lectura/);
      expect(h.resumen, h.id).toMatch(/nunca en el repositorio/);
    }
    expect(HABILIDAD_CONOCIMIENTO_WEKNORA.resumen).toMatch(/alcance de memoria/);
    expect(HABILIDAD_PROYECTOS_OPENPROJECT.resumen).toMatch(/GPL-3\.0/);
  });

  it("sin nombres prohibidos de Genesis, sin emojis y sin nada con forma de clave", () => {
    const todo = JSON.stringify(HABILIDADES_REPOS_1026);
    expect(todo).not.toMatch(new RegExp(["Puente de", "Centro de"].map((p) => `${p} ${["Man", "do"].join("")}`).join("|")));
    expect(todo).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(todo).not.toMatch(/\b(sk|ghp|gsk|xox[bp])[-_][A-Za-z0-9]{16,}/);
  });
});

describe("repos 1026 · el módulo es puro (CLAUDE.md, trampa 11)", () => {
  it("solo importa un tipo del manifiesto: sin node:*, sin «use client», sin ciclo en tiempo de ejecución", () => {
    const fuente = readFileSync(path.join(RAIZ, "src/ai/astraura/habilidades/repos-1026.ts"), "utf8");
    const codigo = fuente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(codigo).not.toMatch(/^\s*import[^;]*from\s+["']node:/m);
    expect(codigo).not.toMatch(/^\s*["']use client["']/m);
    const imports = codigo.match(/^\s*import[^;]*;/gm) ?? [];
    expect(imports).toHaveLength(1);
    expect(imports[0]).toMatch(/^\s*import type /);
  });
});
