import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { DIRECTORIO, FECHA_VERIFICACION } from "../directorio";
import { puedeEnviarElAgente, puedeRedactar, quienActua } from "../consulta";
import { IDS_RAMA } from "../tipos";

const FUENTE = readFileSync(path.join(__dirname, "..", "directorio.ts"), "utf8");

describe("directorio de MetaGeminis", () => {
  it("tiene entre 40 y 80 sitios, con ids únicos y válidos para la base de datos", () => {
    expect(DIRECTORIO.length).toBeGreaterThanOrEqual(40);
    expect(DIRECTORIO.length).toBeLessThanOrEqual(80);
    const ids = DIRECTORIO.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    // El mismo patrón que exige la migración a hallazgos.sitio_id y borradores.sitio_id.
    for (const id of ids) expect(id).toMatch(/^[a-z0-9][a-z0-9-]*$/);
  });

  it("cada ficha es completa y honesta", () => {
    for (const s of DIRECTORIO) {
      expect(s.nombre.trim(), s.id).not.toBe("");
      expect(s.url, s.id).toMatch(/^https:\/\//);
      expect(s.fuente, s.id).toMatch(/^https:\/\//);
      expect(s.que_es.length, s.id).toBeGreaterThan(20);
      expect(s.utilidad.length, s.id).toBeGreaterThan(10);
      expect(s.pasos_alex.length, s.id).toBeGreaterThan(5);
      expect(s.prioridad, s.id).toBeGreaterThanOrEqual(1);
      expect(s.prioridad, s.id).toBeLessThanOrEqual(5);
      expect(s.verificado, s.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(s.ramas.length, s.id).toBeGreaterThan(0);
      for (const r of s.ramas) expect(IDS_RAMA, `${s.id} → ${r}`).toContain(r);
      if (s.vence) expect(s.vence, s.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("se verificó el día declarado y casi todo se leyó de verdad", () => {
    expect(FECHA_VERIFICACION).toBe("2026-10-10");
    const leidas = DIRECTORIO.filter((s) => s.verificacion === "pagina-leida").length;
    expect(leidas / DIRECTORIO.length).toBeGreaterThan(0.8);
  });

  it("lo que no se leyó o no se sabe nunca se envía solo", () => {
    for (const s of DIRECTORIO) {
      if (s.verificacion !== "pagina-leida") expect(puedeEnviarElAgente(s), `${s.id} no leído`).toBe(false);
      if (s.agentes === "sin-verificar") expect(puedeEnviarElAgente(s), `${s.id} sin normas`).toBe(false);
      if (s.estado === "revisar") expect(puedeEnviarElAgente(s), `${s.id} por revisar`).toBe(false);
    }
  });

  it("los sitios que no aceptan texto de IA o prohíben agentes no admiten redacción", () => {
    for (const s of DIRECTORIO) {
      if (s.ia_en_texto === "no-aceptada") expect(puedeRedactar(s), s.id).toBe(false);
      if (s.agentes === "prohibido") expect(puedeRedactar(s), s.id).toBe(false);
      if (s.agentes === "solo-lectura") expect(quienActua(s), s.id).toBe("solo-lee");
    }
  });

  it("recoge los límites reales que se descubrieron al leer las normas", () => {
    const por = Object.fromEntries(DIRECTORIO.map((s) => [s.id, s]));
    expect(por["nlnet-convocatoria"].ia_en_texto).toBe("no-aceptada");
    expect(por["hacker-news"].ia_en_texto).toBe("no-aceptada");
    expect(por["prototype-fund"].estado).toBe("no-encaja");
    expect(por["linkedin"].agentes).toBe("prohibido");
  });

  it("incluye redes de agentes de IA, fondos, donaciones, voluntariado y canales", () => {
    const cats = new Set(DIRECTORIO.map((s) => s.categoria));
    for (const c of ["red-agentes", "fondo", "donaciones", "voluntariado", "canal", "crowdfunding", "comunidad"] as const) expect(cats.has(c), c).toBe(true);
  });

  it("el bloque <datos-json> es JSON válido e idéntico a DIRECTORIO (así lo lee Python sin duplicarlo)", () => {
    const m = FUENTE.match(/\/\/ <datos-json>\nexport const DIRECTORIO: SitioDirectorio\[\] = ([\s\S]*?);\n\/\/ <\/datos-json>/);
    expect(m, "faltan las marcas <datos-json>").not.toBeNull();
    expect(JSON.parse(m![1])).toEqual(DIRECTORIO);
  });
});
