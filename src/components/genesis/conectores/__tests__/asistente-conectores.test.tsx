/** Pruebas del asistente «Conectar Genesis» (Ola 1019G · GCA1019M): API simulada, sin red.
 * La clave jamás aparece en el documento; el campo se borra aunque el envío falle. */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import "@testing-library/jest-dom/vitest";
import { AsistenteConectores, resumenPapeles, type ApiConectores } from "../asistente-conectores";
import type { Papel } from "@/lib/genesis/conectores/catalogo-opciones";
import type { VistaOpciones } from "@/lib/genesis/conectores/opciones-ambito";
import type { Sugerencia } from "@/lib/genesis/conectores/sugerir";

const LIMITE_OPENROUTER = { rpm: null, porDia: null, horasMes: null, almacenamientoGb: null, nota: "30 peticiones/min" };
const OPCION_GRATIS: Sugerencia = { id: "openrouter", nombre: "OpenRouter", tipo: "proveedor", papeles: ["escritor"], enlaceAlta: "https://openrouter.ai/", enlaceClave: "https://openrouter.ai/keys", limite: LIMITE_OPENROUTER, verificado: null, privacidad: "nube-sin-retencion", variables: [], motivo: "Gratis: crea tu cuenta y vincula la clave." };

const VISTA: VistaOpciones = {
  ambito: "cuenta:prueba",
  catalogo: [],
  sugerencias: [
    { clave: "local-por-activar", titulo: "Local por activar", opciones: [
      { id: "astraura-neurona", nombre: "Neurona local 1.58", tipo: "modelo", papeles: ["chat"], enlaceAlta: null, enlaceClave: null, limite: null, verificado: null, privacidad: "local", variables: [], motivo: "Capacidad local sin usar." },
    ] },
    { clave: "gratis-por-vincular", titulo: "Gratis por vincular", opciones: [OPCION_GRATIS] },
    { clave: "sin-opcion", titulo: "Sin opción", papeles: [{ papel: "voz", motivo: "No hay nada local ni gratis." }] },
  ],
  asignaciones: [{ clave: "chat", cadena: ["astraura-neurona"], respaldo: [], preferencias: { localPrimero: true, privacidad: "local", presupuesto: null } }],
};

type Llamada = { accion: "vincular"; proveedor: string; valor: string } | { accion: "asignar"; papel: Papel; cadena: string };
function apiSimulada(vista: VistaOpciones = VISTA, ok = true) {
  const llamadas: Llamada[] = [];
  const api: ApiConectores = {
    cargar: async () => vista,
    vincular: async (proveedor, valor) => { llamadas.push({ accion: "vincular", proveedor, valor }); return { ok, huella: "0123456789ab" }; },
    asignar: async (papel, cadena) => { llamadas.push({ accion: "asignar", papel, cadena }); return true; },
  };
  return { api, llamadas };
}
const asignacion = (clave: Papel, localPrimero = true): VistaOpciones["asignaciones"][number] =>
  ({ clave, cadena: [`${clave}-local`], respaldo: [], preferencias: { localPrimero, privacidad: "desconocida", presupuesto: null } });

afterEach(() => cleanup());

describe("AsistenteConectores · paso 1 (local del contexto)", () => {
  it("enseña la capacidad local y al activarla la añade a la cadena del papel", async () => {
    const { api, llamadas } = apiSimulada();
    render(<AsistenteConectores ambito="cuenta:prueba" api={api} />);
    expect(await screen.findByText(/Neurona local 1.58/)).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("switch", { name: "Activa Neurona local 1.58" }));
    await waitFor(() => expect(llamadas).toEqual([{ accion: "asignar", papel: "chat", cadena: "astraura-neurona" }]));
  });
});

describe("AsistenteConectores · paso 2 (gratis por vincular)", () => {
  it("abre el enlace oficial en pestaña nueva y envía la clave borrándola del campo", async () => {
    const { api, llamadas } = apiSimulada();
    render(<AsistenteConectores ambito="cuenta:prueba" api={api} />);
    fireEvent.click(await screen.findByRole("button", { name: "2 · Gratis por vincular" }));
    const enlace = await screen.findByRole("link", { name: "Vincular" });
    expect(enlace).toHaveAttribute("href", "https://openrouter.ai/");
    expect(enlace).toHaveAttribute("target", "_blank");
    fireEvent.change(screen.getByLabelText("Clave de OpenRouter"), { target: { value: "sk-clave-secreta" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar clave" }));
    await waitFor(() => expect(llamadas).toEqual([{ accion: "vincular", proveedor: "openrouter", valor: "sk-clave-secreta" }]));
    expect((screen.getByLabelText("Clave de OpenRouter") as HTMLInputElement).value).toBe("");
    expect(screen.getByText(/Guardada · huella 01234567/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("sk-clave-secreta");
  });

  it("con envío fallido también borra el campo y avisa sin exponer la clave", async () => {
    const { api, llamadas } = apiSimulada(VISTA, false);
    render(<AsistenteConectores ambito="cuenta:prueba" api={api} />);
    fireEvent.click(await screen.findByRole("button", { name: "2 · Gratis por vincular" }));
    fireEvent.change(await screen.findByLabelText("Clave de OpenRouter"), { target: { value: "sk-otra-clave" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar clave" }));
    await waitFor(() => expect(llamadas).toHaveLength(1));
    expect((screen.getByLabelText("Clave de OpenRouter") as HTMLInputElement).value).toBe("");
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo guardar la clave en la bóveda del ámbito.");
    expect(document.body.textContent).not.toContain("sk-otra-clave");
  });

  it("sin enlace oficial marcado lo dice en vez de inventar un enlace", async () => {
    const sinEnlace: VistaOpciones = { ...VISTA, asignaciones: [], sugerencias: [
      { clave: "gratis-por-vincular", titulo: "Gratis por vincular", opciones: [{ ...OPCION_GRATIS, enlaceAlta: null, enlaceClave: null }] },
    ] };
    const { api } = apiSimulada(sinEnlace);
    render(<AsistenteConectores ambito="cuenta:prueba" api={api} />);
    fireEvent.click(await screen.findByRole("button", { name: "2 · Gratis por vincular" }));
    expect(await screen.findByText("Sin enlace oficial marcado.")).toBeInTheDocument();
    expect(screen.getByText(/30 peticiones\/min/)).toBeInTheDocument();
    expect(screen.getByText(/sin verificar/)).toBeInTheDocument();
  });
});

describe("AsistenteConectores · paso 3 (resumen por papel)", () => {
  it("resume la cadena elegida con su motivo y avisa de los papeles sin opción", async () => {
    const { api } = apiSimulada();
    render(<AsistenteConectores ambito="cuenta:prueba" api={api} />);
    fireEvent.click(await screen.findByRole("button", { name: "3 · Resumen por papel" }));
    expect(await screen.findByText(/Chat · astraura-neurona/)).toBeInTheDocument();
    expect(screen.getByText(/Capacidad local sin usar\./)).toBeInTheDocument();
  });
});

describe("resumenPapeles (puro)", () => {
  it("usa el motivo de la primera sugerencia que cubre el papel y cae a la frase por preferencias", () => {
    expect(resumenPapeles(VISTA)[0].motivo).toBe("Capacidad local sin usar.");
    expect(resumenPapeles(VISTA)[0].cadena).toEqual(["astraura-neurona"]);
    const sinSugerencias: VistaOpciones = { ...VISTA, sugerencias: [], asignaciones: [asignacion("chat", true)] };
    expect(resumenPapeles(sinSugerencias)[0].motivo).toContain("Local primero");
    const sinLocal: VistaOpciones = { ...VISTA, sugerencias: [], asignaciones: [asignacion("chat", false)] };
    expect(resumenPapeles(sinLocal)[0].motivo).toBe("Elegida según las preferencias del ámbito.");
    expect(resumenPapeles({ ...VISTA, asignaciones: [] })).toEqual([]);
  });
});
