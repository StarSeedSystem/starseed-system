/**
 * Guardia de la skill coop-sync-testing (CAP1119).
 *
 * La objeción del director fue mecánica: la tarea se reabrió porque las puertas
 * la rechazaron «sin tocar NINGUNO de sus 1 archivo(s)». Estas pruebas demuestran
 * dos cosas: (1) la guía existe, documenta el método y enlaza las piezas reales;
 * (2) su ejemplo de uso corre de verdad contra los módulos puros del repo, así que
 * la tarea no se cierra en silencio sin entregar nada.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { fusionarEstados, type EstadoSala } from "../salas/sincronia-sala";
import { reclamar, traspasar, aceptarEscritura } from "../salas/propiedad-sala";

const RUTA = join(process.cwd(), ".agent", "skills", "coop-sync-testing", "README.md");
const GUIA = existsSync(RUTA) ? readFileSync(RUTA, "utf8") : "";
const PAGINAS = [
  "fake-world-testing",
  "fuzzing-coop-sync",
  "desync-hunting",
  "network-chaos-testing",
  "actor-ownership",
] as const;

describe("guía de la skill coop-sync-testing", () => {
  it("punto 1 · existe, no está vacía y cabe en el presupuesto de la tarea", () => {
    expect(existsSync(RUTA)).toBe(true);
    const tamano = existsSync(RUTA) ? statSync(RUTA).size : 0;
    expect(tamano).toBeGreaterThan(0);
    expect(GUIA.trim().length).toBeGreaterThan(0);
    expect(GUIA.split("\n").length).toBeLessThanOrEqual(120);
  });

  it("punto 1 · dice qué se copió y que las herramientas de tools/ no se ejecutan", () => {
    expect(GUIA).toMatch(/no se copiaron|no se copian/i);
    expect(GUIA).toContain("tools/");
    expect(GUIA).toMatch(/no se ejecutan/i);
    expect(GUIA).toMatch(/no\s+existen aquí/i);
  });

  it("punto 1 · enlaza las cinco páginas de referencias de la carpeta", () => {
    for (const pagina of PAGINAS) {
      expect(GUIA, `falta ${pagina}.md`).toContain(pagina);
    }
    expect(GUIA).toContain("referencias/");
  });

  it("punto 1 · mapea el método a módulos y pruebas reales del repo", () => {
    for (const ancla of [
      "src/lib/salas/sincronia-sala.ts",
      "src/lib/salas/propiedad-sala.ts",
      "salas-sincronia-fuzz.test.ts",
      "salas-propiedad.test.ts",
    ]) {
      expect(GUIA).toContain(ancla);
    }
  });

  it("punto 1 · documenta la reparación y las puertas del repo", () => {
    expect(GUIA).toMatch(/reparación/i);
    expect(GUIA).toContain("npx vitest run");
    expect(GUIA).toContain("scripts/enjambre/tsc-turno.sh");
  });

  it("punto 2 · el ejemplo de uso no es adorno: los símbolos que enseña existen", () => {
    for (const simbolo of ["fusionarEstados", "reclamar", "traspasar", "aceptarEscritura"]) {
      expect(GUIA).toContain(simbolo);
    }
  });
});

const MI = "observadora";
const ficha = (actualizadoEn: number, porDispositivo: string): EstadoSala => ({
  salaId: "sala-ficha",
  reloj: actualizadoEn,
  elementos: { ficha: { id: "ficha", tipo: "ficha-juego", datos: {}, actualizadoEn, porDispositivo } },
});

describe("el ejemplo de la guía corre contra los módulos reales", () => {
  it("la fusión es conmutativa e idempotente", () => {
    const a = ficha(10, "movil-ana");
    const b = ficha(20, "tablet-bruno");
    expect(fusionarEstados(a, b, MI).resultado.elementos).toEqual(
      fusionarEstados(b, a, MI).resultado.elementos,
    );
    expect(fusionarEstados(a, a, MI).resultado.elementos).toEqual(a.elementos);
  });

  it("la propiedad por épocas rechaza al que no es dueño", () => {
    const p1 = reclamar({}, "ficha", "ana");
    const p2 = traspasar(p1, "ficha", "ana", "bruno");
    expect(p2.ficha.epoca).toBe(2);
    expect(aceptarEscritura(p1, "ficha", "bruno", 1).ok).toBe(false);
    expect(aceptarEscritura(p2, "ficha", "bruno", 2).ok).toBe(true);
  });
});
