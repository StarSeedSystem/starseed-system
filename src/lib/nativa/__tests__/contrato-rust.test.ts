/*
 * Guardia del contrato web ↔ app nativa: los tipos de src/lib/nativa/tipos.ts y los comandos de
 * puente.ts deben casar con lo que de verdad expone Rust (native/src-tauri/src). Si alguien cambia
 * un campo en un lado y no en el otro, esto se pone rojo antes de que lo note una persona.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = join(process.cwd(), "native/src-tauri/src");
const rust = (f: string) => readFileSync(join(RAIZ, f), "utf8");
const ts = (f: string) => readFileSync(join(process.cwd(), "src/lib/nativa", f), "utf8");

function camposRust(fuente: string, struct: string): string[] {
  const m = fuente.match(new RegExp(`pub struct ${struct} \\{([\\s\\S]*?)\\n\\}`));
  if (!m) throw new Error(`No encuentro ${struct} en Rust`);
  return [...m[1].matchAll(/^\s*pub (\w+):/gm)].map((x) => x[1]).sort();
}

function camposTs(fuente: string, iface: string): string[] {
  const m = fuente.match(new RegExp(`export interface ${iface} \\{([\\s\\S]*?)\\n\\}`));
  if (!m) throw new Error(`No encuentro ${iface} en TS`);
  return [...m[1].matchAll(/^ {2}(\w+)\??:/gm)].map((x) => x[1]).sort();
}

const PARES: Array<[string, string, string]> = [
  ["antenas.rs", "EstadoAntenas", "EstadoAntenas"],
  ["antenas.rs", "EstadoAntena", "EstadoAntena"],
  ["antenas.rs", "Vecino", "VecinoFaro"],
  ["antenas.rs", "ConfigAntenas", "ConfigAntenas"],
  ["nativa.rs", "EstadoFondo", "EstadoFondo"],
  ["android.rs", "ServicioAndroid", "ServicioAndroid"],
  ["carpetas.rs", "CarpetaConcedida", "CarpetaConcedida"],
  ["nativa.rs", "EstadoCapasDisco", "EstadoCapasDisco"],
  ["disco.rs", "CapaEnDisco", "CapaEnDisco"],
  ["disco.rs", "PeticionDescarga", "PeticionDescarga"],
  ["disco.rs", "Verificacion", "Verificacion"],
  ["nativa.rs", "EntradaNas", "EntradaNas"],
];

describe("contrato web ↔ app nativa", () => {
  const tipos = ts("tipos.ts");
  it.each(PARES)("%s · %s ↔ %s", (archivo, struct, iface) => {
    expect(camposTs(tipos, iface)).toEqual(camposRust(rust(archivo), struct));
  });

  it("cada comando que llama puente.ts está registrado en lib.rs", () => {
    const lib = rust("lib.rs");
    const registrados = new Set([...lib.matchAll(/nativa::(\w+)/g)].map((m) => m[1]));
    const llamados = [...ts("puente.ts").matchAll(/llamar(?:<[^>]+>)?\("([a-z_]+)"/g)].map((m) => m[1]);
    expect(llamados.length).toBeGreaterThan(15);
    for (const c of llamados) expect(registrados, `falta ${c} en generate_handler!`).toContain(c);
    for (const c of llamados) expect(rust("nativa.rs")).toMatch(new RegExp(`pub (async )?fn ${c}\\(`));
  });

  it("los eventos tienen el mismo nombre a los dos lados", () => {
    const n = rust("nativa.rs");
    for (const ev of ["starseed://antenas", "starseed://serie", "starseed://serie-cerrada"]) {
      expect(n).toContain(`"${ev}"`);
      expect(tipos).toContain(`"${ev}"`);
    }
  });
});
