// Radio local de la Mac: tipos y parser PURO de la salida de
// `system_profiler SPAirPortDataType SPBluetoothDataType -json`.
// Sin node:* ni efectos secundarios (también lo importa el cliente).
// Privacidad: jamás se copian direcciones MAC ni `*_address`.
// (Ola 375 · RDV9: el agente dejó los tipos y los ayudantes; el supervisor escribió el parser.)

export interface RedWifi {
  ssid: string | null;
  canal: number | null;
  banda: "2,4 GHz" | "5 GHz" | "6 GHz" | null;
  anchoMHz: number | null;
  phy: string | null;
  seguridad: string | null;
  rssiDbm: number | null;
  ruidoDbm: number | null;
}

export interface RedWifiActual extends RedWifi {
  velocidadMbps: number | null;
  mcs: number | null;
  pais: string | null;
}

export interface DispositivoBt {
  nombre: string;
  tipo: string | null;
  conectado: boolean;
  rssiDbm: number | null;
  bateriaPct: number | null;
  fabricante: string | null;
}

export interface RadioLocal {
  v: 1;
  at: number;
  wifi: {
    interfaz: string | null;
    estado: "conectado" | "desconectado" | "apagado" | "desconocido";
    tarjeta: string | null;
    actual: RedWifiActual | null;
    cercanas: RedWifi[];
  } | null;
  bluetooth: {
    encendido: boolean;
    chipset: string | null;
    transporte: string | null;
    dispositivos: DispositivoBt[];
  } | null;
}

/** Máximo de redes cercanas y de dispositivos Bluetooth que se devuelven. */
const TOPE = 40;

type Reg = Record<string, unknown>;

function esReg(x: unknown): x is Reg {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function lista(x: unknown): unknown[] {
  return Array.isArray(x) ? x : [];
}

function texto(x: unknown): string | null {
  return typeof x === "string" && x.length > 0 ? x : null;
}

function numero(x: unknown): number | null {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "string") {
    const m = x.match(/-?\d+(?:\.\d+)?/);
    const n = m ? Number(m[0]) : NaN;
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

const VENDEDORES: Record<string, string> = {
  "0x05AC": "Apple",
  "0x004C": "Apple",
  "0x0006": "Microsoft",
  "0x000F": "Broadcom",
  "0x0087": "Garmin",
  "0x00E0": "Google",
  "0x0075": "Samsung",
  "0x0311": "Samsung",
};

/** «0x004C», «0x004C (Apple)» o el número 76 → «Apple». */
function fabricante(vendorId: unknown): string | null {
  let v: string | null = null;
  if (typeof vendorId === "number" && Number.isFinite(vendorId)) {
    v = "0x" + vendorId.toString(16).toUpperCase().padStart(4, "0");
  } else {
    const t = texto(vendorId);
    const m = t?.match(/0x[0-9a-f]+/i);
    if (m) v = "0x" + m[0].slice(2).toUpperCase().padStart(4, "0");
    const nombre = t?.match(/\(([^)]+)\)/)?.[1];
    if (!v && nombre) return nombre;
    if (v && !VENDEDORES[v] && nombre) return nombre;
  }
  return v ? VENDEDORES[v] ?? null : null;
}

const SEGURIDAD: Record<string, string> = {
  spairport_security_mode_none: "abierta",
  spairport_security_mode_wep: "WEP",
  spairport_security_mode_wpa_personal: "WPA Personal",
  spairport_security_mode_wpa2_personal: "WPA2 Personal",
  spairport_security_mode_wpa3_personal: "WPA3 Personal",
  spairport_security_mode_wpa2_enterprise: "WPA2 Empresa",
  spairport_security_mode_wpa3_enterprise: "WPA3 Empresa",
};

function seguridad(modo: unknown): string | null {
  const m = texto(modo);
  if (!m) return null;
  return SEGURIDAD[m] ?? m.replace(/^spairport_security_mode_/, "").replaceAll("_", " ");
}

// "149 (5GHz, 80MHz)" → canal 149, banda 5 GHz, ancho 80 MHz. macOS escribe «2GHz» para 2,4.
function analizarCanal(cadena: unknown): { canal: number | null; banda: RedWifi["banda"]; anchoMHz: number | null } {
  const c = typeof cadena === "number" ? String(cadena) : texto(cadena);
  if (!c) return { canal: null, banda: null, anchoMHz: null };
  const mCanal = c.match(/^\s*(\d+)/);
  const mBanda = c.match(/(2,4|2\.4|2|5|6)\s*GHz/);
  const mAncho = c.match(/(\d+)\s*MHz/);
  let banda: RedWifi["banda"] = null;
  if (mBanda) banda = mBanda[1] === "5" ? "5 GHz" : mBanda[1] === "6" ? "6 GHz" : "2,4 GHz";
  const canal = mCanal ? Number(mCanal[1]) : null;
  if (!banda && canal !== null) banda = canal <= 14 ? "2,4 GHz" : "5 GHz";
  return { canal, banda, anchoMHz: mAncho ? Number(mAncho[1]) : null };
}

// "-46 dBm / -97 dBm" → señal y ruido
function analizarSenal(cadena: unknown): { rssiDbm: number | null; ruidoDbm: number | null } {
  const c = texto(cadena);
  if (!c) return { rssiDbm: null, ruidoDbm: null };
  const nums = c.match(/-\d+/g)?.map(Number) ?? [];
  return { rssiDbm: nums[0] ?? null, ruidoDbm: nums[1] ?? null };
}

function limpiarSsid(nombre: unknown): string | null {
  const s = texto(nombre);
  if (!s || s === "<redacted>") return null;
  return s;
}

function red(r: Reg): RedWifi {
  return {
    ssid: limpiarSsid(r._name),
    ...analizarCanal(r.spairport_network_channel),
    phy: texto(r.spairport_network_phymode),
    seguridad: seguridad(r.spairport_security_mode),
    ...analizarSenal(r.spairport_signal_noise),
  };
}

function estadoWifi(x: unknown): NonNullable<RadioLocal["wifi"]>["estado"] {
  const s = (texto(x) ?? "").toLowerCase();
  if (s.includes("disconnected") || s.includes("inactive")) return "desconectado";
  if (s.includes("connected")) return "conectado";
  if (s.includes("off")) return "apagado";
  return "desconocido";
}

function wifiDe(json: Reg): RadioLocal["wifi"] {
  for (const bloque of lista(json.SPAirPortDataType)) {
    if (!esReg(bloque)) continue;
    const interfaces = lista(bloque.spairport_airport_interfaces).filter(esReg);
    // La interfaz Wi-Fi de verdad es la que trae estado; las awdl/llw no.
    const i = interfaces.find((x) => x.spairport_status_information !== undefined) ?? interfaces[0];
    if (!i) continue;
    const actualCruda = i.spairport_current_network_information;
    const actual: RedWifiActual | null = esReg(actualCruda)
      ? {
          ...red(actualCruda),
          velocidadMbps: numero(actualCruda.spairport_network_rate),
          mcs: numero(actualCruda.spairport_network_mcs),
          pais: texto(actualCruda.spairport_network_country_code),
        }
      : null;
    const cercanas = lista(i.spairport_other_local_wireless_networks)
      .filter(esReg)
      .map(red)
      .sort((a, b) => (b.rssiDbm ?? -999) - (a.rssiDbm ?? -999))
      .slice(0, TOPE);
    const tarjeta = texto(i.spairport_wireless_card_type);
    return {
      interfaz: texto(i._name),
      estado: estadoWifi(i.spairport_status_information),
      tarjeta: tarjeta ? tarjeta.replace(/^spairport_wireless_card_type_/, "") : null,
      actual,
      cercanas,
    };
  }
  return null;
}

/** `device_connected: [{ "AirPods": {…} }, …]` → un dispositivo por nombre. */
function dispositivosDe(grupo: unknown, conectado: boolean): DispositivoBt[] {
  const out: DispositivoBt[] = [];
  for (const entrada of lista(grupo)) {
    if (!esReg(entrada)) continue;
    for (const [nombre, d] of Object.entries(entrada)) {
      if (!esReg(d)) continue;
      const bateria =
        numero(d.device_batteryLevelMain) ??
        numero(d.device_batteryLevel) ??
        numero(d.device_batteryLevelCase) ??
        numero(d.device_batteryLevelLeft);
      out.push({
        nombre,
        tipo: texto(d.device_minorType) ?? texto(d.device_majorType),
        conectado,
        rssiDbm: numero(d.device_rssi),
        bateriaPct: bateria,
        fabricante: fabricante(d.device_vendorID),
      });
    }
  }
  return out;
}

function bluetoothDe(json: Reg): RadioLocal["bluetooth"] {
  for (const bloque of lista(json.SPBluetoothDataType)) {
    if (!esReg(bloque)) continue;
    const c = esReg(bloque.controller_properties) ? bloque.controller_properties : {};
    const estado = (texto(c.controller_state) ?? "").toLowerCase();
    const dispositivos = [
      ...dispositivosDe(bloque.device_connected, true),
      ...dispositivosDe(bloque.device_not_connected, false),
    ].slice(0, TOPE);
    return {
      encendido: estado.includes("on") && !estado.includes("off"),
      chipset: texto(c.controller_chipset),
      transporte: texto(c.controller_transport),
      dispositivos,
    };
  }
  return null;
}

/**
 * Convierte la salida JSON de `system_profiler SPAirPortDataType SPBluetoothDataType -json`
 * en un `RadioLocal`. Nunca lanza: lo que no se entiende queda en `null`.
 */
export function parsearSystemProfiler(json: unknown, ahora: number): RadioLocal {
  const raiz: Reg = esReg(json) ? json : {};
  let wifi: RadioLocal["wifi"] = null;
  let bluetooth: RadioLocal["bluetooth"] = null;
  try {
    wifi = wifiDe(raiz);
  } catch {
    wifi = null;
  }
  try {
    bluetooth = bluetoothDe(raiz);
  } catch {
    bluetooth = null;
  }
  return { v: 1, at: ahora, wifi, bluetooth };
}
