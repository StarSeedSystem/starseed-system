/**
 * GUI1021B · Textos de la red: los del contrato, honestos, y los diez temas en su orden.
 *
 * Lee `architecture/guias-introduccion.md` §3 del disco y compara cada campo de los seis temas de
 * la red; un texto retocado solo en el código se pone en rojo.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { TEMAS_RED, TODOS_LOS_TEMAS } from "../guia-temas-red";
import { TEMAS_SISTEMA } from "../guia-temas-sistema";

interface TemaContrato {
  key: string;
  titulo: string;
  donde: string;
  campos: Record<string, string>;
}

/** Los bloques `**clave** · Título · ruta` de §3, con sus campos ya desenvueltos. */
function temasDelContrato(): TemaContrato[] {
  const md = readFileSync(path.join(process.cwd(), "architecture/guias-introduccion.md"), "utf8");
  const s3 = md.split("## 3.")[1].split("Correcciones de textos existentes")[0];
  const temas: TemaContrato[] = [];
  for (const bloque of s3.split(/\n(?=\*\*[a-z-]+\*\* · )/)) {
    const cab = /^\*\*([a-z-]+)\*\* · (.+?) · (.+)$/m.exec(bloque.trim());
    if (!cab) continue;
    const campos: Record<string, string> = {};
    let actual = "";
    for (const linea of bloque.trim().split("\n").slice(1)) {
      const m = /^- (cuerpo|voz|puntos|preguntaAurora): (.*)$/.exec(linea);
      if (m) {
        actual = m[1];
        campos[actual] = m[2].trim();
      } else if (actual && linea.startsWith("  ")) {
        campos[actual] += ` ${linea.trim()}`;
      }
    }
    temas.push({ key: cab[1], titulo: cab[2].trim(), donde: cab[3].trim(), campos });
  }
  return temas;
}

const sinComillas = (t: string) => t.replace(/^«/, "").replace(/»$/, "");
const puntosDe = (t: string) => t.replace(/\.$/, "").split(" · ").map((p) => p.trim());
const textoEntero = (t: (typeof TODOS_LOS_TEMAS)[number]) =>
  [t.titulo, t.cuerpo, t.voz, t.preguntaAurora, ...t.puntos].join(" ");

describe("TEMAS_RED y TODOS_LOS_TEMAS (GUI1021B)", () => {
  const contrato = temasDelContrato();

  it("son diez temas, sistema y luego red, en el orden del contrato", () => {
    expect(TODOS_LOS_TEMAS.map((t) => t.key)).toEqual([
      "protomolecula", "malla", "capas-conciencia", "neuronas-cerebro",
      "pilar-politica", "pilar-educacion", "pilar-cultura", "libreria-biblioteca", "genesis", "personalizacion-segura",
    ]);
    expect(TODOS_LOS_TEMAS.map((t) => t.key)).toEqual(contrato.map((c) => c.key));
    TEMAS_SISTEMA.forEach((t, i) => expect(TODOS_LOS_TEMAS[i]).toBe(t));
  });

  it("no repite ninguna clave", () => {
    expect(new Set(TODOS_LOS_TEMAS.map((t) => t.key)).size).toBe(10);
  });

  it("copia tal cual título, cuerpo, voz, pregunta y puntos del §3", () => {
    for (const tema of TEMAS_RED) {
      const c = contrato.find((x) => x.key === tema.key);
      expect(c, `falta «${tema.key}» en el contrato`).toBeDefined();
      if (!c) continue;
      expect(tema.titulo).toBe(c.titulo);
      expect(tema.cuerpo).toBe(sinComillas(c.campos.cuerpo));
      expect(tema.voz).toBe(sinComillas(c.campos.voz));
      expect(tema.preguntaAurora).toBe(sinComillas(c.campos.preguntaAurora));
      expect([...tema.puntos]).toEqual(puntosDe(c.campos.puntos));
    }
  });

  it("lleva a la ruta real que da el contrato", () => {
    for (const tema of TEMAS_RED) {
      expect(tema.ruta.startsWith("/")).toBe(true);
      const donde = contrato.find((x) => x.key === tema.key)?.donde ?? "";
      if (donde.startsWith("`")) expect(tema.ruta).toBe(donde.replace(/`/g, ""));
    }
    expect(TEMAS_RED.find((t) => t.key === "personalizacion-segura")?.ruta).toBe("/genesis");
  });

  it("ningún tema promete la verificación biométrica", () => {
    for (const t of TODOS_LOS_TEMAS) expect(textoEntero(t)).not.toMatch(/biom[eé]tric|huella dactilar|reconocimiento facial/i);
  });

  it("las aulas con agentes y la capa colectiva aparecen «en camino»", () => {
    const educacion = TODOS_LOS_TEMAS.find((t) => t.key === "pilar-educacion");
    const capas = TODOS_LOS_TEMAS.find((t) => t.key === "capas-conciencia");
    expect(educacion?.puntos).toContain("aulas con agentes en camino");
    expect(capas?.puntos.some((p) => /capa colectiva.*en camino/.test(p))).toBe(true);
    for (const t of TODOS_LOS_TEMAS) {
      for (const p of t.puntos) if (/\baulas\b/.test(p)) expect(p).toMatch(/en camino/);
    }
  });
});
