/**
 * Medios de transmisión — decisión y textos (MSJ1107A · 2026-11-07).
 * ═══════════════════════════════════════════════════════════════════════════════════
 * Módulo PURO (sin red, sin DOM, sin `node:*`). Decide por qué medios sale un mensaje según los
 * ajustes del chat y los enlaces REALES que hay ahora, y dice por dónde viajó cada mensaje con
 * palabras claras. Nunca inventa medidas: lo que no se midió es «sin medir».
 *
 *  · `mediosParaEnviar(preferencias, candidatos, { tipo })` → orden de envío + descartes con motivo.
 *  · `candidatosDesdeEnlaces(enlaces, llega)` → traduce los enlaces del transporte universal.
 *  · `etiquetaVia(via)` / `detalleVia(via)` → la pastilla de la burbuja y la info del mensaje.
 */

import {
    INFO_MEDIOS,
    MEDIOS_TRANSMISION,
    type CandidatoMedio,
    type DescarteMedio,
    type MedioTransmision,
    type PasoEnvio,
    type PlanEnvio,
    type PreferenciasMedio,
    type TipoChatMedio,
    type ViaMensaje,
} from "./tipos";
import { ETIQUETA_RED_LOCAL_NATIVA, esEnlaceRedLocalNativa } from "@/lib/malla/red-local-nativa";
// (WFD1108A) El canal local por una red Wi-Fi directa entre las dos neuronas: «Wi-Fi directo (sin router)».
import { ETIQUETA_WIFI_DIRECTO, RUTA_WIFI_DIRECTO, esEnlaceWifiDirecto } from "@/lib/malla/enlace-wifi-orquestacion";

/** (WFD1108A) ¿Esta vía fue por un enlace Wi-Fi directo? Por su ruta guardada o por el enlace activo ahora. */
function esViaWifiDirecto(v: Pick<ViaMensaje, "medio" | "enlaceId" | "ruta">): boolean {
    return v.medio === "local" && (v.ruta === RUTA_WIFI_DIRECTO || esEnlaceWifiDirecto(v.enlaceId));
}

/** Lo mínimo de un `EnlaceDisponible` del transporte universal (solo tipos: sin acoplarse a él). */
export interface EnlaceParaMedio {
    id: string;
    tipo: "local" | "cuenta" | "par" | "rele" | "lora" | string;
    etiqueta: string;
    abierto: boolean;
    ruta?: string | null;
    rttMs?: number | null;
    admite?: { mensaje?: boolean };
}

/* ══════════════════════════ Medios por tipo de chat ══════════════════════════ */

/**
 * Orden AUTOMÁTICO por tipo de chat (también son los medios que ese chat puede usar).
 *  · Neuronas: lo más directo primero (sin internet → red local → internet → servidores).
 *  · Chats y grupos: el servidor primero, porque guarda el historial compartido; la malla, si
 *    no hay internet o si la persona lo elige.
 *  · Correos: el buzón @star.seed primero; sin él (GRP1107A), guardar y reenviar por la malla
 *    (`src/lib/mail/correo-malla.ts`).
 */
export const ORDEN_AUTO: Record<TipoChatMedio, MedioTransmision[]> = {
    neurona: ["local", "wifi-local", "bluetooth", "p2p-internet", "turn", "servidor", "rele", "lora"],
    dm: ["servidor", "local", "wifi-local", "bluetooth", "p2p-internet", "turn"],
    grupo: ["servidor", "local", "wifi-local", "bluetooth", "p2p-internet", "turn"],
    correo: ["correo", "local", "wifi-local", "p2p-internet", "turn"],
};

/** Por qué un tipo de chat no usa ciertos medios (para decirlo en los ajustes). */
export const NO_ADMITIDOS: Record<TipoChatMedio, string> = {
    neurona: "El buzón @star.seed es para correos.",
    dm: "LoRa y el relé cifrado aún necesitan la radio o la identidad cifrada de la otra persona; el correo va en Correos.",
    grupo: "LoRa y el relé cifrado aún necesitan la radio o la identidad cifrada de cada miembro; el correo va en Correos.",
    correo: "LoRa, Bluetooth y el relé no llevan correos. Sin el buzón, el correo se guarda cifrado en este aparato y viaja por la malla a la neurona del destinatario o a una tuya que lo sube al buzón al tener internet.",
};

export function mediosAdmitidos(tipo: TipoChatMedio): MedioTransmision[] {
    return [...ORDEN_AUTO[tipo]];
}

export function esMedio(x: unknown): x is MedioTransmision {
    return typeof x === "string" && (MEDIOS_TRANSMISION as readonly string[]).includes(x);
}

export const PREFERENCIAS_POR_DEFECTO: PreferenciasMedio = { modo: "auto", elegidos: [], siNinguno: "esperar" };

/** Limpia lo que venga del almacenamiento: medios válidos, sin repetir; «elegidos» vacío = automático. */
export function normalizarPreferencias(x: unknown): PreferenciasMedio {
    if (!x || typeof x !== "object") return { ...PREFERENCIAS_POR_DEFECTO, elegidos: [] };
    const o = x as Record<string, unknown>;
    const elegidos: MedioTransmision[] = [];
    if (Array.isArray(o.elegidos)) {
        for (const m of o.elegidos) if (esMedio(m) && !elegidos.includes(m)) elegidos.push(m);
    }
    const siNinguno = o.siNinguno === "avisar" ? "avisar" : "esperar";
    const modo = o.modo === "elegidos" && elegidos.length > 0 ? "elegidos" : "auto";
    return { modo, elegidos, siNinguno };
}

/* ══════════════════════════ Enlaces reales → medios ══════════════════════════ */

/** Traduce un enlace del transporte universal a su medio. Null si no lleva mensajes. */
export function medioDeEnlace(e: Pick<EnlaceParaMedio, "tipo" | "ruta">): MedioTransmision | null {
    switch (e.tipo) {
        case "local":
        // (MLT1107A) El canal TCP de la app nativa con una neurona vinculada también es «sin internet»;
        // la pastilla lo distingue por su enlace: «Red local (app nativa)».
        case "nativo":
            return "local";
        // (BLE1108A) Bluetooth directo entre dos apps nativas (`ble:<id>`): el medio «Bluetooth» de los ajustes.
        case "ble":
            return "bluetooth";
        case "cuenta":
        case "par":
            if (e.ruta === "misma-red-local") return "wifi-local";
            if (e.ruta === "reenviado-turn") return "turn";
            return "p2p-internet";
        case "rele":
            return "rele";
        case "lora":
            return "lora";
        default:
            return null;
    }
}

/**
 * Candidatos a partir de los enlaces reales. `llega(e)` dice si el enlace alcanza el destino
 * (en la app: `alcanzaDestino` del transporte universal).
 */
export function candidatosDesdeEnlaces(
    enlaces: EnlaceParaMedio[],
    llega: (e: EnlaceParaMedio) => boolean,
    motivoNoLlega?: (e: EnlaceParaMedio) => string | undefined,
): CandidatoMedio[] {
    const out: CandidatoMedio[] = [];
    const vistos = new Set<string>();
    for (const e of enlaces) {
        if (vistos.has(e.id)) continue;
        vistos.add(e.id);
        const medio = medioDeEnlace(e);
        if (!medio) continue;
        if (e.admite && e.admite.mensaje === false) continue;
        const alcanza = llega(e);
        out.push({
            enlaceId: e.id,
            medio,
            etiqueta: e.etiqueta,
            abierto: !!e.abierto,
            llega: alcanza,
            ...(alcanza ? {} : { motivoNoLlega: motivoNoLlega?.(e) }),
            rttMs: typeof e.rttMs === "number" && Number.isFinite(e.rttMs) ? e.rttMs : null,
            ruta: e.ruta ?? null,
        });
    }
    return out;
}

/* ══════════════════════════ La decisión (pura) ══════════════════════════ */

function motivoPaso(c: CandidatoMedio): string {
    switch (c.medio) {
        case "local":
            return esEnlaceRedLocalNativa(c.enlaceId)
                ? "red local de la app nativa (neurona vinculada, sin internet)"
                : "enlace directo sin internet (emparejado en persona)";
        case "wifi-local":
            return "canal P2P por tu red local (ruta medida)";
        case "bluetooth":
            return "Bluetooth directo entre las dos apps nativas (sin router ni internet)";
        case "lora":
            return "radio LoRa (solo mensajes cortos)";
        case "p2p-internet":
            return c.ruta === "internet-directo" ? "canal P2P por internet" : "canal P2P (ruta aún sin medir)";
        case "turn":
            return "canal P2P reenviado por un servidor TURN";
        case "rele":
            return "relé cifrado del servidor del OS";
        case "servidor":
            return "servidor StarSeed en tiempo real";
        case "correo":
            return "buzón @star.seed";
        default:
            return "enlace";
    }
}

function compararRtt(a?: number | null, b?: number | null): number {
    const va = typeof a === "number" && Number.isFinite(a) ? a : null;
    const vb = typeof b === "number" && Number.isFinite(b) ? b : null;
    if (va === null && vb === null) return 0;
    if (va === null) return 1; // sin medir, detrás
    if (vb === null) return -1;
    return va - vb;
}

/**
 * mediosParaEnviar — por qué medios (y en qué orden) sale un mensaje, y por qué se descarta cada
 * uno. PURA y determinista.
 *
 *  · «auto»: todos los medios que ese tipo de chat admite, en su orden automático.
 *  · «elegidos»: solo los elegidos, en el orden que puso la persona. Si NINGUNO sirve para ese tipo
 *    de chat (p. ej. «solo LoRa» en los ajustes generales y un correo), ese chat va en automático.
 * Dentro del mismo medio gana el enlace con menor latencia MEDIDA (los sin medir, detrás).
 * Sin ningún paso → `sinCamino` y `aviso` según «esperar y reintentar» o «avisar».
 */
export function mediosParaEnviar(
    preferencias: PreferenciasMedio,
    enlacesDisponibles: CandidatoMedio[],
    opciones: { tipo?: TipoChatMedio } = {},
): PlanEnvio {
    const tipo = opciones.tipo ?? "neurona";
    const prefs = normalizarPreferencias(preferencias);
    const admitidos = mediosAdmitidos(tipo);
    const descartados: DescarteMedio[] = [];

    let modo = prefs.modo;
    let nota: string | undefined;
    let orden: MedioTransmision[] = admitidos;
    if (modo === "elegidos") {
        const utiles = prefs.elegidos.filter((m) => admitidos.includes(m));
        if (utiles.length) {
            orden = utiles;
            for (const m of prefs.elegidos) if (!admitidos.includes(m)) descartados.push({ medio: m, motivo: "este tipo de chat no lo usa" });
        } else {
            // Ninguno de los elegidos (p. ej. en los ajustes generales) sirve para este tipo de chat: automático.
            modo = "auto";
            nota = "Ninguno de tus medios elegidos sirve para este tipo de chat: va en automático.";
        }
    }
    const posicion = (m: MedioTransmision) => {
        const i = orden.indexOf(m);
        return i < 0 ? Number.MAX_SAFE_INTEGER : i;
    };

    const pasos: Array<PasoEnvio & { _pos: number }> = [];
    const conCandidato = new Set<MedioTransmision>();
    const vistos = new Set<string>();
    for (const c of enlacesDisponibles) {
        if (vistos.has(c.enlaceId)) continue;
        vistos.add(c.enlaceId);
        const base = { medio: c.medio, enlaceId: c.enlaceId, etiqueta: c.etiqueta };
        if (!admitidos.includes(c.medio)) {
            descartados.push({ ...base, motivo: "este tipo de chat no lo usa" });
            continue;
        }
        if (!orden.includes(c.medio)) {
            descartados.push({ ...base, motivo: "no está entre tus medios elegidos" });
            continue;
        }
        conCandidato.add(c.medio);
        if (!c.llega) {
            descartados.push({ ...base, motivo: c.motivoNoLlega || "no llega a este destino" });
            continue;
        }
        if (!c.abierto) {
            descartados.push({ ...base, motivo: "no está disponible ahora" });
            continue;
        }
        pasos.push({
            enlaceId: c.enlaceId,
            medio: c.medio,
            etiqueta: c.etiqueta,
            rttMs: c.rttMs ?? null,
            ruta: c.ruta ?? null,
            motivo: motivoPaso(c),
            _pos: posicion(c.medio),
        });
    }
    // Medios permitidos para los que no hay ningún enlace ahora mismo (lo decimos).
    if (modo === "elegidos") {
        for (const m of orden) {
            if (!conCandidato.has(m)) descartados.push({ medio: m, motivo: "no hay ningún enlace de este tipo ahora" });
        }
    }

    pasos.sort(
        (a, b) =>
            a._pos - b._pos ||
            compararRtt(a.rttMs, b.rttMs) ||
            (a.enlaceId < b.enlaceId ? -1 : a.enlaceId > b.enlaceId ? 1 : 0),
    );
    const limpios: PasoEnvio[] = pasos.map(({ _pos, ...p }) => p);
    const sinCamino = limpios.length === 0;
    const aviso = sinCamino
        ? prefs.siNinguno === "esperar"
            ? modo === "elegidos"
                ? "Ninguno de tus medios elegidos está disponible: queda en espera y se reintenta solo."
                : "No hay ningún medio disponible ahora: queda en espera y se reintenta solo."
            : modo === "elegidos"
                ? "Ninguno de tus medios elegidos está disponible ahora."
                : "No hay ningún medio disponible ahora."
        : undefined;
    return {
        modo,
        pasos: limpios,
        descartados,
        siNinguno: prefs.siNinguno,
        sinCamino,
        ...(aviso ? { aviso } : {}),
        ...(nota ? { nota } : {}),
    };
}

/* ══════════════════════════ Textos de la vía (pastilla e info) ══════════════════════════ */

export function familiaDe(medio: MedioTransmision): "malla" | "internet" {
    return INFO_MEDIOS[medio]?.familia ?? "internet";
}

function msMedidos(n: number | null | undefined): string | null {
    return typeof n === "number" && Number.isFinite(n) && n >= 0 ? `${Math.max(1, Math.round(n))} ms` : null;
}

/** Texto corto de la pastilla: «Mesh · Wi-Fi local · 12 ms ✓», «Servidor StarSeed», «LoRa»… */
export function etiquetaVia(v: ViaMensaje): string {
    const partes: string[] = [];
    switch (v.medio) {
        case "local":
            partes.push("Mesh", esViaWifiDirecto(v) ? ETIQUETA_WIFI_DIRECTO : esEnlaceRedLocalNativa(v.enlaceId) ? ETIQUETA_RED_LOCAL_NATIVA : "Sin internet");
            break;
        case "wifi-local":
            partes.push("Mesh", "Wi-Fi local");
            break;
        case "bluetooth":
            // (BLE1108A) «Bluetooth directo · 84 ms ✓»: de antena a antena, sin router.
            partes.push("Bluetooth directo");
            break;
        case "lora":
            partes.push("LoRa");
            break;
        case "p2p-internet":
            partes.push("P2P", v.ruta === "internet-directo" ? "Internet" : "ruta sin medir");
            break;
        case "turn":
            partes.push("P2P", "TURN");
            break;
        default:
            partes.push(INFO_MEDIOS[v.medio]?.corto ?? "Enlace");
    }
    const ms = msMedidos(v.latenciaMs);
    if (ms) partes.push(ms);
    // El visto es el acuse del OTRO aparato; «guardado en el servidor» no lo lleva (no se confunde con las marcas de lectura).
    return partes.join(" · ") + (v.direccion === "sale" && v.confirmado && v.confirmadoPor !== "servidor" ? " ✓" : "");
}

const RUTAS: Record<string, string> = {
    "misma-red-local": "Misma red local",
    "internet-directo": "Internet directo (NAT atravesado)",
    "reenviado-turn": "Reenviado por un servidor TURN",
    desconocida: "Sin medir",
    // (WFD1108A)
    [RUTA_WIFI_DIRECTO]: "Wi-Fi directo entre las dos neuronas (sin router)",
};

export interface LineaDetalle {
    etiqueta: string;
    valor: string;
}

/**
 * Nombre del medio de una vía. El enlace de la red local de la app nativa (`nativo:<ip>`, o el WebRTC
 * que abrieron solas dos apps nativas, `local:nativo-…`) es «Red local (app nativa)» (MLT1107A).
 */
export function nombreDeVia(v: Pick<ViaMensaje, "medio" | "enlaceId"> & Partial<Pick<ViaMensaje, "ruta">>): string {
    if (esViaWifiDirecto(v)) return ETIQUETA_WIFI_DIRECTO;
    if (v.medio === "local" && esEnlaceRedLocalNativa(v.enlaceId)) return ETIQUETA_RED_LOCAL_NATIVA;
    return INFO_MEDIOS[v.medio]?.nombre ?? v.medio;
}

/** Detalle completo para la info del mensaje. */
export function detalleVia(v: ViaMensaje): LineaDetalle[] {
    const out: LineaDetalle[] = [
        { etiqueta: "Medio", valor: nombreDeVia(v) },
        { etiqueta: "Tipo", valor: familiaDe(v.medio) === "malla" ? "Malla P2P (sin servidor de por medio)" : "Internet y servidores" },
    ];
    if (v.enlace) out.push({ etiqueta: v.direccion === "entra" ? "Llegó desde" : "Enlace", valor: v.enlace });
    if (v.servidor) out.push({ etiqueta: "Servidor", valor: v.servidor });
    if (v.medio === "wifi-local" || v.medio === "p2p-internet" || v.medio === "turn" || v.medio === "local") {
        out.push({ etiqueta: "Ruta medida", valor: v.ruta ? RUTAS[v.ruta] ?? v.ruta : "Sin medir" });
    }
    const ms = msMedidos(v.latenciaMs);
    const fuente =
        v.latenciaFuente === "acuse"
            ? "ida y vuelta con acuse"
            : v.latenciaFuente === "enlace"
                ? "ida y vuelta medida del enlace"
                : v.latenciaFuente === "servidor"
                    ? "hasta que el servidor lo guardó"
                    : "";
    out.push({ etiqueta: "Latencia", valor: ms ? (fuente ? `${ms} (${fuente})` : ms) : "Sin medir" });
    out.push({
        etiqueta: "Entrega",
        valor:
            v.direccion === "entra"
                ? "Recibido en este aparato"
                : v.confirmado
                    ? v.confirmadoPor === "servidor"
                        ? "El servidor lo guardó"
                        : "El otro aparato confirmó la llegada"
                    : "Enviado, sin acuse de recibo",
    });
    if (v.motivo) out.push({ etiqueta: "Nota", valor: v.motivo });
    if (typeof v.en === "number" && Number.isFinite(v.en)) {
        try {
            out.push({ etiqueta: "Cuándo", valor: new Date(v.en).toLocaleString("es") });
        } catch {
            /* sin Intl: se omite */
        }
    }
    return out;
}

/** Vía de un mensaje del servidor de siempre (Supabase en tiempo real). */
export function viaServidor(direccion: "sale" | "entra", latenciaMs?: number | null, en?: number): ViaMensaje {
    const medida = typeof latenciaMs === "number" && Number.isFinite(latenciaMs);
    return {
        medio: "servidor",
        direccion,
        servidor: "Supabase en tiempo real",
        latenciaMs: medida ? latenciaMs : null,
        latenciaFuente: medida ? "servidor" : null,
        confirmado: direccion === "sale",
        confirmadoPor: direccion === "sale" ? "servidor" : null,
        ...(typeof en === "number" ? { en } : {}),
    };
}

/** Servidor que interviene en cada medio (o null si ninguno). */
export function servidorDeMedio(medio: MedioTransmision): string | null {
    switch (medio) {
        case "servidor":
            return "Supabase en tiempo real";
        case "rele":
            return "Relé cifrado StarSeed";
        case "turn":
            return "Servidor TURN";
        case "correo":
            return "Buzón @star.seed";
        default:
            return null;
    }
}

/** Resumen de las preferencias para la interfaz («Automático» / «Solo: Wi-Fi local, LoRa»). */
export function resumenPreferencias(p: PreferenciasMedio, tipo: TipoChatMedio): string {
    const n = normalizarPreferencias(p);
    if (n.modo === "auto") return "Automático";
    const admitidos = mediosAdmitidos(tipo);
    const nombres = n.elegidos.filter((m) => admitidos.includes(m)).map((m) => INFO_MEDIOS[m].corto);
    return nombres.length ? `Solo: ${nombres.join(", ")}` : "Automático";
}
