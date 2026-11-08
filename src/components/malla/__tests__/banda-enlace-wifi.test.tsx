/**
 * BandaEnlaceWifi (WFD1108A): lo que ven el chat y la ficha de la neurona — «Enlace Wi-Fi directo:
 * activo · N Mb/s», la propuesta con «Abrir enlace Wi-Fi directo», la pregunta de la otra neurona, la vía
 * guiada del Mac y el fallo con su respaldo. Y el Radar/Señales con la métrica del enlace.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BandaEnlaceWifi } from "@/components/malla/banda-enlace-wifi";
import { __fijarMotorWifiParaPruebas, type InstantaneaWifi, type MotorWifi } from "@/lib/malla/enlace-wifi-motor";
import { WIFI_INICIAL, type CapacidadesWifi } from "@/lib/malla/enlace-wifi-directo";
import { fijarEnlacesWifi } from "@/lib/malla/enlace-wifi-orquestacion";
import { enriquecerConEnlaceWifi, DETALLE_WIFI_DIRECTO } from "@/ai/astraura/mesh/senales-enlace-wifi";
import type { DetectedSignal } from "@/ai/astraura/mesh/signals";

const MAC: CapacidadesWifi = { plataforma: "macos", ap: [], cliente: ["corewlan", "guiado"], permiso: "concedido", radioUnica: true, wifi: true };

function motorFalso(foto: Partial<InstantaneaWifi>): MotorWifi & { llamadas: string[] } {
  const llamadas: string[] = [];
  const instantanea: InstantaneaWifi = { estado: WIFI_INICIAL, capPropia: MAC, propuesta: null, pregunta: null, guiado: null, ultimoRespaldo: null, fallos: {}, nativo: null, avisoRadio: null, ...foto };
  return {
    llamadas,
    abrir: vi.fn(async () => {
      llamadas.push("abrir");
      return { ok: true };
    }),
    recibir: vi.fn(async () => undefined),
    decidirPersona: vi.fn(async (a: boolean) => {
      llamadas.push(`persona:${a}`);
    }),
    resolverPropuesta: vi.fn(async (a: boolean) => {
      llamadas.push(`propuesta:${a}`);
    }),
    cerrar: vi.fn(async () => {
      llamadas.push("cerrar");
    }),
    tic: vi.fn(async () => undefined),
    uso: vi.fn(),
    necesitaAncho: vi.fn(async () => ({ accion: "nada" as const, motivo: "" })),
    retenerFlujo: vi.fn(),
    capacidades: vi.fn(async () => MAC),
    pedirPermiso: vi.fn(async () => MAC),
    instantanea: () => instantanea,
    suscribir: () => () => undefined,
  };
}

afterEach(() => {
  cleanup();
  __fijarMotorWifiParaPruebas(null);
  fijarEnlacesWifi([]);
});

describe("BandaEnlaceWifi", () => {
  it("fuera de la app nativa (sin motor) no pinta nada", () => {
    const { container } = render(<BandaEnlaceWifi neurona="tel-1" manual />);
    expect(container.innerHTML).toBe("");
  });

  it("activo: «Enlace Wi-Fi directo: activo · N Mb/s», sin router y que el Mac salió de su red", () => {
    const m = motorFalso({});
    __fijarMotorWifiParaPruebas(m);
    act(() => fijarEnlacesWifi([{ neurona: "tel-1", nombre: "Teléfono", ipOtro: "192.168.49.1", ipPropia: "192.168.49.23", ssid: "StarSeed-9f3a", metodo: "hotspot-local", soyAp: false, mbps: 433, desde: 1 }]));
    render(<BandaEnlaceWifi neurona="tel-1" nombre="Teléfono" />);
    expect(screen.getByText("Enlace Wi-Fi directo: activo · 433 Mb/s")).toBeTruthy();
    expect(screen.getByText(/Sin router/)).toBeTruthy();
    expect(screen.getByText(/salió de su red Wi-Fi/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar el enlace Wi-Fi directo" }));
    expect(m.llamadas).toContain("cerrar");
  });

  it("propuesta: «Abrir enlace Wi-Fi directo» con el aviso de la radio única", () => {
    const m = motorFalso({ propuesta: { neurona: "tel-1", nombre: "Teléfono", clase: "archivo", motivo: "x", aviso: "Este Mac tiene una sola radio Wi-Fi…" } });
    __fijarMotorWifiParaPruebas(m);
    render(<BandaEnlaceWifi neurona="tel-1" nombre="Teléfono" />);
    expect(screen.getByText(/una sola radio/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Abrir enlace Wi-Fi directo" }));
    expect(m.llamadas).toContain("propuesta:true");
  });

  it("la otra neurona lo pide: Aceptar / Ahora no", () => {
    const m = motorFalso({ estado: { ...WIFI_INICIAL, fase: "decidiendo", otro: "tel-1", sesion: "s" }, pregunta: { sesion: "s", otro: "tel-1", nombreOtro: "Teléfono", clase: "pantalla" } });
    __fijarMotorWifiParaPruebas(m);
    render(<BandaEnlaceWifi neurona="tel-1" />);
    expect(screen.getByText(/pide abrir un enlace Wi-Fi directo/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Aceptar" }));
    expect(m.llamadas).toContain("persona:true");
  });

  it("vía guiada del Mac: «Únete a la red StarSeed-xxxx» con nombre y contraseña para copiar", () => {
    const m = motorFalso({ estado: { ...WIFI_INICIAL, fase: "uniendo", otro: "tel-1", sesion: "s" }, guiado: { ssid: "StarSeed-9f3a", clave: "clave-del-ap", ipAp: "192.168.49.1" } });
    __fijarMotorWifiParaPruebas(m);
    render(<BandaEnlaceWifi neurona="tel-1" />);
    expect(screen.getByText("Únete a la red «StarSeed-9f3a»")).toBeTruthy();
    expect(screen.getByText("clave-del-ap")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copiar contraseña" })).toBeTruthy();
  });

  it("falló: dice por qué y que todo sigue por el enlace de antes", () => {
    const m = motorFalso({ estado: { ...WIFI_INICIAL, fase: "fallido", otro: "tel-1", sesion: "s", motivo: "el sistema no dio permiso para crear o unirse a la red", desde: Date.now() } });
    __fijarMotorWifiParaPruebas(m);
    render(<BandaEnlaceWifi neurona="tel-1" />);
    expect(screen.getByText(/no dio permiso.*Todo sigue por el enlace de antes/)).toBeTruthy();
  });

  it("a mano en la ficha: «Abrir enlace Wi-Fi directo» llama al motor", () => {
    const m = motorFalso({});
    __fijarMotorWifiParaPruebas(m);
    render(<BandaEnlaceWifi neurona="tel-1" nombre="Teléfono" manual />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir enlace Wi-Fi directo" }));
    expect(m.llamadas).toContain("abrir");
  });
});

describe("Radar y Señales", () => {
  const base = (id: string, neuronId?: string): DetectedSignal =>
    ({
      id,
      antenna: "account",
      antennaLabel: "Cuenta",
      signalType: "Neurona",
      label: "Teléfono",
      detail: "",
      quality: 0.5,
      qualityDetail: "",
      metrics: [{ label: "Enlace P2P", value: "conectado" }],
      compatible: true,
      compatDetail: "",
      starseed: neuronId ? { via: "neuron-registry", sourceId: neuronId, neuronId, name: "Teléfono", ownAccount: true, capabilities: [] } : null,
      placement: { angleRad: 0, radiusFrac: 0.5, accuracyFrac: 0.1, mode: "sector", distanceM: null, accuracyM: null, detail: "por sector" },
      lastHeard: null,
      actions: [],
      simulated: false,
      color: "#fff",
    }) as unknown as DetectedSignal;

  const activo = { neurona: "tel-1", nombre: "Teléfono", ipOtro: "192.168.49.1", ipPropia: "192.168.49.23", ssid: "StarSeed-9f3a", metodo: "hotspot-local" as const, soyAp: false, mbps: null, desde: 1 };

  it("la señal de esa neurona (por id o por su IP en la red directa) dice el enlace; las demás, intactas", () => {
    const a = base("neuron:tel-1", "tel-1");
    const b = base("lan:192.168.49.1");
    const c = base("neuron:otra", "otra");
    const [x, y, z] = enriquecerConEnlaceWifi([a, b, c], [activo]);
    expect(x.metrics.find((m) => m.label === "Enlace Wi-Fi directo")?.value).toBe("activo · sin medir · sin router");
    expect(x.metrics.find((m) => m.label === "Enlace P2P")).toBeTruthy();
    expect(x.placement.detail).toContain(DETALLE_WIFI_DIRECTO);
    expect(y.metrics.some((m) => m.label === "Red directa")).toBe(true);
    expect(z).toBe(c);
    expect(enriquecerConEnlaceWifi([a], [])[0]).toBe(a);
  });
});
