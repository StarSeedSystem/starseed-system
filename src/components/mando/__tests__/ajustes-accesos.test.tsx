import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { AjustesAccesos } from "../ajustes-accesos";
import { AppearanceProvider } from "@/context/appearance-context";

function renderConProveedor(ui: React.ReactElement) {
  return render(<AppearanceProvider>{ui}</AppearanceProvider>);
}

const datosBase = {
  quienPide: "alex@star.seed",
  cuentas: [
    { correo: "alex@star.seed", rol: "dueno", capacidades: ["ver","editar-perfil","lanzar-olas","publicar","editar-codigo","gestionar-accesos","usar-apis"] },
    { correo: "invitado@ejemplo.com", rol: "invitado", capacidades: ["ver"] },
  ],
  conectados: ["macbook"],
  servicios: [{ variable: "STARSEED_DUENO", uso: "correo del dueño" }],
};

const fetchOriginal = globalThis.fetch;

afterEach(() => {
  cleanup();
  globalThis.fetch = fetchOriginal;
});

describe("AjustesAccesos", () => {
  it("pinta cuentas tras GET y no se rompe con datos vacíos", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/api/mando/accesos")) {
        return new Response(JSON.stringify(datosBase), { status: 200 });
      }
      return new Response("", { status: 404 });
    }) as typeof fetch;

    renderConProveedor(<AjustesAccesos />);
    await waitFor(() => {
      expect(screen.getAllByText("alex@star.seed").length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText("invitado@ejemplo.com").length).toBeGreaterThan(0);
    expect(screen.getByText(/Conectado ahora como/)).toBeInTheDocument();
  });

  it("conceder acceso actualiza la lista sin pantalla en blanco", async () => {
    let llamada = 0;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (!url.endsWith("/api/mando/accesos")) return new Response("", { status: 404 });
      if (!init?.method || init.method === "GET") {
        return new Response(JSON.stringify(datosBase), { status: 200 });
      }
      llamada += 1;
      const body = JSON.parse(init.body as string);
      const nuevo = {
        ...datosBase,
        cuentas: [
          ...datosBase.cuentas,
          { correo: body.correo, rol: "invitado", capacidades: ["ver"] },
        ],
      };
      return new Response(JSON.stringify(nuevo), { status: 200 });
    }) as typeof fetch;

    renderConProveedor(<AjustesAccesos />);
    await waitFor(() => expect(screen.getAllByText("alex@star.seed").length).toBeGreaterThan(0));

    const input = screen.getByLabelText(/Correo de la cuenta invitada/);
    fireEvent.change(input, { target: { value: "nuevo@ejemplo.com" } });
    const boton = screen.getByRole("button", { name: /Conceder/ });
    fireEvent.click(boton);

    await waitFor(() => {
      expect(screen.getByText("nuevo@ejemplo.com")).toBeInTheDocument();
    });
    expect(screen.getAllByText("alex@star.seed").length).toBeGreaterThan(0);
    expect(llamada).toBe(1);
  });

  it("muestra aviso si la API falla y mantiene la UI", async () => {
    globalThis.fetch = (async () => new Response("", { status: 403 })) as typeof fetch;
    renderConProveedor(<AjustesAccesos />);
    await waitFor(() => {
      expect(screen.getByText(/No puedes ver los accesos/)).toBeInTheDocument();
    });
  });
});
