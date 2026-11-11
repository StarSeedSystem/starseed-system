import { describe, expect, it } from "vitest";
import { senalesDisponibles, vigilarSenalesRed, type SenalRed } from "@/lib/malla/senales-red";

describe("señales de red del sistema (MLL1111C)", () => {
  it("offline/online de window y el cambio de tipo de navigator.connection", () => {
    const win = new EventTarget();
    const conexion = Object.assign(new EventTarget(), { type: "wifi", effectiveType: "4g" });
    const vistas: SenalRed[] = [];
    const baja = vigilarSenalesRed((s) => vistas.push(s), { win, nav: { connection: conexion } });
    expect(senalesDisponibles({ win, nav: { connection: conexion } })).toEqual(["online/offline", "network-information"]);
    win.dispatchEvent(new Event("offline"));
    conexion.type = "none";
    conexion.dispatchEvent(new Event("change"));
    conexion.type = "cellular";
    conexion.dispatchEvent(new Event("change"));
    win.dispatchEvent(new Event("online"));
    expect(vistas.map((s) => s.tipo)).toEqual(["offline", "offline", "cambio", "online"]);
    expect(vistas[1].detalle).toBe("tipo=wifi/4g→none/4g");
    baja();
    win.dispatchEvent(new Event("offline"));
    expect(vistas).toHaveLength(4);
  });

  it("sin navigator.connection (WKWebView, WebKitGTK): solo online/offline; sin window, nada y sin lanzar", () => {
    const win = new EventTarget();
    expect(senalesDisponibles({ win, nav: {} })).toEqual(["online/offline"]);
    const baja = vigilarSenalesRed(() => undefined, { win: { nada: 1 }, nav: {} });
    expect(() => baja()).not.toThrow();
  });

  it("un oyente que lanza no rompe la escucha", () => {
    const win = new EventTarget();
    let n = 0;
    vigilarSenalesRed(
      () => {
        n++;
        throw new Error("x");
      },
      { win, nav: {} },
    );
    win.dispatchEvent(new Event("offline"));
    win.dispatchEvent(new Event("online"));
    expect(n).toBe(2);
  });
});
