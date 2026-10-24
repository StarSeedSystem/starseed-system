import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { AsistenteConectoresGenesis, type EstadoConectores } from "../asistente-conectores";
import type { Sugerencia } from "@/lib/genesis/conectores/sugerir";

const sugerencia = (id: string, cambios: Partial<Sugerencia> = {}): Sugerencia => ({
  id, nombre: `Opción ${id}`, tipo: "proveedor", papeles: ["escritor"], enlaceAlta: `https://alta.example/${id}`,
  enlaceClave: `https://claves.example/${id}`,
  limite: { rpm: 30, porDia: null, horasMes: null, almacenamientoGb: null, nota: "30 req/min" },
  verificado: null, privacidad: "nube-con-retencion", variables: [`${id.toUpperCase()}_API_KEY`], motivo: "Gratis con clave.", ...cambios,
});

const estado = (): EstadoConectores => ({
  ambito: "cuenta",
  locales: [
    { id: "neurona-mac", nombre: "Neurona Mac Studio", origen: "neurona", capa: "BitNet 1.58 · 2B", activa: true, motivo: "La local más potente del contexto." },
    { id: "cerebro-oracle", nombre: "Servidor del cerebro Oracle", origen: "cerebro", capa: "Ollama · qwen", activa: false, motivo: "Libera la Mac para el enjambre." },
  ],
  grupos: [
    { clave: "local-por-activar", titulo: "Local por activar", opciones: [] },
    { clave: "gratis-por-vincular", titulo: "Gratis por vincular", opciones: [sugerencia("openrouter"), sugerencia("groq")] },
    { clave: "de-pago-con-permiso", titulo: "De pago con permiso", opciones: [sugerencia("openai", { limite: null, enlaceClave: null })] },
    { clave: "sin-opcion", titulo: "Sin opción", papeles: [{ papel: "voz", motivo: "No hay nada local ni gratis para este papel y el ámbito no permite pago." }] },
  ],
  resumenPapeles: [
    { papel: "escritor", cadena: "Neurona Mac Studio → OpenRouter · :free → Groq", motivo: "Local más potente primero; los demás gratis con la clave vinculada." },
    { papel: "código", cadena: "Cloudroom", motivo: "Contenedor gratis para los procesos de los agentes." },
  ],
});

const pedidos: Array<{ url: string; cuerpo: unknown }> = [];

function responder(datos: unknown, codigo = 200): Response {
  return new Response(JSON.stringify(datos), { status: codigo });
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); pedidos.length = 0; });

describe("Asistente «Conectar Genesis» (GCA1019M)", () => {
  it("enseña las tres secciones y los interruptores alternan lo local por la API", async () => {
    const fetchSimulado = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).startsWith("/api/genesis/conectores/opciones")) return responder(estado());
      pedidos.push({ url: String(url), cuerpo: init?.body ? JSON.parse(String(init.body)) : null });
      return responder({ ok: true });
    });
    vi.stubGlobal("fetch", fetchSimulado);
    render(<AsistenteConectoresGenesis ambito="cuenta" />);
    expect(await screen.findByText("Neurona Mac Studio")).toBeInTheDocument();
    expect(screen.getByText("BitNet 1.58 · 2B")).toBeInTheDocument();
    expect(screen.getByText("Gratis por vincular")).toBeInTheDocument();
    expect(screen.getByText("Opción openrouter")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("switch", { name: "Usar Neurona Mac Studio" }));
    await waitFor(() => expect(screen.getByRole("switch", { name: "Usar Neurona Mac Studio" })).toHaveAttribute("aria-checked", "false"));
    fireEvent.click(screen.getByRole("switch", { name: "Usar Servidor del cerebro Oracle" }));
    await waitFor(() => expect(screen.getByRole("switch", { name: "Usar Servidor del cerebro Oracle" })).toHaveAttribute("aria-checked", "true"));
    expect(fetchSimulado).toHaveBeenCalledWith("/api/genesis/conectores/opciones?ambito=cuenta");
    expect(pedidos[0]).toEqual({ url: "/api/genesis/conectores/local", cuerpo: { ambito: "cuenta", ofertaId: "neurona-mac", activa: false } });
    expect(screen.getAllByText("30 req/min")).toHaveLength(2);
    expect(screen.getAllByText("Sin verificar")).toHaveLength(3);
    expect(screen.getByText("De pago con permiso")).toBeInTheDocument();
    expect(screen.getByTestId("conectores-sin-opcion-voz")).toHaveTextContent("No hay nada local ni gratis para este papel y el ámbito no permite pago.");
    expect(screen.getByText("Neurona Mac Studio → OpenRouter · :free → Groq")).toBeInTheDocument();
    expect(screen.getByText(/Local más potente primero/)).toBeInTheDocument();
  });

  it("la clave pegada se envía a la API y se borra, sin pintarse nunca", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).startsWith("/api/genesis/conectores/opciones")) return responder(estado());
      pedidos.push({ url: String(url), cuerpo: init?.body ? JSON.parse(String(init.body)) : null });
      return responder({ ok: true, huella: "or-…ab12" });
    }));
    render(<AsistenteConectoresGenesis ambito="grupo fútbol" />);
    const enlace = await screen.findByTestId("conectores-vincular-openrouter");
    expect(enlace).toHaveAttribute("href", "https://alta.example/openrouter");
    expect(enlace).toHaveAttribute("target", "_blank");
    expect(enlace).toHaveAttribute("rel", "noopener noreferrer");
    const campo = screen.getByTestId("conectores-clave-openrouter") as HTMLInputElement;
    fireEvent.change(campo, { target: { value: "sk-secreta-0001" } });
    fireEvent.click(screen.getByTestId("conectores-guardar-openrouter"));
    await waitFor(() => expect(campo.value).toBe(""));
    expect(pedidos[0]).toEqual({ url: "/api/genesis/conectores/vincular", cuerpo: { ambito: "grupo fútbol", opcionId: "openrouter", clave: "sk-secreta-0001" } });
    expect(screen.getByTestId("conectores-huella-openrouter")).toHaveTextContent("or-…ab12");
    expect(screen.queryByText("sk-secreta-0001")).not.toBeInTheDocument();
  });

  it("si la bóveda falla, la clave se borra igual y solo se dice el problema sin mostrarla", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).startsWith("/api/genesis/conectores/opciones")) return responder(estado());
      return responder({ error: "La bóveda por ámbito no está aplicada." }, 503);
    }));
    render(<AsistenteConectoresGenesis ambito="cuenta" />);
    const campo = (await screen.findByTestId("conectores-clave-groq")) as HTMLInputElement;
    fireEvent.change(campo, { target: { value: "gsk-fallo" } });
    fireEvent.click(screen.getByTestId("conectores-guardar-groq"));
    await waitFor(() => expect(campo.value).toBe(""));
    expect(await screen.findByTestId("conectores-error-groq")).toHaveTextContent("La bóveda por ámbito no está aplicada.");
    expect(screen.queryByText("gsk-fallo")).not.toBeInTheDocument();
    expect(screen.queryByTestId("conectores-huella-groq")).not.toBeInTheDocument();
  });
});
