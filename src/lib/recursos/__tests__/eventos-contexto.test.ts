import { describe, it, expect } from "vitest";
import { avanzarReloj, compararMarcas, crearCanal, destinosRelevo, fundirReloj, type MarcaEvento, type SobreEvento } from "../eventos-contexto";
import { armarArbol } from "../arbol-relevo";

function relojFalso(inicio = 1000) {
  let t = inicio, n = 0;
  const cola: { at: number; id: number; fn: () => void }[] = [];
  const cancelar = (h: unknown) => { const i = cola.findIndex((x) => x.id === h); if (i >= 0) cola.splice(i, 1); };
  const programar = (fn: () => void, ms: number) => { const id = ++n; cola.push({ at: t + ms, id, fn }); return id; };
  const avanzar = (ms: number) => {
    const fin = t + ms;
    for (;;) {
      cola.sort((a, b) => a.at - b.at || a.id - b.id);
      const x = cola[0];
      if (!x || x.at > fin) break;
      cola.shift(); t = x.at; x.fn();
    }
    t = fin;
  };
  return { ahora: () => t, programar, cancelar, avanzar };
}

function redFalsa() {
  const envios: { destino: string; sobre: SobreEvento }[] = [];
  return { envios, enviar: (destino: string, sobre: SobreEvento) => { envios.push({ destino, sobre }); } };
}

const marca = (fisico: number, contador = 0, nodoId = "a"): MarcaEvento => ({ fisico, contador, nodoId });
const sobre = (id: string, m: MarcaEvento, causal: string[] = []): SobreEvento => ({ id, de: m.nodoId, tipo: "prueba", marca: m, causal });

describe("reloj híbrido", () => {
  it("ordena por físico, contador y nodo", () => {
    expect(compararMarcas(marca(1), marca(2))).toBeLessThan(0);
    expect(compararMarcas(marca(1, 2), marca(1, 3))).toBeLessThan(0);
    expect(compararMarcas(marca(1, 0, "a"), marca(1, 0, "b"))).toBeLessThan(0);
    expect(compararMarcas(marca(1), marca(1))).toBe(0);
  });
  it("avanza sin retroceder y reinicia el contador al cambiar el físico", () => {
    expect(avanzarReloj(marca(100, 2), 90, "a")).toEqual(marca(100, 3));
    expect(avanzarReloj(marca(100, 2), 150, "a")).toEqual(marca(150, 0));
  });
  it("al fundir toma el máximo y deja el contador por delante del remoto", () => {
    expect(fundirReloj(marca(100, 5), marca(100, 9), 90, "b")).toEqual(marca(100, 10, "b"));
    expect(fundirReloj(marca(100, 5), marca(200, 0), 90, "b")).toEqual(marca(200, 1, "b"));
    expect(fundirReloj(marca(100, 5), marca(50, 0), 300, "b")).toEqual(marca(300, 0, "b"));
  });
});

describe("destinos del relevo", () => {
  it("con 8 receptores manda a todos", () => {
    const receptores = Array.from({ length: 8 }, (_, i) => ({ nodoId: `n${i}` }));
    expect(destinosRelevo("origen", receptores).sort()).toEqual(receptores.map((r) => r.nodoId).sort());
  });
  it("con más de 8 usa solo los hijos del árbol del origen", () => {
    const receptores = Array.from({ length: 12 }, (_, i) => ({ nodoId: `n${i}`, subidaKbps: (12 - i) * 1000 }));
    const hijos = armarArbol("origen", receptores, 1000).nodos.get("origen")!.hijos;
    expect(destinosRelevo("origen", receptores, 1000)).toEqual(hijos);
    expect(hijos.length).toBeLessThan(12);
  });
});

function abrirCanal(nodoId = "a", extra: Partial<Parameters<typeof crearCanal>[0]> = {}) {
  const t = relojFalso(), red = redFalsa();
  const canal = crearCanal({ nodoId, ahora: t.ahora, enviar: red.enviar, programar: t.programar, cancelar: t.cancelar, ...extra });
  return { t, red, canal };
}

describe("canal del contexto", () => {
  it("emite con reloj creciente y difunde sin receptores", () => {
    const { red, canal } = abrirCanal();
    const uno = canal.emitir("hola", { n: 1 }), dos = canal.emitir("hola", { n: 2 });
    expect(dos.id).not.toBe(uno.id);
    expect(compararMarcas(dos.marca, uno.marca)).toBeGreaterThan(0);
    expect(red.envios.map((e) => e.destino)).toEqual(["*", "*"]);
  });
  it("entrega en orden causal tras el búfer aunque lleguen desordenados", () => {
    const { red, canal, t } = abrirCanal("b"), vistos: SobreEvento[] = [];
    canal.suscribir((s) => vistos.push(s));
    const e1 = sobre("e1", marca(100, 0, "a")), e2 = sobre("e2", marca(101, 0, "a"), ["e1"]);
    expect([canal.recibir(e2), canal.recibir(e1)]).toEqual([true, true]);
    expect(vistos).toHaveLength(0);
    t.avanzar(40);
    expect(vistos.map((s) => s.id)).toEqual(["e1", "e2"]);
    expect(red.envios).toHaveLength(2);
  });
  it("descarta duplicados por id y vuelve a acusar (acuse perdido)", () => {
    const { red, canal, t } = abrirCanal("b"), vistos: SobreEvento[] = [];
    canal.suscribir((s) => vistos.push(s));
    const e = sobre("e1", marca(100, 0, "a"));
    expect([canal.recibir(e), canal.recibir(e)]).toEqual([true, false]);
    t.avanzar(40);
    expect(vistos.map((s) => s.id)).toEqual(["e1"]);
    expect(red.envios.filter((x) => x.sobre.acuseDe === "e1")).toHaveLength(2);
  });
  it("un acuse corta los reintentos", () => {
    const { red, canal, t } = abrirCanal("a", { esperaReintentoMs: 100 });
    const e = canal.emitir("hola");
    const acuse: SobreEvento = { id: "acuse-1", de: "b", tipo: "acuse", marca: marca(1000, 0, "b"), causal: [e.id], acuseDe: e.id };
    expect(canal.recibir(acuse)).toBe(true);
    t.avanzar(10_000);
    expect(red.envios).toHaveLength(1);
  });
  it("sin acuse reintenta con espera creciente y se detiene en el tope", () => {
    const { red, canal, t } = abrirCanal("a", { esperaReintentoMs: 100, reintentosMax: 3 });
    canal.emitir("hola");
    [100, 200, 400, 800].forEach((ms) => t.avanzar(ms));
    expect(red.envios.map((x) => x.sobre.intento)).toEqual([0, 1, 2, 3]);
  });
  it("con más de 8 receptores reparte por el árbol en vez de difundir", () => {
    const receptores = Array.from({ length: 12 }, (_, i) => ({ nodoId: `n${i}`, subidaKbps: (12 - i) * 1000 }));
    const hijos = armarArbol("origen", receptores, 1000).nodos.get("origen")!.hijos;
    const { red, canal } = abrirCanal("origen", { receptores: () => receptores, kbpsFlujo: 1000 });
    canal.emitir("hola");
    expect(red.envios.length).toBeLessThan(12);
    expect(red.envios.some((x) => x.destino === "*")).toBe(false);
    expect(red.envios.map((x) => x.destino).sort()).toEqual([...hijos].sort());
  });
});
