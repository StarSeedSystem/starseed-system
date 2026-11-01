import { describe, it, expect } from "vitest";
import {
  crearCanal,
  ticDeHlc,
  integrarHlc,
  reparto,
  TOPE_DIRECTO,
  type EventoContexto,
  type MensajeCanal,
} from "../eventos-contexto";

let tiempo = 1000;

const canal = (nodoId: string) => {
  const suelta: MensajeCanal[] = [];
  return {
    suelta,
    c: crearCanal({ nodoId, enviar: (m) => suelta.push(m), ahora: () => tiempo }),
  };
};

type CanalPrueba = ReturnType<typeof canal>;

/** Vacía los mensajes pendientes de un canal y los hace llegar a otro. */
const entrega = (de: CanalPrueba, a: CanalPrueba) => {
  for (const m of de.suelta.splice(0, de.suelta.length)) a.c.recibir(m);
};

describe("eventos-contexto", () => {
  it("el reloj híbrido sube el lógico en el mismo milisegundo y el físico al avanzar la hora", () => {
    expect(ticDeHlc({ fisico: 100, logico: 3 }, 100)).toEqual({ fisico: 100, logico: 4 });
    expect(ticDeHlc({ fisico: 100, logico: 3 }, 101)).toEqual({ fisico: 101, logico: 0 });
    // Al adoptar un reloj ajeno gana el mayor de los tres instantes, con empate lógico.
    expect(integrarHlc({ fisico: 100, logico: 1 }, { fisico: 105, logico: 2 }, 101)).toEqual({
      fisico: 105,
      logico: 3,
    });
    expect(integrarHlc({ fisico: 106, logico: 0 }, { fisico: 105, logico: 2 }, 106)).toEqual({
      fisico: 106,
      logico: 1,
    });
  });

  it("descarta duplicados por id y mantiene el orden causal pese al desorden", () => {
    tiempo = 1000;
    const n1 = canal("n1");
    const n2 = canal("n2");
    const marca = canal("marca");
    const a = n1.c.emitir("a", "primero");
    entrega(n1, n2); // n2 ya vio «a», así su «b» causará sobre él
    const b = n2.c.emitir("b", "segundo");
    // Llega primero el sucesor: queda en el búfer hasta tener a su antecesor.
    marca.c.recibir({ clase: "evento", evento: b });
    expect(marca.c.estado().entregados).toHaveLength(0);
    marca.c.recibir({ clase: "evento", evento: a });
    expect(marca.c.estado().entregados.map((e) => e.tipo)).toEqual(["a", "b"]); // orden por reloj híbrido
    // El duplicado (mismo id) no se entrega otra vez.
    marca.c.recibir({ clase: "evento", evento: a });
    expect(marca.c.estado().entregados).toHaveLength(2);
  });

  it("el hueco causal se entrega igualmente al vencer el búfer corto", () => {
    tiempo = 1000;
    const marca = canal("marca");
    const tarde: EventoContexto = {
      id: "n9:1", tipo: "tarde", cuerpo: null, origen: "n9", seq: 1,
      reloj: { fisico: 1000, logico: 5 }, causal: { n9: 0, n1: 3 },
    };
    marca.c.recibir({ clase: "evento", evento: tarde });
    expect(marca.c.estado().entregados).toHaveLength(0);
    marca.c.paso(); // t = 1000: la espera corta (250 ms) aún no vence
    expect(marca.c.estado().entregados).toHaveLength(0);
    tiempo = 1300;
    marca.c.paso(); // el antecesor no llega: se entrega aunque falte en el orden causal
    expect(marca.c.estado().entregados.map((e) => e.id)).toEqual(["n9:1"]);
  });

  it("acusa en cuanto recibe y reintenta con espera creciente si no llega el acuse", () => {
    tiempo = 1000;
    const emisor = canal("e");
    const receptor = canal("r");
    const m = emisor.c.emitir("m", "hola");
    // Lo entrega en local y queda esperando el acuse.
    expect(emisor.c.estado().entregados.map((e) => e.id)).toEqual(["e:1"]);
    expect(emisor.c.estado().sinAcuse.map((p) => p.evento.id)).toEqual(["e:1"]);
    receptor.c.recibir({ clase: "evento", evento: m });
    expect(receptor.suelta[0]).toEqual({ clase: "acuse", de: "r", para: "e", id: "e:1" });
    emisor.c.recibir(receptor.suelta[0]);
    expect(emisor.c.estado().sinAcuse).toEqual([]); // acuse casado y borrado
    // Sin acuse nunca: reintentos de 150, 300, 600 y 1200 ms, luego se da por vencido.
    tiempo = 1000;
    const solo = canal("solo");
    solo.c.emitir("x", 1);
    solo.c.paso(); // aún dentro de la primera espera
    expect(solo.suelta).toHaveLength(1);
    tiempo = 1200; solo.c.paso();
    expect(solo.suelta).toHaveLength(2);
    tiempo = 1600; solo.c.paso();
    expect(solo.suelta).toHaveLength(3);
    tiempo = 2400; solo.c.paso();
    expect(solo.suelta).toHaveLength(4);
    tiempo = 3600; solo.c.paso();
    expect(solo.suelta).toHaveLength(5);
    tiempo = 5600; solo.c.paso(); // quinto y último reintento (tope de espera de 2 s)
    expect(solo.suelta).toHaveLength(6);
    tiempo = 7600; solo.c.paso(); // agotados los reintentos: se suelta de los pendientes
    expect(solo.suelta).toHaveLength(6);
    expect(solo.c.estado().sinAcuse).toEqual([]);
  });

  it("reparte directo hasta 8 receptores y por el árbol de relevo desde 9", () => {
    tiempo = 1000;
    const ocho = Array.from({ length: TOPE_DIRECTO }, (_, i) => ({ nodoId: `n${i}` }));
    expect(reparto("origen", ocho)).toEqual({
      modo: "directo",
      destinos: ["n0", "n1", "n2", "n3", "n4", "n5", "n6", "n7"],
    });
    const resultado = reparto("origen", [...ocho, { nodoId: "n8", subidaKbps: 3000 }], 1000);
    if (resultado.modo !== "arbol") throw new Error("con 9 receptores toca árbol de relevo");
    expect(resultado.arbol.origen).toBe("origen");
    // Con la subida medida, el árbol lo pone en el centro del reparto.
    expect(resultado.arbol.nodos.has("n8")).toBe(true);
    expect(resultado.arbol.nodos.get("origen")?.hijos).toContain("n8");
  });
});
