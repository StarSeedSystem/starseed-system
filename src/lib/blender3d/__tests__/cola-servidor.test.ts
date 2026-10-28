/**
 * Prueba de la cola local de trabajos 3D (`architecture/blender-3d.md` §7.6 y §11). Los procesos
 * quedan INYECTADOS (`_ponerEjecucion`, `_ponerLanzador`): nada de `vi.mock`; el disco que se toca es
 * un temporal propio que se borra al final. La punta a punta exige Blender real; sin él, `skipIf`.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync, rmSync, utimesSync } from "node:fs";
import { spawnSync, execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import { _ponerEjecucion, _ponerLanzador, RE_ID_TRABAJO, MAX_BYTES_ENTRADAS, capacidades, encolarTrabajo, estadoDe, listarRecientes, leerSalida } from "../cola-servidor";
import { decidirAcceso, mandoHabilitado } from "@/lib/mando/guardian";

type Ejecutar = Parameters<typeof _ponerEjecucion>[0];
const FICHA = JSON.stringify({ instalado: true, perfil: "estandar", version: "5.2.0" });
const base = (): Record<string, unknown> => ({
  v: 1, titulo: "Escena de prueba", calidad: "borrador", ambito: "personal", origen: "estudio", quien: "persona",
  escena: [{ op: "primitiva", tipo: "cubo", nombre: "cubo", tam: 1 }, { op: "camara", nombre: "cam", ubicacion: [0, -5, 2], mira_a: [0, 0, 0] }, { op: "luz", nombre: "sol", tipo: "sol", energia: 3 }],
  salidas: [{ tipo: "render_png", ancho: 256, alto: 256, muestras: 8, motor: "workbench" }] });
let temporal = "", lanzadas: string[][] = [], puestos: string[][] = [];
const conImportar = (): Record<string, unknown> => ({ ...base(), escena: [...(base().escena as unknown[]), { op: "importar", archivo: "libro.stl", nombre: "libro" }] });
const fichaNeurona: Ejecutar = async (bin, args) => { puestos.push([bin, ...args]); return { stdout: FICHA }; };
const fichaNula: Ejecutar = async () => ({ stdout: JSON.stringify({ instalado: false }) }), fichaRota: Ejecutar = async (): Promise<{ stdout: string }> => { throw new Error("sin python"); };
const lanzador = (args: string[]): void => { lanzadas.push(args); };
const raiz = (): string => path.join(temporal, "blender-3d");
/** Índice de una encola buena (o rompe la prueba), y guardia: ninguna respuesta cita rutas absolutas. */
const idDe = (r: { ok: boolean; id?: string; motivo?: string }): string => { expect([r.ok, r.motivo ?? ""]).toEqual([true, ""]); if (!r.id) throw new Error("sin id"); return r.id; };
const sinRutas = (visto: unknown[]): void => { const texto = JSON.stringify(visto); expect(texto).not.toContain(temporal); expect(texto).not.toContain(os.homedir()); };
beforeEach(() => { temporal = mkdtempSync(path.join(os.tmpdir(), "starseed-cola-3d-")); process.env.STARSEED_BLENDER_RAIZ = raiz(); lanzadas = []; puestos = []; _ponerLanzador(lanzador); });
afterEach(() => { _ponerEjecucion(null); _ponerLanzador(null); if (temporal) rmSync(temporal, { recursive: true, force: true }); delete process.env.STARSEED_BLENDER_RAIZ; });

describe("cola de trabajos 3D", () => {
  it("rechaza un trabajo inválido con motivo y no escribe nada en el disco", async () => {
    _ponerEjecucion(fichaNeurona);
    const r = await encolarTrabajo({ feo: true });
    expect([r.ok, r.motivo ? "sí" : "no", existsSync(raiz())]).toEqual([false, "sí", false]);
  });
  it("pide confirmación para un trabajo pesado y no lo ordena", async () => {
    _ponerEjecucion(fichaNeurona);
    const r = await encolarTrabajo({ ...base(), calidad: "final" });
    expect([r.ok, r.requiereConfirmacion, existsSync(path.join(raiz(), "cola"))]).toEqual([false, true, false]);
  });
  it("encola uno válido: id de 32 hex, estado en_cola, ejecutor lanzado una vez y sin rutas", async () => {
    _ponerEjecucion(fichaNeurona);
    const id = idDe(await encolarTrabajo(base()));
    expect([RE_ID_TRABAJO.test(id), existsSync(path.join(raiz(), "cola", `${id}.json`)), lanzadas]).toEqual([true, true, [["python3", "servicios/blender-3d/ejecutor.py", "--una-vez"]]]);
    expect(await estadoDe(id)).toMatchObject({ id, estado: "en_cola", motivo: "encolado", salidas: [] });
    const lista = await listarRecientes(5);
    expect(lista.map((e) => e.id)).toContain(id); sinRutas([lista, puestos]);
  });
  it("no arranca un segundo ejecutor si el cerrojo está vivo (y sí, si cayó)", async () => {
    _ponerEjecucion(fichaNeurona);
    mkdirSync(raiz(), { recursive: true }); writeFileSync(path.join(raiz(), "ejecutor.lock"), "x");
    idDe(await encolarTrabajo(base())); expect(lanzadas).toEqual([]);
    utimesSync(path.join(raiz(), "ejecutor.lock"), new Date(0), new Date(0)); // cerrojo viejo → muerto
    idDe(await encolarTrabajo({ ...base(), titulo: "Segunda escena" }));
    expect(lanzadas).toHaveLength(1);
  });
  it("rechaza ids con «..» o de largo equivocado", async () => {
    expect([await estadoDe("../trabajo"), await estadoDe("9".repeat(31)), await estadoDe("9".repeat(33))]).toEqual([null, null, null]);
  });
  it("sirve solo salidas que el estado nombra, con sus bytes y sin rutas absolutas", async () => {
    _ponerEjecucion(fichaNeurona);
    const id = idDe(await encolarTrabajo({ ...base(), salidas: [{ tipo: "render_png", ancho: 64, alto: 64, muestras: 4, motor: "workbench" }, { tipo: "exportar_glb" }] }));
    mkdirSync(path.join(raiz(), "trabajos", id, "salidas"), { recursive: true });
    writeFileSync(path.join(raiz(), "estado", `${id}.json`), JSON.stringify({ estado: "hecho", motivo: "completado", salidas: ["render_png"] }));
    writeFileSync(path.join(raiz(), "trabajos", id, "salidas", "salida-1.png"), new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]));
    const png = await leerSalida(id, "render_png");
    expect([png.tipo, [...(png.bytes as Uint8Array).slice(0, 4)]]).toEqual(["image/png", [0x89, 0x50, 0x4e, 0x47]]);
    const malas = await Promise.all([leerSalida(id, "exportar_glb"), leerSalida(id, "../../peligro.glb"), leerSalida(id, "salida-7.png")]);
    expect(malas.map((m) => m.ok)).toEqual([false, false, false]); sinRutas([png]);
  });
  it("valida las entradas: solo las que pide el trabajo y ≤ 50 MB en total", async () => {
    _ponerEjecucion(fichaNeurona);
    const deMas = await encolarTrabajo(conImportar(), [{ nombre: "otra.glb", bytes: new Uint8Array([1]) }], true);
    const sobra = await encolarTrabajo(base(), [{ nombre: "cualquiera.stl", bytes: new Uint8Array([1]) }]);
    expect([deMas.ok, (deMas.motivo ?? "").includes("no pide"), sobra.ok, (sobra.motivo ?? "").includes("no pide")]).toEqual([false, true, false, true]);
    const enorme = await encolarTrabajo(conImportar(), [{ nombre: "libro.stl", bytes: new Uint8Array(MAX_BYTES_ENTRADAS + 1) }], true);
    expect([enorme.ok, (enorme.motivo ?? "").includes("50 MB")]).toEqual([false, true]);
    const id = idDe(await encolarTrabajo(conImportar(), [{ nombre: "libro.stl", bytes: new Uint8Array([1, 2, 3]) }], true));
    expect([...readFileSync(path.join(raiz(), "trabajos", id, "entradas", "libro.stl"))]).toEqual([1, 2, 3]);
  });
  it("capacidades(): sin Blender es null y un ejecutable que falla también", async () => {
    _ponerEjecucion(fichaNula); expect(await capacidades()).toBeNull();
    _ponerEjecucion(fichaRota); expect(await capacidades()).toBeNull();
  });
  it("el guardián apagado decide 404 y la ruta llama antes de tocar disco", async () => {
    expect(decidirAcceso({ bandera: false, habilitado: false, produccion: true, esLocal: true, hayUsuario: false, tieneCapacidad: false, rpcFallo: false })).toBe(404);
    const guardado = Reflect.get(process.env, "NODE_ENV") as string | undefined;
    Reflect.set(process.env, "NODE_ENV", "production"); // env.NODE_ENV es de solo lectura en los tipos
    try { expect(mandoHabilitado(new Request("https://otra-caja.ejemplo/api/3d/trabajos"))).toBe(false); }
    finally { Reflect.set(process.env, "NODE_ENV", guardado); }
    // La ruta no se importa (prohibido en pruebas): se comprueba su texto; el guardián en cada método.
    expect(readFileSync(path.resolve("src/app/api/3d/trabajos/route.ts"), "utf-8").split("await guardianMando(request)").length - 1).toBe(2);
  });
});

/** Punta a punta (con Blender real en el PATH; saltada si no lo hay). */
const cual = spawnSync("which", ["blender"], { encoding: "utf8" }).stdout?.trim() ?? "";
const hayBlender = cual.length > 0 && spawnSync("blender", ["--version"], { stdio: "ignore" }).status === 0;

describe.skipIf(!hayBlender)("punta a punta con Blender real", () => {
  it("un cubo → cola → ejecutor real → GLB y PNG de verdad", async () => {
    _ponerEjecucion(null);
    const id = idDe(await encolarTrabajo({ v: 1, titulo: "Cubo real", calidad: "borrador", ambito: "personal", origen: "estudio", quien: "persona", escena: [{ op: "primitiva", tipo: "cubo", nombre: "cubo", tam: 1 }], salidas: [{ tipo: "render_png", ancho: 64, alto: 64, muestras: 4, motor: "workbench" }, { tipo: "exportar_glb" }] }, [], true));
    // El CLI `--una-vez` de BLD1025E aún está pendiente: se pide su función real `ejecutar_uno` (con `STARSEED_BLENDER` fijo).
    process.env.STARSEED_BLENDER = cual;
    try {
      await promisify(execFile)("python3", ["-c", "import sys, os; sys.path.insert(0, 'servicios/blender-3d'); import ejecutor; ejecutor.ejecutar_uno(os.environ['STARSEED_TRABAJO_ID'], None)"], { timeout: 240_000 });
    } finally { delete process.env.STARSEED_BLENDER; }
    let estado = "";
    for (let i = 0; i < 90 && estado !== "hecho"; i++) { estado = (await estadoDe(id))?.estado ?? ""; if (estado !== "hecho") await new Promise((ok) => setTimeout(ok, 1_000)); }
    expect(estado).toBe("hecho");
    const salido = path.join(raiz(), "trabajos", id, "salidas");
    expect([readFileSync(path.join(salido, "salida-1.png")).slice(0, 4), readFileSync(path.join(salido, "salida-2.glb")).slice(0, 4)]).toEqual([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.from("glTF")]);
    expect((await leerSalida(id, "render_png")).ok).toBe(true);
  }, 300_000);
});
