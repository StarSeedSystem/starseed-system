/**
 * Caracterización de `elegirEnlaces` (MED1108B · 2026-11-08).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Fija lo que `elegirEnlaces` devolvía ANTES de delegar en el planificador único
 * (`conectores/planificador-vias.ts`): elegidos (id, rango, motivo, en orden), descartados (id, tipo,
 * motivo, en orden) y, para archivos, el reparto multitrayecto. La foto vive en
 * `fixtures/eleccion-enlace-caracterizacion.json` y se generó con el código de main (8e7c3aea53).
 *
 * Regenerarla (solo si el cambio de comportamiento es querido y está en el contrato):
 *   ESCRIBIR_CARACTERIZACION=1 NODE_ENV=test npx vitest run src/lib/malla/conectores/__tests__/caracterizacion-eleccion.test.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { elegirEnlaces, enlacesParaReparto } from "@/lib/malla/eleccion-enlace";
import { casos, compactar } from "./caracterizacion-matriz";

const RUTA = path.join(__dirname, "fixtures", "eleccion-enlace-caracterizacion.json");

interface Foto {
  version: 1;
  motivos: string[];
  salidas: Array<{ e: string[]; d: string[]; r?: string[] }>;
  /** Índice de salida por caso, en el orden de `casos()`. */
  casos: number[];
}

function fotografiar(): Foto {
  const motivos = new Map<string, number>();
  const salidas: Foto["salidas"] = [];
  const indice = new Map<string, number>();
  const porCaso: number[] = [];
  for (const c of casos()) {
    const r = elegirEnlaces(c.enlaces, c.destino, c.clase, c.bytes, c.opciones);
    const reparto = c.clase === "archivo" ? enlacesParaReparto(r).map((e) => e.id) : undefined;
    const compacta = compactar(r, motivos, reparto);
    const clave = JSON.stringify(compacta);
    let i = indice.get(clave);
    if (i === undefined) {
      i = salidas.length;
      salidas.push(compacta);
      indice.set(clave, i);
    }
    porCaso.push(i);
  }
  return { version: 1, motivos: Array.from(motivos.keys()), salidas, casos: porCaso };
}

/** Salida legible de un caso (para que un fallo diga qué cambió, con los motivos en claro). */
function legible(f: Foto, i: number): { elegidos: string[]; descartados: string[]; reparto?: string[] } {
  const s = f.salidas[f.casos[i]];
  const claro = (x: string) => {
    const partes = x.split("|");
    const m = Number(partes.pop());
    return `${partes.join("|")}|${f.motivos[m]}`;
  };
  return { elegidos: s.e.map(claro), descartados: s.d.map(claro), ...(s.r ? { reparto: s.r } : {}) };
}

describe("elegirEnlaces — caracterización (misma salida antes y después de delegar)", () => {
  const actual = fotografiar();

  if (process.env.ESCRIBIR_CARACTERIZACION === "1") {
    it("escribe la foto", () => {
      writeFileSync(RUTA, `${JSON.stringify(actual)}\n`);
      expect(actual.casos.length).toBeGreaterThan(1000);
    });
    return;
  }

  const foto = JSON.parse(readFileSync(RUTA, "utf8")) as Foto;
  const lista = casos();

  it("cubre una matriz amplia (más de 4.000 casos y cientos de salidas distintas)", () => {
    expect(foto.casos).toHaveLength(lista.length);
    expect(lista.length).toBeGreaterThan(4000);
    expect(foto.salidas.length).toBeGreaterThan(100);
  });

  it("cada caso devuelve exactamente los mismos elegidos, descartados, motivos y reparto", () => {
    const distintos: Array<{ caso: string; antes: unknown; ahora: unknown }> = [];
    for (let i = 0; i < lista.length; i++) {
      const antes = legible(foto, i);
      const ahora = legible(actual, i);
      if (JSON.stringify(antes) !== JSON.stringify(ahora)) distintos.push({ caso: lista[i].clave, antes, ahora });
    }
    expect(distintos.slice(0, 3)).toEqual([]);
    expect(distintos).toHaveLength(0);
  });

  it("los elegidos son los MISMOS objetos de entrada (no copias)", () => {
    for (const c of lista.slice(0, 400)) {
      const r = elegirEnlaces(c.enlaces, c.destino, c.clase, c.bytes, c.opciones);
      for (const x of r.elegidos) expect(c.enlaces).toContain(x.enlace);
    }
  });
});
