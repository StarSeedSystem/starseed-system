/**
 * Protomolécula · ADAPTADOR WEB BLUETOOTH (F6, contrato §8.3). Convierte cada medición de un
 * wearable de ritmo cardíaco en `{ fuente, bruto }`, que es lo que recibe `vinculos-control.ts#procesar`.
 *
 * El acceso del navegador se INYECTA: este módulo nunca toca `navigator.bluetooth` por su cuenta.
 * La interfaz llama a `pedirAccesoBluetooth(navigator)` SOLO cuando la persona pulsa «Conectar wearable»
 * (es ahí cuando el navegador pide el permiso) y, si no hay Web Bluetooth, enseña el motivo: no se
 * finge ningún wearable.
 * Hoy no hay ningún wearable real conectado ni probado: las pruebas usan entradas simuladas.
 */

/** Solo el perfil ESTÁNDAR de ritmo cardíaco (servicio heart_rate 0x180D, característica 0x2A37). */
export const SERVICIO_PULSO = "heart_rate";
export const CARACTERISTICA_PULSO = "heart_rate_measurement";

/** Resultados de pedir acceso Bluetooth. */
export type ResultadoAcceso = { ok: true; acceso: AccesoBluetooth } | { ok: false; motivo: string };

/** Interfaces mínimas de Web Bluetooth que se usan. */
export interface NavegadorBluetooth { requestDevice?(opts?: { filters?: Array<{ services: string[] }>; optionalServices?: string[] }): Promise<DispositivoBluetooth>; }
export interface DispositivoBluetooth { gatt: ServidorBluetooth; addEventListener(t: "gattserverdisconnected", f: () => void): void; removeEventListener(t: "gattserverdisconnected", f: () => void): void; }
export interface ServidorBluetooth { getPrimaryService(s: string): Promise<ServicioBluetooth>; }
export interface ServicioBluetooth { getCharacteristic(c: string): Promise<CaracteristicaBluetooth>; }
export interface CaracteristicaBluetooth { startNotifications(): Promise<void>; stopNotifications(): Promise<void>; addEventListener(t: "characteristicvaluechanged", f: (ev: EventoValorCaracteristica) => void): void; removeEventListener(t: "characteristicvaluechanged", f: (ev: EventoValorCaracteristica) => void): void; }

/** Evento de cambio de valor de característica. */
export interface EventoValorCaracteristica { target: { value: DataView }; }

/** Fuentes de control de wearables. */
export type FuenteWearable = Extract<FuenteControl, { tipo: "sensor"; sensorId: "wearable:pulso" }>;
export interface MedidaPulso { fuente: FuenteWearable; bruto: number; }

/** Mensajes de error. */
export const SIN_BLUETOOTH = "Este navegador no ofrece Bluetooth web";
export const SIN_PERMISO = "No hay permiso para usar Bluetooth en este sitio: actívalo en los ajustes del navegador";

/** Saber si hay Web Bluetooth sin pedir permiso (para pintar el botón o el motivo). */
export const hayBluetooth = (nav?: { bluetooth?: NavegadorBluetooth } | null): boolean => typeof nav?.bluetooth?.requestDevice === "function";

/** Solo al pulsar «Conectar wearable». Con filtros para solo mostrar dispositivos con servicio de pulso. */
export async function pedirAccesoBluetooth(nav?: { bluetooth?: NavegadorBluetooth } | null): Promise<ResultadoAcceso> {
  const pedir = nav?.bluetooth?.requestDevice;
  if (typeof pedir !== "function") return { ok: false, motivo: SIN_BLUETOOTH };
  try {
    return { ok: true, dispositivo: await pedir.call(nav, { filters: [{ services: [SERVICIO_PULSO] }], optionalServices: [] }) };
  } catch (e) {
    const nombre = typeof e === "object" && e !== null && "name" in e ? String((e as { name: unknown }).name) : "";
    if (nombre === "NotAllowedError" || nombre === "SecurityError") return { ok: false, motivo: SIN_PERMISO };
    return { ok: false, motivo: `El navegador no pudo abrir Bluetooth${nombre ? ` (${nombre})` : ""}` };
  }
}

/** Bytes de una medición de pulso → fuente + valor bruto. */
export function analizarMedida(datos: DataView | null): MedidaPulso | null {
  if (!datos) return null;
  const flags = datos.getUint8(0);
  let indice = 1;
  const esValor16Bits = (flags & 0x01) === 1;
  const tieneContacto = (flags & 0x02) === 2;
  let pulso: number;
  if (esValor16Bits) { pulso = datos.getUint16(indice, true); indice += 2; }
  else { pulso = datos.getUint8(indice); indice += 1; }
  return { fuente: { tipo: "sensor", sensorId: "wearable:pulso", eje: tieneContacto ? "contacto" : "sin_contacto" }, bruto: pulso };
}

/** Nombre con el que se guarda el aparato en el vínculo (el id si el navegador no da nombre). */
export const nombreDispositivo = (d: DispositivoBluetooth): string => (d.name && d.name.trim()) || d.id;

/**
 * Escucha las notificaciones de la característica de pulso y las que se desconecten después.
 * Devuelve la función que lo desconecta todo; tras llamarla no llega nada más.
 */
export function conectarBluetooth(
  dispositivo: DispositivoBluetooth,
  alMedida: (m: MedidaPulso) => void,
  alCambiarDispositivos?: (nombres: string[]) => void,
): () => void {
  let servidor: ServidorBluetooth | null = null;
  let servicio: ServicioBluetooth | null = null;
  let caracteristica: CaracteristicaBluetooth | null = null;
  let activo = true;
  const limpiar = async () => { if (!activo) return; try { if (caracteristica) { await caracteristica.stopNotifications(); caracteristica = null; } if (servicio) servicio = null; if (servidor) servidor = null; } catch (e) {} };
  const reconectar = async () => {
    await limpiar();
    try {
      servidor = await dispositivo.gatt;
      servicio = await servidor.getPrimaryService(SERVICIO_PULSO);
      caracteristica = await servicio.getCharacteristic(CARACTERISTICA_PULSO);
      const manejarMedida = (ev: EventoValorCaracteristica) => { const medida = analizarMedida(ev.target.value); if (medida && activo) alMedida(medida); };
      caracteristica.addEventListener("characteristicvaluechanged", manejarMedida);
      await caracteristica.startNotifications();
      const manejarDesconexion = () => { activo = false; limpiar(); alCambiarDispositivos?.([]); };
      dispositivo.addEventListener("gattserverdisconnected", manejarDesconexion);
      return () => { activo = false; limpiar(); dispositivo.removeEventListener("gattserverdisconnected", manejarDesconexion); };
    } catch (e) { await limpiar(); throw e; }
  };
  reconectar().catch(e => { console.error("Error al conectar Bluetooth:", e); activo = false; });
  return () => { activo = false; limpiar(); };
}