import { describe, expect, it } from "vitest";

import {
  ClienteMcpStdio,
  LIMITE_LINEA,
  type RelojMcp,
  type TransporteMcp,
  trocearLineas,
} from "../mcp-stdio";

type RelojFalso = RelojMcp & { disparar: () => void; vivos: () => number };

/** Transporte falso: guarda lo escrito y deja alimentar el flujo de entrada a mano. */
function transporteFalso() {
  const escritas: string[] = [];
  let recibir: (texto: string) => void = () => undefined;
  let cerrado = false;
  const transporte: TransporteMcp = {
    escribir: (linea) => escritas.push(linea),
    alRecibir: (cb) => {
      recibir = cb;
    },
    cerrar: () => {
      cerrado = true;
    },
  };
  return { transporte, escritas, alimentar: (t: string) => recibir(t), estaCerrado: () => cerrado };
}

/** Reloj falso: los tiempos se disparan a mano. */
function relojFalso(): RelojFalso {
  const porDisparar = new Map<number, () => void>();
  let siguiente = 0;
  return {
    tras: (_ms, cb) => {
      const id = siguiente++;
      porDisparar.set(id, cb);
      return () => porDisparar.delete(id);
    },
    disparar: () => {
      const cb = [...porDisparar.values()];
      porDisparar.clear();
      for (const f of cb) f();
    },
    vivos: () => porDisparar.size,
  };
}

describe("cliente MCP por stdio", () => {
  it("trocea por «\\n», quita «\\r» final y salta líneas vacías", () => {
    expect(trocearLineas("", "a\r\n\nb\n")).toEqual({ lineas: ["a", "b"], resto: "" });
    expect(trocearLineas("medio", "trozo\n")).toEqual({ lineas: ["mediotrozo"], resto: "" });
    expect(trocearLineas("x\n", "yy")).toEqual({ lineas: ["x"], resto: "yy" });
  });

  it("handshake: initialize con la ficha del OS y luego notifications/initialized", async () => {
    const t = transporteFalso();
    const c = new ClienteMcpStdio(t.transporte, relojFalso());
    const hecho = c.iniciar();
    expect(JSON.parse(t.escritas[0])).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18", clientInfo: { name: "starseed-os", version: "1" } },
    });
    t.alimentar('{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-06-18"}}\n');
    await hecho;
    expect(t.escritas[1]).toContain("notifications/initialized");
    c.cerrar();
  });

  it("los ids de petición salen en secuencia empezando en 1", () => {
    const t = transporteFalso();
    const c = new ClienteMcpStdio(t.transporte, relojFalso());
    c.listar(1000);
    c.listar(1000);
    expect(t.escritas.map((l) => (JSON.parse(l) as { id: number }).id)).toEqual([1, 2]);
  });

  it("respuestas desordenadas llegan a su petición", async () => {
    const t = transporteFalso();
    const c = new ClienteMcpStdio(t.transporte, relojFalso());
    const p1 = c.listar(1000);
    const p2 = c.listar(1000);
    t.alimentar('{"jsonrpc":"2.0","id":2,"result":{"n":2}}\n');
    t.alimentar('{"jsonrpc":"2.0","id":1,"result":{"n":1}}\n');
    await expect(p1).resolves.toEqual({ n: 1 });
    await expect(p2).resolves.toEqual({ n: 2 });
  });

  it("notificación y línea sin id se ignoran sin romper el flujo", async () => {
    const t = transporteFalso();
    const c = new ClienteMcpStdio(t.transporte, relojFalso());
    const p = c.listar(1000);
    t.alimentar('{"jsonrpc":"2.0","method":"notifications/progreso","params":{"n":1}}\n');
    t.alimentar('{"jsonrpc":"2.0","id":1,"result":{"n":7}}\n');
    await expect(p).resolves.toEqual({ n: 7 });
    expect(c.ilegiblesContadas).toBe(0);
  });

  it("una línea que no es JSON se cuenta y no tumba al cliente", async () => {
    const t = transporteFalso();
    const c = new ClienteMcpStdio(t.transporte, relojFalso());
    const p = c.listar(1000);
    t.alimentar("puf no soy json\n");
    t.alimentar('{"jsonrpc":"2.0","id":1,"result":{"ok":true}}\n');
    await expect(p).resolves.toEqual({ ok: true });
    expect(c.ilegiblesContadas).toBe(1);
  });

  it("resto sin salto por encima del límite corta el flujo y no despacha más", async () => {
    const t = transporteFalso();
    const c = new ClienteMcpStdio(t.transporte, relojFalso());
    const p = c.listar(1000);
    t.alimentar("x".repeat(LIMITE_LINEA + 1));
    await expect(p).rejects.toMatchObject({ tipo: "enorme" });
    await expect(c.listar(1000)).rejects.toMatchObject({ tipo: "enorme" });
    expect(t.escritas.length).toBe(1);
  });

  it("tiempo agotado rechaza con «tiempo»", async () => {
    const t = transporteFalso();
    const reloj = relojFalso();
    const c = new ClienteMcpStdio(t.transporte, reloj);
    const p = c.listar(1000);
    expect(reloj.vivos()).toBe(1);
    reloj.disparar();
    await expect(p).rejects.toMatchObject({ tipo: "tiempo" });
  });

  it("un error JSON-RPC rechaza con «rpc»", async () => {
    const t = transporteFalso();
    const c = new ClienteMcpStdio(t.transporte, relojFalso());
    const p = c.listar(1000);
    t.alimentar('{"jsonrpc":"2.0","id":1,"error":{"code":-32601,"message":"sin método"}}\n');
    await expect(p).rejects.toMatchObject({ tipo: "rpc" });
  });

  it("una respuesta partida a mitad de línea se arma al llegar completa", async () => {
    const t = transporteFalso();
    const c = new ClienteMcpStdio(t.transporte, relojFalso());
    const p = c.listar(1000);
    t.alimentar('{"jsonrpc":"2.0","id":1,');
    t.alimentar('"result":{"n":9}}\n');
    await expect(p).resolves.toEqual({ n: 9 });
  });

  it("isError de la herramienta llega como {ok:false} y no como excepción", async () => {
    const t = transporteFalso();
    const c = new ClienteMcpStdio(t.transporte, relojFalso());
    const p = c.llamar("run_command", { id: "undo" }, 1000);
    t.alimentar('{"jsonrpc":"2.0","id":1,"result":{"isError":true,"content":[{"type":"text","text":"falló"}]}}\n');
    await expect(p).resolves.toEqual({ ok: false, texto: "falló" });
  });

  it("el texto de content se concatena y la imagen llega decodificada", async () => {
    const t = transporteFalso();
    const c = new ClienteMcpStdio(t.transporte, relojFalso());
    const p = c.llamar("export", {}, 1000);
    t.alimentar(
      '{"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"a"},' +
        '{"type":"text","text":"b"},{"type":"image","mimeType":"image/png","data":"AQID"}]}}\n',
    );
    const r = await p;
    if (!r.ok) throw new Error("tenía que salir bien");
    expect(r.texto).toBe("a\nb");
    expect(r.imagenes[0]).toEqual({ tipo: "imagen", mime: "image/png", bytes: new Uint8Array([1, 2, 3]) });
  });

  it("cerrar() con peticiones pendientes las rechaza con «cerrado»", async () => {
    const t = transporteFalso();
    const c = new ClienteMcpStdio(t.transporte, relojFalso());
    const p = c.listar(1000);
    c.cerrar();
    await expect(p).rejects.toMatchObject({ tipo: "cerrado" });
    expect(t.estaCerrado()).toBe(true);
  });
});
