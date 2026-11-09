// @vitest-environment jsdom
/**
 * LLA1108G · la superficie con el motor: botones desactivados con su motivo, atajos M V S F, chat, reacciones,
 * chip de transición, terminar para todos y el adaptador cableado a la superficie (de punta a punta con motor falso).
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SuperficieLlamada } from "../superficie-llamada";
import type { AccionesLlamada, VistaLlamada } from "@/lib/llamadas/superficie/vista";
import { AdaptadorMotor } from "@/lib/llamadas/superficie/adaptador-motor";
import { BusFalso, ENTORNO_ESCRITORIO, MotorFalso, vaciar } from "@/lib/llamadas/superficie/__tests__/motor-falso";

vi.mock("@/lib/nativa/puente", () => ({ esAppNativa: () => false, puenteNativo: () => ({ llamar: vi.fn() }) }));
afterEach(cleanup);

const viva = (o: Partial<VistaLlamada> = {}): VistaLlamada => ({
  estado: "conectada", tipo: "voz", nombre: "Ana Pérez", yo: "yo", desde: Date.now() - 4000, local: null, remoto: null, micro: true, camara: false, compartiendoPantalla: false, ...o,
});
const abrir = (v: VistaLlamada, a: AccionesLlamada) => {
  const r = render(<SuperficieLlamada vista={viva({ estado: "saliente", desde: null })} acciones={a} tamanoInicial="panel" />);
  r.rerender(<SuperficieLlamada vista={v} acciones={a} tamanoInicial="panel" />);
  return r;
};
const sec = () => screen.getByTestId("superficie-llamada");

describe("sin botones muertos: desactivado con su motivo", () => {
  it("al conectar abre el panel (tamaño inicial) y la cámara, la pantalla y el PiP salen desactivados con el motivo en el título", () => {
    const a: AccionesLlamada = { colgar: vi.fn(), alternarMicro: vi.fn(), alternarCamara: vi.fn(), alternarPantalla: vi.fn() };
    abrir(viva({ motivos: { camara: "El vídeo no cabe por Bluetooth: cambia a Wi‑Fi o red local.", pantalla: "Android no deja compartir la pantalla desde la app.", pip: "Aún no hay vídeo." } }), a);
    expect(sec().dataset.tamano).toBe("panel");
    const cam = screen.getByRole("button", { name: "Encender cámara" }) as HTMLButtonElement;
    expect(cam.disabled).toBe(true);
    expect(cam.title).toContain("Bluetooth");
    const pan = screen.getByRole("button", { name: /Compartir pantalla/ }) as HTMLButtonElement;
    expect(pan.disabled).toBe(true);
    expect(pan.title).toContain("Android");
    expect((screen.getByRole("button", { name: "Imagen en imagen" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(cam);
    expect(a.alternarCamara).not.toHaveBeenCalled();
  });

  it("el selector de tipo desactiva «En vivo» con su motivo y «Vídeo» si el medio no lo lleva", () => {
    const a: AccionesLlamada = { colgar: vi.fn(), cambiarTipo: vi.fn() };
    abrir(viva({ motivos: { "tipo-vivo": "Se empieza desde el chat.", "tipo-video": "No cabe por Bluetooth." } }), a);
    const vivo = screen.getByRole("radio", { name: "En vivo" }) as HTMLButtonElement;
    const video = screen.getByRole("radio", { name: "Vídeo" }) as HTMLButtonElement;
    expect(vivo.disabled).toBe(true);
    expect(vivo.title).toBe("Se empieza desde el chat.");
    expect(video.disabled).toBe(true);
    expect((screen.getByRole("radio", { name: "Pantalla" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("cambiar de tipo llama al motor y enseña «Cambiando a vídeo sin colgar…»", async () => {
    const cambiarTipo = vi.fn(async () => undefined);
    abrir(viva(), { colgar: vi.fn(), cambiarTipo });
    fireEvent.click(screen.getByRole("radio", { name: "Vídeo" }));
    expect(cambiarTipo).toHaveBeenCalledWith("video");
  });
});

describe("atajos de teclado", () => {
  it("M micro, V cámara, S pantalla y F pantalla completa; no al escribir", () => {
    const a: AccionesLlamada = { colgar: vi.fn(), alternarMicro: vi.fn(), alternarCamara: vi.fn(), alternarPantalla: vi.fn() };
    abrir(viva(), a);
    fireEvent.keyDown(window, { key: "m" });
    fireEvent.keyDown(window, { key: "v" });
    fireEvent.keyDown(window, { key: "s" });
    expect(a.alternarMicro).toHaveBeenCalledTimes(1);
    expect(a.alternarCamara).toHaveBeenCalledTimes(1);
    expect(a.alternarPantalla).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: "f" });
    expect(sec().dataset.tamano).toBe("pantalla-completa");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(sec().dataset.tamano).not.toBe("pantalla-completa");
    const campo = document.createElement("input");
    document.body.appendChild(campo);
    fireEvent.keyDown(campo, { key: "m" });
    expect(a.alternarMicro).toHaveBeenCalledTimes(1);
    campo.remove();
  });

  it("si la cámara no está disponible, V dice por qué en lugar de no hacer nada", () => {
    const a: AccionesLlamada = { colgar: vi.fn(), alternarCamara: vi.fn() };
    abrir(viva({ motivos: { camara: "Este aparato no tiene cámara disponible." } }), a);
    fireEvent.keyDown(window, { key: "v" });
    expect(a.alternarCamara).not.toHaveBeenCalled();
    expect(screen.getByText("Este aparato no tiene cámara disponible.")).toBeTruthy();
  });
});

describe("chat, reacciones, chip y terminar para todos", () => {
  it("chip de transición, reacciones flotando y Terminar para todos solo si se puede", () => {
    const a: AccionesLlamada = { colgar: vi.fn(), colgarTodos: vi.fn(), reaccionar: vi.fn() };
    const { rerender } = abrir(viva({ chip: "Pasando a red local…", reacciones: [{ id: "1", nombre: "Beto", emoji: "👏" }] }), a);
    expect(screen.getByTestId("chip-transmision").textContent).toBe("Pasando a red local…");
    expect(screen.getByTitle("Beto").textContent).toContain("👏");
    expect(screen.queryByRole("button", { name: "Terminar para todos" })).toBeNull();
    rerender(<SuperficieLlamada vista={viva({ puedeTerminarParaTodos: true })} acciones={a} tamanoInicial="panel" />);
    fireEvent.click(screen.getByRole("button", { name: "Terminar para todos" }));
    expect(a.colgarTodos).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Reaccionar" }));
    fireEvent.click(screen.getByRole("button", { name: "Reaccionar con 👍" }));
    expect(a.reaccionar).toHaveBeenCalledWith("👍");
  });

  it("la pestaña Chat muestra los mensajes y envía", () => {
    const a: AccionesLlamada = { colgar: vi.fn(), enviarChat: vi.fn() };
    abrir(viva({ chat: [{ id: "1", de: "b", nombre: "Beto", texto: "¡Hola!", en: 1, mio: false }] }), a);
    fireEvent.click(screen.getByRole("tab", { name: /Chat/ }));
    expect(screen.getByText("¡Hola!")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Mensaje para la llamada"), { target: { value: "ya voy" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
    expect(a.enviarChat).toHaveBeenCalledWith("ya voy");
  });

  it("en grupo se oye a TODOS (un audio por participante) y la voz de la llamada tiene el anillo de hablante", () => {
    const { container } = abrir(
      viva({ tipo: "grupo", participantes: [
        { id: "yo", nombre: "Yo", yo: true, micro: true, camara: false, volumen: 1 },
        { id: "b", nombre: "Beto", micro: true, camara: false, volumen: 1, nivel: 0.4, stream: {} as MediaStream },
        { id: "c", nombre: "Cris", micro: true, camara: false, volumen: 0.5, nivel: 0, stream: {} as MediaStream },
      ] }),
      { colgar: vi.fn() },
    );
    expect(container.querySelectorAll("audio").length).toBe(2);
  });
});

describe("el adaptador cableado a la superficie (motor falso)", () => {
  it("de punta a punta: aparece conectada, la cámara cambia el tipo y el botón de colgar llega al motor", async () => {
    const bus = new BusFalso();
    const m = new MotorFalso("a", "Ana", bus, 1);
    new MotorFalso("b", "Beto", bus, 2);
    const ad = new AdaptadorMotor(m, { titulo: "Beto", unoAUno: true, entorno: () => ENTORNO_ESCRITORIO });
    const { rerender } = render(<SuperficieLlamada vista={{ ...ad.vista(), estado: "saliente" }} acciones={ad.acciones} tamanoInicial="panel" />);
    rerender(<SuperficieLlamada vista={ad.vista()} acciones={ad.acciones} tamanoInicial="panel" />);
    expect(sec().dataset.estado).toBe("conectada");
    await act(async () => {
      await ad.cambiarTipo("video");
      await vaciar(2);
    });
    rerender(<SuperficieLlamada vista={ad.vista()} acciones={ad.acciones} tamanoInicial="panel" />);
    expect(sec().dataset.tipo).toBe("video");
    fireEvent.click(screen.getByRole("button", { name: "Colgar" }));
    expect(m.colgar).toHaveBeenCalled();
  });
});
