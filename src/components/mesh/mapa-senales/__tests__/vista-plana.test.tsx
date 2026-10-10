/**
 * La vista plana pinta el MISMO modelo que el 3D: aquí se comprueba, sobre SVG real, que no dibuja
 * nada decorativo (sin barrido), que los anillos de distancia solo existen donde hay distancia y que
 * cada trazo de enlace sale de la clase medida.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { construirVivo } from "@/lib/senales/aparatos";
import { anonimizarAjenas } from "@/lib/senales/cuentas";
import { reubicar } from "@/lib/senales/escalas";
import { ESTILO_ENLACE } from "@/lib/senales/enlaces";
import { construirModeloMapa } from "@/lib/senales/modelo";
import { AHORA, aparato, contexto, fila, medioPresencia, senal } from "@/lib/senales/__fixtures__/vivo";
import { VistaPlana } from "../vista-plana";

const VIEJO = AHORA - 10 * 60_000;
const gps = senal("lora:7", { label: "Nodo GPS", lastHeard: VIEJO, placement: { angleRad: -1, radiusFrac: 0.4, accuracyFrac: 0.02, mode: "gps", distanceM: 250, accuracyM: 35, detail: "gps" } });
const rf = senal("lora:8", { label: "Nodo RF", lastHeard: AHORA - 5_000 });
const ble = senal("ble:1", { antenna: "ble", label: "Auriculares", lastHeard: VIEJO, placement: { angleRad: 0, radiusFrac: 0.16, accuracyFrac: 0.1, mode: "rf", distanceM: 4, accuracyM: 4, detail: "BLE. El rumbo es desconocido." } });

function modelo(base = [gps, rf, ble, aparato("a", { lastHeard: VIEJO })], ahora = AHORA) {
  const vivo = construirVivo(base, contexto({
    filas: [fila("a", { enlace: { estado: "conectado", latenciaMs: 20, ruta: { clase: "misma-red-local", tipoLocal: "host", tipoRemoto: "host", protocolo: "udp", rttMs: 20, bytesEnviados: 1, bytesRecibidos: 2, medidoEn: AHORA } } })],
    presencia: { conectado: true, medios: [medioPresencia("a", "m1")] },
    ahora,
  }));
  const senales = anonimizarAjenas([...base, ...vivo.extras]).map(reubicar);
  return construirModeloMapa({ senales, vivo, filtros: { ocultas: [], cuenta: "todas", ocultarDesconectados: false }, altura: "plano", ahora });
}

function pintar(m = modelo(), extra: Partial<React.ComponentProps<typeof VistaPlana>> = {}) {
  const onSeleccionar = vi.fn();
  const r = render(<VistaPlana modelo={m} seleccionId={null} onSeleccionar={onSeleccionar} reducido={false} descripcion="Mapa de prueba" {...extra} />);
  return { ...r, onSeleccionar };
}

afterEach(() => cleanup());

describe("VistaPlana", () => {
  test("no dibuja barrido ni ondas de adorno desde el centro", () => {
    const { container } = pintar();
    expect(container.querySelector(".ss-radar-beam")).toBeNull();
    // Solo late lo oído hace menos de 30 s (aquí: el nodo RF, 5 s antes; el resto, hace 10 min).
    expect(container.querySelectorAll(".ss-signal-ping").length).toBe(1);
  });

  test("con prefers-reduced-motion no late nada", () => {
    const { container } = pintar(modelo(), { reducido: true });
    expect(container.querySelector(".ss-signal-ping")).toBeNull();
  });

  test("círculo completo solo donde hay GPS; arcos punteados «≈» para las estimaciones", () => {
    const { container } = pintar();
    const textos = Array.from(container.querySelectorAll("text")).map((t) => t.textContent);
    expect(textos).toContain("100 m");
    expect(textos).toContain("1 km");
    expect(textos.some((t) => t?.startsWith("≈"))).toBe(true);
    const arcos = Array.from(container.querySelectorAll("path[stroke-dasharray]"));
    expect(arcos.length).toBeGreaterThan(0);
  });

  test("sin ninguna distancia no hay un solo anillo ni etiqueta de metros", () => {
    const { container } = pintar(modelo([senal("lora:9", { placement: { angleRad: 0, radiusFrac: 0.5, accuracyFrac: 0.2, mode: "sector", distanceM: null, accuracyM: null, detail: "s" } })]));
    const textos = Array.from(container.querySelectorAll("text")).map((t) => t.textContent ?? "");
    expect(textos.some((t) => /^≈?\d+(,\d)? ?(m|km)$/.test(t))).toBe(false);
  });

  test("cada aparato dibuja su línea con el color de la clase de enlace medida", () => {
    const { container } = pintar();
    const colores = Array.from(container.querySelectorAll("line")).map((l) => l.getAttribute("stroke"));
    expect(colores).toContain(ESTILO_ENLACE["p2p-red-local"].color);
  });

  test("los medios abiertos son rombos con nombre accesible y son pulsables", () => {
    const { onSeleccionar } = pintar();
    fireEvent.click(screen.getByRole("button", { name: /Medio Chrome · m1, a la vista/ }));
    expect(onSeleccionar).toHaveBeenCalledWith("medio:m1");
  });

  test("«Tú» y cada marca se activan con teclado", () => {
    const { onSeleccionar } = pintar();
    fireEvent.keyDown(screen.getByRole("button", { name: "Tú, esta neurona" }), { key: "Enter" });
    expect(onSeleccionar).toHaveBeenCalledWith("yo");
    fireEvent.keyDown(screen.getByRole("button", { name: /Auriculares/ }), { key: " " });
    expect(onSeleccionar).toHaveBeenCalledWith("ble:1");
  });

  test("pulsar lo ya elegido lo suelta", () => {
    const { onSeleccionar } = pintar(modelo(), { seleccionId: "ble:1" });
    fireEvent.click(screen.getByRole("button", { name: /Auriculares/ }));
    expect(onSeleccionar).toHaveBeenCalledWith(null);
  });

  test("el modo mini quita rótulos de sectores y anillos", () => {
    const completa = pintar();
    const n = completa.container.querySelectorAll("text").length;
    cleanup();
    const mini = pintar(modelo(), { mini: true });
    expect(mini.container.querySelectorAll("text").length).toBeLessThan(n);
  });

  test("la descripción accesible llega al SVG", () => {
    pintar();
    expect(screen.getByRole("group", { name: "Mapa de prueba" })).toBeInTheDocument();
  });
});
