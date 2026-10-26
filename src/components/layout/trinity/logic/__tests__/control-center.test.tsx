/**
 * El Centro de Control rediseñado (Ola 1025U): cabecera con el estado del aparato, barra de secciones
 * navegable con teclado, accesos con estado, organizador (orden y ocultas), enlaces reales y la franja
 * de grabación. Todo lo que habla con el exterior (cuenta, apariencia, notificaciones, grabadora) va
 * simulado; lo que se prueba es lo que la persona ve y puede hacer.
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crearControlador } from "@/lib/grabacion/controlador";
import { GrabadorFalso, depsFalsas, type DepsFalsas } from "@/lib/grabacion/falsos-prueba";
import type { Controlador } from "@/lib/grabacion/controlador";
import { CONTROL_CENTER_NAVIGATE_EVENT } from "../../control-center-events";
import { ControlCenter, IDS_SECCIONES } from "../../control-center";
import { ORDEN_POR_DEFECTO } from "../orden-modulos";
import { GRUPOS_SISTEMA } from "../datos-sistema";

const h = vi.hoisted(() => ({
  push: undefined as unknown as (href: string) => void,
  setActiveEdge: undefined as unknown as (edge: string | null) => void,
  setTheme: undefined as unknown as (t: string) => void,
  theme: "dark",
  sesion: true,
  inbox: [] as Array<{ id: string; title: string; body?: string; category: string; read: boolean; createdAt: string }>,
  controlador: null as unknown as Controlador,
}));

/* ── Apariencia: un almacén con suscripción, para que ocultar y reordenar repinten ── */
const almacen = vi.hoisted(() => {
  const inicial = (): Record<string, unknown> => ({
    themeStore: { activeMode: "primary" },
    styling: { crystalPreset: "none", opacity: 0.65 },
    background: { type: "living", living: { variant: "aurora", intensity: 0.7 }, overlayOpacity: 0.1 },
    controlCenter: { moduleOrder: ["system", "quick", "home", "notif"], hiddenModules: [] },
  });
  let config = inicial();
  const subs = new Set<() => void>();
  return {
    get: () => config,
    reiniciar: (parche: Record<string, unknown> = {}) => {
      config = { ...inicial(), ...parche };
      subs.forEach((f) => f());
    },
    fijar: (c: Record<string, unknown>) => {
      config = c;
      subs.forEach((f) => f());
    },
    suscribir: (f: () => void) => {
      subs.add(f);
      return () => subs.delete(f);
    },
  };
});

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: (href: string) => h.push(href) }) }));
vi.mock("@/context/perimeter-context", () => ({ usePerimeter: () => ({ activeEdge: "logic", setActiveEdge: (e: string | null) => h.setActiveEdge(e) }) }));
vi.mock("@/context/appearance-context", async () => {
  const React = await import("react");
  const updateSection = (seccion: string, parche: Record<string, unknown>) => {
    const actual = almacen.get();
    almacen.fijar({ ...actual, [seccion]: { ...(actual[seccion] as object), ...parche } });
  };
  return {
    useAppearance: () => {
      const config = React.useSyncExternalStore(almacen.suscribir, almacen.get, almacen.get);
      return { config, updateSection };
    },
  };
});
vi.mock("@/context/notifications-context", () => ({
  useNotifications: () => ({
    inbox: h.inbox,
    unreadCount: h.inbox.filter((n) => !n.read).length,
    markRead: () => {},
    clearAll: () => {},
    archive: () => {},
  }),
}));
vi.mock("next-themes", () => ({ useTheme: () => ({ theme: h.theme, setTheme: (t: string) => h.setTheme(t) }) }));
vi.mock("@/lib/settings-sync", () => ({
  hasStarseedSession: () => Promise.resolve(h.sesion),
  pushPreferences: vi.fn(async () => ({ ok: true, message: "" })),
}));
vi.mock("@/lib/sync/realtime-sync", () => ({
  getRealtimeSyncStatus: () => ({ state: "connected", lastChangeAt: null }),
  onRealtimeSyncStatus: () => () => {},
}));
vi.mock("@/lib/aurora/tts-oss/voice-config", () => ({
  getVoiceConfig: () => ({ engine: "browser" }),
  subscribeVoiceConfig: () => () => {},
}));
vi.mock("@/lib/astraura/config-ui", () => ({ openAstrauraConfig: vi.fn() }));
vi.mock("@/lib/astraura/neuron-persona-systems", () => ({
  ALL_PERSONAS: [],
  resolvePersonaSystems: () => ({
    llm: { provenance: "auto" },
    astraura: { modo: "auto" },
    voz: { motor: "browser" },
    cerebro: { usarMemorias: true, nivelContexto: "breve" },
    senales: { porAntena: {} },
  }),
  subscribeNeuronPersona: () => () => {},
}));
vi.mock("@/lib/neurons/neurons", () => ({ thisDeviceId: () => "dispositivo-1" }));
vi.mock("@/lib/neurons/medio", () => ({ describirMedio: () => ({ id: "m1", tipo: "navegador", etiqueta: "Chrome 154 · app instalada" }) }));
vi.mock("@/components/connectivity/connections-center", () => ({ ConnectionsCenter: () => <div data-testid="conexiones-simulado">Centro de conexiones</div> }));
vi.mock("@/lib/grabacion/global", async () => {
  const real = await vi.importActual<typeof import("@/lib/grabacion/global")>("@/lib/grabacion/global");
  return { ...real, controladorGlobal: () => h.controlador };
});

let deps: DepsFalsas;

function nav(): Navigator {
  return navigator;
}

beforeEach(() => {
  h.push = vi.fn() as never;
  h.setActiveEdge = vi.fn() as never;
  h.setTheme = vi.fn() as never;
  h.theme = "dark";
  h.sesion = true;
  h.inbox = [];
  almacen.reiniciar();
  GrabadorFalso.reiniciar(["video/webm;codecs=vp9,opus", "video/webm;codecs=vp9", "video/webm"]);
  deps = depsFalsas();
  h.controlador = crearControlador(deps);
  vi.spyOn(performance, "now").mockImplementation(() => deps.reloj.ahora);
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query.includes("reduced-motion"),
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent: () => false,
    }),
  });
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as never;
  try {
    window.localStorage.clear();
  } catch {
    /* sin almacenamiento */
  }
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete (nav() as unknown as Record<string, unknown>).getBattery;
});

const tablist = () => screen.getByRole("tablist", { name: "Secciones del Centro de Control" });
const pestanas = () => within(tablist()).getAllByRole("tab");
const nombres = () => pestanas().map((t) => t.textContent?.replace(/\s*,\s*\d+ sin leer$/, "").trim());
const seleccionada = () => pestanas().find((t) => t.getAttribute("aria-selected") === "true")?.textContent?.trim();

/** Radix mueve el foco en un `setTimeout`: se deja pasar una vuelta de reloj dentro de `act`. */
async function tecla(el: Element, key: string) {
  await act(async () => {
    fireEvent.keyDown(el, { key });
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function montar() {
  const r = render(<ControlCenter />);
  // Deja que se resuelvan la sesión y los import() perezosos del arranque.
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
  return r;
}

describe("Centro de Control · cabecera y estado del aparato", () => {
  it("tiene el nombre, la X común con su etiqueta y título, y cierra", async () => {
    await montar();
    expect(screen.getByTestId("control-center")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Centro de Control" })).toBeTruthy();
    const x = screen.getByRole("button", { name: "Cerrar el Centro de Control" });
    expect(x.getAttribute("title")).toBe("Cerrar el Centro de Control (Esc)");
    fireEvent.click(x);
    expect(h.setActiveEdge).toHaveBeenCalledWith(null);
  });

  it("muestra red, neurona y sesión; sin batería no inventa un chip de batería", async () => {
    await montar();
    const chips = screen.getByTestId("chips-estado");
    expect(within(chips).getByText("En línea")).toBeTruthy();
    expect(within(chips).getByText("Esta neurona")).toBeTruthy();
    expect(within(chips).getByText("Sesión activa")).toBeTruthy();
    expect(chips.querySelector('[data-chip="bateria"]')).toBeNull();
  });

  it("con batería (Chromium) añade el chip con el porcentaje", async () => {
    Object.defineProperty(nav(), "getBattery", {
      configurable: true,
      value: () => Promise.resolve({ level: 0.82, charging: true, addEventListener() {}, removeEventListener() {} }),
    });
    await montar();
    const chips = screen.getByTestId("chips-estado");
    expect(within(chips).getByText("82 %")).toBeTruthy();
    expect(chips.querySelector('[data-chip="bateria"]')?.textContent).toContain("cargando");
  });

  it("sin sesión lo dice, y el acceso de sincronizar pasa a «Iniciar sesión» (a /login)", async () => {
    h.sesion = false;
    await montar();
    expect(within(screen.getByTestId("chips-estado")).getByText("Sin sesión")).toBeTruthy();
    fireEvent.click(screen.getByTestId("pildora-sincronizar"));
    expect(h.push).toHaveBeenCalledWith("/login");
  });

  it("al perder la conexión el chip cambia a «Sin conexión»", async () => {
    await montar();
    Object.defineProperty(nav(), "onLine", { configurable: true, get: () => false });
    await act(async () => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(within(screen.getByTestId("chips-estado")).getByText("Sin conexión")).toBeTruthy();
    Object.defineProperty(nav(), "onLine", { configurable: true, get: () => true });
  });
});

describe("Centro de Control · secciones y teclado", () => {
  it("las seis secciones salen en el orden nuevo y se abre en Inicio", async () => {
    await montar();
    expect(nombres()).toEqual(["Inicio", "Grabar", "Atmósfera", "Conexiones", "Alertas", "Sistema"]);
    expect(seleccionada()).toBe("Inicio");
    expect(screen.getByTestId("seccion-inicio")).toBeTruthy();
  });

  it("el catálogo y el orden de fábrica tienen los mismos ids", () => {
    expect([...IDS_SECCIONES].sort()).toEqual([...ORDEN_POR_DEFECTO].sort());
  });

  it("un orden que eligió la persona se respeta (y lo nuevo va al final)", async () => {
    almacen.reiniciar({ controlCenter: { moduleOrder: ["notif", "quick", "home", "system", "conexiones"], hiddenModules: [] } });
    await montar();
    expect(nombres()).toEqual(["Alertas", "Inicio", "Atmósfera", "Sistema", "Conexiones", "Grabar"]);
    // Se abre en Inicio aunque no sea la primera.
    expect(seleccionada()).toBe("Inicio");
  });

  it("flechas, Inicio y Fin mueven por las pestañas y activan la sección", async () => {
    await montar();
    const [inicio] = pestanas();
    inicio.focus();
    await tecla(inicio, "ArrowRight");
    expect(seleccionada()).toBe("Grabar");
    expect(screen.getByTestId("seccion-grabar")).toBeTruthy();
    await tecla(document.activeElement as Element, "End");
    expect(seleccionada()).toBe("Sistema");
    expect(screen.getByTestId("seccion-sistema")).toBeTruthy();
    await tecla(document.activeElement as Element, "Home");
    expect(seleccionada()).toBe("Inicio");
    await tecla(document.activeElement as Element, "ArrowLeft");
    expect(seleccionada()).toBe("Sistema"); // da la vuelta
  });

  it("al tabular hasta la barra, el foco cae en la sección activa", async () => {
    await montar();
    tablist().focus();
    expect(document.activeElement).toBe(pestanas()[0]);
    expect(document.activeElement?.getAttribute("aria-selected")).toBe("true");
  });

  it("cada sección abre su contenido", async () => {
    await montar();
    const ir = (nombre: string) => fireEvent.mouseDown(pestanas().find((t) => t.textContent?.trim() === nombre) as Element, { button: 0 });
    ir("Atmósfera");
    expect(screen.getByTestId("seccion-atmosfera")).toBeTruthy();
    ir("Conexiones");
    expect(screen.getByTestId("conexiones-simulado")).toBeTruthy();
    ir("Alertas");
    expect(screen.getByTestId("seccion-alertas")).toBeTruthy();
    expect(screen.getByText("Sin notificaciones nuevas")).toBeTruthy();
    ir("Sistema");
    expect(screen.getByTestId("seccion-sistema")).toBeTruthy();
    ir("Inicio");
    expect(screen.getByTestId("seccion-inicio")).toBeTruthy();
  });

  it("las alertas sin leer se ven como número sobre la pestaña y lo oyen los lectores de pantalla", async () => {
    h.inbox = [
      { id: "1", title: "Hola", category: "system", read: false, createdAt: new Date().toISOString() },
      { id: "2", title: "Dos", category: "ai", read: false, createdAt: new Date().toISOString() },
      { id: "3", title: "Leída", category: "system", read: true, createdAt: new Date().toISOString() },
    ];
    await montar();
    const alertas = pestanas().find((t) => t.textContent?.includes("Alertas")) as HTMLElement;
    expect(alertas.textContent).toContain("2");
    expect(alertas.textContent).toContain("2 sin leer");
  });

  it("el evento de navegación lleva a una sección visible y se ignora si está oculta", async () => {
    almacen.reiniciar({ controlCenter: { moduleOrder: [...ORDEN_POR_DEFECTO], hiddenModules: ["notif"] } });
    await montar();
    await act(async () => {
      window.dispatchEvent(new CustomEvent(CONTROL_CENTER_NAVIGATE_EVENT, { detail: { tab: "home" } }));
    });
    expect(seleccionada()).toBe("Atmósfera");
    await act(async () => {
      window.dispatchEvent(new CustomEvent(CONTROL_CENTER_NAVIGATE_EVENT, { detail: { tab: "notif" } }));
    });
    expect(seleccionada()).toBe("Atmósfera");
  });
});

describe("Centro de Control · accesos rápidos con estado", () => {
  it("Tema es un interruptor que dice Oscuro/Claro y cambia el tema", async () => {
    await montar();
    const tema = screen.getByTestId("pildora-tema");
    expect(tema.getAttribute("aria-pressed")).toBe("true");
    expect(tema.textContent).toContain("Oscuro");
    fireEvent.click(tema);
    expect(h.setTheme).toHaveBeenCalledWith("light");
  });

  it("con tema claro el interruptor está apagado y dice Claro", async () => {
    h.theme = "light";
    await montar();
    const tema = screen.getByTestId("pildora-tema");
    expect(tema.getAttribute("aria-pressed")).toBe("false");
    expect(tema.textContent).toContain("Claro");
  });

  it("Grabar y Conexiones llevan a su sección", async () => {
    await montar();
    fireEvent.click(screen.getByTestId("pildora-conexiones"));
    expect(seleccionada()).toBe("Conexiones");
    fireEvent.mouseDown(pestanas()[0], { button: 0 });
    fireEvent.click(screen.getByTestId("pildora-grabar"));
    expect(seleccionada()).toBe("Grabar");
  });

  it("el rendimiento es un selector de tres opciones y recuerda la elegida", async () => {
    await montar();
    const grupo = screen.getByRole("radiogroup", { name: "Rendimiento" });
    const eco = within(grupo).getByRole("radio", { name: /Eco/ });
    fireEvent.click(eco);
    expect(eco.getAttribute("aria-checked")).toBe("true");
    expect(window.localStorage.getItem("starseed.perf.v1")).toBe("eco");
  });

  it("Ajustes completos y Aurora llevan a páginas que existen y cierran el panel", async () => {
    await montar();
    fireEvent.click(screen.getByTestId("fila-ajustes"));
    expect(h.push).toHaveBeenLastCalledWith("/cuenta");
    fireEvent.click(screen.getByTestId("fila-aurora"));
    expect(h.push).toHaveBeenLastCalledWith("/cuenta?section=aurora-voz");
  });

  it("«Atmósfera del fondo» abre la sección Atmósfera", async () => {
    await montar();
    fireEvent.click(screen.getByTestId("fila-atmosfera"));
    expect(seleccionada()).toBe("Atmósfera");
  });
});

describe("Centro de Control · Sistema", () => {
  it("cada entrada lleva a su destino real", async () => {
    await montar();
    fireEvent.mouseDown(pestanas().find((t) => t.textContent?.trim() === "Sistema") as Element, { button: 0 });
    for (const e of GRUPOS_SISTEMA.flatMap((g) => g.entradas)) {
      fireEvent.click(screen.getByTestId(`sistema-${e.id}`));
      expect(h.push).toHaveBeenLastCalledWith(e.href);
    }
    expect(h.push).toHaveBeenCalledWith("/cuenta?section=datos-privacidad");
    expect(h.push).not.toHaveBeenCalledWith("/settings/privacy");
  });
});

describe("Centro de Control · organizar las secciones", () => {
  const abrir = async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Organizar las secciones" }));
    return screen.getByTestId("organizador-secciones");
  };

  it("ocultar una sección la quita de la barra y se puede volver a mostrar", async () => {
    const org = await abrir();
    fireEvent.click(within(org).getByRole("button", { name: "Ocultar Atmósfera" }));
    expect(nombres()).not.toContain("Atmósfera");
    expect((almacen.get().controlCenter as { hiddenModules: string[] }).hiddenModules).toEqual(["home"]);
    fireEvent.click(within(org).getByRole("button", { name: "Mostrar Atmósfera" }));
    expect(nombres()).toContain("Atmósfera");
  });

  it("subir y bajar cambian el orden de la barra", async () => {
    const org = await abrir();
    fireEvent.click(within(org).getByRole("button", { name: "Subir Grabar" }));
    expect(nombres().slice(0, 2)).toEqual(["Grabar", "Inicio"]);
    expect((within(org).getByRole("button", { name: "Subir Grabar" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(org).getByRole("button", { name: "Bajar Grabar" }));
    expect(nombres().slice(0, 2)).toEqual(["Inicio", "Grabar"]);
  });

  it("nunca se puede ocultar la última sección: avisa y deja una", async () => {
    const org = await abrir();
    for (const n of ["Grabar", "Atmósfera", "Conexiones", "Alertas", "Sistema"]) {
      fireEvent.click(within(org).getByRole("button", { name: `Ocultar ${n}` }));
    }
    expect(nombres()).toEqual(["Inicio"]);
    fireEvent.click(within(org).getByRole("button", { name: "Ocultar Inicio" }));
    expect(nombres()).toEqual(["Inicio"]);
    expect(within(org).getByRole("status").textContent).toMatch(/al menos una sección/);
  });

  it("si se oculta la sección activa, pasa a la primera que queda", async () => {
    const org = await abrir();
    fireEvent.click(within(org).getByRole("button", { name: "Ocultar Inicio" }));
    expect(seleccionada()).toBe("Grabar");
  });

  it("Restaurar devuelve el orden de fábrica y todo visible", async () => {
    const org = await abrir();
    fireEvent.click(within(org).getByRole("button", { name: "Subir Sistema" }));
    fireEvent.click(within(org).getByRole("button", { name: "Ocultar Alertas" }));
    fireEvent.click(within(org).getByRole("button", { name: /Restaurar/ }));
    expect(nombres()).toEqual(["Inicio", "Grabar", "Atmósfera", "Conexiones", "Alertas", "Sistema"]);
  });
});

describe("Centro de Control · la grabación a la vista desde cualquier sección", () => {
  async function empezarGrabacion() {
    await act(async () => {
      void h.controlador.iniciar({
        fuente: "pantalla",
        microfono: false,
        sonidoSistema: false,
        camaraSuperpuesta: false,
        cuentaAtras: 0,
        calidad: "estandar",
        formato: "auto",
        posicionCamara: "abajo-derecha",
        tamanoCamara: "mediana",
      });
      for (let i = 0; i < 8; i++) await Promise.resolve();
    });
  }

  it("mientras se graba, la cabecera lo dice y lleva a Grabar; ya en Grabar, la franja sobra", async () => {
    await montar();
    expect(screen.queryByTestId("franja-grabacion")).toBeNull();
    await empezarGrabacion();
    const franja = screen.getByTestId("franja-grabacion");
    expect(franja.textContent).toContain("Grabando");
    // El acceso de Inicio también lo refleja.
    expect(screen.getByTestId("pildora-grabar").textContent).toContain("Grabando");
    fireEvent.click(franja);
    expect(seleccionada()).toBe("Grabar");
    expect(screen.queryByTestId("franja-grabacion")).toBeNull();
    expect(screen.getByTestId("grabar-en-curso")).toBeTruthy();
  });

  it("si la sección Grabar está oculta, la franja solo informa (no hay botón que no hace nada)", async () => {
    almacen.reiniciar({ controlCenter: { moduleOrder: [...ORDEN_POR_DEFECTO], hiddenModules: ["grabar"] } });
    await montar();
    await empezarGrabacion();
    const franja = screen.getByTestId("franja-grabacion");
    expect(franja.tagName).not.toBe("BUTTON");
    expect(franja.textContent).toContain("Sección Grabar oculta");
  });
});

describe("Centro de Control · accesibilidad y diseño táctil", () => {
  it("las pestañas, el organizador y los accesos miden al menos 44 px de alto", async () => {
    await montar();
    const alto = (el: Element) => {
      const c = el.getAttribute("class") ?? "";
      const m = /(?:^|\s)(?:min-)?h-\[(\d+)px\]/.exec(c);
      if (m) return Number(m[1]);
      const rem = /(?:^|\s)(?:min-)?h-(\d+)(?:\s|$)/.exec(c);
      return rem ? Number(rem[1]) * 4 : 0;
    };
    for (const t of pestanas()) expect(alto(t), t.textContent ?? "").toBeGreaterThanOrEqual(44);
    expect(alto(screen.getByRole("button", { name: "Organizar las secciones" }))).toBeGreaterThanOrEqual(44);
    expect(alto(screen.getByTestId("pildora-tema"))).toBeGreaterThanOrEqual(44);
    expect(alto(screen.getByTestId("fila-ajustes"))).toBeGreaterThanOrEqual(44);
  });

  it("los iconos decorativos no se anuncian y los chips tienen texto para lectores de pantalla", async () => {
    await montar();
    for (const li of screen.getByTestId("chips-estado").querySelectorAll("li")) {
      expect(li.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
      expect(li.querySelector(".sr-only")?.textContent?.length).toBeGreaterThan(3);
    }
  });

  it("lo visible no usa el nombre antiguo del producto (guardia de nombres)", async () => {
    await montar();
    const texto = screen.getByTestId("control-center").textContent ?? "";
    // La palabra se arma por partes para que esta propia prueba no dispare la guardia de `src/`.
    expect(texto).not.toMatch(new RegExp(`\\bMan${"do"}\\b`));
  });
});
