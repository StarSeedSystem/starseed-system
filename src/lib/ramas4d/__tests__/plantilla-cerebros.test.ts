import { describe, it, expect } from "vitest";
import {
  construirGrafoCerebros,
  destinoApertura,
  enfriarRecuerdos,
  grafoVisibleCerebros,
  padresCerebros,
  type EntradaRecuerdo,
  type VinculoRecuerdo,
} from "../plantillas/cerebros";

const entradas: EntradaRecuerdo[] = [
  { id: "cerebro:1", titulo: "Mi cerebro", tipo: "cerebro", ref: "/cerebro", alcance: "privado", dueno: "ana" },
  { id: "carpeta:soul", titulo: "Alma", tipo: "carpeta", ref: "/cerebro/mapa?soul", alcance: "privado", dueno: "ana" },
  { id: "mem:1", titulo: "Recuerdo de hoy", tipo: "memoria", ref: "/memorias?recuerdo=1", alcance: "privado", dueno: "ana", carpetaPadre: "carpeta:soul" },
];

describe("construirGrafoCerebros", () => {
  it("ordena cerebros, carpetas y recuerdos con aristas de pertenencia", () => {
    const grafo = construirGrafoCerebros(entradas, [], 1000);
    expect(grafo.nodos.size).toBe(3);
    expect(grafo.nodos.get("mem:1")?.tipo).toBe("memoria");
    expect(grafo.nodos.get("mem:1")?.t_actividad).toBe(1000);
    expect(grafo.aristas).toHaveLength(2);
    expect(grafo.aristas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ de: "cerebro:1", a: "carpeta:soul", tipo: "contiene" }),
        expect.objectContaining({ de: "carpeta:soul", a: "mem:1", tipo: "contiene" }),
      ]),
    );
    expect(grafo.ramas.get("cerebro:1")).toEqual(["carpeta:soul"]);
  });

  it("añade fusiones y telepatía solo entre recuerdos existentes", () => {
    const vinculos: VinculoRecuerdo[] = [
      { de: "mem:1", a: "mem:2", tipo: "fusiona", t: 1500 },
      { de: "mem:1", a: "inexistente", tipo: "telepatia", t: 1500 },
    ];
    const grafo = construirGrafoCerebros(entradas, vinculos, 1000);
    expect(grafo.aristas.some((a) => a.tipo === "fusiona")).toBe(false);
  });
});

describe("enfriarRecuerdos", () => {
  it("enfría sin borrar y nunca apaga del todo el brillo", () => {
    const grafo = construirGrafoCerebros(entradas, [], 1000);
    const enfriado = enfriarRecuerdos(grafo, 1000 + 8 * 24 * 60 * 60 * 1000);
    expect(enfriado.nodos.size).toBe(grafo.nodos.size);
    const peso = enfriado.nodos.get("mem:1")?.peso ?? 0;
    expect(peso).toBeLessThan(1);
    expect(peso).toBeGreaterThanOrEqual(0.05);
  });
});

describe("grafoVisibleCerebros", () => {
  it("no muestra lo privado ajeno ni sus aristas", () => {
    const ajena: EntradaRecuerdo = {
      id: "mem:ajena",
      titulo: "Secreto de otra persona",
      tipo: "memoria",
      ref: "/memorias?recuerdo=ajena",
      alcance: "privado",
      dueno: "otra",
    };
    const grafo = construirGrafoCerebros([...entradas, ajena], [], 1000);
    const visible = grafoVisibleCerebros(grafo, { id: "ana" });
    expect(visible.nodos.has("mem:ajena")).toBe(false);
    expect(visible.nodos.has("mem:1")).toBe(true);
    expect(visible.aristas.every((a) => a.de !== "mem:ajena" && a.a !== "mem:ajena")).toBe(true);
  });
});

describe("destinoApertura", () => {
  it("abre cada recuerdo en la app que le corresponde", () => {
    const nodo = construirGrafoCerebros(entradas, [], 1000).nodos.get("mem:1")!;
    expect(destinoApertura(nodo)).toBe("/memorias?recuerdo=1");
    expect(destinoApertura({ ...nodo, ref: "mem-1" })).toContain("/memorias");
    expect(destinoApertura({ ...nodo, ref: "//externo" })).toContain("/memorias");
  });
});

describe("padresCerebros", () => {
  it("devuelve índices de padre para la disposición radial", () => {
    const grafo = construirGrafoCerebros(entradas, [], 1000);
    expect(padresCerebros(grafo, ["cerebro:1", "carpeta:soul", "mem:1"])).toEqual([-1, 0, 1]);
  });
});
