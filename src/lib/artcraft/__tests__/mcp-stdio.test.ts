import { describe, it, expect, vi } from "vitest";
import { ClienteMcpStdio, trocearLineas, LIMITE_LINEA, ErrorMcp } from "../mcp-stdio";

describe("ClienteMcpStdio", () => {
  class TransporteFalso {
    escrito: string[] = [];
    private cb?: (t: string) => void;
    escribir(l: string) { this.escrito.push(l); }
    alRecibir(cb: (t: string) => void) { this.cb = cb; }
    cerrar() {}
    simularRecibir(obj: any) { this.cb?.(JSON.stringify(obj)); }
    simularTexto(txt: string) { this.cb?.(txt); }
  }

  const relojFalso = {
    tras(ms: number, cb: () => void) {
      const t = setTimeout(cb, ms);
      return () => clearTimeout(t);
    }
  };

  it("1. handshake completo", async () => {
    const trans = new TransporteFalso();
    const cliente = new ClienteMcpStdio(trans, relojFalso);
    setTimeout(() => {
      trans.simularRecibir({ jsonrpc: "2.0", id: 1, result: { capabilities: {} } });
    }, 10);
    await cliente.iniciar();
    expect(trans.escrito.length).toBe(2);
    expect(trans.escrito[0]).toContain("initialize");
    expect(trans.escrito[1]).toContain("notifications/initialized");
  });
  it("1b. trocearLineas separa por \n y descarta \r y líneas vacías", () => {
    const res = trocearLineas("ini\r\n", "linea1\n\nlinea2\r\nresto");
    expect(res.lineas).toEqual(["ini", "linea1", "linea2"]);
    expect(res.resto).toBe("resto");
  });

  it("2. respuestas desordenadas", async () => {
    const trans = new TransporteFalso();
    const cliente = new ClienteMcpStdio(trans, relojFalso);
    setTimeout(() => {
      trans.simularRecibir({ jsonrpc: "2.0", id: 2, result: { content: [{ type: "text", text: "dos" }] } });
      trans.simularRecibir({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: "uno" }] } });
    }, 10);
    const p1 = cliente.listar(1000);
    const p2 = cliente.listar(1000);
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.result.content[0].text).toBe("uno");
    expect(r2.result.content[0].text).toBe("dos");
  });

  it("3. notificación ignorada y 4. línea ilegible", async () => {
    const trans = new TransporteFalso();
    const cliente = new ClienteMcpStdio(trans, relojFalso);
    trans.simularTexto("no es json");
    trans.simularRecibir({ jsonrpc: "2.0", method: "notif", params: {} });
    expect(cliente.erroresIlegibles).toBe(1);
  });

  it("5. línea enorme cortada y sin más despachos", async () => {
    const trans = new TransporteFalso();
    const cliente = new ClienteMcpStdio(trans, relojFalso);
    expect(() => cliente.procesarTrozo("", "a".repeat(LIMITE_LINEA + 1))).toThrowError();
  });

  it("6. tiempo agotado", async () => {
    const trans = new TransporteFalso();
    const cliente = new ClienteMcpStdio(trans, relojFalso);
    await expect(cliente.listar(50)).rejects.toThrowError();
  });

  it("7. isError", async () => {
    const trans = new TransporteFalso();
    const cliente = new ClienteMcpStdio(trans, relojFalso);
    setTimeout(() => {
      trans.simularRecibir({ jsonrpc: "2.0", id: 1, result: { isError: true, content: [{ type: "text", text: "falló" }] } });
    }, 10);
    const res = await cliente.llamar("herramienta", {}, 1000);
    expect(res.ok).toBe(false);
    expect(res.texto).toBe("falló");
  });

  it("8. cierre con pendientes", async () => {
    const trans = new TransporteFalso();
    const cliente = new ClienteMcpStdio(trans, relojFalso);
    const p = cliente.listar(1000);
    cliente.cerrar();
    await expect(p).rejects.toThrowError();
  });

  it("9. trozos partidos a mitad de línea", async () => {
    const r1 = trocearLineas("hola", " mundo\notra");
    expect(r1.lineas).toEqual(["hola mundo"]);
    expect(r1.resto).toBe("otra");
  });

  it("10. imagen base64", async () => {
    const trans = new TransporteFalso();
    const cliente = new ClienteMcpStdio(trans, relojFalso);
    const b64 = btoa("datos-imagen");
    setTimeout(() => {
      trans.simularRecibir({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "image", mime: "image/png", data: b64 }] } });
    }, 10);
    const res = await cliente.llamar("screenshot", {}, 1000);
    expect(res.tipo).toBe("imagen");
    if (res.tipo === "imagen") {
      expect(res.mime).toBe("image/png");
      expect(res.bytes.length).toBeGreaterThan(0);
    }
  });

  it("11. error RPC", async () => {
    const trans = new TransporteFalso();
    const cliente = new ClienteMcpStdio(trans, relojFalso);
    setTimeout(() => {
      trans.simularRecibir({ jsonrpc: "2.0", id: 1, error: { message: "Error interno" } });
    }, 10);
    await expect(cliente.llamar("tool", {}, 1000)).rejects.toThrowError();
  });

  it("12. llamada normal ok", async () => {
    const trans = new TransporteFalso();
    const cliente = new ClienteMcpStdio(trans, relojFalso);
    setTimeout(() => {
      trans.simularRecibir({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: "ok texto" }] } });
    }, 10);
    const res = await cliente.llamar("tool", {}, 1000);
    expect(res.ok).toBe(true);
    expect(res.texto).toBe("ok texto");
  });
});
