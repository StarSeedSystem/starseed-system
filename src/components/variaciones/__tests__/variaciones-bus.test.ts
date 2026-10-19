/// <reference types="vitest" />
import { describe, it, expect, vi } from "vitest";
import {
  isVariacionesPublicasClave,
  isVariacionesPublicasWindowTab,
  VARIACIONES_PUBLICAS_WINDOW_OPEN_EVENT,
  openVariacionesPublicasWindow,
  subscribeVariacionesPublicasWindow,
  variacionesPublicasWindowHref,
  type VariacionesPublicasWindowDetail,
} from "../variaciones-bus";

// Mock window for environments without jsdom
let listeners: Map<string, Set<Function>> = new Map();
beforeEach(() => {
  listeners = new Map();
  if (typeof globalThis.window === 'undefined') {
    globalThis.window = {
      addEventListener: (type: string, listener: Function) => {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type).add(listener);
      },
      removeEventListener: (type: string, listener: Function) => {
        const set = listeners.get(type);
        if (set) {
          set.delete(listener);
          if (set.size === 0) listeners.delete(type);
        }
      },
      dispatchEvent: (event: Event) => {
        const set = listeners.get(event.type);
        if (set) {
          set.forEach(l => l.call(this, event));
        }
      }
    } as Window & typeof globalThis;
  }
});

describe("variaciones-bus (pure)", () => {
  describe("isVariacionesPublicasClave", () => {
    it.each([
      ["widget:clima", true],
      ["widget:clima#parte", true],
      ["", false],
      ["widget", false],
      [":clima", false],
      ["widget:", false],
      ["widget:clima#", false],
      ["widget:#parte", false],
    ])("clave %j -> %s", (clave, expected) => {
      expect(isVariacionesPublicasClave(clave)).toBe(expected);
    });
  });

  describe("isVariacionesPublicasWindowTab", () => {
    it.each([
      ["variaciones", true],
      ["notas", true],
      ["repos", true],
      ["fuentes", true],
      ["", false],
      ["Variaciones", false],
    ])("tab %j -> %s", (tab, expected) => {
      expect(isVariacionesPublicasWindowTab(tab)).toBe(expected);
    });
  });

  describe("variacionesPublicasWindowHref", () => {
    it("devuelve URL base", () => {
      const clave = "widget:clima";
      expect(variacionesPublicasWindowHref(clave)).toBe(`/agent/variaciones/${encodeURIComponent(clave)}`);
    });
    it("devuelve URL con tab", () => {
      const clave = "widget:clima";
      const tab = "notas";
      expect(variacionesPublicasWindowHref(clave, tab)).toBe(`/agent/variaciones/${encodeURIComponent(clave)}?tab=${encodeURIComponent(tab)}`);
    });
    it("lanza error con clave inválida", () => {
      expect(() => variacionesPublicasWindowHref("")).toThrow();
      expect(() => variacionesPublicasWindowHref("widget")).toThrow();
    });
  });
});

describe("variaciones-bus (browser)", () => {
  describe("openVariacionesPublicasWindow", () => {
    it("despacha evento con detail válido", () => {
      const spy = vi.spyOn(window, "dispatchEvent");
      try {
        openVariacionesPublicasWindow({ clave: "widget:clima", tab: "notas" });
        expect(spy).toHaveBeenCalledTimes(1);
        const call = spy.mock.calls[0][0];
        expect(call).toBeInstanceOf(CustomEvent);
        expect(call.type).toBe(VARIACIONES_PUBLICAS_WINDOW_OPEN_EVENT);
        expect(call.detail).toEqual({ clave: "widget:clima", tab: "notas" });
      } finally {
        spy.mockRestore();
      }
    });

    it("no despacha evento si la clave es inválida", () => {
      const spy = vi.spyOn(window, "dispatchEvent");
      try {
        openVariacionesPublicasWindow({ clave: "invalid" as any });
        expect(spy).not.toHaveBeenCalled();
      } finally {
        spy.mockRestore();
      }
    });

    it("no despacha evento si la tab es inválida", () => {
      const spy = vi.spyOn(window, "dispatchEvent");
      try {
        openVariacionesPublicasWindow({ clave: "widget:clima", tab: "invalid" as any });
        expect(spy).not.toHaveBeenCalled();
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe("subscribeVariacionesPublicasWindow", () => {
    it("devuelve una función de baja", () => {
      const cb = vi.fn();
      const unsubscribe = subscribeVariacionesPublicasWindow(cb);
      expect(typeof unsubscribe).toBe("function");
    });

    it("llama al callback cuando se despacha un evento válido", () => {
      const cb = vi.fn();
      const unsubscribe = subscribeVariacionesPublicasWindow(cb);
      const detail: VariacionesPublicasWindowDetail = { clave: "widget:clima", tab: "notas" };
      const event = new CustomEvent<VariacionesPublicasWindowDetail>(VARIACIONES_PUBLICAS_WINDOW_OPEN_EVENT, { detail });
      window.dispatchEvent(event);
      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenCalledWith(detail);
      unsubscribe();
    });

    it("no llama al callback si el evento tiene clave inválida", () => {
      const cb = vi.fn();
      const unsubscribe = subscribeVariacionesPublicasWindow(cb);
      const detail = { clave: "invalid", tab: "notas" };
      const event = new CustomEvent<VariacionesPublicasWindowDetail>(VARIACIONES_PUBLICAS_WINDOW_OPEN_EVENT, { detail });
      window.dispatchEvent(event);
      expect(cb).not.toHaveBeenCalled();
      unsubscribe();
    });

    it("el retorno de la función de baja elimina la suscripción", () => {
      const cb = vi.fn();
      const unsubscribe = subscribeVariacionesPublicasWindow(cb);
      const detail: VariacionesPublicasWindowDetail = { clave: "widget:clima", tab: "notas" };
      const event = new CustomEvent<VariacionesPublicasWindowDetail>(VARIACIONES_PUBLICAS_WINDOW_OPEN_EVENT, { detail });
      window.dispatchEvent(event);
      expect(cb).toHaveBeenCalledTimes(1);
      unsubscribe();
      window.dispatchEvent(event);
      expect(cb).toHaveBeenCalledTimes(1);
    });
  });
});