/**
 * StarSeed XR · VOZ → INTENCIÓN. Una frase en español se convierte en una lista de pasos tipados o en una PREGUNTA.
 *
 * Reglas (contrato en architecture/starseed-xr.md §g):
 *  - Nunca se adivina un grupo, una persona ni un destino: exacto = actúa; parcial o varios = pregunta; ninguno = lo dice.
 *  - Lo que sale hacia otras personas (invitar, publicar, mandar) pasa SIEMPRE por la tarjeta de confirmación.
 *  - Reflejo = este módulo, siempre local y sin red. Solo «crear un mundo a partir de una descripción libre» y los cambios
 *    que el vocabulario no cubre piden la capa razón (otra neurona del mismo usuario, o la nube si él lo ha permitido).
 *  - No hay audio aquí: recibe el texto que ya transcribió el aparato (SpeechRecognition o Whisper local).
 * Módulo PURO.
 */
import { abrir, crearMundo, editarMundo, invitar, irA, sistema, subir } from "./intenciones-clausulas";
import { esFallo, fallo } from "./intenciones-destinos";
import { limpiar } from "./intenciones-ref";
import type { CapaIA, ContextoVoz, Intencion, PasoVoz, ResultadoVoz, TarjetaConfirmacion } from "./intenciones-tipos";

export * from "./intenciones-tipos";
export { elegirCandidato, type Eleccion } from "./intenciones-ref";

const VERBOS = "invita|invitales|invitalos|invitalas|sube|subelo|subela|publica|publicalo|publicala|mandalo|mandala|enviaselo|mandaselo|compartelo|llevame|abre|crea|pon|ponle|cambia|guardalo|guardala";
/** «crea un mundo con cielo de noche y gravedad cero e invita al grupo X» → 3 cláusulas. */
const CORTE = new RegExp(`\\s*(?:,|;|\\by\\b|\\be\\b|\\bluego\\b|\\bdespues\\b|\\bentonces\\b)+\\s*(?=(?:${VERBOS})\\b)`);

/** «…, luego / después / entonces …» separa pasos aunque lo siguiente no sea una orden conocida (así se dice «no entendido»). */
const SECUENCIA = /\s*,?\s*(?:\by\s+)?\b(?:luego|despues|entonces)\b[,\s]*/g;

export const EJEMPLOS = [
    "crea un mundo con cielo de noche y gravedad cero e invita al grupo Banda",
    "súbelo a la biblioteca",
    "llévame a la estación Cumbre",
    "abre una pizarra con Ana",
];

export const capaDe = (i: Intencion): CapaIA =>
    i.tipo === "crear-mundo" ? (i.libre ? "razon" : "reflejo") : i.tipo === "editar-mundo" && i.campo === "otro" ? "razon" : "reflejo";

/** Verdadero si el paso comunica algo a otras personas o lo hace público: nunca se ejecuta sin confirmar. */
export const saleDeLaCuenta = (i: Intencion): boolean =>
    i.tipo === "invitar" || (i.tipo === "subir" && i.destino.donde !== "biblioteca");

const nombres = (r: { nombre: string }[]) => r.map((x) => `«${x.nombre}»`).join(", ");

function describir(i: Intencion): string {
    switch (i.tipo) {
        case "crear-mundo": return `Crear un mundo ${i.modo === "ar" ? "en AR" : i.modo === "ambos" ? "en VR y AR" : "en VR"}${i.descripcion ? `: ${i.descripcion}` : ""}`;
        case "editar-mundo": return i.campo === "otro" ? `Cambiar el mundo: ${i.texto}` : `Poner ${i.campo} «${i.valor}»`;
        case "invitar": return `Invitar a ${nombres(i.a)}${i.a.some((x) => x.miembros) ? ` (${i.a.reduce((n, x) => n + (x.miembros ?? 0), 0)} personas)` : ""}`;
        case "subir": {
            const d = i.destino;
            if (d.donde === "biblioteca") return "Guardar en tu biblioteca";
            if (d.donde === "estacion") return d.nueva ? "Subir a una estación nueva" : `Subir a la estación «${d.ref?.nombre}»`;
            if (d.donde === "mensaje") return `Mandar por mensaje a ${nombres(d.para)}`;
            return `Publicar ${d.visibilidad === "publica" ? "para todo el mundo" : d.visibilidad === "yo" ? "solo para ti" : `para ${d.ref ? `«${d.ref.nombre}»` : "tu grupo"}`}`;
        }
        case "ir-a": return `Ir a «${i.destino.nombre}»`;
        case "abrir": return `Abrir ${i.que === "pizarra" ? "una pizarra" : "una llamada"}${i.con.length ? ` con ${nombres(i.con)}` : ""}`;
        case "sistema": return { recentrar: "Recentrar la vista", salir: "Salir del modo inmersivo", ayuda: "Mostrar la ayuda de voz", silenciar: "Silenciar el micrófono" }[i.orden];
    }
}

export function tarjetaDe(pasos: PasoVoz[]): TarjetaConfirmacion {
    return { titulo: "Esto saldrá de tu cuenta. ¿Lo hago?", lineas: pasos.map((p) => describir(p.intencion)), acciones: ["confirmar", "cambiar", "cancelar"] };
}

export function entenderVoz(frase: string, ctx: ContextoVoz): ResultadoVoz {
    const texto = limpiar(frase).replace(/^(?:astraura|oye astraura|ok astraura|por favor|porfa)[,\s]+/, "").replace(/[,\s]*por favor[.!]?$/, "").trim();
    if (!texto) return fallo("vacio", "No te he oído. Dime qué quieres hacer.", EJEMPLOS);
    const clausulas = texto.replace(SECUENCIA, " ; ").split(/\s*;\s*/).flatMap((t) => t.split(CORTE)).map((c) => c.trim().replace(/[,.]+$/, "")).filter(Boolean);
    const pasos: PasoVoz[] = [];
    let creado = false;
    for (const c of clausulas) {
        const r = crearMundo(c) ?? editarMundo(c, ctx, creado) ?? invitar(c, ctx, creado) ?? subir(c, ctx, creado) ?? irA(c, ctx) ?? abrir(c, ctx) ?? sistema(c);
        if (!r) return fallo("no-entendido", `No he entendido «${c}». Prueba con una de estas.`, EJEMPLOS);
        if (esFallo(r)) return r;
        if (r.tipo === "crear-mundo") creado = true;
        pasos.push({ intencion: r, capa: capaDe(r) });
    }
    const confirmar = pasos.some((p) => saleDeLaCuenta(p.intencion));
    return { ok: true, pasos, confirmar, tarjeta: confirmar ? tarjetaDe(pasos) : null };
}
