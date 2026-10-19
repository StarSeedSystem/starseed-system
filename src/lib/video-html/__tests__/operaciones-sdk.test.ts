import { describe, it, expect } from "vitest";
import { operacionASdkOrder, SdkOrder } from "../operaciones-sdk";
import type { Operacion } from "@/lib/protomolecula/tipos";

describe("operacionASdkOrder", () => {
  const makeOperacion = (parametroId: string, accion: any): Operacion => ({
    id: "test-id",
    objetivo: {
      atomoId: "test-atomo",
      parametroId,
    },
    accion,
    autor: { tipo: "persona", id: "test-autor", nombre: "Test Autor" },
    origen: "mano",
    t: Date.now(),
  });

  it("should return a setText order for textContent exacta operation", () => {
    const op = makeOperacion("elemento1::textContent", { tipo: "exacta", valor: "Hello World" });
    const order = operacionASdkOrder(op);
    expect(order).toEqual({
      type: "setText",
      target: "elemento1",
      value: "Hello World",
    });
  });

  it("should return a setStyle order for style property", () => {
    const op = makeOperacion("elemento1::style.color", { tipo: "exacta", valor: "#ff0000" });
    const order = operacionASdkOrder(op);
    expect(order).toEqual({
      type: "setStyle",
      target: "elemento1",
      styles: { color: "#ff0000" },
    });
  });

  it("should return a setVariableValue order for vars property", () => {
    const op = makeOperacion("elemento1::vars.myVar", { tipo: "exacta", valor: 42 });
    const order = operacionASdkOrder(op);
    expect(order).toEqual({
      type: "setVariableValue",
      id: "myVar",
      value: 42,
    });
  });

  it("should return a setAttribute order for attribute", () => {
    const op = makeOperacion("elemento1::src", { tipo: "exacta", valor: "image.png" });
    const order = operacionASdkOrder(op);
    expect(order).toEqual({
      type: "setAttribute",
      target: "elemento1",
      name: "src",
      value: "image.png",
    });
  });

  it("should throw for GSAP property", () => {
    const op = makeOperacion("elemento1::gsapTween", { tipo: "exacta", valor: {} });
    expect(() => operacionASdkOrder(op)).toThrow(/GSAP properties are not allowed/);
  });

  it("should throw for on* property", () => {
    const op = makeOperacion("elemento1::onclick", { tipo: "exacta", valor: "alert('hi')" });
    expect(() => operacionASdkOrder(op)).toThrow(/Properties starting with "on" are not allowed/);
  });

  it("should throw for src with javascript:", () => {
    const op = makeOperacion("elemento1::src", { tipo: "exacta", valor: "javascript:alert('hi')" });
    expect(() => operacionASdkOrder(op)).toThrow(/src attribute with javascript: URL is not allowed/);
  });

  it("should throw for non-exacta action", () => {
    const op = makeOperacion("elemento1::textContent", { tipo: "relativa", cantidad: 1, modo: "delta" });
    expect(() => operacionASdkOrder(op)).toThrow(/Only exacta actions are supported/);
  });

  it("should throw for invalid parametroId", () => {
    const op = makeOperacion("invalid", { tipo: "exacta", valor: "test" });
    expect(() => operacionASdkOrder(op)).toThrow(/Invalid parametroId format/);
  });
});