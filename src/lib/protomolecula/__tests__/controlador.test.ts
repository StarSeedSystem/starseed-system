import { describe, it, expect, beforeEach } from "vitest";
import { crearControlador, type Controlador } from "../controlador";
import { registrarControlador, controladorActivo, listarControladores, limpiarControladores } from "../controlador-activo";
import { registrarAtomo, limpiarRegistro, type DefinicionAtomo } from "../registro-atomos";
import type { Ambito, Autor, Molecula, Operacion, Origen, Parametro, Rol, Sesion } from "../tipos";

const P_BRILLO: Parametro = { id: "brillo", nombre: "brillo", tipo: "numero", min: 0, max: 100, unidad: "%" };
const P_GRAVES: Parametro = { id: "graves", nombre: "graves", tipo: "numero", min: -12, max: 12, unidad: "dB" };
const DEF: DefinicionAtomo = {
  herramientaId: "herr-test", nombre: "Ecualizador de prueba", categoria: "audio",
  integracion: "libreria-js", control: "total", parametros: [P_BRILLO, P_GRAVES], entradas: [], salidas: [],
};
const mol = (ambito: Ambito = "personal", atomos: Molecula["atomos"] = [{ id: "at-1", herramientaId: "herr-test", estado: "activo" }]): Molecula =>
  ({ id: "mol-1", titulo: "Prueba", ambito, capas: [], atomos, valores: {}, version: 0, creadaEn: 0, actualizadaEn: 0 });
let t = 0, n = 0;
const ctrl = (m: Molecula, rol: Rol | null, sesion?: Pick<Sesion, "ambito" | "consentimientos">): Controlador =>
  crearControlador({ molecula: m, rol, sesion, ahora: () => ++t, nuevoId: () => `id-${++n}` });
const persona: Autor = { tipo: "persona", id: "u-1" };
const op = (objetivo: Operacion["objetivo"], valor: number, origen: Origen = "mano", autor: Autor = persona, fuente?: string): Operacion =>
  ({ id: `op-${++n}`, objetivo, accion: { tipo: "exacta", valor }, autor, origen, t: ++t, fuente });
const valor = (c: Controlador, clave: string) => c.obtener().molecula.valores[`at-1::${clave}`];
beforeEach(() => { limpiarRegistro(); limpiarControladores(); expect(registrarAtomo(DEF).ok).toBe(true); });
describe("controlador", () => {
  it("un observador no mueve", () => {
    const c = ctrl(mol("grupo"), "observador");
    const r = c.mover(op({ atomoId: "at-1", parametroId: "brillo" }, 50));
    expect(r.ok).toBe(false); expect(valor(c, "brillo")).toBeUndefined();
  });
  it("un editor sí mueve y difunde", () => {
    const c = ctrl(mol("grupo"), "editor");
    const r = c.mover(op({ atomoId: "at-1", parametroId: "brillo" }, 50));
    expect(r.ok && r.difundir).toBe(true); expect(valor(c, "brillo")).toBe(50);
  });
  it("una IA que edita la estructura en espacio compartido queda pendiente y confirmar la aplica", () => {
    const c = ctrl(mol("grupo"), "editor", { ambito: "grupo", consentimientos: [] });
    const r = c.anadirAtomo("herr-test", "Extra", "ia");
    expect(r.ok).toBe(false); expect(c.obtener().pendientes).toHaveLength(1); expect(c.obtener().molecula.atomos).toHaveLength(1);
    const p = c.obtener().pendientes[0];
    expect(c.confirmar(p.operacion.id).ok).toBe(true);
    expect(c.obtener().molecula.atomos).toHaveLength(2); expect(c.obtener().pendientes).toHaveLength(0);
  });
  it("rechazar quita la pendiente sin aplicar", () => {
    const c = ctrl(mol("grupo"), "editor", { ambito: "grupo", consentimientos: [] });
    c.anadirAtomo("herr-test", "Extra", "ia");
    const p = c.obtener().pendientes[0];
    expect(c.rechazar(p.operacion.id).ok).toBe(true); expect(c.obtener().pendientes).toHaveLength(0);
    expect(c.rechazar("no-existe").ok).toBe(false); expect(c.confirmar("no-existe").ok).toBe(false);
  });
  it("dictado correcto cambia el valor", () => {
    const c = ctrl(mol("grupo"), "editor");
    const r = c.dictar("pon el brillo a 50", persona);
    expect(r.aplicados).toBe(1); expect(valor(c, "brillo")).toBe(50);
  });
  it("dictado no entendido no cambia nada", () => {
    const c = ctrl(mol(), "dueno");
    const r = c.dictar("sube el quark cuantico", persona);
    expect(r.aplicados).toBe(0); expect(r.resultados[0].ok).toBe(false);
    expect(c.obtener().molecula.valores).toEqual({}); expect(c.obtener().historial.hechos).toHaveLength(0);
  });
  it("dictado de dos órdenes aplica las dos", () => {
    const c = ctrl(mol("grupo"), "editor");
    const r = c.dictar("pon el brillo a 50 y sube los graves 2 dB", persona);
    expect(r.aplicados).toBe(2); expect(valor(c, "brillo")).toBe(50); expect(valor(c, "graves")).toBe(-10);
  });
  it("anadirAtomo con la mano crea el átomo activo al momento", () => {
    const c = ctrl(mol("grupo"), "editor", { ambito: "grupo", consentimientos: [] });
    const r = c.anadirAtomo("herr-test", "Segundo");
    expect(r.ok).toBe(true);
    const ultimo = c.obtener().molecula.atomos.at(-1);
    expect(ultimo).toMatchObject({ herramientaId: "herr-test", titulo: "Segundo", estado: "activo" });
    expect(c.obtener().pendientes).toHaveLength(0);
  });
  it("un observador no añade átomos ni a mano, y wearable sin consentimiento no difunde", () => {
    const cObs = ctrl(mol("grupo"), "observador", { ambito: "grupo", consentimientos: [] });
    expect(cObs.anadirAtomo("herr-test").ok).toBe(false); expect(cObs.obtener().molecula.atomos).toHaveLength(1);
  });
  it("deshacer solo lo propio; si otro tocó después no pisa; rehacer devuelve", () => {
    const c = ctrl(mol("grupo"), "editor");
    const u2: Autor = { tipo: "persona", id: "u-2" };
    c.mover(op({ atomoId: "at-1", parametroId: "brillo" }, 50));
    c.mover(op({ atomoId: "at-1", parametroId: "graves" }, 5, "mano", u2));
    expect(c.deshacer("u-2").ok).toBe(true); expect(valor(c, "graves")).toBe(-12); expect(valor(c, "brillo")).toBe(50);
    expect(c.rehacer("u-2").ok).toBe(true); expect(valor(c, "graves")).toBe(5);
    c.mover(op({ atomoId: "at-1", parametroId: "brillo" }, 70, "mano", u2));
    expect(c.deshacer("u-1").ok).toBe(false); expect(valor(c, "brillo")).toBe(70);
  });
  it("suscribir avisa y desuscribir deja de avisar", () => {
    const c = ctrl(mol("grupo"), "editor");
    let avisos = 0; const off = c.suscribir(() => avisos++);
    c.mover(op({ atomoId: "at-1", parametroId: "brillo" }, 10)); expect(avisos).toBe(1);
    off(); c.mover(op({ atomoId: "at-1", parametroId: "brillo" }, 20)); expect(avisos).toBe(1);
  });
  it("wearable sin consentimiento: aplica en local con difundir false", () => {
    const c = ctrl(mol("grupo"), "editor", { ambito: "grupo", consentimientos: [] });
    const r = c.mover(op({ atomoId: "at-1", parametroId: "brillo" }, 33, "sensor", persona, "wearable:pulso"));
    expect(r.ok).toBe(true); expect(r.ok && r.difundir).toBe(false); expect(valor(c, "brillo")).toBe(33);
  });
  it("operación desconocida no se aplica y un átomo con próximamente se rechaza", () => {
    const c = ctrl(mol(), "dueno");
    expect(c.mover(op({ atomoId: "at-1", parametroId: "fantasma" }, 1)).ok).toBe(false);
    expect(c.mover(op({ atomoId: "at-x", parametroId: "brillo" }, 1)).ok).toBe(false);
    expect(registrarAtomo({ ...DEF, herramientaId: "herr-futura", proximamente: "próximamente: sin puente" }).ok).toBe(false);
    expect(c.anadirAtomo("herr-futura").ok).toBe(false); expect(c.anadirAtomo("no-existe").ok).toBe(false);
  });
  it("sin historial no hay nada que deshacer ni rehacer; mover acota al rango y la IA queda pendiente", () => {
    const c = ctrl(mol(), "dueno");
    expect(c.obtener().pendientes).toHaveLength(0);
    expect(c.deshacer("u-1").ok).toBe(false); expect(c.rehacer("u-1").ok).toBe(false);
    const r = c.mover(op({ atomoId: "at-1", parametroId: "brillo" }, 500));
    expect(r.ok && r.cambio.acotado).toBe(true); expect(valor(c, "brillo")).toBe(100);
  });
  it("controlador-activo: registrar, activo, listar y desregistrar", () => {
    const a = ctrl(mol(), "dueno"), b = ctrl({ ...mol(), id: "mol-2" }, "editor");
    const offA = registrarControlador("mol-1", a); registrarControlador("mol-2", b);
    expect(controladorActivo("mol-1")).toBe(a); expect(controladorActivo()).toBe(b); expect(listarControladores()).toEqual([a, b]);
    offA(); expect(controladorActivo("mol-1")).toBeNull(); expect(listarControladores()).toEqual([b]);
  });
  it("obtener expone la molécula inicial", () => expect(ctrl(mol(), "dueno").obtener().molecula.titulo).toBe("Prueba"));
});
