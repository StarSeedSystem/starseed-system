'use client';

// ════════════════════════════════════════════════════════════════
// Dashboard Devices — capa ligera de dispositivos y sincronización
// ----------------------------------------------------------------
// Modelo aditivo y defensivo (localStorage, SSR-safe) para la "pantalla
// principal adaptativa": permite AGRUPAR pestañas del dashboard por tipo de
// dispositivo (móvil/tablet/desktop/VR/AR…) y asociar dispositivos concretos
// derivados de la cuenta / cerebros / servidores (src/lib/brains/brains.ts).
//
// No inventa datos: si el usuario no ha configurado nada, se ofrecen unos
// dispositivos por defecto razonables (este dispositivo, detectado del entorno)
// + opciones de sincronización automáticas, todo configurable. Nunca lanza;
// degrada en silencio a un conjunto vacío cuando no hay window/localStorage.
// ════════════════════════════════════════════════════════════════

import type { DeviceType } from "./dashboard-types";
import type { LucideIcon } from "lucide-react";
import {
    Smartphone, Tablet, Monitor, Tv, Glasses, Watch, Car, Cpu, Layers,
} from "lucide-react";

// ── Catálogo de tipos de dispositivo (para etiquetas y agrupación) ──
export interface DeviceTypeDef {
    id: DeviceType;
    label: string;
    icon: LucideIcon;
    /** Acento (token CSS o hex) para chips/insignias. */
    accent: string;
    blurb: string;
}

export const DEVICE_TYPES: DeviceTypeDef[] = [
    { id: "all", label: "Universal", icon: Layers, accent: "#94a3b8", blurb: "Se muestra en cualquier dispositivo." },
    { id: "phone", label: "Teléfono", icon: Smartphone, accent: "#22D3EE", blurb: "Pantalla pequeña, una mano. Widgets 2/hilera, apps 4–8/hilera." },
    { id: "tablet", label: "Tablet", icon: Tablet, accent: "#34D399", blurb: "Pantalla media, táctil. Rejillas de 3 columnas." },
    { id: "desktop", label: "Escritorio", icon: Monitor, accent: "#818CF8", blurb: "Pantalla grande, ratón. Rejilla completa arrastrable." },
    { id: "tv", label: "TV / Salón", icon: Tv, accent: "#F472B6", blurb: "Pantalla lejana, mando. Tipografía y objetivos grandes." },
    { id: "vr", label: "VR / AR", icon: Glasses, accent: "#A855F7", blurb: "Inmersivo espacial (WebXR). Portales y profundidad." },
    { id: "watch", label: "Reloj", icon: Watch, accent: "#FBBF24", blurb: "Micro-pantalla. Un dato clave a la vez." },
    { id: "car", label: "Vehículo", icon: Car, accent: "#FB923C", blurb: "En movimiento. Mínima interacción, máximo contraste." },
    { id: "iot", label: "IoT / Hábitat", icon: Cpu, accent: "#10B981", blurb: "Dispositivos del Oikos (domótica, sensores)." },
];

export function deviceTypeById(id: DeviceType): DeviceTypeDef | undefined {
    return DEVICE_TYPES.find((d) => d.id === id);
}

// ── Dispositivos concretos del usuario (cuenta/cerebros/servidores) ──
export interface UserDevice {
    id: string;
    name: string;
    type: DeviceType;
    /** Origen: 'this' (este equipo), 'brain-server' (servidor de un cerebro), 'manual'. */
    source?: "this" | "brain-server" | "manual";
    /** Referencia al servidor/cerebro de origen (BrainServer.id), si aplica. */
    ref?: string;
    /** Última sincronización (epoch ms). */
    lastSync?: number;
    online?: boolean;
}

// ── Grupo de dispositivos afines (p. ej. "Mis móviles") ──
export interface DeviceGroup {
    id: string;
    label: string;
    deviceIds: string[];
    /** Tipos incluidos por defecto (para auto-asignar tableros). */
    types?: DeviceType[];
}

// ── Opciones de interconexión / sincronización ──
export interface DeviceSyncOptions {
    /** Sincronización automática entre dispositivos activada. Default: true. */
    auto: boolean;
    /** Sincronizar los tableros/paneles. Default: true. */
    dashboards: boolean;
    /** Sincronizar widgets y su disposición. Default: true. */
    widgets: boolean;
    /** Sincronizar la apariencia/tema. Default: false. */
    appearance: boolean;
    /** Adaptar automáticamente el tablero mostrado al dispositivo actual. Default: true. */
    adaptToDevice: boolean;
    /** Preferir cerebros/servidores para el estado (si existen). Default: true. */
    preferBrains: boolean;
}

export const DEFAULT_SYNC_OPTIONS: DeviceSyncOptions = {
    auto: true,
    dashboards: true,
    widgets: true,
    appearance: false,
    adaptToDevice: true,
    preferBrains: true,
};

// ── Persistencia (localStorage, SSR-safe) ──
const LS_DEVICES = "starseed_devices_v1";
const LS_DEVICE_GROUPS = "starseed_device_groups_v1";
const LS_SYNC_OPTS = "starseed_device_sync_v1";

function safeGet<T>(key: string, fallback: T): T {
    if (typeof window === "undefined") return fallback;
    try {
        const raw = window.localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
        return fallback;
    }
}
function safeSet(key: string, value: unknown): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
        /* cuota / modo privado: degradamos en silencio */
    }
}

/**
 * Detecta el tipo del dispositivo ACTUAL a partir del entorno (defensivo).
 * Heurística barata; nunca lanza. VR/AR se detecta por WebXR si está presente.
 */
export function detectCurrentDeviceType(): DeviceType {
    if (typeof window === "undefined" || typeof navigator === "undefined") return "desktop";
    try {
        const nav = navigator as Navigator & { xr?: unknown };
        if (nav.xr) return "vr";
        const ua = navigator.userAgent || "";
        const coarse = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
        const w = window.innerWidth || 1024;
        if (/watch/i.test(ua)) return "watch";
        if (/tv|smarttv|googletv|appletv/i.test(ua)) return "tv";
        if (/mobi|iphone|android.*mobile/i.test(ua) || (coarse && w < 640)) return "phone";
        if (/ipad|tablet|android/i.test(ua) || (coarse && w < 1100)) return "tablet";
        return "desktop";
    } catch {
        return "desktop";
    }
}

/**
 * Dispositivo por defecto que representa ESTE equipo (sin inventar datos: solo
 * lo que el entorno permite deducir). Siempre presente en la lista de origen.
 */
export function thisDevice(): UserDevice {
    const t = detectCurrentDeviceType();
    const label = deviceTypeById(t)?.label ?? "Este dispositivo";
    return { id: "this-device", name: `Este ${label.toLowerCase()}`, type: t, source: "this", online: true, lastSync: Date.now() };
}

export function loadDevices(): UserDevice[] {
    const stored = safeGet<UserDevice[]>(LS_DEVICES, []);
    const withThis = stored.some((d) => d.id === "this-device") ? stored : [thisDevice(), ...stored];
    return withThis;
}

export function saveDevices(devices: UserDevice[]): void {
    safeSet(LS_DEVICES, devices);
}

export function loadDeviceGroups(): DeviceGroup[] {
    return safeGet<DeviceGroup[]>(LS_DEVICE_GROUPS, []);
}

export function saveDeviceGroups(groups: DeviceGroup[]): void {
    safeSet(LS_DEVICE_GROUPS, groups);
}

export function loadSyncOptions(): DeviceSyncOptions {
    return { ...DEFAULT_SYNC_OPTIONS, ...safeGet<Partial<DeviceSyncOptions>>(LS_SYNC_OPTS, {}) };
}

export function saveSyncOptions(opts: DeviceSyncOptions): void {
    safeSet(LS_SYNC_OPTS, opts);
}

/**
 * Importa dispositivos desde los servidores de un cerebro (BrainServer[]),
 * mapeando su tipo de forma razonable. Aditivo: no borra los existentes;
 * fusiona por id. Pensado para reutilizar la infraestructura de cerebros.
 */
export function devicesFromBrainServers(
    servers: Array<{ id: string; name?: string; kind?: string | unknown }>,
): UserDevice[] {
    const map: Record<string, DeviceType> = {
        local: "desktop", own: "desktop", vps: "iot", hostinger: "iot",
        starseed: "iot", service: "iot", online: "iot",
    };
    return (servers || []).map((s) => ({
        id: `srv:${s.id}`,
        name: s.name || "Servidor",
        type: map[String(s.kind ?? "online")] ?? "iot",
        source: "brain-server" as const,
        ref: s.id,
        online: false,
    }));
}

/**
 * ¿Debería mostrarse este tablero en el tipo de dispositivo dado? Un tablero
 * sin etiquetas (o con 'all') es universal. Base para el filtro de pestañas.
 */
export function dashboardMatchesDevice(
    deviceTags: DeviceType[] | undefined,
    current: DeviceType,
): boolean {
    if (!deviceTags || deviceTags.length === 0) return true;
    if (deviceTags.includes("all")) return true;
    return deviceTags.includes(current);
}
