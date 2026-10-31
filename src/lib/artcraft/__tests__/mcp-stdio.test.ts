/**
 * Pruebas del CLIENTE MCP por stdio (rescatadas de la rama nube/41190364956 de la
 * tarea FSH1018G, adaptadas a la API de hoy: `ClienteMcpStdio` en
 * `pasarela-servidor.ts`). Solo transporte inyectado: sin procesos, sin red,
 * sin disco — el hijo falso recuerda lo escrito y dispara llegada y cierre.
 */
import { describe, expect, it } from "vitest";

import { ClienteMcpStdio, type HijoMcp } from "../pasarela-servidor";

/** Hijo MCP falso: sin proceso; `llegada` y `morir` lo maneja el propio caso. */
class HijoFalso implements HijoMcp {
  escrito: string[] = [];
  muerto = false;
  private salida: ((t: string) => void)[] = [];
  private cierre: ((c: number | null) => void)[] = [];

  escribir(linea: string): void { this.escrito.push(linea); }
  aLaSalida(cb: (t: string) => void): void { this.salida.push(cb); }
  alFinal(cb: (c: number | null) => void): void { this.cierre.push(cb); }
  terminar(): void { this.muerto = true; }

  llegada(t: string): void { for (const cb of this.salida) cb(t); }
  morir(codigo: number | null = null): void { for (const cb of this.cierre) cb(codigo); }
  /** El servidor contesta a la petición con el id dado. */
  contesta(id: number, cuerpo: object): void {
    this.llegada(`${JSON.stringify({ jsonrpc: "2.0", ...cuerpo, id })}\n`);
  }
}

const clienteDe = (tope = 1_000): [HijoFalso, ClienteMcpStdio] => {
  const hijo = new HijoFalso();
  return [hijo, new ClienteMcpStdio(hijo, tope)];
};

describe("ClienteMcpStdio · saludo del protocolo", () => {
  it("escribe initialize y, al contestar, la notificación notifications/initialized", async () => {
    const [hijo, cliente] = clienteDe();
    const saludo = cliente.iniciar();
    const mensaje = (n: number): Record<string, unknown> => JSON.parse(hijo.escrito[n] ?? "{}") as Record<string, unknown>;
    expect(mensaje(0)["method"]).toBe("initialize");
    expect(mensaje(0)["jsonrpc"]).toBe("2.0");
    hijo.contesta(1, { result: { serverInfo: { name: "figcraft" } } });
    await saludo;
    expect(mensaje(1)["method"]).toBe("notifications/initialized");
    expect(mensaje(1)).not.toHaveProperty("id");
  });
});

describe("ClienteMcpStdio · líneas del stdio", () => {
  it("junta una respuesta que llega partida a mitad de línea y devuelve el resto", async () => {
    const [hijo, cliente] = clienteDe();
    const respuesta = cliente.llamar("list_commands", {});
    const entera = JSON.stringify({ jsonrpc: "2.0", id: 1, result: { comando: "sí" } });
    const mitad = Math.floor(entera.length / 2);
    hijo.llegada(entera.slice(0, mitad));
    hijo.llegada(entera.slice(mitad));
    hijo.llegada("\n");
    await expect(respuesta).resolves.toEqual({ comando: "sí" });
  });

  it("ignora líneas vacías y respeta el \\r final de la línea", async () => {
    const [hijo, cliente] = clienteDe();
    const respuesta = cliente.llamar("list_commands", {});
    hijo.llegada("\n");
    hijo.llegada(`${JSON.stringify({ jsonrpc: "2.0", id: 1, result: 7 })}\r\n`);
    hijo.llegada("\n");
    await expect(respuesta).resolves.toBe(7);
  });

  it("una notificación sin id y una línea que no es JSON no tumban al cliente", async () => {
    const [hijo, cliente] = clienteDe();
    const p1 = cliente.llamar("list_commands", {});
    hijo.llegada('{"jsonrpc":"2.0","method":"tools/list"}\n');
    hijo.llegada("esto no es JSON\n");
    const p2 = cliente.llamar("list_commands", {});
    hijo.contesta(1, { result: "sigue vivo" });
    hijo.contesta(2, { result: "también" });
    await expect(p1).resolves.toBe("sigue vivo");
    await expect(p2).resolves.toBe("también");
  });
});

describe("ClienteMcpStdio · respuestas de la llamada", () => {
  it("respuestas desordenadas: cada promesa recibe SU respuesta", async () => {
    const [hijo, cliente] = clienteDe();
    const p1 = cliente.llamar("a", {});
    const p2 = cliente.llamar("b", {});
    hijo.contesta(2, { result: "segunda" });
    hijo.contesta(1, { result: "primera" });
    await expect(p1).resolves.toBe("primera");
    await expect(p2).resolves.toBe("segunda");
  });

  it("una respuesta rpc con error rechaza la llamada y el cliente sigue sirviendo", async () => {
    const [hijo, cliente] = clienteDe();
    const rota = cliente.llamar("romper", {});
    hijo.contesta(1, { error: { code: -32601, message: "no existe" } });
    await expect(rota).rejects.toThrow(/no existe/);
    const deNuevo = cliente.llamar("list_commands", {});
    hijo.contesta(2, { result: "ok" });
    await expect(deNuevo).resolves.toBe("ok");
  });

  it("el hijo muere con peticiones pendientes: todas fallan con el mismo motivo", async () => {
    const [hijo, cliente] = clienteDe(2_000);
    const p1 = cliente.llamar("a", {});
    const p2 = cliente.llamar("b", {});
    hijo.morir(0);
    await expect(p1).rejects.toThrow(/terminó antes de contestar/);
    await expect(p2).rejects.toThrow(/terminó antes de contestar/);
  });
});
