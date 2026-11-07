/**
 * Un icono por medio de transmisión (MSJ1107A · 2026-11-07): el mismo en la pastilla de la
 * burbuja, en los ajustes y en la lista de neuronas.
 */

import type { ComponentType, CSSProperties } from "react";
import { Bluetooth, Globe, Mail, Radio, Repeat, Server, ShieldCheck, Waypoints, Wifi } from "lucide-react";
import type { MedioTransmision } from "@/lib/mensajeria/medios/tipos";

export type IconoMedio = ComponentType<{ className?: string; style?: CSSProperties }>;

export const ICONOS_MEDIO: Record<MedioTransmision, IconoMedio> = {
    local: Waypoints,
    "wifi-local": Wifi,
    bluetooth: Bluetooth,
    lora: Radio,
    "p2p-internet": Globe,
    turn: Repeat,
    rele: ShieldCheck,
    servidor: Server,
    correo: Mail,
};
