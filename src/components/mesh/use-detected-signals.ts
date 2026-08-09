"use client";

/**
 * useDetectedSignals — CABLEADO de todas las fuentes REALES del inventario
 * multi-antena (Adenda 150).
 * ============================================================================
 * Junta en un solo hook, sin inventar NADA, lo que de verdad existe hoy:
 *
 *   · `useMeshState()`      → nodos LoRa del radio conectado (SNR/RSSI/GPS/saltos)
 *                             + topologías federadas de tus otras neuronas.
 *   · `useNearbyBeacons()`  → faros de la red sináptica (neuronas StarSeed).
 *   · `listNeurons()`       → neuronas registradas de la cuenta (neuron_devices)
 *                             con sus capacidades PÚBLICAS y su latido.
 *   · `externalLink()`      → la portadora IP medida (router / datos).
 *   · Escaneo BLE           → SOLO tras un gesto del usuario (Web Bluetooth).
 *   · Web Serial            → puertos USB ya autorizados por el usuario.
 *
 * Lo que NO está disponible se declara en `unavailable` con su porqué, para que
 * la UI lo muestre en vez de fingir que no existe. SSR-safe: sin window devuelve
 * listas vacías y no toca ninguna API. Nunca lanza.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMeshState, useNearbyBeacons, subscribeConnectivity } from "@/ai/astraura/mesh";
import {
  collectDetectedSignals,
  getBleScanState,
  listAuthorizedSerialPorts,
  probeBleSupport,
  subscribeBleScan,
  BLE_FRESH_MS,
  type AccountNeuronView,
  type BleScanState,
  type DetectedSignal,
  type SerialPortView,
} from "@/ai/astraura/mesh/signals";
import { listNeurons, NEURON_EVENT, type Neuron } from "@/lib/neurons/neurons";

/** Cadencia de refresco del registro de neuronas (consulta a la cuenta). */
const NEURONS_REFRESH_MS = 90_000;

/** Una fuente que HOY no da datos, con la razón exacta (honestidad radical). */
export interface UnavailableSource {
  id: string;
  label: string;
  reason: string;
  /** Qué puede hacer el usuario para desbloquearla (si algo puede hacerse). */
  fix?: string;
}

export interface DetectedSignalsOptions {
  /**
   * Consultar el REGISTRO de neuronas de la cuenta (Supabase). Es la única
   * fuente que sale a la red; las superficies ligeras (widget del escritorio)
   * la apagan y trabajan solo con lo que ya está en memoria. Por defecto true.
   */
  accountRegistry?: boolean;
}

export interface DetectedSignalsResult {
  signals: DetectedSignal[];
  ble: BleScanState;
  /** ¿Se está consultando el registro de neuronas ahora mismo? */
  loadingNeurons: boolean;
  /** Fuentes reales que no dan datos y por qué. */
  unavailable: UnavailableSource[];
  /** Fuerza un refresco de neuronas + puertos serie. */
  refresh: () => void;
}

/**
 * Capacidades PÚBLICAS de una neurona (nunca datos privados: ni memorias, ni
 * archivos, ni tokens). Solo lo que la propia neurona declara del hardware.
 */
function publicCapabilities(n: Neuron): string[] {
  const c = n.capabilities ?? {};
  const caps: string[] = [];
  if (c.webgpu) caps.push("WebGPU (IA local)");
  if (c.chromeAi) caps.push("IA integrada del navegador");
  if (c.ollama) caps.push("Ollama");
  if (c.lmstudio) caps.push("LM Studio");
  if (c.webgl2) caps.push("WebGL2");
  if (c.gpuRenderer) caps.push(`GPU ${c.gpuRenderer}`);
  if (typeof c.cores === "number") caps.push(`${c.cores} núcleos`);
  if (typeof c.memoryGb === "number") caps.push(`${c.memoryGb} GB RAM`);
  if (typeof c.storageQuotaGb === "number") caps.push(`${c.storageQuotaGb} GB de cuota`);
  if (c.installedApp) caps.push("app instalada");
  if (c.touch) caps.push("táctil");
  if (c.hermesInstalled) caps.push("puente Hermes");
  if (typeof c.battery?.level === "number") {
    caps.push(`batería ${c.battery.level} %${c.battery.charging ? " (cargando)" : ""}`);
  }
  // Permisos declarados: son la "interfaz pública" de la neurona en la red.
  const p = n.permissions ?? {};
  const perms = [
    p.compute ? "cómputo" : null,
    p.storage ? "almacenamiento" : null,
    p.sync ? "sincronización" : null,
    p.agent ? "agente" : null,
    p.wake ? "despertar" : null,
  ].filter(Boolean) as string[];
  if (perms.length) caps.push(`ofrece: ${perms.join(", ")}`);
  return caps;
}

function toView(n: Neuron): AccountNeuronView {
  return {
    id: n.id,
    name: n.name,
    kind: n.kind,
    online: !!n.online,
    lastSeenMs: n.last_seen_at ? Date.parse(n.last_seen_at) || null : null,
    platform: n.capabilities?.platform,
    browser: n.capabilities?.browser,
    syncDeviceId: n.capabilities?.syncDeviceId,
    capabilities: publicCapabilities(n),
    isThisDevice: !!n.isThisDevice,
  };
}

/* ── Caché COMPARTIDA del registro de neuronas ─────────────────────────────────
 * El radar y el inventario montan el hook a la vez: sin esto, cada superficie
 * lanzaría su propia consulta a `neuron_devices` cada 90 s. Una sola petición en
 * vuelo, un solo temporizador, todos los suscriptores comparten el resultado.
 */
interface NeuronsCache {
  list: AccountNeuronView[];
  probed: boolean;
  loading: boolean;
}
/** Referencia estable para el caso «sin registro»: evita recalcular en cada render. */
const NO_NEURONS: AccountNeuronView[] = [];
let neuronsCache: NeuronsCache = { list: NO_NEURONS, probed: false, loading: false };
const neuronsListeners = new Set<(c: NeuronsCache) => void>();
let neuronsInFlight: Promise<void> | null = null;

function publishNeurons(patch: Partial<NeuronsCache>): void {
  neuronsCache = { ...neuronsCache, ...patch };
  for (const l of neuronsListeners) {
    try { l(neuronsCache); } catch { /* un listener roto no tumba al resto */ }
  }
}

function fetchNeurons(): Promise<void> {
  if (neuronsInFlight) return neuronsInFlight;
  publishNeurons({ loading: true });
  neuronsInFlight = listNeurons()
    .then((list) => { publishNeurons({ list: list.map(toView) }); })
    .catch(() => { /* sin sesión/tabla: la lista se queda vacía y se declara */ })
    .finally(() => {
      neuronsInFlight = null;
      publishNeurons({ loading: false, probed: true });
    });
  return neuronsInFlight;
}

export function useDetectedSignals(options?: DetectedSignalsOptions): DetectedSignalsResult {
  const accountRegistry = options?.accountRegistry !== false;
  const mesh = useMeshState();
  const beacons = useNearbyBeacons();
  const [neuronsState, setNeuronsState] = useState<NeuronsCache>(() => neuronsCache);
  const [serialPorts, setSerialPorts] = useState<SerialPortView[]>([]);
  const [serialProbed, setSerialProbed] = useState(false);
  const [ble, setBle] = useState<BleScanState>(getBleScanState);
  // Sella el reloj para que la colocación NO cambie en cada render (determinismo
  // visual): solo avanza cuando cambia alguna fuente o cada 15 s.
  const [tick, setTick] = useState(0);
  const alive = useRef(true);

  const neurons = accountRegistry ? neuronsState.list : NO_NEURONS;
  const neuronsProbed = accountRegistry ? neuronsState.probed : true;
  const loadingNeurons = accountRegistry && neuronsState.loading;

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  /* Registro de neuronas de la cuenta (consulta remota compartida, cadencia larga). */
  const loadNeurons = useCallback(() => {
    if (!accountRegistry) return;
    void fetchNeurons();
  }, [accountRegistry]);

  const loadSerial = useCallback(() => {
    void listAuthorizedSerialPorts().then((ports) => {
      if (!alive.current) return;
      setSerialPorts(ports);
      setSerialProbed(true);
    });
  }, []);

  useEffect(() => {
    if (!accountRegistry) return;
    neuronsListeners.add(setNeuronsState);
    loadNeurons();
    const t = setInterval(loadNeurons, NEURONS_REFRESH_MS);
    if (typeof window === "undefined") {
      return () => { neuronsListeners.delete(setNeuronsState); clearInterval(t); };
    }
    window.addEventListener(NEURON_EVENT, loadNeurons);
    return () => {
      neuronsListeners.delete(setNeuronsState);
      clearInterval(t);
      window.removeEventListener(NEURON_EVENT, loadNeurons);
    };
  }, [accountRegistry, loadNeurons]);

  /* Puertos serie autorizados (se revisan al cambiar la conectividad). */
  useEffect(() => {
    loadSerial();
    return subscribeConnectivity(loadSerial);
  }, [loadSerial]);
  // Al conectar/soltar un radio pueden aparecer/desaparecer autorizaciones.
  useEffect(() => { loadSerial(); }, [loadSerial, mesh.status, mesh.transport]);

  /* Estado del escaneo BLE (sondeo de soporte sin gesto + suscripción). */
  useEffect(() => {
    void probeBleSupport();
    return subscribeBleScan(setBle);
  }, []);

  /* Latido lento: refresca "hace X" y la calidad por frescura sin re-render loco. */
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 15_000);
    return () => clearInterval(t);
  }, []);

  const now = Date.now();
  const freshBle = useMemo(
    () => ble.detections.filter((d) => d.viaPicker || now - d.at < BLE_FRESH_MS),
    // `tick` fuerza la reevaluación temporal sin depender de `now` (que cambia siempre).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ble.detections, tick],
  );

  const signals = useMemo(
    () => collectDetectedSignals({ mesh, beacons, neurons, ble: freshBle, serialPorts }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mesh, beacons, neurons, freshBle, serialPorts, tick],
  );

  const unavailable = useMemo<UnavailableSource[]>(() => {
    const out: UnavailableSource[] = [];
    const radioOn = mesh.status === "ready" || mesh.status === "degraded";
    if (!radioOn) {
      out.push({
        id: "lora",
        label: "Malla LoRa (Meshtastic)",
        reason: "No hay radio conectado, así que esta neurona no oye ningún nodo por radiofrecuencia.",
        fix: "Conecta un radio por USB (Web Serial), por Bluetooth o apunta al daemon meshtasticd de tu red.",
      });
    }
    if (ble.support === "unsupported") {
      out.push({
        id: "ble",
        label: "Bluetooth LE",
        reason: "Este navegador no implementa Web Bluetooth (Safari y Firefox no lo soportan).",
        fix: "Usa Chrome/Edge en escritorio o Android, o la app nativa para acceso completo al hardware.",
      });
    } else if (ble.support === "picker") {
      out.push({
        id: "ble-scan",
        label: "Escaneo BLE continuo",
        reason: "Este navegador solo ofrece el SELECTOR de dispositivos: verás el que elijas, pero sin RSSI (no hay potencia ni distancia).",
        fix: "Activa chrome://flags/#enable-experimental-web-platform-features para habilitar requestLEScan.",
      });
    } else if (ble.adapter === false) {
      out.push({
        id: "ble-adapter",
        label: "Adaptador Bluetooth",
        reason: "El navegador reporta que no hay adaptador Bluetooth disponible o está apagado.",
        fix: "Enciende el Bluetooth del sistema y vuelve a escanear.",
      });
    } else if (!ble.scanning && ble.detections.length === 0) {
      out.push({
        id: "ble-gesture",
        label: "Bluetooth LE",
        reason: "El navegador prohíbe escanear BLE sin un gesto tuyo: hasta que pulses «Escanear BLE» no hay ningún dato.",
        fix: "Pulsa «Escanear BLE» para empezar a oír anuncios con su RSSI real.",
      });
    }
    if (serialProbed && serialPorts.length === 0) {
      out.push({
        id: "serial",
        label: "Serie / USB",
        reason:
          typeof navigator !== "undefined" && "serial" in navigator
            ? "No hay ningún puerto serie autorizado todavía: el navegador solo los revela tras tu autorización explícita."
            : "Web Serial no existe en este navegador.",
        fix:
          typeof navigator !== "undefined" && "serial" in navigator
            ? "Pulsa «Conectar radio USB» y elige el puerto del radio en el diálogo del navegador."
            : "Usa Chrome/Edge de escritorio para radios USB.",
      });
    }
    if (!accountRegistry) {
      out.push({
        id: "account-off",
        label: "Neuronas de tu cuenta",
        reason: "Esta superficie ligera no consulta el registro de la cuenta para no salir a la red.",
        fix: "Abre Señales o Red Mesh a pantalla completa para ver todas las neuronas de tu cuenta.",
      });
    } else if (neuronsProbed && neurons.filter((n) => !n.isThisDevice).length === 0) {
      out.push({
        id: "account",
        label: "Neuronas de tu cuenta",
        reason: "El registro de la cuenta no devuelve otras neuronas (sin sesión iniciada o esta es tu única neurona).",
        fix: "Inicia sesión en StarSeed desde otro dispositivo para verlo aparecer aquí.",
      });
    }
    if (beacons.length === 0) {
      out.push({
        id: "relay",
        label: "Faros de la red sináptica",
        reason: "Ninguna neurona StarSeed ha emitido un faro reciente alcanzable desde aquí (o el radar público está apagado en privacidad).",
        fix: "Comprueba que el internet público StarSeed está encendido en el panel de conectividad.",
      });
    }
    // Wi-Fi: la plataforma NUNCA permite escanear redes cercanas. Se declara.
    out.push({
      id: "wifi-scan",
      label: "Escaneo de redes Wi-Fi cercanas",
      reason: "Ningún navegador expone SSID, MAC ni la lista de redes Wi-Fi del entorno: sería vigilancia y la plataforma lo prohíbe. Solo se puede medir la conexión ACTIVA.",
    });
    out.push({
      id: "cellular-scan",
      label: "Escaneo de celdas / torres celulares",
      reason: "La web no da acceso a la antena celular ni a las celdas vecinas. Solo el tipo de conexión (2G–5G) cuando el sistema lo reporta.",
      fix: "Para antenas directas y múltiples radios simultáneos, usa la app nativa.",
    });
    return out;
  }, [mesh.status, ble.support, ble.adapter, ble.scanning, ble.detections.length, serialProbed, serialPorts.length, neuronsProbed, neurons, beacons.length, accountRegistry]);

  const refresh = useCallback(() => {
    loadNeurons();
    loadSerial();
    void probeBleSupport();
    setTick((n) => n + 1);
  }, [loadNeurons, loadSerial]);

  return { signals, ble, loadingNeurons, unavailable, refresh };
}

export default useDetectedSignals;
