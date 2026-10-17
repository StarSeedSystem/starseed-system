/** Pruebas de los bots de grupo y página en PoliGenesis (BOT1011J2) en jsdom, sin red. La lista sale de
 *  `astraura_bots` con Supabase simulado; el gobierno, las propuestas y el envío se inyectan. */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import type { RolBot } from "@/lib/astraura-bots/tipos";
import { TIPOS_OPERACION } from "@/lib/genesis/operaciones";

const consulta = vi.hoisted(() => ({ tabla: "", filas: [] as Record<string, unknown>[], eq: [] as [string, unknown][] }));
vi.mock("@/utils/supabase/client", () => ({
  createClient: () => {
    const cadena = { select: () => cadena, limit: () => Promise.resolve({ data: consulta.filas, error: null }),
      eq: (columna: string, valor: unknown) => { consulta.eq.push([columna, valor]); return cadena; } };
    return { from: (tabla: string) => { consulta.tabla = tabla; return cadena; } };
  },
}));

import { BotsEntidad, botDeFila, type ServiciosBots } from "../bots-entidad";
const ENTIDAD = { tipo: "grupo" as const, id: "g-1", slug: "huerto", nombre: "Huerto" };
const FILA = { id: "b-1", nombre: "Semilla", cuenta_id: "c-1", dueno_tipo: "grupo", dueno_id: "g-1", activo: true };

function montar(rol: RolBot, democratico: boolean, opciones: { filas?: Record<string, unknown>[]; sinEnvio?: boolean } = {}) {
  consulta.filas = opciones.filas ?? [FILA]; consulta.eq = [];
  const enviar = vi.fn<ServiciosBots["enviar"]>(async () => ({ ok: true }));
  const servicios: Partial<ServiciosBots> = { modo: async () => ({ democratico }), pendientes: async () => [], ...(opciones.sinEnvio ? {} : { enviar }) };
  render(<BotsEntidad entidad={ENTIDAD} rol={rol} servicios={servicios} />);
  return enviar;
}

/** Abre el editor con el botón dado, mueve la calidez y guarda. */
async function cambiarCalidez(boton: string) {
  fireEvent.click(await screen.findByRole("button", { name: boton }));
  fireEvent.change(screen.getByLabelText("rasgo calidez"), { target: { value: "0.9" } });
  fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
}

describe("BotsEntidad", () => {
  afterEach(() => cleanup());
  it("democrático: muestra «Proponer al grupo» y el cambio va a votación", async () => {
    const enviar = montar("admin", true);
    await cambiarCalidez("Proponer al grupo");
    await waitFor(() => expect(enviar).toHaveBeenCalledTimes(1));
    const [entidad, op, como] = enviar.mock.calls[0]; expect(entidad).toEqual(ENTIDAD);
    expect(op).toMatchObject({ tipo: "bot.configurar", botId: "b-1", cambio: "personalidad" });
    expect(op.valor.personalidad?.calidez).toBe(0.9);
    expect(como).toBe("proponer");
    expect(await screen.findByText(/propuesto: se decide en Decisiones/)).toBeTruthy();
  });

  it("jerárquico con admin: aplica la operación bot.configurar", async () => {
    const enviar = montar("admin", false);
    fireEvent.click(await screen.findByRole("button", { name: "Cambiar configuración" }));
    fireEvent.change(screen.getByLabelText("Tono (0–360)"), { target: { value: "120" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(enviar).toHaveBeenCalledTimes(1));
    expect(enviar.mock.calls[0].slice(1)).toMatchObject([{ cambio: "cuerpo", valor: { cuerpo: { tono: 120 } } }, "aplicar"]);
    expect(await screen.findByText(/aplicado y anotado en el registro/)).toBeTruthy();
  });

  it("miembro en jerárquico: pide a un administrador (propuesta, no aplica)", async () => {
    const enviar = montar("miembro", false);
    expect(screen.queryByRole("button", { name: "Cambiar configuración" })).toBeNull();
    await cambiarCalidez("Pedir a un administrador");
    await waitFor(() => expect(enviar).toHaveBeenCalledTimes(1));
    expect(enviar.mock.calls[0][2]).toBe("proponer");
  });

  it("observador: sin botones de cambio ni de pausa, con el motivo", async () => {
    montar("observador", true);
    expect(await screen.findByText("Tu papel no configura el bot del grupo.")).toBeTruthy();
    for (const nombre of [/Proponer al grupo/, /Pedir a un administrador/, /Cambiar configuración/, /Pausar/, /Delegar/]) expect(screen.queryByRole("button", { name: nombre })).toBeNull();
  });

  it("pausar el bot común: visible para miembros y pide confirmación antes de aplicar", async () => {
    const enviar = montar("miembro", true);
    fireEvent.click(await screen.findByRole("button", { name: "Pausar el bot común" }));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(enviar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Pausar para todos" }));
    await waitFor(() => expect(enviar).toHaveBeenCalledTimes(1));
    expect(enviar.mock.calls[0].slice(1)).toMatchObject([{ cambio: "pausar", valor: { activo: false } }, "aplicar"]);
  });

  it("delegar en el bot (riesgo bajo) es una propuesta votable", async () => {
    const enviar = montar("miembro", true);
    fireEvent.click(await screen.findByRole("button", { name: "Delegar en el bot (riesgo bajo)" }));
    await waitFor(() => expect(enviar).toHaveBeenCalledTimes(1));
    expect(enviar.mock.calls[0].slice(1)).toMatchObject([{ cambio: "permisos", valor: { delegado: "bajo" } }, "proponer"]);
  });

  it("si el envío falla, lo dice y los botones no se quedan bloqueados", async () => {
    montar("miembro", true).mockRejectedValueOnce(new Error("sin red"));
    fireEvent.click(await screen.findByRole("button", { name: "Delegar en el bot (riesgo bajo)" }));
    expect(await screen.findByText(/No se pudo enviar: sin red/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pausar el bot común" }).hasAttribute("disabled")).toBe(false);
  });

  it("lista vacía honesta, leída de astraura_bots filtrada por dueño", async () => {
    montar("admin", false, { filas: [] });
    expect((await screen.findByTestId("bots-entidad-vacio")).textContent).toMatch(/todavía no tiene ningún bot común/);
    expect(consulta.tabla).toBe("astraura_bots");
    expect(consulta.eq).toEqual([["dueno_tipo", "grupo"], ["dueno_id", "g-1"]]);
  });

  it("sin envío inyectado, los botones siguen al vocabulario de Genesis (si falta «bot.configurar», «próximamente»)", async () => {
    montar("admin", false, { sinEnvio: true });
    await screen.findByText("Semilla");
    const conocida = (TIPOS_OPERACION as readonly string[]).includes("bot.configurar");
    expect(screen.queryByText(/próximamente: cambiar o pausar/) !== null).toBe(!conocida);
    expect(screen.queryByRole("button", { name: "Cambiar configuración" }) !== null).toBe(conocida);
  });

  it("botDeFila sanea la fila: rasgos acotados, sentidos válidos y el gobierno de la entidad", () => {
    const { bot, delegado } = botDeFila({ ...FILA, datos: { personalidad: { calidez: 7 }, sentidosHabilitados: ["red", "rayos-x"], delegado: "bajo" } }, ENTIDAD, true);
    expect(bot.personalidad.calidez).toBe(1);
    expect(bot.sentidosHabilitados).toEqual(["red"]);
    expect(bot.gobierno).toBe("democratico");
    expect(bot.dueno).toEqual({ tipo: "grupo", id: "g-1", cuentaId: "c-1" });
    expect(delegado).toBe("bajo");
  });
});
