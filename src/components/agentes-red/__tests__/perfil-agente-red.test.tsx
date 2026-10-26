/**
 * Pantalla del perfil de un agente en la red (Ola 1025U · U3): la etiqueta de bot no se quita, el agente nace
 * privado, solo se vincula a entidades que existen, tiene tantos dispositivos como se quiera y se puede bloquear.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { crearAgenteMundoRef } from "@/lib/avatares/mundo/agente-mundo";
import { leerPerfilAgente, puedePublicarEn, type EntidadRed } from "@/lib/agentes-red/perfil-agente";
import { _reiniciarCacheBloqueoParaPruebas, leerReglas } from "@/lib/agentes-red/bloqueo-bots";
import { PerfilAgenteRed, PerfilAgenteRedVista, type ServiciosPerfilRed } from "../perfil-agente-red";

const AGENTE = crearAgenteMundoRef({ origen: "personalidad", idOrigen: "aurora", nombre: "Aurora", dueno: { tipo: "cuenta", id: "c1" } });

function servicios(extra: Partial<ServiciosPerfilRed> = {}): ServiciosPerfilRed {
  return {
    listarEntidades: vi.fn(async (): Promise<EntidadRed[]> => [
      { tipo: "grupo", id: "huerto", nombre: "Huerto comunal" },
      { tipo: "pagina", id: "calle-viva", nombre: "Calle Viva" },
    ]),
    comprobarEntidad: vi.fn(async (tipo, id) => (id === "existe" ? { tipo, id, nombre: "La que existe" } : null)),
    listarEscritorios: vi.fn(async () => [{ id: "esc-1", nombre: "Mi taller" }, { id: "esc-2", nombre: "Biblioteca" }]),
    ...extra,
  };
}

beforeEach(() => {
  localStorage.clear();
  _reiniciarCacheBloqueoParaPruebas();
});
afterEach(cleanup);

describe("PerfilAgenteRedVista", () => {
  it("lleva la etiqueta «Bot de IA» en la cabecera, siempre", async () => {
    render(<PerfilAgenteRedVista agente={AGENTE} servicios={servicios()} />);
    const cabecera = screen.getByRole("heading", { name: "Aurora" }).parentElement!;
    expect(within(cabecera).getByTestId("etiqueta-bot-ia")).toBeVisible();
    // sigue ahí al cambiar de visibilidad y al bloquear
    await userEvent.click(screen.getByRole("radio", { name: /Vinculado a la red/ }));
    await userEvent.click(screen.getByRole("button", { name: /Bloquear a Aurora/ }));
    expect(within(screen.getByRole("heading", { name: "Aurora" }).parentElement!).getByTestId("etiqueta-bot-ia")).toBeVisible();
  });

  it("el contrato de props se mantiene: <PerfilAgenteRed agente={…} /> pinta el perfil", () => {
    render(<PerfilAgenteRed agente={AGENTE} />);
    expect(screen.getByTestId("perfil-agente-red")).toHaveAttribute("aria-label", "Perfil en la red de Aurora");
  });

  it("nace privado y lo dice", () => {
    render(<PerfilAgenteRedVista agente={AGENTE} servicios={servicios()} />);
    expect(screen.getByRole("radio", { name: /Solo privado/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: /Vinculado a la red/ })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByTestId("aviso-privado")).toBeVisible();
  });

  it("vincular cambia el perfil guardado, y solo entonces puede publicar en esa entidad", async () => {
    const s = servicios();
    render(<PerfilAgenteRedVista agente={AGENTE} servicios={s} />);
    await userEvent.click(screen.getByRole("radio", { name: /Vinculado a la red/ }));
    await userEvent.click(screen.getByRole("button", { name: /Elegir de mis grupos/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Vincular con Huerto comunal" }));
    const perfil = leerPerfilAgente(AGENTE.id);
    expect(perfil.visibilidad).toBe("vinculado");
    expect(puedePublicarEn(perfil, { tipo: "grupo", id: "huerto" })).toBe(true);
    expect(puedePublicarEn(perfil, { tipo: "pagina", id: "calle-viva" })).toBe(false);
    expect(await screen.findByRole("list", { name: "Vínculos del agente" })).toHaveTextContent("Huerto comunal");
    // ya vinculado: deja de ofrecerse
    expect(screen.queryByRole("button", { name: "Vincular con Huerto comunal" })).toBeNull();
    // quitar el vínculo
    await userEvent.click(screen.getByRole("button", { name: /Quitar el vínculo con Huerto comunal/ }));
    expect(leerPerfilAgente(AGENTE.id).vinculos).toEqual([]);
  });

  it("en privado, los vínculos no dan permiso y la pantalla lo avisa", async () => {
    render(<PerfilAgenteRedVista agente={AGENTE} servicios={servicios()} />);
    await userEvent.click(screen.getByRole("button", { name: /Elegir de mis grupos/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Vincular con Calle Viva" }));
    const perfil = leerPerfilAgente(AGENTE.id);
    expect(perfil.vinculos).toHaveLength(1);
    expect(puedePublicarEn(perfil, { tipo: "pagina", id: "calle-viva" })).toBe(false);
    expect(screen.getByTestId("aviso-privado")).toBeVisible();
  });

  it("vincular por id comprueba que existe: un id inventado no se guarda", async () => {
    const s = servicios();
    render(<PerfilAgenteRedVista agente={AGENTE} servicios={s} />);
    await userEvent.type(screen.getByLabelText("Id de la entidad"), "inventado");
    await userEvent.click(screen.getByRole("button", { name: "Comprobar y vincular" }));
    expect(await screen.findByRole("status")).toHaveTextContent(/No existe/);
    expect(leerPerfilAgente(AGENTE.id).vinculos).toEqual([]);

    await userEvent.clear(screen.getByLabelText("Id de la entidad"));
    await userEvent.type(screen.getByLabelText("Id de la entidad"), "existe");
    await userEvent.click(screen.getByRole("button", { name: "Comprobar y vincular" }));
    await waitFor(() => expect(leerPerfilAgente(AGENTE.id).vinculos).toHaveLength(1));
    expect(leerPerfilAgente(AGENTE.id).vinculos[0]).toMatchObject({ tipo: "grupo", id: "existe" });
  });

  it("si no se pueden leer las entidades, lo dice y no inventa ninguna", async () => {
    render(<PerfilAgenteRedVista agente={AGENTE} servicios={servicios({ listarEntidades: async () => { throw new Error("sin sesión"); } })} />);
    await userEvent.click(screen.getByRole("button", { name: /Elegir de mis grupos/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/No pude leer/);
    expect(screen.queryByRole("list", { name: "Entidades que puedes vincular" })).toBeNull();
  });

  it("dispositivos virtuales: sin tope, con tipo y nombre, y cada uno se puede quitar", async () => {
    render(<PerfilAgenteRedVista agente={AGENTE} servicios={servicios()} />);
    expect(screen.getByRole("heading", { name: /Dispositivos virtuales \(0\)/ })).toBeVisible();
    for (const [i, tipo] of ["vr", "ar", "movil", "tableta", "pantalla", "vr"].entries()) {
      await userEvent.selectOptions(screen.getByLabelText("Tipo de dispositivo"), tipo);
      await userEvent.type(screen.getByLabelText("Nombre del dispositivo nuevo"), `Aparato ${i}`);
      await userEvent.click(screen.getByRole("button", { name: /Añadir dispositivo/ }));
    }
    expect(screen.getByRole("heading", { name: /Dispositivos virtuales \(6\)/ })).toBeVisible();
    expect(screen.getAllByTestId("dispositivo-virtual")).toHaveLength(6);
    expect(leerPerfilAgente(AGENTE.id).dispositivos.map((d) => d.tipo)).toEqual(["vr", "ar", "movil", "tableta", "pantalla", "vr"]);
    await userEvent.click(screen.getByRole("button", { name: "Quitar el dispositivo Aparato 0" }));
    expect(screen.getAllByTestId("dispositivo-virtual")).toHaveLength(5);
  });

  it("un dispositivo apunta a un escritorio real (referencia, no copia) y se puede renombrar", async () => {
    render(<PerfilAgenteRedVista agente={AGENTE} servicios={servicios()} />);
    await userEvent.click(screen.getByRole("button", { name: /Añadir dispositivo/ }));
    const selector = await screen.findByLabelText(/Disposición del OS de/);
    await waitFor(() => expect(within(selector).getByRole("option", { name: "Mi taller" })).toBeInTheDocument());
    await userEvent.selectOptions(selector, "esc-1");
    expect(leerPerfilAgente(AGENTE.id).dispositivos[0].disposicion).toEqual({ tipo: "escritorio", ref: "esc-1", nombre: "Mi taller" });

    const nombre = screen.getByLabelText("Nombre del dispositivo Pantalla");
    fireEvent.change(nombre, { target: { value: "Pantalla del taller" } });
    fireEvent.blur(nombre);
    expect(leerPerfilAgente(AGENTE.id).dispositivos[0].nombre).toBe("Pantalla del taller");
  });

  it("bloquear a este agente es solo de esta persona y se puede deshacer", async () => {
    render(<PerfilAgenteRedVista agente={AGENTE} servicios={servicios()} />);
    await userEvent.click(screen.getByRole("button", { name: /Bloquear a Aurora/ }));
    expect(leerReglas().bots[AGENTE.id]).toBeDefined();
    await userEvent.click(await screen.findByRole("button", { name: /Desbloquear a Aurora/ }));
    expect(leerReglas().bots[AGENTE.id]).toBeUndefined();
  });

  it("todos los botones y campos tocables miden al menos 44 px (clases de la pauta móvil)", () => {
    render(<PerfilAgenteRedVista agente={AGENTE} servicios={servicios()} />);
    const botones = [...screen.getByTestId("perfil-agente-red").querySelectorAll("button, input, select")];
    expect(botones.length).toBeGreaterThan(5);
    for (const el of botones) expect(el.className, el.outerHTML.slice(0, 80)).toMatch(/\b(min-h-11|h-11|size-11)\b/);
  });
});
