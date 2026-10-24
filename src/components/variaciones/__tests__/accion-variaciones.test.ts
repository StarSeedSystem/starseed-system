import { describe, it, expect } from "vitest";
import { Layers } from "lucide-react";
import {
  accionVariaciones, claveDeItemBiblioteca, ETIQUETA_VARIACIONES,
  type ItemBibliotecaParaClave,
} from "../accion-variaciones";
import { VARIACIONES_ABRIR_EVENTO, type DetalleVariaciones } from "../variaciones-bus";

describe("accionVariaciones", () => {
  it("devuelve la entrada del menú con su etiqueta, icono y onClick", () => {
    const a = accionVariaciones("widget:clima", { nombre: "Clima" });
    expect(a.label).toBe(ETIQUETA_VARIACIONES);
    expect(a.label).toBe("Variaciones públicas");
    expect(a.icon).toBe(Layers);
    expect(typeof a.onClick).toBe("function");
  });

  it("onClick abre la ventana en el destino inyectado (sin tocar window)", () => {
    const destino = new EventTarget();
    const recibidos: DetalleVariaciones[] = [];
    destino.addEventListener(VARIACIONES_ABRIR_EVENTO, (e) => {
      const d = (e as CustomEvent<DetalleVariaciones | null>).detail;
      if (d) recibidos.push(d);
    });
    accionVariaciones("widget:clima", { nombre: "Clima" }, destino).onClick();
    expect(recibidos).toEqual([{ clave: "widget:clima", opciones: { nombre: "Clima" } }]);
  });

  it("sin destino (servidor y pruebas node) no lanza y no abre nada", () => {
    expect(typeof window).toBe("undefined");
    expect(() => accionVariaciones("widget:clima").onClick()).not.toThrow();
  });

  it("una clave que no pasa la validación nunca rompe el menú", () => {
    const destino = new EventTarget();
    const recibidos: DetalleVariaciones[] = [];
    destino.addEventListener(VARIACIONES_ABRIR_EVENTO, (e) => {
      const d = (e as CustomEvent<DetalleVariaciones | null>).detail;
      if (d) recibidos.push(d);
    });
    expect(() => accionVariaciones("Widget:Clima", {}, destino).onClick()).not.toThrow();
    expect(recibidos).toEqual([]);
  });
});

describe("claveDeItemBiblioteca", () => {
  const de = (item: ItemBibliotecaParaClave | null) => claveDeItemBiblioteca(item);

  it("los paquetes llevan su ficha de catálogo como clave", () => {
    expect(de({ type: "package", refId: "app-navegador" })).toBe("paquete:app-navegador");
  });

  it("un identificador que no es canónico no crea clave", () => {
    expect(de({ type: "package", refId: "Material Vintage" })).toBeNull();
    expect(de({ type: "package" })).toBeNull();
  });

  it("las rutas internas de una tramo limpio son la app que abren", () => {
    expect(de({ type: "route", route: "/red-mesh" })).toBe("app:red-mesh");
    expect(de({ type: "route", route: "/agent?tab=x" })).toBe("app:agent");
  });

  it("rutas con tramos anidados, vacías o de otros tipos, no tienen clave estable", () => {
    expect(de({ type: "route", route: "/network/politics" })).toBeNull();
    expect(de({ type: "route", route: "" })).toBeNull();
    expect(de({ type: "route" })).toBeNull();
    expect(de({ type: "file", url: "https://x.example/a.png" })).toBeNull();
    expect(de({ type: "alias", targetItemId: "otro" })).toBeNull();
    expect(de({ type: "contact", route: "/contactos?c=1" })).toBeNull();
    expect(de(null)).toBeNull();
  });

  it("una rama toma la clave del recurso que refleja", () => {
    expect(de({ type: "branch", refKind: "package", refId2: "app-navegador" })).toBe("paquete:app-navegador");
    expect(de({ type: "branch", refKind: "route", route: "/red-mesh" })).toBe("app:red-mesh");
    expect(de({ type: "branch" })).toBeNull();
  });
});
