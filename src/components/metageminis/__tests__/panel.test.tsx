import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render as renderSolo, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { AppearanceProvider } from "@/context/appearance-context";
import { MetaGeminisPanel, type AccionesPanel, type PropsPanel } from "@/components/mando/metageminis-panel";
import { datosVacios, type Carga, type TablaId } from "@/lib/metageminis/datos";
import { borrador, pieza } from "@/lib/metageminis/datos-de-prueba";
import { DIRECTORIO } from "@/lib/metageminis/directorio";

afterEach(cleanup);
const render = (ui: React.ReactElement) => renderSolo(<AppearanceProvider>{ui}</AppearanceProvider>);

function carga(extra: Partial<Carga> = {}): Carga {
  return { datos: datosVacios(), sinTabla: [], errores: {}, sesion: true, ...extra };
}

const dueno = async () => ({ miembro: true, dueno: true });
const desarrollador = async () => ({ miembro: true, dueno: false });

function acciones(): AccionesPanel {
  return {
    decidirBorrador: vi.fn(async () => ({ ok: true })),
    decidirPieza: vi.fn(async () => ({ ok: true })),
    marcarHecho: vi.fn(async () => ({ ok: true })),
    confirmarEnlace: vi.fn(async () => ({ ok: true })),
  };
}

function panel(props: PropsPanel) {
  return render(<MetaGeminisPanel recargarCadaMs={0} hoy={new Date("2026-10-10T12:00:00Z")} {...props} />);
}

describe("MetaGeminisPanel", () => {
  it("la cuenta de un miembro llega a «Para aprobar», con el aviso de que nada sale sin aprobación", async () => {
    panel({ acceso: dueno, cargar: async () => carga({ datos: { ...datosVacios(), borradores: [borrador()] } }) });
    expect(screen.getByText(/no envía ni publica nada sin tu aprobación/)).toBeInTheDocument();
    expect(await screen.findByTestId("borrador")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Para aprobar/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /Para aprobar/ })).toHaveTextContent("1");
  });

  it("aprobar llama a la RPC de decisión y recarga", async () => {
    const a = acciones();
    const cargar = vi.fn(async () => carga({ datos: { ...datosVacios(), borradores: [borrador()] } }));
    panel({ acceso: dueno, cargar, acciones: a });
    fireEvent.click(await screen.findByRole("button", { name: /^Aprobar$/ }));
    await waitFor(() => expect(a.decidirBorrador).toHaveBeenCalledWith("b1", true));
    await waitFor(() => expect(cargar).toHaveBeenCalledTimes(2));
  });

  it("un desarrollador (no dueño) lee pero no decide", async () => {
    panel({ acceso: desarrollador, cargar: async () => carga({ datos: { ...datosVacios(), borradores: [borrador()] } }) });
    await screen.findByTestId("borrador");
    expect(screen.queryByRole("button", { name: /^Aprobar$/ })).toBeNull();
  });

  it("las piezas aparecen en «Piezas de campaña» con aprobar y descartar", async () => {
    const a = acciones();
    panel({ acceso: dueno, acciones: a, cargar: async () => carga({ datos: { ...datosVacios(), piezas: [pieza()] } }) });
    fireEvent.click(await screen.findByRole("tab", { name: /Piezas de campaña/ }));
    expect(await screen.findByTestId("pieza")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Imagen para instagram/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Aprobar$/ }));
    await waitFor(() => expect(a.decidirPieza).toHaveBeenCalledWith("p1", true));
  });

  it("si la migración no está aplicada, cada parte lo dice con claridad", async () => {
    const todas: TablaId[] = ["borradores", "piezas", "campanas", "resultados", "donaciones", "enlaces", "agentes", "hallazgos"];
    panel({ acceso: dueno, cargar: async () => carga({ sinTabla: todas }) });
    expect(await screen.findByTestId("aviso-sin-tabla")).toHaveTextContent(/metageminis_borradores/);
    fireEvent.click(screen.getByRole("tab", { name: /Piezas de campaña/ }));
    expect(await screen.findByTestId("aviso-sin-tabla")).toHaveTextContent(/metageminis_piezas/);
    fireEvent.click(screen.getByRole("tab", { name: /Resultados/ }));
    expect(await screen.findAllByTestId("aviso-sin-tabla")).toHaveLength(4);
    fireEvent.click(screen.getByRole("tab", { name: /Donaciones/ }));
    expect(await screen.findAllByTestId("aviso-sin-tabla")).toHaveLength(2);
  });

  it("un error de lectura no se confunde con una tabla que falta", async () => {
    panel({ acceso: dueno, cargar: async () => carga({ errores: { borradores: "Solo para miembros de MetaGenesis con sesión iniciada." } }) });
    expect(await screen.findByTestId("aviso-error")).toHaveTextContent(/No se pudo leer la cola/);
    expect(screen.queryByTestId("aviso-sin-tabla")).toBeNull();
  });

  it("sin sesión solo se ve el directorio y se explica por qué", async () => {
    const cargar = vi.fn(async () => carga());
    panel({ acceso: async () => null, cargar });
    expect(await screen.findByTestId("meta-sin-sesion")).toBeInTheDocument();
    expect(await screen.findByTestId("directorio-vista")).toBeInTheDocument();
    expect(screen.getAllByTestId("sitio")).toHaveLength(DIRECTORIO.length);
    fireEvent.click(screen.getByRole("tab", { name: /Para aprobar/ }));
    expect(screen.getAllByTestId("meta-sin-sesion").length).toBeGreaterThan(0);
    // Sin ser miembro no se toca la base de datos.
    expect(cargar).not.toHaveBeenCalled();
  });

  it("una cuenta que no es de MetaGenesis no lee nada de las tablas", async () => {
    const cargar = vi.fn(async () => carga());
    panel({ acceso: async () => ({ miembro: false, dueno: false }), cargar });
    expect(await screen.findByTestId("meta-no-miembro")).toBeInTheDocument();
    expect(cargar).not.toHaveBeenCalled();
  });

  it("si la sesión caduca durante la lectura, lo dice", async () => {
    panel({ acceso: dueno, cargar: async () => carga({ sesion: false }) });
    expect(await screen.findByTestId("meta-sin-sesion")).toHaveTextContent(/sin sesión iniciada/);
  });

  it("si el cargador lanza, la pantalla no se rompe", async () => {
    panel({ acceso: dueno, cargar: async () => { throw new Error("sin red"); } });
    expect(await screen.findByTestId("aviso-error")).toHaveTextContent(/sin red/);
  });

  it("si la comprobación de acceso falla, se trata como sin sesión", async () => {
    panel({ acceso: async () => { throw new Error("boom"); } });
    expect(await screen.findByTestId("meta-sin-sesion")).toBeInTheDocument();
  });

  it("«Actualizar» vuelve a leer", async () => {
    const cargar = vi.fn(async () => carga());
    panel({ acceso: dueno, cargar });
    await screen.findByText(/No hay nada esperando tu aprobación/);
    fireEvent.click(screen.getByRole("button", { name: /Volver a leer MetaGeminis/ }));
    await waitFor(() => expect(cargar).toHaveBeenCalledTimes(2));
  });

  it("puede abrirse directamente en el directorio", async () => {
    panel({ acceso: dueno, cargar: async () => carga(), seccionInicial: "directorio" });
    expect(await screen.findByTestId("directorio-vista")).toBeInTheDocument();
  });
});
