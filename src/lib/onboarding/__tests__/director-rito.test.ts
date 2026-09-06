/**
 * Tests del director del rito (Ola 247 · 2026-09-05).
 *
 * POR QUÉ en entorno node con `window` simulado: el director se escribió sin
 * React ni Next precisamente para poder probarse así. Cada `beforeEach`
 * reinstala un `window` con un `sessionStorage` en memoria para que ningún
 * test herede estado del anterior (el rito intentó cargarse en cadena).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  CLAVE_RITO,
  ETAPAS,
  CADUCIDAD_MS,
  abandonarRito,
  esMiTurno,
  etapaActual,
  iniciarRito,
  migrarMarcasLegadas,
  navegarSuave,
  suscribirRito,
  terminarEtapa,
  type EtapaRito,
} from "../director-rito";

/** sessionStorage mínimo pero fiel: Map + API de Storage. */
function crearStorageFalso(): Storage {
  const mapa = new Map<string, string>();
  return {
    get length() {
      return mapa.size;
    },
    clear: () => mapa.clear(),
    getItem: (k: string) => (mapa.has(k) ? (mapa.get(k) as string) : null),
    key: (i: number) => Array.from(mapa.keys())[i] ?? null,
    removeItem: (k: string) => {
      mapa.delete(k);
    },
    setItem: (k: string, v: string) => {
      mapa.set(k, String(v));
    },
  };
}

interface VentanaFalsa {
  sessionStorage: Storage;
  location: { pathname: string; assign: (p: string) => void };
  addEventListener: (tipo: string, cb: EventListener) => void;
  removeEventListener: (tipo: string, cb: EventListener) => void;
  dispatchEvent: (ev: Event) => boolean;
  setTimeout: typeof setTimeout;
  listeners: Map<string, Set<EventListener>>;
}

let ventana: VentanaFalsa;

function instalarVentanaFalsa(): void {
  const listeners = new Map<string, Set<EventListener>>();
  ventana = {
    sessionStorage: crearStorageFalso(),
    location: { pathname: "/bienvenida", assign: vi.fn() },
    addEventListener: (tipo, cb) => {
      if (!listeners.has(tipo)) listeners.set(tipo, new Set());
      listeners.get(tipo)?.add(cb);
    },
    removeEventListener: (tipo, cb) => {
      listeners.get(tipo)?.delete(cb);
    },
    dispatchEvent: (ev: Event) => {
      for (const cb of listeners.get(ev.type) ?? []) cb(ev);
      return true;
    },
    // Delega en el momento de la llamada: así honra los temporizadores falsos
    // de vitest aunque se activen DESPUÉS de instalar la ventana.
    setTimeout: ((cb: () => void, ms?: number) => setTimeout(cb, ms)) as typeof setTimeout,
    listeners,
  };
  vi.stubGlobal("window", ventana);
  vi.stubGlobal("CustomEvent", class CustomEventFalso<T> extends Event {
    detail: T;
    constructor(tipo: string, init?: CustomEventInit<T>) {
      super(tipo);
      this.detail = init?.detail as T;
    }
  });
}

beforeEach(() => {
  instalarVentanaFalsa();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("director del rito — máquina de estados", () => {
  it("(1) sin rito en curso, etapaActual() es null", () => {
    expect(etapaActual()).toBeNull();
  });

  it("(2) iniciarRito() deja el rito en «bienvenida» y marca al recién registrado", () => {
    iniciarRito();
    expect(etapaActual()).toBe("bienvenida");
    expect(ventana.sessionStorage.getItem("starseed.recien.registrado")).toBe("1");
    expect(esMiTurno("bienvenida")).toBe(true);
    expect(esMiTurno("perfil")).toBe(false);
  });

  it("(3) terminarEtapa avanza por el orden: bienvenida → sistemas → perfil → guia → hecho", () => {
    iniciarRito();
    expect(terminarEtapa("bienvenida")).toBe("sistemas");
    expect(etapaActual()).toBe("sistemas");
    expect(terminarEtapa("sistemas")).toBe("perfil");
    expect(terminarEtapa("perfil")).toBe("guia");
    expect(terminarEtapa("guia")).toBe("hecho");
    expect(etapaActual()).toBe("hecho");
  });

  it("(4) terminarEtapa con una etapa que NO es la actual no cambia nada", () => {
    iniciarRito();
    terminarEtapa("bienvenida"); // ahora: sistemas
    // Una ventana de perfil que se cierra tarde no debe romper el orden:
    expect(terminarEtapa("perfil")).toBe("sistemas");
    expect(etapaActual()).toBe("sistemas");
  });

  it("(5) migración: solo «starseed.guia.tras.perfil» → etapa «guia» y la marca desaparece", () => {
    ventana.sessionStorage.setItem("starseed.guia.tras.perfil", "1");
    expect(migrarMarcasLegadas()).toBe("guia");
    expect(ventana.sessionStorage.getItem("starseed.guia.tras.perfil")).toBeNull();
    // Y la migración persiste: etapaActual ya no necesita la marca vieja.
    expect(etapaActual()).toBe("guia");
    expect(ventana.sessionStorage.getItem(CLAVE_RITO)).not.toBeNull();
  });

  it("(6) suscribirRito recibe la etapa nueva al avanzar y deja de recibir al desuscribir", () => {
    const recibidas: (EtapaRito | null)[] = [];
    const off = suscribirRito((etapa) => recibidas.push(etapa));
    iniciarRito();
    terminarEtapa("bienvenida");
    expect(recibidas).toEqual(["bienvenida", "sistemas"]);
    off();
    terminarEtapa("sistemas");
    expect(recibidas).toEqual(["bienvenida", "sistemas"]);
  });

  it("(7) navegarSuave llama a push una vez y NO recarga si la ruta cambia a tiempo", () => {
    vi.useFakeTimers();
    const push = vi.fn((p: string) => {
      // El router de verdad cambia la ruta; lo simulamos aquí:
      ventana.location.pathname = p;
    });
    navegarSuave({ push }, "/escritorios", 1500);
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/escritorios");
    vi.advanceTimersByTime(2000);
    expect(ventana.location.assign).not.toHaveBeenCalled();
  });

  it("(7b) navegarSuave usa assign como último recurso si el push no cambió la ruta", () => {
    vi.useFakeTimers();
    const push = vi.fn(); // modal encima: el push se pierde en silencio
    navegarSuave({ push }, "/escritorios", 1500);
    vi.advanceTimersByTime(2000);
    expect(ventana.location.assign).toHaveBeenCalledWith("/escritorios");
  });

  it("(7c) navegarSuave no hace nada si ya estamos en la ruta destino", () => {
    const push = vi.fn();
    ventana.location.pathname = "/escritorios";
    navegarSuave({ push }, "/escritorios");
    expect(push).not.toHaveBeenCalled();
  });

  it("abandonarRito borra el estado y las marcas legadas", () => {
    iniciarRito();
    ventana.sessionStorage.setItem("starseed.guia.pendiente", "1");
    abandonarRito();
    expect(etapaActual()).toBeNull();
    expect(ventana.sessionStorage.getItem(CLAVE_RITO)).toBeNull();
    expect(ventana.sessionStorage.getItem("starseed.recien.registrado")).toBeNull();
    expect(ventana.sessionStorage.getItem("starseed.guia.pendiente")).toBeNull();
  });

  it("las etapas declaradas son las seis del rito, en orden", () => {
    expect(ETAPAS).toEqual(["registro", "bienvenida", "sistemas", "perfil", "guia", "hecho"]);
  });

  it("(8) un rito de hace más de CADUCIDAD_MS caduca: etapaActual() null y el estado desaparece", () => {
    // Fijamos el reloj para que Date.now() sea determinista.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-06T12:00:00Z"));
    // Estado escrito hace 7 h (> 6 h): un alta a medias de ayer.
    ventana.sessionStorage.setItem(
      CLAVE_RITO,
      JSON.stringify({ etapa: "guia", t: Date.now() - (7 * 60 * 60 * 1000) }),
    );
    expect(etapaActual()).toBeNull();
    // El estado caducado se borró: la clave ya no existe.
    expect(ventana.sessionStorage.getItem(CLAVE_RITO)).toBeNull();
    vi.useRealTimers();
  });

  it("(8b) un rito reciente (menos de CADUCIDAD_MS) sigue vivo y no se borra", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-06T12:00:00Z"));
    ventana.sessionStorage.setItem(
      CLAVE_RITO,
      JSON.stringify({ etapa: "guia", t: Date.now() - (60 * 60 * 1000) }), // hace 1 h
    );
    expect(etapaActual()).toBe("guia");
    expect(ventana.sessionStorage.getItem(CLAVE_RITO)).not.toBeNull();
    vi.useRealTimers();
  });
});
