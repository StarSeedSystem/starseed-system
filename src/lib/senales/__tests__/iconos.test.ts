import { describe, expect, it } from "vitest";
import { ICONO_DE_FAMILIA, NOMBRE_ICONO, ORDEN_ICONOS, iconoDeSenal, iconosPresentes } from "../iconos";
import { FAMILIAS } from "../mapa-3d";
import { ID_PROPIA, aparato, senal } from "../__fixtures__/vivo";

describe("un icono por TIPO de señal, sacado de lo que la señal declara", () => {
  it("por antena", () => {
    expect(iconoDeSenal(senal("lora:1", { antenna: "lora" }))).toBe("nodo-lora");
    expect(iconoDeSenal(senal("beacon:a", { antenna: "relay" }))).toBe("rele");
    expect(iconoDeSenal(senal("ip:external", { antenna: "ip" }))).toBe("red-ip");
    expect(iconoDeSenal(senal("ble:1", { antenna: "ble" }))).toBe("bluetooth");
    expect(iconoDeSenal(senal("serial:0", { antenna: "serial" }))).toBe("usb");
  });
  it("un aparato de la cuenta toma el icono de su tipo declarado", () => {
    const tipo = (deviceKind?: string) => iconoDeSenal(aparato("1", { starseed: { ...ID_PROPIA, deviceKind } }));
    expect(tipo("mobile")).toBe("movil");
    expect(tipo("tablet")).toBe("tablet");
    expect(tipo("laptop")).toBe("portatil");
    expect(tipo("desktop")).toBe("escritorio");
    expect(tipo("server")).toBe("servidor");
    expect(tipo("other")).toBe("aparato");
    expect(tipo(undefined)).toBe("aparato");
  });
  it("un enlace directo sin internet tiene el suyo, sea cual sea su antena", () => {
    expect(iconoDeSenal(senal("local:x", { antenna: "account", starseed: { via: "direct-link", sourceId: "x", name: null, ownAccount: true, capabilities: [] } }))).toBe("enlace-directo");
  });
  it("todos tienen nombre; las familias tienen su icono; la leyenda sale en orden fijo y sin repetir", () => {
    for (const i of ORDEN_ICONOS) expect(NOMBRE_ICONO[i].length).toBeGreaterThan(2);
    for (const f of FAMILIAS) expect(ORDEN_ICONOS).toContain(ICONO_DE_FAMILIA[f]);
    expect(iconosPresentes(["usb", "movil", "usb", "nodo-lora"])).toEqual(["nodo-lora", "movil", "usb"]);
    expect(new Set(ORDEN_ICONOS).size).toBe(ORDEN_ICONOS.length);
  });
});
