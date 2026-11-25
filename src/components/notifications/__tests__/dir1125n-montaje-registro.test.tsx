// @vitest-environment jsdom
/**
 * DIR1125N · el montaje global: con la app en CUALQUIER área (aquí no hay ninguna página de Señales montada), lo que llega de
 * otra neurona entra en la bandeja y deja su entrada en el Centro de notificaciones.
 */
import { act } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MESH_INBOUND_EVENT, clearNetworkInbox, getNetworkInbox } from "@/ai/astraura/mesh/network-inbox";
import { APP_NOTIFY_EVENT } from "@/lib/notifications/app-notify";
import { RUTA_AJUSTE_CONTROL } from "@/lib/control-remoto/aviso-peticion";
import { RUTA_CONTROL } from "@/lib/notifications/registro-senales-control";
import { RegistroSenalesControlMount } from "@/components/notifications/registro-senales-control-mount";

describe("DIR1125N · montaje global del registro de señales y control", () => {
  afterEach(() => {
    cleanup();
    clearNetworkInbox();
  });

  it("la ruta del control es la del ajuste de verdad", () => {
    expect(RUTA_CONTROL).toBe(RUTA_AJUSTE_CONTROL);
  });

  it("sin abrir Señales, una llegada de otra neurona queda en la bandeja y en el Centro de notificaciones", () => {
    const vistos: Array<{ appId?: string; title?: string }> = [];
    const oir = (e: Event) => vistos.push((e as CustomEvent).detail);
    window.addEventListener(APP_NOTIFY_EVENT, oir);
    try {
      render(<RegistroSenalesControlMount />);
      act(() => {
        window.dispatchEvent(new CustomEvent(MESH_INBOUND_EVENT, { detail: { type: "message", cls: "P2", body: { text: "hola desde la Maggabook" }, at: 1 } }));
      });
      expect(getNetworkInbox()).toHaveLength(1);
      expect(vistos).toHaveLength(1);
      expect(vistos[0]).toMatchObject({ appId: "senales", title: "Mensaje de otra neurona" });
    } finally {
      window.removeEventListener(APP_NOTIFY_EVENT, oir);
    }
  });
});
