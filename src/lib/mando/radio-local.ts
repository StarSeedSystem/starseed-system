// Radio nativa de la Mac (servidor): lee Wi-Fi y Bluetooth del SISTEMA con `system_profiler`,
// que ve lo que el navegador nunca ve (redes cercanas con su señal, dispositivos Bluetooth
// emparejados con batería y RSSI). Solo para el Mando local (Ola 375 · RDV10).
// Privacidad: el parser (`radio-local-tipos.ts`) descarta direcciones MAC antes de salir de aquí.
import { execFile } from "node:child_process";
import { parsearSystemProfiler, type RadioLocal } from "./radio-local-tipos";

export type LecturaRadioLocal =
  | { ok: true; radio: RadioLocal; deCache: boolean }
  | { ok: false; motivo: string };

/** Una lectura sirve 60 s: `system_profiler` tarda 2–8 s y pide CPU. */
const VIGENCIA_MS = 60_000;
const PLAZO_MS = 20_000;
const BUFFER_MAX = 5 * 1024 * 1024;

let ultimaBuena: RadioLocal | null = null;
let enVuelo: Promise<LecturaRadioLocal> | null = null;

function ejecutarSystemProfiler(): Promise<unknown> {
  return new Promise((ok, mal) => {
    execFile(
      "/usr/sbin/system_profiler",
      ["SPAirPortDataType", "SPBluetoothDataType", "-json"],
      { timeout: PLAZO_MS, maxBuffer: BUFFER_MAX },
      (error, stdout) => {
        if (error) return mal(error);
        try {
          ok(JSON.parse(String(stdout)));
        } catch (e) {
          mal(e);
        }
      },
    );
  });
}

async function leerDeVerdad(): Promise<LecturaRadioLocal> {
  try {
    const json = await ejecutarSystemProfiler();
    const radio = parsearSystemProfiler(json, Date.now());
    if (!radio.wifi && !radio.bluetooth) {
      return ultimaBuena
        ? { ok: true, radio: ultimaBuena, deCache: true }
        : { ok: false, motivo: "system_profiler no devolvió Wi-Fi ni Bluetooth" };
    }
    ultimaBuena = radio;
    return { ok: true, radio, deCache: false };
  } catch (e) {
    // Un fallo no borra la última lectura buena: se devuelve con su `at` para que se vea su edad.
    if (ultimaBuena) return { ok: true, radio: ultimaBuena, deCache: true };
    const motivo = e instanceof Error ? e.message.split("\n")[0].slice(0, 160) : "fallo desconocido";
    return { ok: false, motivo: `no se pudo leer la radio del sistema: ${motivo}` };
  }
}

/** Radio del sistema con caché de 60 s y una sola ejecución en vuelo. */
export async function leerRadioLocal(ahora: number = Date.now()): Promise<LecturaRadioLocal> {
  if (process.platform !== "darwin") {
    return { ok: false, motivo: "la radio nativa solo se lee en macOS (system_profiler)" };
  }
  if (ultimaBuena && ahora - ultimaBuena.at < VIGENCIA_MS) {
    return { ok: true, radio: ultimaBuena, deCache: true };
  }
  if (!enVuelo) {
    enVuelo = leerDeVerdad().finally(() => {
      enVuelo = null;
    });
  }
  return enVuelo;
}
