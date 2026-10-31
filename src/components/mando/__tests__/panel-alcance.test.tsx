/**
 * Panel de alcance (INV1025P) contra un `/api/mando/alcance` y un
 * `/api/mando/imaginacion` simulados, sin red ni disco: pinta remitente y medio,
 * al aprobar un texto EDITADO manda primero la edición (que anula la
 * aprobación), la ventana de envío exige escribir ENVIAR y el envío
 * `correo-usuario` devuelve el `mailto:` que lo envía la persona (R3).
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

import { PanelAlcance, puedeEnviar } from "@/components/mando/panel-alcance";
import type { VistaAlcance } from "@/lib/alcance/alcance-tipos";

const HOY = new Date().toISOString();

const vista = (o: Partial<VistaAlcance> = {}): VistaAlcance => ({
  id: "p1", titular: "Hola", asunto: "Hola", cuerpo: "Nos resonó su trabajo.",
  medio: "correo-usuario", remitente: "Alex · StarSeed OS", destinatario: "prensa@yosoy.org", destinoUrl: "",
  estadoPropuesta: "aprobada", envio: "aprobada" as VistaAlcance["envio"], aprobada: true, huellaAprobada: "a".repeat(64),
  enlaces: [{ url: "https://yosoy.org", codigo: 200, verificadoEn: HOY }], suprimido: false,
  seguimiento: "esperando", motivos: [],
});

type Cuerpo = Record<string, unknown>;
const posts: Cuerpo[] = [];

/** GET devuelve la vista; POST responde bien. */
function servidor(v: VistaAlcance) {
  const estado = { v };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      const c = JSON.parse(String(init.body)) as Cuerpo;
      posts.push(c);
      const cuerpo = c.accion === "enviar" ? JSON.stringify({ ok: true, mailto: "mailto:prensa%40yosoy.org" }) : JSON.stringify({ ok: true });
      return new Response(cuerpo, { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ vista: estado.v }), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  posts.length = 0;
});

describe("puedeEnviar (pura)", () => {
  it("exige texto aprobado y sin motivos; un texto tocado lo bloquea (R2)", () => {
    const v = vista();
    expect(puedeEnviar(v, false)).toBe(true);
    expect(puedeEnviar(v, true)).toBe(false);
    expect(puedeEnviar({ ...v, aprobada: false }, false)).toBe(false);
    expect(puedeEnviar({ ...v, motivos: ["Se alcanzó el límite diario de mensajes (5)"] }, false)).toBe(false);
    expect(puedeEnviar({ ...v, envio: "enviada" }, false)).toBe(false);
  });
});

describe("PanelAlcance", () => {
  it("pinta remitente, medio, contadores y el estado del envío", async () => {
    servidor(vista());
    render(<PanelAlcance id="p1" />);
    expect(await screen.findByText(/Alex · StarSeed OS/)).toBeInTheDocument();
    expect(screen.getByText(/correo-usuario/)).toBeInTheDocument();
    expect(screen.getByText(/palabras \(tope 220\)/)).toBeInTheDocument();
    expect(screen.getByText("Texto aprobado")).toBeInTheDocument();
  });

  it("aprobar con el texto tocado manda PRIMERO editar y luego aprobar-texto", async () => {
    servidor(vista());
    render(<PanelAlcance id="p1" />);
    const asunto = await screen.findByLabelText("Asunto");
    fireEvent.change(asunto, { target: { value: "Hola de nuevo" } });
    fireEvent.click(screen.getByTestId("alcance-p1-aprobar"));
    await waitFor(() => expect(posts.length).toBe(2), { timeout: 4000 });
    expect(posts[0]).toEqual({ id: "p1", asunto: "Hola de nuevo", accion: "editar", cuerpo: "Nos resonó su trabajo." });
    expect(posts[1].accion).toBe("aprobar-texto");
    await screen.findByText("Texto aprobado: la ventana de envío ya puede revisar los enlaces.");
  });

  it("la ventana pide el texto exacto ENVIAR y el envío sale con el mailto para la persona (R2·R3)", async () => {
    servidor(vista());
    render(<PanelAlcance id="p1" />);
    await screen.findByText(/Alex · StarSeed OS/);
    fireEvent.click(screen.getByTestId("alcance-p1-enviar"));
    const entrada = await screen.findByLabelText(/Escribe ENVIAR/);
    const mandar = await screen.findByRole("button", { name: /Confirmar el envío/ });
    expect(mandar).toBeDisabled();
    fireEvent.change(entrada, { target: { value: "enviar" } });
    expect(mandar).toBeDisabled();
    fireEvent.change(entrada, { target: { value: "ENVIAR" } });
    expect(mandar).toBeEnabled();
    fireEvent.click(mandar);
    await waitFor(() => expect(posts.some((c) => c.accion === "enviar" && c.confirmacion === "ENVIAR" && c.medio === "correo-usuario")), { timeout: 4000 });
    await screen.findByText(/Envío registrado/);
  });
});
