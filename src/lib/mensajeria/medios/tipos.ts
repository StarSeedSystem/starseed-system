/**
 * Medios de transmisión de la Mensajería — tipos y catálogo (MSJ1107A · 2026-11-07).
 * ═══════════════════════════════════════════════════════════════════════════════════
 * Módulo PURO (sin red, sin DOM, sin `node:*`): lo importan la interfaz, el buzón de neuronas,
 * el hilo de mensajes y las pruebas.
 *
 * Un MEDIO es lo que la persona elige en sus ajustes («Wi-Fi local», «Servidor StarSeed»…).
 * Un ENLACE es lo que hay de verdad ahora mismo (`EnlaceDisponible` del transporte universal,
 * `src/lib/malla/eleccion-enlace.ts`): cada enlace real se traduce a UN medio. Este módulo nunca
 * inventa enlaces ni medidas: lo que no se midió se dice «sin medir».
 */

export const MEDIOS_TRANSMISION = [
    "local",
    "wifi-local",
    "bluetooth",
    "lora",
    "p2p-internet",
    "turn",
    "rele",
    "servidor",
    "correo",
] as const;

export type MedioTransmision = (typeof MEDIOS_TRANSMISION)[number];

/** Malla P2P (sin servidor de por medio) o internet y servidores. */
export type FamiliaMedio = "malla" | "internet";

/** Tipo de chat al que se aplican los ajustes de medio. */
export type TipoChatMedio = "dm" | "grupo" | "correo" | "neurona";

export type ModoMedio = "auto" | "elegidos";

/** Qué hacer si ningún medio permitido está disponible al enviar. */
export type SiNingunMedio = "esperar" | "avisar";

export interface PreferenciasMedio {
    /** «auto» = enruta cada caso por la malla o cualquier internet disponible (recomendado). */
    modo: ModoMedio;
    /** Solo en «elegidos»: los medios permitidos, en orden de preferencia. */
    elegidos: MedioTransmision[];
    siNinguno: SiNingunMedio;
}

export interface InfoMedio {
    id: MedioTransmision;
    nombre: string;
    /** Para la pastilla de la burbuja. */
    corto: string;
    familia: FamiliaMedio;
    descripcion: string;
}

/** Un enlace REAL traducido a medio, listo para decidir. */
export interface CandidatoMedio {
    /** «local:ab12», «cuenta:xyz», «par:v1», «rele», «lora», «servidor», «correo»… */
    enlaceId: string;
    medio: MedioTransmision;
    /** Aparato, vínculo o servidor («Tablet de Alex», «Relé cifrado del servidor»…). */
    etiqueta: string;
    /** ¿Está abierto ahora mismo? */
    abierto: boolean;
    /** ¿Llega a este destino? */
    llega: boolean;
    /** Por qué no llega (si se sabe). */
    motivoNoLlega?: string;
    /** Ida y vuelta medida del enlace (ms); null = sin medir. */
    rttMs?: number | null;
    /** Ruta medida del canal WebRTC (misma-red-local, internet-directo, reenviado-turn…). */
    ruta?: string | null;
}

export interface PasoEnvio {
    enlaceId: string;
    medio: MedioTransmision;
    etiqueta: string;
    rttMs?: number | null;
    ruta?: string | null;
    motivo: string;
}

export interface DescarteMedio {
    medio: MedioTransmision;
    enlaceId?: string;
    etiqueta?: string;
    motivo: string;
}

export interface PlanEnvio {
    modo: ModoMedio;
    /** En el orden en que se probarán. */
    pasos: PasoEnvio[];
    descartados: DescarteMedio[];
    siNinguno: SiNingunMedio;
    /** Ningún medio permitido está disponible: se aplica `siNinguno`. */
    sinCamino: boolean;
    /** Frase honesta para la interfaz cuando no hay camino. */
    aviso?: string;
    /** Nota cuando los ajustes no aplican tal cual (p. ej. ningún medio elegido sirve para este chat). */
    nota?: string;
}

export interface IntentoVia {
    medio: MedioTransmision;
    etiqueta: string;
    ok: boolean;
    detalle: string;
}

/** Por dónde viajó un mensaje (enviado o recibido). Se guarda con el mensaje. */
export interface ViaMensaje {
    medio: MedioTransmision;
    direccion: "sale" | "entra";
    /** Aparato o vínculo por el que fue («Tablet de Alex», «Vínculo entre cuentas»). */
    enlace?: string | null;
    enlaceId?: string | null;
    /** Servidor que intervino («Supabase en tiempo real», «Relé cifrado StarSeed», «TURN»). */
    servidor?: string | null;
    /** Ruta medida del canal (si la hay). */
    ruta?: string | null;
    /** Latencia MEDIDA (ms). null/ausente = sin medir. */
    latenciaMs?: number | null;
    /** De dónde sale la latencia: el acuse del destino, el RTT del enlace o la respuesta del servidor. */
    latenciaFuente?: "acuse" | "enlace" | "servidor" | null;
    /** Confirmado por el otro aparato o guardado por el servidor. */
    confirmado: boolean;
    confirmadoPor?: "destino" | "servidor" | null;
    /** Frase honesta (p. ej. «enviado sin acuse en 2,5 s»). */
    motivo?: string;
    intentos?: IntentoVia[];
    descartados?: DescarteMedio[];
    /** Epoch ms. */
    en?: number;
}

export const INFO_MEDIOS: Record<MedioTransmision, InfoMedio> = {
    local: {
        id: "local",
        nombre: "Enlace directo sin internet",
        corto: "Sin internet",
        familia: "malla",
        descripcion: "Dos aparatos emparejados en persona (código o QR): ni internet ni servidores.",
    },
    "wifi-local": {
        id: "wifi-local",
        nombre: "Wi-Fi local (P2P)",
        corto: "Wi-Fi local",
        familia: "malla",
        descripcion: "Canal P2P cuya ruta medida es tu red local: el mensaje no sale a internet.",
    },
    bluetooth: {
        id: "bluetooth",
        nombre: "Bluetooth",
        corto: "Bluetooth",
        familia: "malla",
        descripcion: "Aparatos cercanos por Bluetooth. Aún no hay enlace Bluetooth real en el navegador: llegará con la app nativa.",
    },
    lora: {
        id: "lora",
        nombre: "Radio LoRa (Meshtastic)",
        corto: "LoRa",
        familia: "malla",
        descripcion: "Radio de largo alcance sin internet. Solo mensajes cortos.",
    },
    "p2p-internet": {
        id: "p2p-internet",
        nombre: "P2P por internet (WebRTC)",
        corto: "P2P",
        familia: "internet",
        descripcion: "Canal directo entre aparatos a través de internet: ningún servidor guarda el mensaje.",
    },
    turn: {
        id: "turn",
        nombre: "WebRTC reenviado por TURN",
        corto: "TURN",
        familia: "internet",
        descripcion: "El mismo canal P2P, reenviado por un servidor TURN cuando no hay camino directo.",
    },
    rele: {
        id: "rele",
        nombre: "Relé cifrado StarSeed",
        corto: "Relé cifrado",
        familia: "internet",
        descripcion: "El servidor del OS guarda y reenvía el mensaje cifrado hasta que llegue.",
    },
    servidor: {
        id: "servidor",
        nombre: "Servidor StarSeed (tiempo real)",
        corto: "Servidor StarSeed",
        familia: "internet",
        descripcion: "El servidor de siempre (Supabase en tiempo real): guarda el historial compartido.",
    },
    correo: {
        id: "correo",
        nombre: "Correo @star.seed",
        corto: "Correo @star.seed",
        familia: "internet",
        descripcion: "El buzón interno @star.seed del servidor StarSeed.",
    },
};
