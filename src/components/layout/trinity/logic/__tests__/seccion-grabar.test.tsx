/**
 * La sección «Grabar» con una grabadora simulada (MediaRecorder y getDisplayMedia falsos):
 * soporte honesto, permisos solo al pulsar, el flujo completo (cuenta atrás → grabando → pausa →
 * parar → vista previa → descargar y guardar) y los caminos que NO se pueden en este navegador.
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crearControlador, type Controlador } from "@/lib/grabacion/controlador";
import {
  GrabadorFalso,
  UA_CHROME_ANDROID,
  UA_SAFARI_IPHONE,
  depsFalsas,
  flujoDeCamara,
  flujoDePantalla,
  type DepsFalsas,
} from "@/lib/grabacion/falsos-prueba";
import type { EntornoGrabacion } from "@/lib/grabacion/soporte";
import { SeccionGrabar } from "../grabar/seccion-grabar";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

let deps: DepsFalsas;
let c: Controlador;

function montar(parcial: Partial<EntornoGrabacion> = {}, extra: { depsGuardado?: Parameters<typeof SeccionGrabar>[0]["depsGuardado"] } = {}) {
  deps = depsFalsas(parcial);
  c = crearControlador(deps);
  // El cronómetro de la vista lee `performance.now()`: se alinea con el reloj de la grabadora simulada.
  vi.spyOn(performance, "now").mockImplementation(() => deps.reloj.ahora);
  return render(<SeccionGrabar controlador={c} depsGuardado={extra.depsGuardado} />);
}

/** Un clic que deja correr las promesas pendientes (permisos, parada…). */
async function pulsar(el: Element) {
  await act(async () => {
    fireEvent.click(el);
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
}
const boton = (nombre: string | RegExp) => screen.getByRole("button", { name: nombre });

beforeEach(() => {
  push.mockClear();
  GrabadorFalso.reiniciar(["video/webm;codecs=vp9,opus", "video/webm;codecs=vp9", "video/webm"]);
  try {
    window.localStorage.clear();
  } catch {
    /* sin almacenamiento */
  }
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Grabar · en un navegador de escritorio", () => {
  it("muestra qué se puede hacer y NO pide ningún permiso hasta pulsar", () => {
    const pantalla = vi.fn(async () => flujoDePantalla());
    const camara = vi.fn(async () => flujoDeCamara());
    montar({ mediaDevices: { getDisplayMedia: pantalla, getUserMedia: camara, getSupportedConstraints: () => ({}) } as never });
    expect(screen.getByTestId("seccion-grabar")).toBeTruthy();
    expect(boton("Grabar")).toBeTruthy();
    expect(boton("Captura de pantalla")).toBeTruthy();
    expect(screen.queryByTestId("aviso-sin-pantalla")).toBeNull();
    expect(pantalla).not.toHaveBeenCalled();
    expect(camara).not.toHaveBeenCalled();
  });

  it("enlaza a la app de escritorio Cap (cap.so) en pestaña nueva, sin instalar nada", () => {
    montar();
    const enlace = screen.getByTestId("enlace-cap") as HTMLAnchorElement;
    expect(enlace.getAttribute("href")).toBe("https://cap.so");
    expect(enlace.getAttribute("target")).toBe("_blank");
    expect(enlace.getAttribute("rel")).toContain("noopener");
    expect(enlace.textContent).toContain("App de escritorio Cap");
  });

  it("recorre grabar → pausar → reanudar → parar y deja descargar y guardar en la Biblioteca", async () => {
    const guardado: Array<{ name: string; origin: string }> = [];
    montar(
      {},
      {
        depsGuardado: {
          cargarRef: async () => ({ kind: "user", id: "u1" }),
          cargarBiblioteca: async () => ({
            saveMediaToLibrary: async (_ref, input) => {
              guardado.push({ name: input.name, origin: input.origin });
              return { ok: true };
            },
          }),
        },
      },
    );

    // Sin cuenta atrás, para ir directos a grabar.
    fireEvent.click(screen.getByRole("radio", { name: "Sin" }));
    await pulsar(boton("Grabar"));

    expect(screen.getByTestId("grabar-en-curso")).toBeTruthy();
    expect(screen.getByText("Grabando", { selector: "span" })).toBeTruthy();
    expect(screen.getByTestId("cronometro").textContent).toBe("00:00");
    expect(GrabadorFalso.instancias).toHaveLength(1);
    expect(GrabadorFalso.instancias[0].state).toBe("recording");
    // Mientras graba no se ofrecen los ajustes ni un segundo «Grabar».
    expect(screen.queryByTestId("grabar-ajustes")).toBeNull();

    await pulsar(boton("Pausar"));
    expect(GrabadorFalso.instancias[0].state).toBe("paused");
    expect(screen.getByText("En pausa", { selector: "span" })).toBeTruthy();

    await pulsar(boton("Reanudar"));
    expect(GrabadorFalso.instancias[0].state).toBe("recording");

    await pulsar(boton("Parar"));
    const resultado = await screen.findByTestId("resultado-video");
    expect(within(resultado).getByRole("button", { name: "Descargar" })).toBeTruthy();
    expect(resultado.querySelector("video")?.getAttribute("src")).toMatch(/^blob:falso\//);
    expect(screen.queryByTestId("grabar-en-curso")).toBeNull();

    // Descargar: un enlace temporal con el nombre del archivo.
    fireEvent.click(within(resultado).getByRole("button", { name: "Descargar" }));
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);

    // Guardar en la Biblioteca (origen «Capturas»).
    await pulsar(within(resultado).getByRole("button", { name: "Guardar en la Biblioteca" }));
    expect(guardado).toHaveLength(1);
    expect(guardado[0].origin).toBe("Capturas");
    expect(guardado[0].name).toMatch(/^starseed-grabacion-2026-10-26-1530\.webm$/);
    expect(within(resultado).getByText(/Guardado en Imágenes y videos › Capturas/)).toBeTruthy();

    // Descartar vuelve a dejar grabar.
    await pulsar(within(resultado).getByRole("button", { name: /Descartar/ }));
    expect(screen.queryByTestId("resultado-video")).toBeNull();
    expect(boton("Grabar")).toBeTruthy();
  });

  it("con cuenta atrás, cuenta de 3 a 0 y entonces graba", async () => {
    montar();
    await pulsar(boton("Grabar")); // cuenta atrás de 3 s por defecto
    const cuenta = screen.getByTestId("grabar-cuenta-atras");
    expect(cuenta.textContent).toContain("Empieza a grabar en 3 s");
    expect(GrabadorFalso.instancias[0].llamadas.some((l) => l.startsWith("start"))).toBe(false);
    await act(async () => {
      deps.reloj.avanzar(1000);
    });
    expect(screen.getByTestId("grabar-cuenta-atras").textContent).toContain("Empieza a grabar en 2 s");
    await act(async () => {
      deps.reloj.avanzar(2000);
    });
    expect(screen.queryByTestId("grabar-cuenta-atras")).toBeNull();
    expect(screen.getByTestId("grabar-en-curso")).toBeTruthy();
    expect(GrabadorFalso.instancias[0].state).toBe("recording");
  });

  it("se puede cancelar la cuenta atrás: no se graba nada y se sueltan los permisos", async () => {
    montar();
    await pulsar(boton("Grabar"));
    const cuenta = screen.getByTestId("grabar-cuenta-atras");
    await pulsar(within(cuenta).getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByTestId("grabar-cuenta-atras")).toBeNull();
    expect(GrabadorFalso.instancias.every((g) => !g.llamadas.some((l) => l.startsWith("start")))).toBe(true);
    expect(boton("Grabar")).toBeTruthy();
    await act(async () => {
      deps.reloj.avanzar(10_000);
    });
    expect(screen.queryByTestId("grabar-en-curso")).toBeNull();
  });

  it("si se rechaza compartir la pantalla, lo dice con calma y se puede reintentar", async () => {
    const rechazo = Object.assign(new Error("Permission denied"), { name: "NotAllowedError" });
    montar({ mediaDevices: { getDisplayMedia: async () => Promise.reject(rechazo), getUserMedia: async () => flujoDeCamara(), getSupportedConstraints: () => ({}) } as never });
    await pulsar(boton("Grabar"));
    expect(screen.queryByTestId("grabar-en-curso")).toBeNull();
    expect(boton("Grabar")).toBeTruthy();
    expect(screen.getByTestId("grabar-aviso").textContent?.length).toBeGreaterThan(10);
  });

  it("recuerda tus ajustes en este navegador (sin tocar la cuenta)", () => {
    const { unmount } = montar();
    fireEvent.click(screen.getByRole("radio", { name: "5 s" }));
    expect(screen.getByRole("radio", { name: "5 s" }).getAttribute("aria-checked")).toBe("true");
    unmount();
    montar();
    expect(screen.getByRole("radio", { name: "5 s" }).getAttribute("aria-checked")).toBe("true");
    expect(JSON.parse(window.localStorage.getItem("starseed.logic.grabar.v1") ?? "{}").cuentaAtras).toBe(5);
  });

  it("si el navegador no deja guardar ajustes, sigue funcionando", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("cuota");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    montar();
    fireEvent.click(screen.getByRole("radio", { name: "Sin" }));
    expect(screen.getByRole("radio", { name: "Sin" }).getAttribute("aria-checked")).toBe("true");
  });

  it("la captura de pantalla produce un PNG con vista previa, descarga y guardado", async () => {
    montar();
    await pulsar(boton("Captura de pantalla"));
    const captura = await screen.findByTestId("resultado-captura");
    expect(within(captura).getByRole("button", { name: "Descargar" })).toBeTruthy();
    expect(captura.querySelector("img")?.getAttribute("alt")).toMatch(/captura/i);
    expect(captura.textContent).toContain("PNG");
  });

  it("un archivo de más de 50 MB solo se puede descargar, y se explica por qué", async () => {
    montar();
    fireEvent.click(screen.getByRole("radio", { name: "Sin" }));
    await pulsar(boton("Grabar"));
    // Un trozo gigante simulado: la grabación ya supera el límite de la Biblioteca.
    await act(async () => {
      GrabadorFalso.instancias[0].bytesAlParar = 60 * 1024 * 1024;
    });
    await pulsar(boton("Parar"));
    const resultado = await screen.findByTestId("resultado-video");
    expect(within(resultado).queryByRole("button", { name: "Guardar en la Biblioteca" })).toBeNull();
    expect(within(resultado).getByRole("button", { name: "Descargar" })).toBeTruthy();
    expect(within(resultado).getByRole("note").textContent).toMatch(/50 MB/);
  });
});

describe("Grabar · donde el navegador no puede grabar la pantalla", () => {
  const sinPantalla = (getUserMedia = async () => flujoDeCamara()) => ({ getUserMedia, getSupportedConstraints: () => ({}) }) as never;

  it("iPhone: dice por qué, da los pasos de iOS, no ofrece captura de pantalla y lleva a la app Cámara", async () => {
    montar({ userAgent: UA_SAFARI_IPHONE, plataforma: "iPhone", puntosTactiles: 5, mediaDevices: sinPantalla() });
    const aviso = screen.getByTestId("aviso-sin-pantalla");
    expect(aviso.textContent).toMatch(/iPhone|iPad|iOS/);
    expect(aviso.textContent).toContain("Grabación de pantalla");
    expect(screen.queryByRole("button", { name: "Captura de pantalla" })).toBeNull();
    await pulsar(within(aviso).getByRole("button", { name: "Abrir la app Cámara" }));
    expect(push).toHaveBeenCalledWith("/camara");
  });

  it("Chrome de Android: guía propia (Grabadora de pantalla del sistema), también sin captura de pantalla", () => {
    montar({ userAgent: UA_CHROME_ANDROID, plataforma: "Linux armv8l", puntosTactiles: 5, mediaDevices: sinPantalla() });
    const aviso = screen.getByTestId("aviso-sin-pantalla");
    expect(aviso.textContent).toContain("Grabadora de pantalla");
    expect(screen.queryByRole("button", { name: "Captura de pantalla" })).toBeNull();
  });

  it("sin pantalla ni cámara no queda ni un botón de grabar: solo la explicación y el enlace a Cap", () => {
    montar({ contextoSeguro: false, mediaDevices: undefined as never });
    expect(screen.getByTestId("aviso-sin-pantalla").textContent).toMatch(/https|seguro|HTTPS/i);
    expect(screen.queryByRole("button", { name: "Grabar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Captura de pantalla" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Abrir la app Cámara" })).toBeNull();
    expect(screen.getByTestId("enlace-cap")).toBeTruthy();
  });

  it("solo cámara: se puede grabar con la cámara y no hay opciones de pantalla", async () => {
    montar({ userAgent: UA_SAFARI_IPHONE, plataforma: "iPhone", puntosTactiles: 5, mediaDevices: sinPantalla() });
    fireEvent.click(screen.getByRole("radio", { name: "Sin" }));
    await pulsar(boton("Grabar"));
    expect(screen.getByTestId("grabar-en-curso")).toBeTruthy();
    expect(GrabadorFalso.instancias).toHaveLength(1);
  });
});
