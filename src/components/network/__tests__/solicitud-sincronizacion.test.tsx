// @vitest-environment jsdom
/**
 * SolicitudSincronizacionFlotante — la ventana que ve la OTRA neurona: quién la pide, por qué vía y su
 * firma; «Recordar para futuros encuentros» marcado si es de tu cuenta; al aceptar contesta por la red
 * local; al confirmarse, «Vinculadas». Y el aviso si dice ser una neurona recordada con otra firma.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/consumo/usuario", () => ({ uidActual: async () => "u-1" }));

import { SolicitudSincronizacionFlotante } from "@/components/network/solicitud-sincronizacion";
import { __fijarMotorSyncParaPruebas, crearMotorSync, type DepsMotorSync, type MotorSync } from "@/lib/malla/sincronizacion-neuronas-motor";
import {
  CLAVE_VINCULOS_LOCAL,
  mensajeSolicitud,
  mensajeVinculada,
  type NeuronaSync,
} from "@/lib/malla/sincronizacion-neuronas";

const T = 1_800_000_000_000;
const MAC: NeuronaSync = { neurona: "mac-1", sync: "sync-mac", cuenta: "u-1", nombre: "Mac de Alex", medio: "app-nativa", capacidades: ["canal local (TCP 47071)"] };
const TAB: NeuronaSync = { neurona: "tab-1", sync: "sync-tab", cuenta: "u-1", nombre: "Tablet", capacidades: [] };

function montar(almacen = new Map<string, string>()): { motor: MotorSync; enviados: string[] } {
  const enviados: string[] = [];
  const deps: DepsMotorSync = {
    ahora: () => T,
    nuevoId: () => `id-${enviados.length}-${Math.random().toString(36).slice(2, 6)}`,
    neuronaPropia: () => TAB.neurona,
    yo: async () => TAB,
    miCuenta: async () => "u-1",
    firmar: async (m) => ({ firmado: true, huella: "id:tab", m }),
    verificar: async (s) => {
      const o = s as { firmado?: boolean; huella?: string; m?: unknown };
      return { cuerpo: o.m, huella: o.huella, valido: o.firmado === true };
    },
    nativa: {
      disponible: () => true,
      estado: async () => ({ escuchando: true, puerto: 47071, motivo: "", ultimo_seq: 0, vecinos: [] }),
      enviar: async (_ip, _p, json) => {
        enviados.push(json);
        return { ok: true, ms: 4 };
      },
    },
    transporte: {
      enviar: async () => ({ ok: false, confirmado: false, tipo: null, ms: 0 }),
      releCuenta: async () => ({ ok: false }),
      enlacesHacia: async () => [],
      enLinea: () => false,
    },
    almacen: { leer: (k) => almacen.get(k) ?? null, escribir: (k, v) => void almacen.set(k, v) },
  };
  const motor = crearMotorSync(deps);
  __fijarMotorSyncParaPruebas(motor);
  return { motor, enviados };
}

const firmado = (m: unknown, huella = "id:mac") => ({ firmado: true, huella, m: JSON.parse(JSON.stringify(m)) });

afterEach(() => {
  cleanup();
  __fijarMotorSyncParaPruebas(null);
});

describe("SolicitudSincronizacionFlotante", () => {
  test("aparece al instante con quién, vía y firma; aceptar contesta por la red local y luego dice «Vinculadas»", async () => {
    const { motor, enviados } = montar();
    render(<SolicitudSincronizacionFlotante />);
    await act(async () => {
      await motor.recibir(firmado(mensajeSolicitud({ id: "s1", de: MAC, para: { neurona: "tab-1" }, ahora: T })), {
        via: "red-local-nativa",
        ip: "192.168.1.10",
      });
    });
    const ventana = await screen.findByRole("alertdialog");
    expect(ventana.textContent).toContain("Solicitud de sincronización");
    expect(ventana.textContent).toContain("Mac de Alex");
    expect(ventana.textContent).toContain("la red local (app nativa, sin internet) · en 192.168.1.10");
    expect(ventana.textContent).toContain("Firma verificada · id:mac");
    expect(ventana.textContent).toContain("canal local (TCP 47071)");
    const casilla = screen.getByRole("checkbox", { name: /Recordar para futuros encuentros/ }) as HTMLInputElement;
    await screen.findByText(/de tu cuenta/); // la cuenta se lee después de montar
    expect(casilla.checked).toBe(true);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Aceptar" }));
    });
    await vi.waitFor(() => expect(enviados).toHaveLength(1));
    expect(JSON.parse(enviados[0]).b.m).toMatchObject({ t: "sync.respuesta", id: "s1", acepta: true, recordar: true });
    await vi.waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(await screen.findByText(/Aceptada · esperando la confirmación de Mac de Alex/)).toBeTruthy();

    await act(async () => {
      await motor.recibir(firmado(mensajeVinculada("s1", MAC, true, T)), { via: "red-local-nativa", ip: "192.168.1.10" });
    });
    const aviso = await screen.findByRole("status");
    expect(aviso.textContent).toContain("Vinculadas");
    expect(aviso.textContent).toContain("Mac de Alex");
    expect(aviso.textContent).toContain("Se recordará");
  });

  test("rechazar cierra la ventana y contesta que no", async () => {
    const { motor, enviados } = montar();
    render(<SolicitudSincronizacionFlotante />);
    await act(async () => {
      await motor.recibir(firmado(mensajeSolicitud({ id: "s2", de: MAC, para: { neurona: "tab-1" }, ahora: T })), {
        via: "red-local-nativa",
        ip: "192.168.1.10",
      });
    });
    await screen.findByRole("alertdialog");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Rechazar" }));
    });
    await vi.waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    await vi.waitFor(() => expect(enviados).toHaveLength(1));
    expect(JSON.parse(enviados[0]).b.m).toMatchObject({ t: "sync.respuesta", acepta: false });
  });

  test("avisa si dice ser una neurona recordada pero firma con otra identidad", async () => {
    const almacen = new Map<string, string>();
    almacen.set(
      CLAVE_VINCULOS_LOCAL,
      JSON.stringify({ v: 1, vinculos: [{ neurona: "mac-1", nombre: "Mac de Alex", huella: "id:mac", recordado: true, capacidades: [], creado: 1, ultimoEncuentro: 1 }] }),
    );
    const { motor } = montar(almacen);
    render(<SolicitudSincronizacionFlotante />);
    await act(async () => {
      await motor.recibir(firmado(mensajeSolicitud({ id: "s3", de: MAC, para: { neurona: "tab-1" }, ahora: T }), "id:otra"), {
        via: "red-local-nativa",
        ip: "192.168.1.66",
      });
    });
    await screen.findByRole("alertdialog");
    expect(screen.getByRole("alert").textContent).toContain("no firma con la identidad que recordabas");
  });
});
