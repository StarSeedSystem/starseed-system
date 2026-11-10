/**
 * LLA1110D — una neurona SIN internet y con solo Bluetooth hacia la otra tiene ruta para llamar y la hace sonar.
 * Prueba 33: la tableta con el Wi-Fi apagado nunca llamaba (`planLlamada` → sin vía).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  enviar: vi.fn(),
  empezar: vi.fn(),
  directo: vi.fn(),
  pesado: vi.fn(),
}));

vi.mock("../buzon", () => ({
  anunciarEnChatMalla: vi.fn(),
  cambiarMensajeMalla: vi.fn(),
  guardarMensajeMalla: vi.fn(),
  mensajeMalla: vi.fn(),
  enviarANeurona: h.enviar,
  hayInternetYSesion: async () => ({ internet: false, uid: "u-alex" }),
}));
vi.mock("@/lib/mensajeria/medios/preferencias-store", () => ({ claveChat: () => "neurona:x", preferenciasEfectivas: () => ({ modo: "auto", elegidos: [] }) }));
vi.mock("@/lib/llamadas/pantalla", () => ({ motivoSinPantalla: async () => ({ motivo: "", ajustes: null }), pedirPantalla: async () => null }));
vi.mock("@/lib/malla/puente-ble-wifi", () => ({ avisarEnvioPesado: h.pesado }));
vi.mock("@/lib/malla/transporte-universal", () => ({ enlaceLocalHacia: () => null, enlacesDisponibles: async () => [] }));
vi.mock("@/lib/llamadas/voz-datos/transporte", () => ({ hayEnlaceDirectoCon: h.directo }));
vi.mock("@/lib/llamadas/acciones", () => ({ empezarLlamadaSinChat: h.empezar }));
vi.mock("@/lib/llamadas/store", () => ({ suscribirLlamadas: () => () => undefined, leerLlamadas: () => ({ activa: null, timbres: [] }) }));

import { llamarANeurona } from "../llamadas-neurona";

const conversacion = { clave: "n:tableta", destino: { neuronDeviceId: "neurona-mac", uid: "u-alex" }, nombre: "MaggaBook", propia: true };

beforeEach(() => {
  vi.clearAllMocks();
  h.enviar.mockResolvedValue({ clave: "n:tableta", id: "m1", estado: "enviado" });
  h.empezar.mockImplementation(async (o: { avisar: (s: string) => Promise<boolean> }) => {
    const ok = await o.avisar("0f8e0c4e-5a1b-4c2d-9e3f-1a2b3c4d5e6f");
    return ok ? { ok: true, sesionId: "0f8e0c4e-5a1b-4c2d-9e3f-1a2b3c4d5e6f" } : { ok: false, motivo: "sin aviso" };
  });
});

describe("llamar sin internet por el enlace directo (LLA1110D)", () => {
  it("con solo Bluetooth hacia la neurona hay ruta, va sin servidor y el timbre sale por el enlace", async () => {
    h.directo.mockResolvedValue(true);
    const r = await llamarANeurona({ conversacion, tipo: "video" });
    expect(r.ok).toBe(true);
    expect(r.plan?.via).toBe("sistema-llamadas");
    expect(h.empezar).toHaveBeenCalledTimes(1);
    expect(h.empezar.mock.calls[0][0]).toMatchObject({ neurona: "neurona-mac", sinServidor: true, tipo: "video" });
    // El timbre: el mismo mensaje urgente que cuando llama la Mac (vía «sistema-llamadas» con la sesión).
    expect(h.enviar).toHaveBeenCalledTimes(1);
    expect(h.enviar.mock.calls[0][0]).toMatchObject({ urgente: true, llamada: { tipo: "video", via: "sistema-llamadas", sesion: "0f8e0c4e-5a1b-4c2d-9e3f-1a2b3c4d5e6f" } });
  });

  it("sin internet y sin ningún enlace directo: no hay ruta (como antes) y se pide el Wi-Fi directo", async () => {
    h.directo.mockResolvedValue(false);
    const r = await llamarANeurona({ conversacion, tipo: "audio" });
    expect(r.ok).toBe(false);
    expect(h.empezar).not.toHaveBeenCalled();
    expect(h.pesado).toHaveBeenCalledTimes(1);
  });
});
