/**
 * StarSeed XR · TEXTO DE ENTRADA (XR1010E, contrato §3 c). Módulo PURO.
 * Dadas las capacidades del aparato y el plan de entrada, decide qué botones «Entrar en VR/AR»
 * se pintan (etiqueta y descripción honestas por plataforma) y qué aviso se dice cuando NO hay
 * ningún modo inmersivo (iPhone, Vision Pro, sin https, sondeando). Sin React, sin DOM.
 */
import type { CapacidadesXR, PlanEntrada } from "@/lib/xr/capacidades";
import type { ModoXR } from "@/lib/xr/tipos";

export type ModoBotonXR = "vr-inmersivo" | "ar-passthrough" | "ar-mano";

export interface BotonEntrada {
    modo: ModoBotonXR;
    etiqueta: string;
    descripcion: string;
}

export interface TextoEntrada {
    botones: BotonEntrada[];
    aviso: string | null;
}

const ES_INMERSIVO: (m: ModoXR) => m is ModoBotonXR = (m) =>
    m === "vr-inmersivo" || m === "ar-passthrough" || m === "ar-mano";

/** Etiqueta visible del botón: «Entrar en VR» / «Entrar en AR»; en AR de móvil, «Ver en mi cuarto (AR)». */
function etiquetaDe(m: ModoBotonXR): string {
    if (m === "vr-inmersivo") return "Entrar en VR";
    if (m === "ar-passthrough") return "Entrar en AR";
    return "Ver en mi cuarto (AR)";
}

function descripcionDe(m: ModoBotonXR): string {
    if (m === "vr-inmersivo") return "Abre el sistema en tu visor, en tres dimensiones.";
    if (m === "ar-passthrough") return "Trae el sistema sobre tu habitación con la cámara del visor.";
    return "Coloca el sistema en tu cuarto con la cámara del móvil.";
}

/**
 * Aviso honesto cuando no hay modo inmersivo. Orden: iPhone/iPad, Vision Pro, la razón sin https
 * (que el núcleo casi nunca emite: sin `navigator.xr` no sabe que es el contexto inseguro, así que
 * `sinSeguro` llega desde `DatosNavegador.seguro`), y en último lugar el motivo del plan.
 */
function avisoSinInmersivo(c: CapacidadesXR, plan: PlanEntrada, sinSeguro: boolean): string {
    if (c.plataforma === "ios") return "Safari en iPhone no ofrece AR ni VR web: el mundo se ve en 3D en pantalla.";
    if (c.plataforma === "visionos") return "Aquí la VR funciona con mirada y pellizco; la AR web no está disponible.";
    if (sinSeguro || c.avisos.some((a) => a.includes("https"))) {
        return "WebXR sólo se abre en https o en localhost: aquí se verá en 3D normal.";
    }
    return plan.motivo;
}

/**
 * Qué botones y qué texto debe pintar la entrada XR. La lógica vive aquí para poder probarla sin
 * jsdom: el componente (XR1010E) sólo pinta lo que esta función devuelve.
 * - Con algún modo inmersivo: un botón por modo, con etiqueta y descripción del aparato.
 * - Sin ninguno: `botones` vacío y un aviso honesto (nunca un bucle ni una promesa vacía).
 * - `sondeando` (los datos aún no llegan): sin botones y «Comprobando tu visor…».
 */
export function textoEntrada(c: CapacidadesXR, plan: PlanEntrada, sondeando = false, sinSeguro = false): TextoEntrada {
    if (sondeando) return { botones: [], aviso: "Comprobando tu visor…" };
    const botones: BotonEntrada[] = [];
    for (const modo of c.modos) {
        if (!ES_INMERSIVO(modo)) continue;
        botones.push({ modo, etiqueta: etiquetaDe(modo), descripcion: descripcionDe(modo) });
    }
    if (botones.length === 0) return { botones, aviso: avisoSinInmersivo(c, plan, sinSeguro) };
    return { botones, aviso: null };
}

/** El modo pedido por la persona o la página reduce la lista a ese botón (si es inmersivo). */
export function soloModo(botones: readonly BotonEntrada[], modo: ModoXR | "auto" | undefined): BotonEntrada[] {
    if (!modo || modo === "auto" || !ES_INMERSIVO(modo)) return [...botones];
    return botones.filter((b) => b.modo === modo);
}

