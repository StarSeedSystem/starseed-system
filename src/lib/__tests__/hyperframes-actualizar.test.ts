import { describe, it, expect } from "vitest";
import {
  aplicar, compararVersiones, esSemver, huellasConcuerdan, planActualizacion, TOLERANCIA,
} from "../../../servicios/hyperframes/src/actualizar.mjs";

type Plan = { viable: boolean; motivo?: string; actual?: string; disponible?: string; pasos?: string[] };
type Sincron<T> = T | Promise<T>;
type Deps = { instalar?: (v: string) => Sincron<unknown>; lint?: (v: string) => Sincron<string | null>;
  renderPrueba?: (v: string) => Sincron<number[]>; huellasReferencia?: () => Sincron<number[]>;
  cambiarEnlace?: (a: string, n: string) => Sincron<unknown>; deshacerEnlace?: (v: string) => Sincron<unknown> };
type Resultado = { ok: boolean; pasos: string[]; version: string | null; motivo?: string };
type Aplicar = (plan: Plan, deps?: Deps) => Promise<Resultado>;
const ejecutar = aplicar as unknown as Aplicar;
const PLAN = planActualizacion({ actual: "0.8.172", disponible: "0.8.173" }) as Plan;

/** Deps falsas que van anotando la orden real de las llamadas (sin disco, sin redes, sin procesos). */
function depsFalsas(salidas: Partial<Deps> = {}): { deps: Deps; orden: string[] } {
  const orden: string[] = [];
  const anota = (nombre: string) => () => { orden.push(nombre); };
  return {
    orden,
    deps: {
      instalar: async (v) => { anota("instalar")(); if (salidas.instalar) return salidas.instalar(v); },
      lint: async (v) => { anota("lint")(); return salidas.lint ? salidas.lint(v) : null; },
      renderPrueba: async (v) => { anota("renderPrueba")(); return salidas.renderPrueba ? salidas.renderPrueba(v) : [10, 20, 30]; },
      huellasReferencia: () => { anota("huellasReferencia")(); return salidas.huellasReferencia ? salidas.huellasReferencia() : [9, 19, 30]; },
      cambiarEnlace: (a, n) => { anota("cambiarEnlace")(); if (salidas.cambiarEnlace) return salidas.cambiarEnlace(a, n); },
      deshacerEnlace: salidas.deshacerEnlace ? salidas.deshacerEnlace : undefined,
    },
  };
}

describe("hyperframes-actualizar", () => {
  it("reconoce semver y no acepta versiones cortas ni texto suelto", () => {
    expect(esSemver("0.8.172")).toBe(true);
    expect(esSemver("1.2.3-rc.1")).toBe(true);
    expect(esSemver("0.8")).toBe(false);
    expect(esSemver("prueba")).toBe(false);
    expect(esSemver(null)).toBe(false);
    expect(compararVersiones("0.8.172", "0.8.173")).toBe(-1);
    expect(compararVersiones("0.8.173", "0.8.172")).toBe(1);
    expect(compararVersiones("1.0.0+b", "1.0.0+c")).toBe(0);
    expect(compararVersiones("1.0.0", "1.0.0-rc.1")).toBe(1);
    expect(compararVersiones("1.0.0-rc.2", "1.0.0-rc.10")).toBe(-1);
  });

  it("junta las huellas con tolerancia y rechaza longitudes o tipos extraños", () => {
    expect(TOLERANCIA).toBeGreaterThan(0);
    expect(huellasConcuerdan([9, 19, 30], [10, 20, 30])).toBe(true);
    expect(huellasConcuerdan([9], [13])).toBe(true);
    expect(huellasConcuerdan([9], [14])).toBe(false);
    expect(huellasConcuerdan([9, 19], [10, 20, 30])).toBe(false);
    expect(huellasConcuerdan(null, [1, 2, 3])).toBe(false);
    expect(huellasConcuerdan([1, 2, 3], [1, 2, Number.NaN])).toBe(false);
  });

  it("plan: viable solo con semver de ambas, distinto y sin rebajarse", () => {
    expect(planActualizacion({ actual: "0.8", disponible: "0.8.173" })).toMatchObject({
      viable: false, motivo: "la versión no es semver",
    });
    expect(planActualizacion({ actual: "0.8.173", disponible: "0.8.172" })).toMatchObject({
      viable: false, motivo: "no se baja de versión sola",
    });
    expect(planActualizacion({ actual: "0.8.173", disponible: "0.8.173" })).toMatchObject({
      viable: false, motivo: "misma versión, nada que actualizar",
    });
    expect(PLAN).toMatchObject({ viable: true, actual: "0.8.172", disponible: "0.8.173" });
    expect(PLAN.pasos?.slice(-1)).toEqual(["cambiar-enlace"]);
    expect(planActualizacion()).toMatchObject({ viable: false, motivo: "la versión no es semver" });
  });

  it("aplica en orden: instalar aparte, lint, prueba de 3 fotogramas, huellas y enlace", async () => {
    const { deps, orden } = depsFalsas();
    const r = await ejecutar(PLAN, deps);
    expect(orden).toEqual(["instalar", "lint", "renderPrueba", "huellasReferencia", "cambiarEnlace"]);
    expect(r).toMatchObject({ ok: true, version: "0.8.173", pasos: PLAN.pasos });
  });

  it("si el lint falla no hay render ni cambio de enlace y se queda la anterior", async () => {
    const { deps, orden } = depsFalsas({ lint: () => "2 errores del linter" });
    const r = await ejecutar(PLAN, deps);
    expect(orden).toEqual(["instalar", "lint"]);
    expect(r).toMatchObject({ ok: false, version: "0.8.172", pasos: ["instalar"] });
    expect(r.motivo).toContain("lint");
  });

  it("una prueba sin 3 fotogramas o con huellas cambiadas no toca el enlace: vuelta atrás", async () => {
    const corta = depsFalsas({ renderPrueba: () => [1, 2] });
    const rc = await ejecutar(PLAN, corta.deps);
    expect(rc.ok).toBe(false);
    expect(rc.motivo).toContain("3 fotogramas");
    const distinta = depsFalsas({ huellasReferencia: () => [200, 200, 200] });
    const rd = await ejecutar(PLAN, distinta.deps);
    expect(rd).toMatchObject({ ok: false, version: "0.8.172", pasos: ["instalar", "lint", "render-prueba"] });
    expect(rd.motivo).toContain("huellas");
    expect(distinta.orden).toEqual(["instalar", "lint", "renderPrueba", "huellasReferencia"]);
  });
});
