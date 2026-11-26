import { describe, it, expect } from "vitest";
import {
  fusionarEstados,
  prioridadDeElemento,
  resumirDivergencia,
  excedeLimite,
  EstadoSala,
  ElementoSala,
  LIMITE_ELEMENTOS,
} from "../sincronia-sala";

interface ClienteSim {
  deviceId: string;
  estado: EstadoSala;
}

function crearCliente(deviceId: string, elementos: ElementoSala[] = [], reloj = 0): ClienteSim {
  return {
    deviceId,
    estado: {
      salaId: "sala-coop-qa-1",
      elementos: Object.fromEntries(elementos.map(e => [e.id, e])),
      reloj,
    },
  };
}

function recibir(cliente: ClienteSim, remoto: EstadoSala): { conflictos: string[] } {
  const { resultado, conflictos } = fusionarEstados(cliente.estado, remoto, cliente.deviceId);
  cliente.estado = resultado;
  return { conflictos };
}

function estadoIgual(a: EstadoSala, b: EstadoSala): boolean {
  const idsA = Object.keys(a.elementos).sort();
  const idsB = Object.keys(b.elementos).sort();
  if (idsA.join(",") !== idsB.join(",")) return false;
  for (const id of idsA) {
    const ea = a.elementos[id];
    const eb = b.elementos[id];
    if (ea.actualizadoEn !== eb.actualizadoEn) return false;
    if (ea.porDispositivo !== eb.porDispositivo) return false;
    if (ea.borrado !== eb.borrado) return false;
    if (JSON.stringify(ea.datos) !== JSON.stringify(eb.datos)) return false;
    if (ea.tipo !== eb.tipo) return false;
  }
  return a.reloj === b.reloj && a.salaId === b.salaId;
}

const baseWidget: ElementoSala = {
  id: "widget-1",
  tipo: "posicion",
  datos: { x: 100, y: 100 },
  actualizadoEn: 1000,
  porDispositivo: "host",
};

describe("coop-qa · sincronia-sala · fusión determinista (host + 2 clientes)", () => {
  it("tres dispositivos editan el mismo widget → mismo resultado en todos (determinismo)", () => {
    const host = crearCliente("host", [baseWidget]);
    const clienteA = crearCliente("cliente-A", [{
      ...baseWidget,
      actualizadoEn: 2000,
      porDispositivo: "cliente-A",
      datos: { x: 150, y: 100 },
    }]);
    const clienteB = crearCliente("cliente-B", [{
      ...baseWidget,
      actualizadoEn: 3000,
      porDispositivo: "cliente-B",
      datos: { x: 200, y: 100 },
    }]);

    const estados = [host.estado, clienteA.estado, clienteB.estado];
    for (const c of [host, clienteA, clienteB]) {
      for (const remoto of estados) {
        if (remoto !== c.estado) recibir(c, remoto);
      }
    }

    expect(estadoIgual(host.estado, clienteA.estado)).toBe(true);
    expect(estadoIgual(clienteA.estado, clienteB.estado)).toBe(true);
    expect(host.estado.elementos["widget-1"].porDispositivo).toBe("cliente-B");
    expect(host.estado.elementos["widget-1"].actualizadoEn).toBe(3000);
    expect(host.estado.elementos["widget-1"].datos).toEqual({ x: 200, y: 100 });
  });

  it("orden de fusión distinto → mismo resultado (conmutatividad)", () => {
    const makeClients = () => ({
      host: crearCliente("host", [baseWidget]),
      clienteA: crearCliente("cliente-A", [{
        ...baseWidget,
        actualizadoEn: 2000,
        porDispositivo: "cliente-A",
        datos: { x: 150, y: 100 },
      }]),
      clienteC: crearCliente("cliente-C", [{
        ...baseWidget,
        actualizadoEn: 2500,
        porDispositivo: "cliente-C",
        datos: { x: 175, y: 100 },
      }]),
    });

    const { host: h1, clienteA: a1, clienteC: c1 } = makeClients();
    for (const client of [h1, a1, c1]) {
      for (const remoto of [h1.estado, a1.estado, c1.estado]) {
        if (remoto !== client.estado) recibir(client, remoto);
      }
    }

    const { host: h2, clienteA: a2, clienteC: c2 } = makeClients();
    for (const client of [c2, h2, a2]) {
      for (const remoto of [h2.estado, a2.estado, c2.estado]) {
        if (remoto !== client.estado) recibir(client, remoto);
      }
    }

    expect(estadoIgual(h1.estado, h2.estado)).toBe(true);
  });

  it("anti-eco: cambios propios que vuelven no se aplican", () => {
    const host = crearCliente("host", [baseWidget]);
    const clienteA = crearCliente("cliente-A", [{
      ...baseWidget,
      actualizadoEn: 2000,
      porDispositivo: "cliente-A",
      datos: { x: 150, y: 100 },
    }]);

    recibir(host, clienteA.estado);
    const antes = host.estado.elementos["widget-1"];
    recibir(host, host.estado);
    const despues = host.estado.elementos["widget-1"];

    expect(despues).toEqual(antes);
  });

  it("lápidas persisten y no resucitan sin edición nueva", () => {
    const host = crearCliente("host", [baseWidget]);
    const clienteA = crearCliente("cliente-A", [{
      ...baseWidget,
      id: "widget-1",
      borrado: true,
      actualizadoEn: 2000,
      porDispositivo: "cliente-A",
    }]);

    recibir(host, clienteA.estado);
    recibir(clienteA, host.estado);

    expect(host.estado.elementos["widget-1"].borrado).toBe(true);
    expect(clienteA.estado.elementos["widget-1"].borrado).toBe(true);
    expect(estadoIgual(host.estado, clienteA.estado)).toBe(true);
  });

  it("lápida de contenido tiene prioridad P1 (no P0)", () => {
    const lapida: ElementoSala = { ...baseWidget, borrado: true, actualizadoEn: 2000 };
    expect(prioridadDeElemento(lapida)).toBe(1);
  });

  it("elementos efímeros (cursor, presencia) son P0", () => {
    expect(prioridadDeElemento({ ...baseWidget, id: "c1", tipo: "cursor", actualizadoEn: 1000, porDispositivo: "a" })).toBe(0);
    expect(prioridadDeElemento({ ...baseWidget, id: "p1", tipo: "presencia", actualizadoEn: 1000, porDispositivo: "a" })).toBe(0);
    expect(prioridadDeElemento({ ...baseWidget, id: "s1", tipo: "seleccion", actualizadoEn: 1000, porDispositivo: "a" })).toBe(0);
  });

  it("elementos masivos son P3", () => {
    expect(prioridadDeElemento({ ...baseWidget, id: "m1", tipo: "historial", actualizadoEn: 1000, porDispositivo: "a" })).toBe(3);
    expect(prioridadDeElemento({ ...baseWidget, id: "m2", tipo: "modelo3d", actualizadoEn: 1000, porDispositivo: "a" })).toBe(3);
  });

  it("desempate por dispositivo: alfabético menor gana si mismo timestamp (vía fusionarEstados)", () => {
    const host = crearCliente("host", [{
      ...baseWidget,
      id: "widget-x",
      actualizadoEn: 1000,
      porDispositivo: "aaa",
    }]);
    const clienteA = crearCliente("cliente-A", [{
      ...baseWidget,
      id: "widget-x",
      actualizadoEn: 1000,
      porDispositivo: "bbb",
      datos: { x: 999 },
    }]);

    recibir(host, clienteA.estado);
    recibir(clienteA, host.estado);

    expect(host.estado.elementos["widget-x"].porDispositivo).toBe("aaa");
    expect(clienteA.estado.elementos["widget-x"].porDispositivo).toBe("aaa");
  });

  it("límite de elementos: conflicto 'limite-excedido' si se pasa de 5000 vivos", () => {
    const host = crearCliente("host", [], 0);
    const elementos: ElementoSala[] = [];
    for (let i = 0; i < LIMITE_ELEMENTOS + 10; i++) {
      elementos.push({ id: `e${i}`, tipo: "posicion", datos: {}, actualizadoEn: 1000 + i, porDispositivo: "host" });
    }
    host.estado.elementos = Object.fromEntries(elementos.map(e => [e.id, e]));

    const clienteA = crearCliente("cliente-A", [], 0);
    const { conflictos } = recibir(clienteA, host.estado);

    expect(conflictos).toContain("limite-excedido");
  });
});

describe("coop-qa · sincronia-sala · monitores de invariantes", () => {
  it("invariante: reloj nunca retrocede tras fusión", () => {
    const host = crearCliente("host", [baseWidget], 100);
    const clienteA = crearCliente("cliente-A", [{
      ...baseWidget,
      actualizadoEn: 2000,
      porDispositivo: "cliente-A",
    }], 50);

    const relojAntesHost = host.estado.reloj;
    const relojAntesA = clienteA.estado.reloj;

    recibir(host, clienteA.estado);
    recibir(clienteA, host.estado);

    expect(host.estado.reloj).toBeGreaterThanOrEqual(relojAntesHost);
    expect(clienteA.estado.reloj).toBeGreaterThanOrEqual(relojAntesA);
  });

  it("invariante: misma salaId en todos los clientes tras fusión", () => {
    const host = crearCliente("host", [baseWidget]);
    const clienteA = crearCliente("cliente-A", [{
      ...baseWidget,
      actualizadoEn: 2000,
      porDispositivo: "cliente-A",
    }]);

    recibir(host, clienteA.estado);
    recibir(clienteA, host.estado);

    expect(host.estado.salaId).toBe("sala-coop-qa-1");
    expect(clienteA.estado.salaId).toBe("sala-coop-qa-1");
  });

  it("invariante: elementos efímeros no aparecen en resumirDivergencia", () => {
    const host = crearCliente("host", [
      baseWidget,
      { ...baseWidget, id: "cursor-1", tipo: "cursor", actualizadoEn: 1000, porDispositivo: "host" },
    ]);
    const clienteA = crearCliente("cliente-A", [
      { ...baseWidget, id: "widget-1", actualizadoEn: 2000, porDispositivo: "cliente-A" },
      { ...baseWidget, id: "cursor-1", tipo: "cursor", actualizadoEn: 2000, porDispositivo: "cliente-A" },
    ]);

    const resumen = resumirDivergencia(host.estado, clienteA.estado);
    expect(resumen).toContain("cambio");
    expect(resumen).not.toContain("cursor");
  });

  it("invariante: fusión de sala distinta devuelve conflicto y no mezcla", () => {
    const host = crearCliente("host", [baseWidget]);
    const otraSala: EstadoSala = { salaId: "otra-sala", elementos: { "widget-1": baseWidget }, reloj: 0 };

    const { resultado, conflictos } = fusionarEstados(host.estado, otraSala, "host");

    expect(conflictos).toContain("sala-distinta");
    expect(resultado).toEqual(host.estado);
  });
});

describe("coop-qa · sincronia-sala · prioridades P0-P3 y cola de malla", () => {
  it("P0 (cursor) se descarta primero bajo presión de malla", () => {
    const cursor: ElementoSala = { id: "c1", tipo: "cursor", datos: {}, actualizadoEn: 1000, porDispositivo: "a" };
    const contenido: ElementoSala = { id: "w1", tipo: "posicion", datos: {}, actualizadoEn: 1000, porDispositivo: "a" };

    expect(prioridadDeElemento(cursor)).toBeLessThan(prioridadDeElemento(contenido));
  });

  it("P1 (contenido + lápidas) nunca se pierde", () => {
    const nota: ElementoSala = { id: "n1", tipo: "nota", datos: { texto: "x" }, actualizadoEn: 1000, porDispositivo: "a" };
    const lapida: ElementoSala = { ...nota, borrado: true, actualizadoEn: 2000 };

    expect(prioridadDeElemento(nota)).toBe(1);
    expect(prioridadDeElemento(lapida)).toBe(1);
  });

  it("P2 (estado escena) viaja antes que P3 (masivo)", () => {
    const posicion: ElementoSala = { id: "p1", tipo: "posicion", datos: {}, actualizadoEn: 1000, porDispositivo: "a" };
    const modelo: ElementoSala = { id: "m1", tipo: "modelo3d", datos: {}, actualizadoEn: 1000, porDispositivo: "a" };

    expect(prioridadDeElemento(posicion)).toBeLessThan(prioridadDeElemento(modelo));
  });
});