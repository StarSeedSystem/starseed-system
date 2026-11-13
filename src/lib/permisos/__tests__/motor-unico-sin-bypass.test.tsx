// @vitest-environment jsdom
// (DR1113-2) Cierra la unificación del motor de permisos: ninguna superficie
// pide permisos por su cuenta. La prueba en rojo era la de alarmas —el motor de
// alarmas pedía `Notification.requestPermission` a pelo y los paneles vivos no
// se enteraban (sin evento `starseed:permiso`).
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { EVENTO_PERMISO } from "@/lib/aurora/senses/request-permission";
import { NotificationsProvider } from "@/context/notifications-context";
import { AlarmsEngine } from "@/components/alarms/alarms-engine";
import { requestMaxAccess } from "@/lib/aurora/capabilities";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("motor de alarmas: permiso por el motor unificado", () => {
  it("al montar con permiso «default», emite starseed:permiso (los paneles vivos se enteran)", async () => {
    vi.stubGlobal("Notification", {
      permission: "default",
      requestPermission: () => Promise.resolve("granted"),
    });
    const vistos: string[] = [];
    window.addEventListener(EVENTO_PERMISO, (e) => {
      vistos.push((e as CustomEvent<{ permiso?: string }>).detail?.permiso ?? "");
    });
    render(
      <NotificationsProvider>
        <AlarmsEngine />
      </NotificationsProvider>,
    );
    await waitFor(() => expect(vistos).toContain("notificaciones"));
  });
});

describe("requestMaxAccess: el sondeo de micro pasa por el motor (caracterización)", () => {
  it("pide el stream, lo suelta y reporta granted", async () => {
    const stop = vi.fn();
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: () => Promise.resolve({ getTracks: () => [{ stop }] }),
      },
      permissions: { query: () => Promise.resolve({ state: "prompt" }) },
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)",
    });
    const r = await requestMaxAccess();
    expect(r.mic).toBe("granted");
    expect(stop).toHaveBeenCalled();
  });
});
