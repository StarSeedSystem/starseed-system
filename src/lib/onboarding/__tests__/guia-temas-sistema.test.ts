/**
 * GUI1021A · Los textos del sistema son los del contrato, palabra por palabra.
 *
 * El contrato (`architecture/guias-introduccion.md` §3) es la fuente de verdad: esta prueba lo lee
 * del disco y compara cada campo, así que un texto retocado solo en el código se pone en rojo.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
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

describe("TEMAS_SISTEMA (GUI1021A)", () => {
  const contrato = temasDelContrato();

  it("son los cuatro del sistema, en el orden del tour", () => {
    expect(TEMAS_SISTEMA.map((t) => t.key)).toEqual(["protomolecula", "malla", "capas-conciencia", "neuronas-cerebro"]);
  });

  it("copian tal cual título, cuerpo, voz, pregunta y puntos del §3", () => {
    for (const tema of TEMAS_SISTEMA) {
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

  it("llevan a una ruta real: la del contrato cuando la da como ruta", () => {
    for (const tema of TEMAS_SISTEMA) {
      expect(tema.ruta.startsWith("/")).toBe(true);
      const donde = contrato.find((x) => x.key === tema.key)?.donde ?? "";
      if (donde.startsWith("`")) expect(tema.ruta).toBe(donde.replace(/`/g, ""));
    }
    expect(TEMAS_SISTEMA.find((t) => t.key === "capas-conciencia")?.ruta).toBe("/agent?tab=config-ia");
  });

  it("es honesta: la capa colectiva sale «en camino» y ninguna voz es más larga que su cuerpo", () => {
    const capas = TEMAS_SISTEMA.find((t) => t.key === "capas-conciencia");
    expect(capas?.puntos.some((p) => /colectiva.*en camino/.test(p))).toBe(true);
    for (const t of TEMAS_SISTEMA) {
      expect(t.voz.length).toBeLessThan(t.cuerpo.length);
      expect(t.puntos.length).toBeGreaterThan(0);
    }
    expect(new Set(TEMAS_SISTEMA.map((t) => t.key)).size).toBe(TEMAS_SISTEMA.length);
  });
});
