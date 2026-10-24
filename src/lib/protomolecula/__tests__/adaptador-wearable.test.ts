import { describe, expect, it, vi } from "vitest";
import { analizarTrama, CARACTERISTICA_PULSO, conectarPulso, CURVA_PULSO, FUENTE_PULSO, hayBluetooth, PULSO_PERDIDO, RANGO_PULSO, SENSOR_PULSO, SERVICIO_PULSO, SIN_APARATO, SIN_BLUETOOTH, SIN_PERFIL, type CaracteristicaPulso, type DispositivoPulso, type EstadoPulso, type GattPulso, type MensajePulso, type VistaBytes } from "../adaptador-wearable";
import { decidirOperacion, metricaDeFuente, revocarConsentimiento } from "../permisos";
import type { Consentimiento, Operacion, Sesion } from "../tipos";
import { normalizar01 } from "../vinculos-control";

/** NO hay ningún pulsómetro real: el navegador, el aparato y las tramas están simulados aquí. */
const vista = (...b: number[]): VistaBytes => { const d = new Uint8Array(b); return { byteLength: d.length, getUint8: (i) => d[i] }; };
type CharFalsa = CaracteristicaPulso & { value: VistaBytes | null; emitir: (...b: number[]) => void; oyentes: Set<() => void> };
const caracteristicaFalsa = (): CharFalsa => {
  const oyentes = new Set<() => void>();
  const c: CharFalsa = { value: null, addEventListener: (_t, f) => void oyentes.add(f), removeEventListener: (_t, f) => void oyentes.delete(f), startNotifications: async () => c, emitir: (...b) => { c.value = vista(...b); [...oyentes].forEach((f) => f()); }, oyentes };
  return c;
};
const aparatoFalso = (o: { servicio?: boolean; fallaConexion?: boolean } = {}) => {
  const oyentes = new Set<() => void>();
  const char = caracteristicaFalsa();
  const gatt: GattPulso = {
    connected: false,
    connect: async () => { if (o.fallaConexion) throw new Error("sin conexión"); gatt.connected = true; return gatt; },
    disconnect: () => { gatt.connected = false; },
    getPrimaryService: async (nombre) => {
      if (o.servicio === false || nombre !== SERVICIO_PULSO) throw new Error("sin servicio");
      return { getCharacteristic: async (n) => { if (n !== CARACTERISTICA_PULSO) throw new Error("sin característica"); return char; } };
    },
  };
  const dispositivo: DispositivoPulso & { desconectar: () => void } = {
    id: "ble-1", name: "Polar H10", gatt,
    addEventListener: (_t, f) => void oyentes.add(f), removeEventListener: (_t, f) => void oyentes.delete(f),
    desconectar: () => [...oyentes].forEach((f) => f()),
  };
  return { dispositivo, char, gatt, oyentes };
};
const navegador = (dispositivo: DispositivoPulso | Error) => ({ bluetooth: { requestDevice: async () => { if (dispositivo instanceof Error) throw dispositivo; return dispositivo; } } });
const errorConNombre = (name: string) => Object.assign(new Error("no"), { name });

describe("analizarTrama: perfil estándar 0x2A37", () => {
  it("8 bits: sin soporte de contacto y con el sensor en contacto (bits 1–2 = 11)", () => {
    expect([analizarTrama([0x00, 72]), analizarTrama([0x06, 80])]).toEqual([{ bpm: 72, contacto: null }, { bpm: 80, contacto: true }]);
  });
  it("16 bits little endian, con y sin contacto", () => {
    expect([analizarTrama([0x01, 0x2c, 0x01]), analizarTrama([0x07, 0x58, 0x02])]).toEqual([{ bpm: 300, contacto: null }, { bpm: 600, contacto: true }]);
  });
  it("contacto perdido: el aparato lo declara y la lectura se marca, no se inventa", () => {
    expect(analizarTrama([0x04, 70])).toEqual({ bpm: 70, contacto: false });
  });
  it("ignora los bytes de energía y de intervalo RR que van detrás", () => {
    expect(analizarTrama([0x10, 66, 9, 9, 9])?.bpm).toBe(66);
  });
  it("tramas cortas, vacías o con pulso cero no son lecturas", () => {
    for (const b of [null, [], [0x00], [0x01, 5], [0x00, 0]]) expect(analizarTrama(b)).toBeNull();
  });
});

describe("curva propia y fuente de salud", () => {
  it("la curva 40–180 no recorta la cifra y hayBluetooth solo dice sí con la API inyectada", () => {
    expect(RANGO_PULSO).toEqual({ min: 40, max: 180 });
    expect([normalizar01(SENSOR_PULSO, 40, CURVA_PULSO), normalizar01(SENSOR_PULSO, 110, CURVA_PULSO), normalizar01(SENSOR_PULSO, 180, CURVA_PULSO)]).toEqual([0, 0.5, 1]);
    expect([analizarTrama([0x00, 30])?.bpm, analizarTrama([0x00, 200])?.bpm]).toEqual([30, 200]);
    expect([hayBluetooth(null), hayBluetooth(undefined), hayBluetooth({})]).toEqual([false, false, false]);
    expect(hayBluetooth(navegador(aparatoFalso().dispositivo))).toBe(true);
  });
});

describe("conectarPulso: permiso, perfil y lecturas", () => {
  it("sin Web Bluetooth no se pide nada y se explica el motivo; cancelar da su motivo", async () => {
    expect(await conectarPulso(null, () => {})).toEqual({ ok: false, motivo: SIN_BLUETOOTH });
    expect(await conectarPulso({}, () => {})).toEqual({ ok: false, motivo: SIN_BLUETOOTH });
    expect(await conectarPulso(navegador(errorConNombre("NotFoundError")), () => {})).toEqual({ ok: false, motivo: SIN_APARATO });
  });
  it("un aparato sin el servicio 0x180D o una conexión que falla quedan como no compatibles", async () => {
    const sinServicio = aparatoFalso({ servicio: false }), falla = aparatoFalso({ fallaConexion: true });
    expect(await conectarPulso(navegador(sinServicio.dispositivo), () => {})).toEqual({ ok: false, motivo: SIN_PERFIL });
    expect(await conectarPulso(navegador(falla.dispositivo), () => {})).toEqual({ ok: false, motivo: SIN_PERFIL });
    expect(falla.char.oyentes.size).toBe(0);
  });
  it("pide solo el perfil estándar; sin contacto no difunde y con contacto entrega 8 y 16 bits", async () => {
    const { dispositivo, char } = aparatoFalso();
    const pedir = vi.fn(async (_o: { filters: { services: string[] }[] }) => dispositivo);
    const mensajes: MensajePulso[] = [];
    const r = await conectarPulso({ bluetooth: { requestDevice: pedir } }, (m) => mensajes.push(m));
    expect(r.ok).toBe(true);
    expect(pedir).toHaveBeenCalledWith({ filters: [{ services: [SERVICIO_PULSO] }] });
    char.emitir(0x00, 72); char.emitir(0x06, 81); char.emitir(0x04, 99); char.emitir(0x07, 0x58, 0x02);
    expect(mensajes.map((m) => m.bruto)).toEqual([72, 81, 600]);
    expect(mensajes.map((m) => m.contacto)).toEqual([null, true, true]);
    expect(mensajes[0]).toEqual({ fuente: FUENTE_PULSO, sensor: SENSOR_PULSO, bruto: 72, contacto: null });
    expect(metricaDeFuente(mensajes[0].fuente)).toBe("pulso");
  });
  it("desconectar suelta los oyentes; si el aparato se va, se avisa para no pintar un pulso viejo", async () => {
    const { dispositivo, char } = aparatoFalso();
    const mensajes: MensajePulso[] = [], estados: EstadoPulso[] = [];
    const r = await conectarPulso(navegador(dispositivo), (m) => mensajes.push(m), (e) => estados.push(e));
    if (!r.ok) throw new Error(r.motivo);
    expect(estados[0]).toEqual({ conectado: true, dispositivo: "Polar H10" });
    dispositivo.desconectar();
    expect(estados.at(-1)).toEqual({ conectado: false, motivo: PULSO_PERDIDO });
    r.desconectar();
    char.emitir(0x00, 90);
    expect(mensajes).toHaveLength(0);
    expect([char.oyentes.size, dispositivo.gatt?.connected]).toEqual([0, false]);
  });
});

describe("el pulso no viaja a la sesión sin consentimiento", () => {
  const opDe = (fuente: string): Operacion => ({ id: "w1", objetivo: { atomoId: "at-1", parametroId: "ritmo" }, accion: { tipo: "exacta", valor: 72 }, autor: { tipo: "persona", id: "ana" }, origen: "sensor", fuente, t: 1 });
  const sesion = (consentimientos: Consentimiento[]): Pick<Sesion, "ambito" | "consentimientos"> => ({ ambito: "grupo", consentimientos });
  const consentimiento = (extra: Partial<Consentimiento> = {}): Consentimiento => ({ metrica: "pulso", ambitoMax: "grupo", concedidoPor: "ana", concedidoEn: 0, ...extra });

  it("sin consentimiento no se difunde; con él sí; revocar, caducar o una métrica desconocida lo paran", () => {
    const op = opDe(FUENTE_PULSO);
    expect([decidirOperacion(op, "editor", sesion([]), 10).difundir, decidirOperacion(op, "editor", sesion([consentimiento()]), 10).difundir]).toEqual([false, true]);
    expect(decidirOperacion(op, "editor", sesion(revocarConsentimiento([consentimiento()], "pulso", "ana")), 10).difundir).toBe(false);
    expect(decidirOperacion(op, "editor", sesion([consentimiento({ caducaEn: 5 })]), 10).difundir).toBe(false);
    const ajeno = opDe("wearable:algo-raro");
    expect([metricaDeFuente(ajeno.fuente), decidirOperacion(ajeno, "editor", sesion([consentimiento()]), 10).difundir]).toEqual([null, false]);
  });
});
