import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { GrupoSugerencias } from "@/lib/genesis/conectores/sugerir";
import { AsistenteConectores, type OfertaLocal, type ResumenPapel } from "../asistente-conectores";

const ofertas: OfertaLocal[] = [
  { id: "neurona-mac", nombre: "MacBook de Álex", origen: "neurona", capa: null, papel: ["chat"], activa: false },
  { id: "cerebro-oracle", nombre: "Oracle del cerebro", origen: "cerebro", capa: "4-bit", papel: ["escritor"], activa: true },
  { id: "astraura-158", nombre: "Astraura 1.58 local", origen: "astraura", capa: "1.58-bit", papel: ["chat"], activa: true },
];

const grupos: GrupoSugerencias[] = [
  {
    clave: "gratis-por-vincular", titulo: "Gratis por vincular",
    opciones: [{
      id: "openrouter", nombre: "OpenRouter", tipo: "proveedor", papeles: ["escritor"],
      enlaceAlta: "https://openrouter.ai/registro", enlaceClave: "https://openrouter.ai/keys",
      limite: { rpm: null, porDia: 50, horasMes: null, almacenamientoGb: null, nota: "50 peticiones al día" },
      verificado: null, privacidad: "nube-con-retencion", variables: ["OPENROUTER_API_KEY"],
      motivo: "Gratis: crea tu cuenta en el enlace oficial y vincula la clave.",
    }],
  },
  { clave: "sin-opcion", titulo: "Sin opción", papeles: [{ papel: "voz", motivo: "Nada local ni gratis." }] },
];

const resumenes: ResumenPapel[] = [
  {
    papel: "escritor",
    cadena: [
      { id: "astraura-158", nombre: "Astraura 1.58 local", motivo: "Lo local más potente de la cuenta." },
      { id: "openrouter", nombre: "OpenRouter", motivo: "Gratis: relevo en la nube." },
    ],
  },
  { papel: "voz", cadena: [] },
];

function propsCon(alternarLocal: (id: string, activa: boolean) => void) {
  return { tituloAmbito: "cuenta personal", ofertas, grupos, resumenes, alternarLocal, enviarClave: vi.fn(async () => undefined) };
}

afterEach(cleanup);

describe("Asistente Conectar Genesis", () => {
  it("paso 1: lista lo local con capa real o «capa sin validar» y alterna con el interruptor", () => {
    const alternarLocal = vi.fn();
    render(<AsistenteConectores {...propsCon(alternarLocal)} />);
    fireEvent.click(screen.getByTestId("paso-1"));
    expect(screen.getByText(/Astraura 1.58 local/)).toBeInTheDocument();
    expect(screen.getByText(/capa 1.58-bit/)).toBeInTheDocument();
    expect(screen.getByText(/capa sin validar/)).toBeInTheDocument();
    expect(screen.getAllByRole("switch")).toHaveLength(3);
    fireEvent.click(screen.getByTestId("interruptor-neurona-mac"));
    expect(alternarLocal).toHaveBeenCalledWith("neurona-mac", true);
    expect(screen.getByTestId("interruptor-neurona-mac")).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByTestId("interruptor-cerebro-oracle"));
    expect(alternarLocal).toHaveBeenLastCalledWith("cerebro-oracle", false);
  });

  it("paso 2: el botón Vincular abre el enlace oficial en pestaña nueva y la clave se envía y se borra", async () => {
    const abrirEnlace = vi.fn();
    const enviarClave = vi.fn(async () => undefined);
    render(<AsistenteConectores {...propsCon(vi.fn())} abrirEnlace={abrirEnlace} enviarClave={enviarClave} />);
    fireEvent.click(screen.getByTestId("paso-2"));
    expect(screen.getByText("OpenRouter")).toBeInTheDocument();
    expect(screen.getByText(/50 al día/)).toBeInTheDocument();
    expect(screen.getByText(/variables: OPENROUTER_API_KEY/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("vincular-openrouter"));
    await waitFor(() => expect(abrirEnlace).toHaveBeenCalledWith("https://openrouter.ai/keys"));
    const campo = screen.getByTestId("clave-openrouter");
    fireEvent.change(campo, { target: { value: "clave-de-prueba" } });
    expect(screen.getByTestId("enviar-clave-openrouter")).not.toBeDisabled();
    fireEvent.click(screen.getByTestId("enviar-clave-openrouter"));
    expect(await screen.findByTestId("aviso-clave")).toHaveTextContent(/borrada del campo/);
    expect(enviarClave).toHaveBeenCalledWith("openrouter", "clave-de-prueba");
    expect(campo).toHaveValue("");
    expect(screen.queryByText("clave-de-prueba")).not.toBeInTheDocument();
  });

  it("paso 2: si la API rechaza la clave, lo dice y el campo se conserva para reintentar", async () => {
    const enviarClave = vi.fn(async () => { throw new Error("429"); });
    render(<AsistenteConectores {...propsCon(vi.fn())} enviarClave={enviarClave} />);
    fireEvent.click(screen.getByTestId("paso-2"));
    fireEvent.change(screen.getByTestId("clave-openrouter"), { target: { value: "otra-clave" } });
    fireEvent.click(screen.getByTestId("enviar-clave-openrouter"));
    expect(await screen.findByTestId("aviso-clave")).toHaveTextContent(/no aceptó la clave/);
    expect(screen.getByTestId("clave-openrouter")).toHaveValue("otra-clave");
  });

  it("paso 3: resume cada papel con la cadena elegida y su motivo, y señala los sin cadena", () => {
    render(<AsistenteConectores {...propsCon(vi.fn())} />);
    fireEvent.click(screen.getByTestId("paso-3"));
    expect(screen.getByText("escritor")).toBeInTheDocument();
    const primero = screen.getByText("Astraura 1.58 local").closest("li");
    expect(primero?.textContent).toMatch(/^1\. Astraura 1.58 local — Lo local más potente de la cuenta\.$/);
    const segundo = screen.getByText("OpenRouter").closest("li");
    expect(segundo?.textContent).toMatch(/^2\. OpenRouter — Gratis: relevo en la nube\.$/);
    expect(screen.getByText(/Sin cadena todavía/)).toBeInTheDocument();
  });
});
