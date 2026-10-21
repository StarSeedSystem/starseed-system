/**
 * Pruebas del diálogo de consentimiento de un sentido (BOT1011E2) en jsdom, sin red ni
 * aparato: el permiso real del dispositivo se inyecta y se simula.
 */
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PermisoDispositivo } from "@/lib/aurora/senses/request-permission";
import type { Bot, Sentido, TipoSesion } from "@/lib/astraura-bots/tipos";
import { DialogoConsentimiento } from "../dialogo-consentimiento";

function bot(origen: Bot["origen"] = "astraura"): Bot {
  return { id: "bot:luna", nombre: "Luna", origen, gobierno: "jerarquico", dueno: { tipo: "perfil", id: "p1", cuentaId: "c1" },
    personalidad: { calidez: 0.5, energia: 0.5, formalidad: 0.5, curiosidad: 0.5, humor: 0.5, concision: 0.5 },
    cuerpo: { forma: "orbe", tono: 200, escala: 1 }, sentidosHabilitados: [], activo: true };
}

function montar(opciones: { bot?: Bot; sentido?: Sentido; sesion?: TipoSesion; abierto?: boolean } = {}) {
  const onConceder = vi.fn(), onDenegar = vi.fn();
  const pedirPermiso = vi.fn(async (permiso: PermisoDispositivo) => ({ permiso, soportado: true, concedido: true }));
  render(<DialogoConsentimiento bot={opciones.bot ?? bot()} sentido={opciones.sentido ?? "microfono"}
    sesion={opciones.sesion ?? "privada"} abierto={opciones.abierto ?? true}
    onConceder={onConceder} onDenegar={onDenegar} pedirPermiso={pedirPermiso} />);
  return { onConceder, onDenegar, pedirPermiso };
}

describe("DialogoConsentimiento", () => {
  afterEach(() => cleanup());

  it("un invitado no puede pedir «hasta que lo quite»", () => {
    montar({ bot: bot("externo") });
    expect(screen.queryByLabelText("Hasta que lo quite")).toBeNull();
    expect(screen.getByLabelText("Esta sesión")).toBeTruthy();
    expect(screen.getByLabelText("Hoy")).toBeTruthy();
  });

  it("un bot propio sí puede pedir «hasta que lo quite»", () => {
    montar();
    expect(screen.getByLabelText("Hasta que lo quite")).toBeTruthy();
  });

  it("a un invitado no se le hereda «hasta que lo quite»", async () => {
    const user = userEvent.setup();
    const onConceder = vi.fn();
    const pedir = async (permiso: PermisoDispositivo) => ({ permiso, soportado: true, concedido: true });
    const { rerender } = render(<DialogoConsentimiento bot={bot()} sentido="microfono" sesion="privada" abierto
      onConceder={onConceder} onDenegar={vi.fn()} pedirPermiso={pedir} />);
    await user.click(screen.getByLabelText("Hasta que lo quite"));
    rerender(<DialogoConsentimiento bot={bot("externo")} sentido="microfono" sesion="privada" abierto
      onConceder={onConceder} onDenegar={vi.fn()} pedirPermiso={pedir} />);
    expect(screen.queryByLabelText("Hasta que lo quite")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Permitir" }));
    await waitFor(() => expect(onConceder).toHaveBeenCalled());
    expect(onConceder.mock.calls[0][0]).toMatchObject({ duracion: "sesion" });
  });

  it("«No» cierra sin otorgar", async () => {
    const user = userEvent.setup();
    const { onConceder, onDenegar, pedirPermiso } = montar();
    await user.click(screen.getByRole("button", { name: "No" }));
    expect(onConceder).not.toHaveBeenCalled();
    expect(pedirPermiso).not.toHaveBeenCalled();
    expect(onDenegar).toHaveBeenCalled();
  });

  it("Escape cierra sin otorgar", () => {
    const { onConceder, onDenegar } = montar();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onConceder).not.toHaveBeenCalled();
    expect(onDenegar).toHaveBeenCalled();
  });

  it("el diálogo dice el nombre del bot, qué verá y para qué", () => {
    montar();
    expect(screen.getByRole("dialog", { name: /Luna/ })).toBeTruthy();
    expect(screen.getByText("Qué verá")).toBeTruthy();
    expect(screen.getByText("Para qué")).toBeTruthy();
    expect(screen.getByText(/el audio del micrófono/)).toBeTruthy();
  });

  it("la casilla de permiso expreso solo aparece en sesión pública", () => {
    montar({ sesion: "privada" });
    expect(screen.queryByLabelText(/permiso expreso/i)).toBeNull();
    cleanup();
    montar({ sesion: "publica" });
    expect(screen.getByLabelText(/permiso expreso/i)).toBeTruthy();
  });

  it("«Permitir» pide el permiso real del micrófono y lo otorga", async () => {
    const user = userEvent.setup();
    const { onConceder, pedirPermiso } = montar({ sentido: "microfono" });
    await user.click(screen.getByRole("button", { name: "Permitir" }));
    await waitFor(() => expect(onConceder).toHaveBeenCalled());
    expect(pedirPermiso).toHaveBeenCalledWith("microfono");
    expect(onConceder.mock.calls[0][0]).toMatchObject({ sentido: "microfono", duracion: "sesion", expreso: false });
  });

  it("los sensores piden el permiso de movimiento", async () => {
    const user = userEvent.setup();
    const { pedirPermiso } = montar({ sentido: "sensores" });
    await user.click(screen.getByRole("button", { name: "Permitir" }));
    await waitFor(() => expect(pedirPermiso).toHaveBeenCalledWith("movimiento"));
  });

  it("si el aparato no concede el permiso no se otorga nada y se dice por qué", async () => {
    const user = userEvent.setup();
    const onConceder = vi.fn();
    render(<DialogoConsentimiento bot={bot()} sentido="camara" sesion="privada" abierto onConceder={onConceder}
      onDenegar={vi.fn()} pedirPermiso={async (permiso) => ({ permiso, soportado: true, concedido: false, motivo: "lo negaste en el navegador" })} />);
    await user.click(screen.getByRole("button", { name: "Permitir" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("lo negaste en el navegador"));
    expect(onConceder).not.toHaveBeenCalled();
  });

  it("cerrado no pinta nada", () => {
    montar({ abierto: false });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
