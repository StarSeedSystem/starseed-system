import { describe, it, expect } from "vitest";
import { crearCanal, type Sobre } from "../eventos-contexto";

type Receptor = { nodoId: string; subidaKbps?: number };

function montar(receptores: Receptor[] = []) {
  let ahora = 1000;
  const enviados: Sobre[] = [];
  const canal = crearCanal({ nodoId: "n1", enviar: (s) => enviados.push(s), ahora: () => ahora, receptores });
  return { canal, enviados, avanzar: (ms: number) => { ahora += ms; } };
}

function sobre(nodoId: string, secuencia: number, t: number): Sobre {
  return {
    tipo: "evento",
    de: nodoId,
    evento: { id: `${nodoId}:${secuencia}:${t}`, tipo: "dominio", cuerpo: { secuencia }, t, secuencia, nodoId },
  };
}

describe("canal de eventos del contexto", () => {
  it("emite, recibe y avanza el reloj lógico aunque la hora física no cambie", () => {
    const { canal } = montar();
    const a = canal.emitir("alerta", { x: 1 });
    const b = canal.emitir("alerta", { x: 2 });
    expect(b.t).toBeGreaterThan(a.t);
    expect(canal.recibir()?.cuerpo).toEqual({ x: 1 });
    expect(canal.recibir()?.id).toBe(b.id);
    expect(canal.recibir()).toBeNull();
  });

  it("descarta duplicados por id", () => {
    const { canal } = montar();
    const s = sobre("n2", 1, 1005);
    expect(canal.recibir(s)?.id).toBe(s.evento.id);
    expect(canal.recibir(s)).toBeNull();
    expect(canal.recibir()).toBeNull();
  });

  it("guarda el desorden y entrega en orden causal", () => {
    const { canal } = montar();
    const vistos: number[] = [];
    canal.suscribir((e) => vistos.push(e.secuencia));
    const s2 = sobre("n2", 2, 1010);
    const s1 = sobre("n2", 1, 1009);
    expect(canal.recibir(s2)).toBeNull();
    expect(canal.recibir(s1)?.secuencia).toBe(1);
    expect(canal.recibir()?.secuencia).toBe(2);
    expect(vistos).toEqual([1, 2]);
  });

  it("salta un hueco perdido tras la espera corta", () => {
    const { canal, avanzar } = montar();
    expect(canal.recibir(sobre("n2", 2, 1010))).toBeNull();
    avanzar(300);
    expect(canal.recibir()?.secuencia).toBe(2);
  });

  it("acusa lo recibido de otro nodo y no responde a un acuse", () => {
    const { canal, enviados } = montar();
    const s = sobre("n2", 1, 1000);
    canal.recibir(s);
    const acuse = enviados.find((x) => x.tipo === "acuse");
    expect(acuse).toMatchObject({ de: "n1", para: "n2", evento: { id: s.evento.id } });
    const antes = enviados.length;
    canal.recibir({ tipo: "acuse", de: "n2", para: "n1", evento: s.evento });
    expect(enviados.length).toBe(antes);
  });

  it("reintenta con espera creciente hasta que llega el acuse", () => {
    const { canal, enviados, avanzar } = montar();
    const ev = canal.emitir("x", {});
    const enviadosDe = () => enviados.filter((s) => s.tipo === "evento" && s.evento.id === ev.id).length;
    expect(enviadosDe()).toBe(1);
    avanzar(400);
    canal.recibir();
    expect(enviadosDe()).toBe(2);
    avanzar(400);
    canal.recibir();
    expect(enviadosDe()).toBe(2);
    avanzar(400);
    canal.recibir();
    expect(enviadosDe()).toBe(3);
    canal.recibir({ tipo: "acuse", de: "n2", para: "n1", evento: ev });
    expect(canal.pendientes()).toBe(0);
    avanzar(10_000);
    canal.recibir();
    expect(enviadosDe()).toBe(3);
  });

  it("con más de 8 receptores reparte por el árbol de relevo", () => {
    const receptores: Receptor[] = Array.from({ length: 10 }, (_, i) => ({ nodoId: `r${i}` }));
    const { canal, enviados } = montar(receptores);
    const hijos = canal.repartir(receptores).nodos.get("n1")?.hijos ?? [];
    expect(hijos).toHaveLength(1);
    canal.emitir("x", {});
    const eventos = enviados.filter((s) => s.tipo === "evento");
    expect(eventos).toHaveLength(1);
    expect(eventos[0].para).toBe(hijos[0]);
  });

  it("con 8 receptores o menos difunde a cada uno", () => {
    const receptores: Receptor[] = Array.from({ length: 8 }, (_, i) => ({ nodoId: `r${i}` }));
    const { canal, enviados } = montar(receptores);
    canal.emitir("x", {});
    expect(enviados.filter((s) => s.tipo === "evento").map((s) => s.para)).toEqual(
      receptores.map((r) => r.nodoId),
    );
  });
});
