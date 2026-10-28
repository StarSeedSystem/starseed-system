import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ChatDirector } from "../chat-director";

/** Entregas que devolverá el feed en la lectura en curso de cada prueba. */
let entregasFeed: Record<string, Record<string, string>> = {};

/** Feed mínimo que devuelve la API local del chat del director. */
function feed(mensajes: unknown[] = [], ultimoModelo = "") {
  return { ok: true, json: async () => ({ mensajes, entregas: entregasFeed, ultimoModelo }) };
}

const nativoFetch = globalThis.fetch;

/** Feed largo con ids y horas crecientes, como el que recorta el chat a 500. */
function mensajesLargos(total: number) {
  return Array.from({ length: total }, (_, i) => ({
    id: `md-largo-${i + 1}`,
    t: new Date(Date.UTC(2026, 9, 4, 10, 0, i)).toISOString(),
    de: i % 2 === 0 ? "alex" : "director",
    rol: i % 2 === 0 ? "alex" : "director",
    tipo: "mensaje",
    texto: `Mensaje ${i + 1}`,
    canal: "mando",
  }));
}

/** jsdom no mide layout: se le dan altura total y visible para probar el «pegado al final». */
function medirLista(nodo: HTMLElement, inicial: { alto: number; visible: number }) {
  let alto = inicial.alto;
  let scrollTop = 0;
  Object.defineProperty(nodo, "clientHeight", { configurable: true, get: () => inicial.visible });
  Object.defineProperty(nodo, "scrollHeight", { configurable: true, get: () => alto });
  Object.defineProperty(nodo, "scrollTop", {
    configurable: true,
    get: () => scrollTop,
    set: (valor: number) => { scrollTop = valor; },
  });
  return { crecer: (nuevo: number) => { alto = nuevo; } };
}

async function asentarMicrotareas() {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

function feedLargo(total: () => number) {
  return async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/mando/modelos")) {
      return { ok: true, json: async () => ({ modelos: [] }) } as Response;
    }
    return { ok: true, json: async () => ({ mensajes: mensajesLargos(total()), entregas: {}, ultimoModelo: "" }) } as Response;
  };
}

describe("ChatDirector", () => {
  const llamadas: { url: string; init?: RequestInit }[] = [];

  beforeEach(() => {
    llamadas.length = 0;
    entregasFeed = {};
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      llamadas.push({ url, init });
      if (url.includes("/api/mando/modelos")) {
        return { ok: true, json: async () => ({ modelos: [] }) } as Response;
      }
      return feed([
        { id: "md-1-aaaa", t: "2026-10-04T10:00:00Z", de: "alex", rol: "alex", tipo: "mensaje", texto: "Hola, dirección", canal: "mando" },
        { id: "md-2-bbbb", t: "2026-10-04T10:01:00Z", de: "claude-cowork", rol: "director", tipo: "respuesta", texto: "Recibido, al lío.", canal: "mando", modelo: "nim/mixtral" },
        { id: "md-3-cccc", t: "2026-10-04T10:02:00Z", de: "informe", rol: "director", tipo: "informe", texto: "Ola integrada sin novedad.", canal: "mando" },
      ], "nim/mixtral") as unknown as Response;
    };
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = nativoFetch;
    window.localStorage.clear();
  });

  it("pinta los mensajes recibidos", async () => {
    render(<ChatDirector />);
    expect(await screen.findByText("Hola, dirección")).toBeInTheDocument();
    expect(await screen.findByText("Recibido, al lío.")).toBeInTheDocument();
  });

  it("filtra por Informes", async () => {
    render(<ChatDirector />);
    await screen.findByText("Hola, dirección");
    fireEvent.click(screen.getByRole("tab", { name: "Informes" }));
    expect(screen.getByText("Ola integrada sin novedad.")).toBeInTheDocument();
    expect(screen.queryByText("Hola, dirección")).not.toBeInTheDocument();
  });

  it("enviar publica un POST con el modelo preseleccionado", async () => {
    render(<ChatDirector />);
    await screen.findByText("Hola, dirección");
    fireEvent.change(screen.getByLabelText("Mensaje a la dirección"), { target: { value: "Revisen la cola" } });
    fireEvent.click(screen.getByText("Enviar", { selector: ".bg-violet-600" }));
    const post = await (async () => {
      for (let i = 0; i < 50; i++) {
        const p = llamadas.find((l) => l.init?.method === "POST");
        if (p) return p;
        await new Promise((r) => setTimeout(r, 10));
      }
      return undefined;
    })();
    expect(post).toBeDefined();
    const cuerpo = JSON.parse(String(post?.init?.body)) as Record<string, unknown>;
    expect(cuerpo.accion).toBe("decir");
    expect(cuerpo.texto).toBe("Revisen la cola");
    expect(cuerpo.modelo).toBe("nim/mixtral");
  });

  it("lee el feed UNA vez al montar, no en bucle", async () => {
    render(<ChatDirector />);
    await screen.findByText("Hola, dirección");
    await new Promise((r) => setTimeout(r, 300));
    const lecturas = llamadas.filter((l) => l.url.includes("/api/mando/director-chat") && !l.init?.method);
    expect(lecturas).toHaveLength(1);
  });

  it("mientras alguien va a contestar (entrega pendiente) suena cada 3 s, no a los 10 s", async () => {
    entregasFeed = { "md-1-aaaa": { hermes: "pendiente" } };
    vi.useFakeTimers();
    try {
      render(<ChatDirector />);
      await act(async () => { await Promise.resolve(); });
      const lecturas = () =>
        llamadas.filter((l) => l.url.includes("/api/mando/director-chat") && !l.init?.method).length;
      expect(lecturas()).toBe(1);
      await act(async () => { vi.advanceTimersByTime(3_200); });
      expect(lecturas()).toBe(2);
      await act(async () => { vi.advanceTimersByTime(3_000); });
      expect(lecturas()).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("sin entregas pendientes, a los 3 s todavía no ha vuelto a leer", async () => {
    vi.useFakeTimers();
    try {
      render(<ChatDirector />);
      await act(async () => { await Promise.resolve(); });
      const lecturas = () =>
        llamadas.filter((l) => l.url.includes("/api/mando/director-chat") && !l.init?.method).length;
      expect(lecturas()).toBe(1);
      await act(async () => { vi.advanceTimersByTime(3_500); });
      expect(lecturas()).toBe(1);
      await act(async () => { vi.advanceTimersByTime(7_000); });
      expect(lecturas()).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("con entrega pendiente enseña el aviso de que alguien está respondiendo", async () => {
    entregasFeed = { "md-1-aaaa": { hermes: "pendiente" } };
    render(<ChatDirector />);
    const estado = await screen.findByRole("status");
    expect(estado).toHaveTextContent(/Hermes está respondiendo/);
  });

  it("con 500 mensajes, el 501 deja la lista al fondo aunque el recorte no cambie su longitud", async () => {
    let total = 500;
    globalThis.fetch = feedLargo(() => total);
    vi.useFakeTimers();
    try {
      render(<ChatDirector />);
      const lista = screen.getByRole("log", { name: "Mensajes del director" });
      const medida = medirLista(lista, { alto: 5000, visible: 300 });
      await act(async () => { await asentarMicrotareas(); });
      expect(screen.getByText("Mensaje 500")).toBeInTheDocument();
      expect(lista.scrollTop).toBe(5000);
      total = 501;
      medida.crecer(5200);
      await act(async () => {
        vi.advanceTimersByTime(10_000);
        await asentarMicrotareas();
      });
      expect(screen.getByText("Mensaje 501")).toBeInTheDocument();
      expect(lista.scrollTop).toBe(5200);
    } finally {
      vi.useRealTimers();
    }
  });

  it("si Alex se subió a leer, el mensaje nuevo no le arrastra y aparece «1 nuevos»", async () => {
    let total = 500;
    globalThis.fetch = feedLargo(() => total);
    vi.useFakeTimers();
    try {
      render(<ChatDirector />);
      const lista = screen.getByRole("log", { name: "Mensajes del director" });
      const medida = medirLista(lista, { alto: 5000, visible: 300 });
      await act(async () => { await asentarMicrotareas(); });
      expect(screen.getByText("Mensaje 500")).toBeInTheDocument();
      lista.scrollTop = 100;
      fireEvent.scroll(lista);
      total = 501;
      medida.crecer(5200);
      await act(async () => {
        vi.advanceTimersByTime(10_000);
        await asentarMicrotareas();
      });
      expect(screen.getByText("Mensaje 501")).toBeInTheDocument();
      expect(lista.scrollTop).toBe(100);
      const boton = document.querySelector<HTMLButtonElement>('button[aria-label="Bajar al último mensaje (1 nuevos)"]');
      expect(boton).not.toBeNull();
      fireEvent.click(boton as HTMLButtonElement);
      expect(lista.scrollTop).toBe(5200);
      expect(document.querySelector('button[aria-label="Bajar al último mensaje (1 nuevos)"]')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
