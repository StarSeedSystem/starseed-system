import { describe, expect, it } from "vitest";
import { adaptarANivel, costoMundo, validarMundo } from "../mundo-spec";
import { LIMITES, MAX_REGLAS } from "../mundo-tipos";

const prim = (id: string, extra: Record<string, unknown> = {}) => ({ id, fuente: { tipo: "primitiva", forma: "caja" }, pos: [0, 1, -2], ...extra });
const MUNDO = {
  version: 1, tipo: "mundo-xr", nombre: "Sala de ensayo", modo: "vr",
  entorno: { cielo: "noche", terreno: "plano" }, fisica: { gravedad: -1.6 }, maxJugadores: 6,
  spawns: [{ id: "entrada", pos: [0, 0, 0] }],
  luces: [{ id: "sol", clase: "direccional" }],
  objetos: [prim("caja1", { cuerpo: { tipo: "dinamico", agarrable: true } }), prim("cartel", { fuente: { tipo: "texto", contenido: "Bienvenida" } })],
  zonas: [{ id: "escenario", forma: "caja", pos: [0, 0, -5], tam: [4, 2, 4], efecto: "escenario" }],
  pizarras: [{ id: "pizarra1", pos: [3, 1.5, -2] }],
  reglas: [{ id: "r1", cuando: { tipo: "al-entrar", zona: "escenario" }, entonces: [{ tipo: "mostrar", objeto: "cartel" }, { tipo: "cielo", cielo: "amanecer" }] }],
};

describe("validarMundo", () => {
  it("acepta un mundo válido y lo normaliza con valores por defecto", () => {
    const r = validarMundo(MUNDO);
    expect(r.ok).toBe(true);
    expect(r.mundo?.entorno.cielo).toBe("noche");
    expect(r.mundo?.fisica.gravedad).toBe(-1.6);
    expect(r.mundo?.objetos[0].cuerpo?.tipo).toBe("dinamico");
    expect(r.mundo?.reglas).toHaveLength(1);
    expect(r.costo?.objetos).toBe(2);
  });
  it("rechaza lo que no es un mundo y explica cómo arreglarlo", () => {
    const r = validarMundo({ tipo: "otra-cosa" });
    expect(r.ok).toBe(false);
    expect(r.problemas[0].arreglo).toMatch(/mundo-xr/);
    expect(validarMundo(null).ok).toBe(false);
    expect(validarMundo("hola").ok).toBe(false);
  });
  it("nunca lanza, aunque venga basura", () => {
    for (const basura of [undefined, 3, [], { tipo: "mundo-xr", objetos: "x", reglas: 7, spawns: [null, 3] }]) {
      expect(() => validarMundo(basura)).not.toThrow();
    }
  });
  it("sin spawns añade uno y avisa (no es un error)", () => {
    const r = validarMundo({ ...MUNDO, spawns: [] });
    expect(r.ok).toBe(true);
    expect(r.mundo?.spawns).toHaveLength(1);
    expect(r.problemas.some((p) => p.gravedad === "aviso" && p.ruta === "spawns")).toBe(true);
  });
  it("una referencia rota en una regla es error y la regla se descarta", () => {
    const r = validarMundo({ ...MUNDO, reglas: [{ id: "mala", cuando: { tipo: "al-tocar", objeto: "no-existe" }, entonces: [{ tipo: "ocultar", objeto: "cartel" }] }] });
    expect(r.ok).toBe(false);
    expect(r.mundo?.reglas).toHaveLength(0);
  });
  it("un id repetido o inválido se descarta", () => {
    const r = validarMundo({ ...MUNDO, objetos: [prim("a"), prim("a"), prim("con espacios raros!!")] });
    expect(r.mundo?.objetos).toHaveLength(1);
    expect(r.ok).toBe(false);
  });
  it("no deja entrar código: ni scripts, ni html, ni urls que no sean https, ni ids de fuera de la Biblioteca", () => {
    const sucio = {
      ...MUNDO,
      objetos: [prim("x", { nombre: "<script>alert(1)</script>" }), prim("y", { fuente: { tipo: "biblioteca", id: "../../etc/passwd", formato: "glb" } }), prim("z", { fuente: { tipo: "script", codigo: "alert(1)" } })],
      pantallas: [{ id: "p1", fuente: { tipo: "https", url: "javascript:alert(1)" } }, { id: "p2", fuente: { tipo: "https", url: "http://inseguro.example" } }, { id: "p3", fuente: { tipo: "app", ruta: "//evil.example" } }],
    };
    const r = validarMundo(sucio);
    expect(r.mundo?.pantallas).toHaveLength(0);
    expect(r.mundo?.objetos.map((o) => o.id)).toEqual(["x"]);
    expect(r.mundo?.objetos[0].nombre).not.toMatch(/<script/i);
  });
  it("acepta una pantalla https y una ruta interna", () => {
    const r = validarMundo({ ...MUNDO, pantallas: [{ id: "tele", fuente: { tipo: "https", url: "https://starseed.example/directo" } }, { id: "app", fuente: { tipo: "app", ruta: "/estaciones" } }, { id: "ll", fuente: { tipo: "llamada" } }] });
    expect(r.mundo?.pantallas).toHaveLength(3);
  });
  it("acota números fuera de rango en vez de aceptarlos", () => {
    const r = validarMundo({ ...MUNDO, fisica: { gravedad: 500 }, maxJugadores: 9999, objetos: [prim("a", { esc: [0, 1e9, 1], pos: [1e12, 0, 0] })] });
    expect(r.mundo?.fisica.gravedad).toBeLessThanOrEqual(0);
    expect(r.mundo?.maxJugadores).toBeLessThanOrEqual(64);
    expect(r.mundo?.objetos[0].pos[0]).toBeLessThanOrEqual(500);
    expect(r.mundo?.objetos[0].esc[1]).toBeLessThanOrEqual(100);
  });
  it("limita el número de reglas", () => {
    const reglas = Array.from({ length: MAX_REGLAS + 20 }, (_, i) => ({ id: `r${i}`, cuando: { tipo: "al-llegar-persona" }, entonces: [{ tipo: "mensaje", texto: "hola" }] }));
    expect(validarMundo({ ...MUNDO, reglas }).mundo!.reglas.length).toBeLessThanOrEqual(MAX_REGLAS);
  });
  it("un portal a un punto que no existe es error", () => {
    const r = validarMundo({ ...MUNDO, portales: [{ id: "p", destino: { tipo: "punto", spawn: "fantasma" } }, { id: "q", destino: { tipo: "estacion", id: "cumbre" } }] });
    expect(r.ok).toBe(false);
    expect(r.mundo?.portales.map((p) => p.id)).toEqual(["q"]);
  });
  it("con nivel, marca como error lo que no cabe y dice cómo arreglarlo", () => {
    const muchos = Array.from({ length: LIMITES.minima.objetos + 5 }, (_, i) => prim(`o${i}`));
    const r = validarMundo({ ...MUNDO, objetos: muchos, reglas: [] }, "minima");
    expect(r.ok).toBe(false);
    expect(r.problemas.find((p) => p.ruta === "objetos")?.arreglo).toMatch(/nivel/);
    expect(validarMundo({ ...MUNDO, objetos: muchos, reglas: [] }, "alta").ok).toBe(true);
  });
});

describe("costoMundo y adaptarANivel", () => {
  it("el nivel mínimo es el menor al que cabe el mundo", () => {
    expect(costoMundo(validarMundo(MUNDO).mundo!).nivelMinimo).toBe("baja"); // 6 jugadores no caben en «minima» (4)
    expect(costoMundo(validarMundo({ ...MUNDO, maxJugadores: 4 }).mundo!).nivelMinimo).toBe("minima");
    const grande = validarMundo({ ...MUNDO, objetos: Array.from({ length: 150 }, (_, i) => prim(`o${i}`)) }).mundo!;
    expect(costoMundo(grande).nivelMinimo).toBe("media");
  });
  it("adaptar poda lo decorativo primero, conserva lo que usan las reglas y lo cuenta", () => {
    const objetos = [...Array.from({ length: 60 }, (_, i) => prim(`d${i}`, { prioridad: 0 })), prim("cartel", { prioridad: 0 })];
    const m = validarMundo({ ...MUNDO, objetos }).mundo!;
    const { mundo, recortes } = adaptarANivel(m, "minima");
    expect(mundo.objetos).toHaveLength(LIMITES.minima.objetos);
    expect(mundo.objetos.some((o) => o.id === "cartel")).toBe(true);
    expect(recortes.join(" ")).toMatch(/objetos decorativos/);
    expect(validarMundo(mundo, "minima").ok).toBe(true);
  });
  it("adaptar quita las reglas que apuntaban a lo recortado y avisa", () => {
    const objetos = Array.from({ length: 50 }, (_, i) => prim(`d${i}`, { prioridad: 0 }));
    const m = validarMundo({ ...MUNDO, objetos: [...objetos, prim("cartel", { prioridad: 0 })], reglas: [{ id: "x", cuando: { tipo: "al-tocar", objeto: "d49" }, entonces: [{ tipo: "ocultar", objeto: "d48" }] }] }).mundo!;
    const { mundo, recortes } = adaptarANivel(m, "minima");
    expect(mundo.reglas.every((r) => JSON.stringify(r).includes("d49") === false || mundo.objetos.some((o) => o.id === "d49"))).toBe(true);
    expect(recortes.length).toBeGreaterThan(0);
  });
  it("adaptar pasa los cuerpos dinámicos sobrantes a fijos y baja el máximo de jugadores", () => {
    const objetos = Array.from({ length: 30 }, (_, i) => prim(`c${i}`, { cuerpo: { tipo: "dinamico" } }));
    const m = validarMundo({ ...MUNDO, objetos, maxJugadores: 30 }).mundo!;
    const { mundo, recortes } = adaptarANivel(m, "minima");
    expect(mundo.objetos.filter((o) => o.cuerpo?.tipo === "dinamico")).toHaveLength(LIMITES.minima.cuerpos);
    expect(mundo.maxJugadores).toBe(LIMITES.minima.jugadores);
    expect(recortes.join(" ")).toMatch(/cuerpos físicos/);
  });
  it("adaptar un mundo que ya cabe no cambia nada", () => {
    const m = validarMundo(MUNDO).mundo!;
    const r = adaptarANivel(m, "maxima");
    expect(r.recortes).toHaveLength(0);
    expect(r.mundo.objetos).toHaveLength(m.objetos.length);
  });
});
