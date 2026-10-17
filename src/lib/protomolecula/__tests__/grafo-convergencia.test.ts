import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { analizarConvergencia, TOPE_CICLOS, type Arista, type RutaDe } from "../grafo-convergencia";
import type { DefinicionAtomo } from "../registro-atomos";

const def = (herramientaId: string, entradas: string[], salidas: string[], nombre = herramientaId): DefinicionAtomo =>
  ({ herramientaId, nombre, categoria: "3d", integracion: "libreria-js", control: "ventana", parametros: [], entradas, salidas });
const DEFS = new Map<string, DefinicionAtomo>([
  ["paso", def("paso", ["json"], ["json"], "Paso")],
  ["modelador", def("modelador", [], ["OBJ"], "Modelador")],
  ["escena", def("escena", [".GLB"], ["glb"], "Escena")],
  ["sinte", def("sinte", ["midi"], ["wav"], "Sintetizador")],
  ["visor", def("visor", [], ["png"], "Visor")],
  ["pantalla", def("pantalla", ["png"], [], "Pantalla")],
]);
const definicion = (id: string) => DEFS.get(id);
const sinRutas: RutaDe = () => null;
const at = (id: string, herramientaId = "paso") => ({ id, herramientaId });
const ar = (de: string, a: string): Arista => ({ de, a });
const grafo = (ids: string[], aristas: Arista[], ruta: RutaDe = sinRutas) =>
  analizarConvergencia(ids.map((id) => at(id)), aristas, definicion, ruta);

describe("orden de ejecución (Kahn estable)", () => {
  it("cadena lineal: A → B → C", () => {
    expect(grafo(["C", "B", "A"], [ar("A", "B"), ar("B", "C")]))
      .toMatchObject({ ok: true, orden: ["A", "B", "C"], ciclos: [], incompatibles: [], conversiones: [] });
  });
  it("diamante: entre los listos sale primero el que entró antes", () => {
    const d = grafo(["D", "C", "B", "A"], [ar("A", "B"), ar("A", "C"), ar("B", "D"), ar("C", "D")]);
    expect(d).toMatchObject({ ok: true, orden: ["A", "C", "B", "D"] });
  });
  it("orden estable: sin aristas respeta la entrada, una arista solo mueve lo suyo y la repetida cuenta una vez", () => {
    expect(grafo(["C", "A", "B"], []).orden).toEqual(["C", "A", "B"]);
    expect(grafo(["C", "A", "B"], [ar("B", "C")]).orden).toEqual(["A", "B", "C"]);
    expect(grafo(["A", "B"], [ar("A", "B"), ar("A", "B")])).toMatchObject({ ok: true, orden: ["A", "B"] });
  });
});

describe("ciclos (DFS)", () => {
  it("ciclo simple: no es ok y no ordena nada del ciclo", () => {
    const d = grafo(["A", "B"], [ar("A", "B"), ar("B", "A")]);
    expect(d).toMatchObject({ ok: false, ciclos: [["A", "B"]], orden: [] });
    expect(d.avisos).toContain("Hay un ciclo: A → B → A. Quita una de sus conexiones para poder ordenar.");
  });
  it("ciclo con cola: la cola se ordena y lo que cuelga del ciclo queda sin orden y avisado", () => {
    const d = grafo(["T", "A", "B", "C", "D"], [ar("T", "A"), ar("A", "B"), ar("B", "C"), ar("C", "A"), ar("C", "D")]);
    expect(d).toMatchObject({ ciclos: [["A", "B", "C"]], orden: ["T"] });
    expect(d.avisos).toContain("Sin orden porque dependen de un ciclo: D.");
  });
  it("da CADA ciclo, también dos que comparten átomo y el que se alimenta a sí mismo", () => {
    expect(grafo(["A", "B", "C"], [ar("A", "B"), ar("B", "A"), ar("B", "C"), ar("C", "B")]).ciclos)
      .toEqual([["A", "B"], ["B", "C"]]);
    expect(grafo(["A"], [ar("A", "A")]).ciclos).toEqual([["A"]]);
  });
  it("también el ciclo que un DFS de aristas de retroceso no ve (A→C→A con A→B→C→A ya visto)", () => {
    expect(grafo(["A", "B", "C"], [ar("A", "B"), ar("B", "C"), ar("C", "A"), ar("A", "C")]).ciclos).toEqual([["A", "B", "C"], ["A", "C"]]);
    const e = grafo(["R", "A", "B"], [ar("R", "A"), ar("A", "R"), ar("R", "B"), ar("B", "A")]);
    expect(e.ciclos).toEqual([["R", "A"], ["R", "B", "A"]]);
    expect(e.avisos.some((t) => t.startsWith("Sin orden"))).toBe(false);
  });
  it("con demasiados ciclos se corta en el tope y lo dice", () => {
    const ids = ["A", "B", "C", "D", "E", "F"];
    const d = grafo(ids, ids.flatMap((x) => ids.filter((y) => y !== x).map((y) => ar(x, y))));
    expect(d.ciclos).toHaveLength(TOPE_CICLOS);
    expect(d.avisos).toContain(`Dejo de buscar ciclos tras ${TOPE_CICLOS} (el grafo está demasiado enredado): puede haber más.`);
  });
});

describe("formatos: directo, por conversión o incompatible", () => {
  it("formato directo, sin preguntar a rutaDe (y normalizado: «.GLB» = «glb»)", () => {
    const rutaDe = vi.fn<RutaDe>(() => null);
    const d = analizarConvergencia([at("e1", "escena"), at("e2", "escena")], [ar("e1", "e2")], definicion, rutaDe);
    expect(d).toMatchObject({ ok: true, incompatibles: [], conversiones: [] });
    expect(rutaDe).not.toHaveBeenCalled();
  });
  it("conversión de dos pasos con un rutaDe falso: la arista va a conversiones con su ruta", () => {
    const rutaDe = vi.fn<RutaDe>((de, a) => (de === "obj" && a === "glb" ? ["OBJ", "gltf", "glb"] : null));
    const d = analizarConvergencia([at("m", "modelador"), at("e", "escena")], [ar("m", "e")], definicion, rutaDe);
    expect(rutaDe).toHaveBeenCalledWith("obj", "glb");
    expect(d.conversiones).toEqual([{ arista: ar("m", "e"), ruta: ["obj", "gltf", "glb"] }]);
    expect(d).toMatchObject({ ok: true, incompatibles: [], orden: ["m", "e"] });
  });
  it("incompatible: sin ruta se dice qué sale y qué entra, y no es ok", () => {
    const d = analizarConvergencia([at("s", "sinte"), at("e", "escena")], [ar("s", "e")], definicion, () => []);
    expect(d).toMatchObject({ ok: false, incompatibles: [{ arista: ar("s", "e"), salidas: ["wav"], entradas: ["glb"] }] });
    expect(d.avisos).toContain("No hay conversor de wav a glb (de Sintetizador a Escena).");
  });
  it("átomo desconocido: incompatible y avisado una sola vez", () => {
    const d = analizarConvergencia([at("x", "fantasma"), at("e", "escena")], [ar("x", "e")], definicion, sinRutas);
    expect(d).toMatchObject({ ok: false, incompatibles: [{ arista: ar("x", "e"), salidas: [], entradas: ["glb"] }] });
    expect(d.avisos).toEqual(["La herramienta fantasma (átomo x) no está registrada: no sé qué produce ni qué recibe."]);
  });
  it("destino sin entradas y origen sin salidas: incompatibles con su motivo", () => {
    const d1 = analizarConvergencia([at("e", "escena"), at("v", "visor")], [ar("e", "v")], definicion, sinRutas);
    expect(d1).toMatchObject({ avisos: ["La herramienta Visor no recibe archivos."], incompatibles: [{ arista: ar("e", "v") }] });
    const d2 = analizarConvergencia([at("p", "pantalla"), at("q", "pantalla")], [ar("p", "q")], definicion, sinRutas);
    expect(d2.avisos).toEqual(["La herramienta Pantalla no produce archivos."]);
  });
});

describe("datos que no cuadran", () => {
  it("aristas a átomos que no están: se ignoran, se avisa y no es ok", () => {
    const d = grafo(["A", "B"], [ar("A", "B"), ar("B", "Z"), ar("Y", "A")]);
    expect(d).toMatchObject({ ok: false, orden: ["A", "B"] });
    expect(d.avisos).toEqual([
      "La conexión B → Z apunta a un átomo que no está (Z): se ignora.",
      "La conexión Y → A apunta a un átomo que no está (Y): se ignora.",
    ]);
  });
  it("un átomo repetido cuenta una vez", () => {
    const d = grafo(["A", "A", "B"], [ar("A", "B")]);
    expect(d).toMatchObject({ orden: ["A", "B"], avisos: ["El átomo A está repetido: cuenta una vez."] });
  });
  it("es puro: solo importa de ./tipos o ./registro-atomos, sin React", () => {
    const src = readFileSync(path.join(__dirname, "..", "grafo-convergencia.ts"), "utf8");
    for (const m of src.matchAll(/from ["']([^"']+)["']/g)) expect(m[1]).toMatch(/^\.\/(tipos|registro-atomos)$/);
    expect(src).not.toMatch(/\beval\s*\(|new Function|import\s*\(/);
  });
});
