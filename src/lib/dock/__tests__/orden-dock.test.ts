import { describe, it, expect } from "vitest";
import {
  aterrizaje,
  carpetaDe,
  claveEntrada,
  construirEntradas,
  desplazamientosDeHueco,
  devolverAlDock,
  meterEnCarpeta,
  objetivoDeSoltar,
  pasoDeHueco,
  posicionEnRaiz,
  quitarDelDock,
  reordenarEnCarpeta,
  reordenarRaiz,
  sacarDeCarpeta,
  ZONA_CARPETA,
  type CeldaMedida,
} from "../orden-dock";

const it_ = (id: string, enabled = true) => ({ id, enabled });
const car = (id: string, itemIds: string[], enabled = true) => ({ id, itemIds, enabled });
const ids = (xs: Array<{ id: string }>) => xs.map((x) => x.id);

describe("construirEntradas · lo que se pinta en el carril", () => {
  it("los sueltos van en el orden del array y los apagados no se pintan", () => {
    const e = construirEntradas([it_("a"), it_("b", false), it_("c")], []);
    expect(e.map(claveEntrada)).toEqual(["a", "c"]);
  });

  it("una carpeta se coloca donde está su primer icono encendido", () => {
    const items = [it_("a"), it_("b"), it_("c"), it_("d")];
    const e = construirEntradas(items, [car("f", ["c", "b"])]);
    expect(e.map(claveEntrada)).toEqual(["a", "carpeta:f", "d"]);
    const f = e[1];
    expect(f.tipo === "carpeta" && ids(f.hijos)).toEqual(["c", "b"]);
  });

  it("las carpetas sin ningún icono presente van al final; las apagadas no se pintan", () => {
    const e = construirEntradas([it_("a")], [car("vacia", []), car("off", ["a"], false)]);
    expect(e.map(claveEntrada)).toEqual(["a", "carpeta:vacia"]);
  });
});

describe("reordenarRaiz · mantener y arrastrar un icono suelto", () => {
  const items = [it_("a"), it_("b"), it_("c"), it_("d")];

  it("mover al principio, al medio y al final", () => {
    expect(ids(reordenarRaiz(items, [], "c", 0))).toEqual(["c", "a", "b", "d"]);
    expect(ids(reordenarRaiz(items, [], "a", 2))).toEqual(["b", "c", "a", "d"]);
    expect(ids(reordenarRaiz(items, [], "a", 3))).toEqual(["b", "c", "d", "a"]);
  });

  it("soltar en su sitio devuelve la MISMA referencia (no se escribe de más)", () => {
    expect(reordenarRaiz(items, [], "b", 1)).toBe(items);
    expect(reordenarRaiz(items, [], "zzz", 0)).toBe(items);
  });

  it("un destino fuera de rango se acota", () => {
    expect(ids(reordenarRaiz(items, [], "a", 99))).toEqual(["b", "c", "d", "a"]);
    expect(ids(reordenarRaiz(items, [], "d", -5))).toEqual(["d", "a", "b", "c"]);
  });

  it("respeta lo que se ve: los apagados no cuentan como posición", () => {
    const con = [it_("a"), it_("x", false), it_("b"), it_("c")];
    // Visible: a b c. Mover «a» a la posición 1 (entre b y c).
    expect(ids(reordenarRaiz(con, [], "a", 1))).toEqual(["x", "b", "a", "c"]);
  });

  it("con una carpeta en medio, el icono se coloca respecto a la carpeta", () => {
    const todos = [it_("a"), it_("b"), it_("c"), it_("d")];
    const carpetas = [car("f", ["b", "c"])]; // carril: a, [f], d
    expect(construirEntradas(todos, carpetas).map(claveEntrada)).toEqual(["a", "carpeta:f", "d"]);
    // «d» antes de la carpeta → carril: a, d, [f]
    const r = reordenarRaiz(todos, carpetas, "d", 1);
    expect(construirEntradas(r, carpetas).map(claveEntrada)).toEqual(["a", "d", "carpeta:f"]);
    // «a» detrás de la carpeta → carril: [f], a, d
    const r2 = reordenarRaiz(todos, carpetas, "a", 1);
    expect(construirEntradas(r2, carpetas).map(claveEntrada)).toEqual(["carpeta:f", "a", "d"]);
  });

  it("no pierde ni duplica iconos al reordenar", () => {
    const r = reordenarRaiz(items, [], "b", 3);
    expect(new Set(ids(r)).size).toBe(4);
    expect(r).toHaveLength(4);
  });

  it("posicionEnRaiz da la posición (1-based) y el total para anunciarla", () => {
    expect(posicionEnRaiz(items, [], "c")).toEqual({ posicion: 3, total: 4 });
    expect(posicionEnRaiz(items, [], "nope")).toBeNull();
  });
});

describe("reordenarEnCarpeta", () => {
  const items = [it_("a"), it_("b"), it_("c"), it_("oculto", false)];
  const carpetas = [car("f", ["a", "oculto", "b", "c"])];

  it("reordena los visibles y conserva la pertenencia de los ocultos", () => {
    const r = reordenarEnCarpeta(carpetas, items, "f", "c", 0);
    expect(r[0].itemIds).toEqual(["c", "a", "b", "oculto"]);
  });

  it("sin cambios devuelve la misma referencia", () => {
    expect(reordenarEnCarpeta(carpetas, items, "f", "a", 0)).toBe(carpetas);
    expect(reordenarEnCarpeta(carpetas, items, "f", "zzz", 0)).toBe(carpetas);
    expect(reordenarEnCarpeta(carpetas, items, "no-existe", "a", 0)).toBe(carpetas);
  });
});

describe("meter, sacar y quitar", () => {
  it("meter en una carpeta lo saca de cualquier otra (solo vive en una)", () => {
    const cs = [car("f", ["a"]), car("g", ["b"])];
    const r = meterEnCarpeta(cs, "g", "a");
    expect(r.find((c) => c.id === "f")!.itemIds).toEqual([]);
    expect(r.find((c) => c.id === "g")!.itemIds).toEqual(["b", "a"]);
    expect(carpetaDe(r, "a")?.id).toBe("g");
  });

  it("meter donde ya estaba o en una carpeta inexistente no cambia nada", () => {
    const cs = [car("f", ["a"])];
    expect(meterEnCarpeta(cs, "f", "a")).toBe(cs);
    expect(meterEnCarpeta(cs, "nope", "a")).toBe(cs);
  });

  it("sacar de la carpeta lo devuelve al carril raíz", () => {
    const cs = [car("f", ["a", "b"])];
    const r = sacarDeCarpeta(cs, "a");
    expect(r[0].itemIds).toEqual(["b"]);
    expect(sacarDeCarpeta(r, "a")).toBe(r);
  });

  it("quitar del dock apaga el icono (no lo borra) y deshacer lo devuelve a su sitio", () => {
    const items = [it_("a"), it_("b"), it_("c")];
    const q = quitarDelDock(items, "b");
    expect(q.map((x) => x.enabled)).toEqual([true, false, true]);
    expect(ids(q)).toEqual(["a", "b", "c"]);
    const d = devolverAlDock(q, "b");
    expect(d.map((x) => x.enabled)).toEqual([true, true, true]);
    expect(ids(d)).toEqual(["a", "b", "c"]);
  });

  it("quitar un icono ya apagado o inexistente devuelve la misma referencia", () => {
    const items = [it_("a", false)];
    expect(quitarDelDock(items, "a")).toBe(items);
    expect(quitarDelDock(items, "zzz")).toBe(items);
    expect(devolverAlDock([it_("a")], "a")).toEqual([it_("a")]);
  });
});

describe("geometría del arrastre", () => {
  // Cuatro celdas de 60 px con 4 px de hueco: paso = 64.
  const celdas: CeldaMedida[] = [0, 1, 2, 3].map((i) => ({ clave: "abcd"[i], izq: i * 64, ancho: 60 }));

  it("el destino es el número de otras celdas cuyo centro queda a la izquierda del puntero", () => {
    expect(objetivoDeSoltar(celdas, 1, 10, false)).toEqual({ destino: 0, carpeta: null });
    expect(objetivoDeSoltar(celdas, 1, 100, false)).toEqual({ destino: 1, carpeta: null });
    expect(objetivoDeSoltar(celdas, 1, 300, false)).toEqual({ destino: 3, carpeta: null });
  });

  it("soltar sobre el centro de una carpeta la elige; en su borde, no", () => {
    const conCarpeta: CeldaMedida[] = [
      { clave: "a", izq: 0, ancho: 60 },
      { clave: "carpeta:f", izq: 64, ancho: 60, carpeta: "f" },
      { clave: "c", izq: 128, ancho: 60 },
    ];
    const centro = 64 + 30;
    expect(objetivoDeSoltar(conCarpeta, 0, centro, true)).toEqual({ destino: 0, carpeta: "f" });
    expect(objetivoDeSoltar(conCarpeta, 0, centro + 60 * ZONA_CARPETA + 1, true).carpeta).toBeNull();
    // En el carril interior de una carpeta no se puede meter en otra.
    expect(objetivoDeSoltar(conCarpeta, 0, centro, false).carpeta).toBeNull();
  });

  it("el hueco: al mover a la derecha ceden las intermedias hacia la izquierda, y al revés", () => {
    expect(desplazamientosDeHueco(4, 0, 2, 64)).toEqual([0, -64, -64, 0]);
    expect(desplazamientosDeHueco(4, 3, 1, 64)).toEqual([0, 64, 64, 0]);
    expect(desplazamientosDeHueco(4, 2, 2, 64)).toEqual([0, 0, 0, 0]);
  });

  it("paso del hueco y aterrizaje", () => {
    expect(pasoDeHueco(celdas, 1)).toBe(64);
    expect(pasoDeHueco(celdas, 3)).toBe(64); // la última mira a la anterior
    expect(pasoDeHueco([{ clave: "a", izq: 0, ancho: 60 }], 0)).toBe(60);
    expect(aterrizaje(celdas, 0, 2)).toBe(128); // tres celdas iguales: la derecha de la 3.ª menos la de la 1.ª
    expect(aterrizaje(celdas, 3, 1)).toBe(-128);
    expect(aterrizaje(celdas, 2, 2)).toBe(0);
  });
});
