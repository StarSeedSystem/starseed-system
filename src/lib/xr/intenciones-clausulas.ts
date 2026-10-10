/**
 * StarSeed XR · una CLÁUSULA hablada (ya sin acentos ni mayúsculas) → una intención, un fallo con pregunta, o null si no es de este tipo.
 * Cada analizador es independiente y puro: se prueba con una frase y un contexto.
 */
import { esFallo, fallo, resolverUna, resolverVarias, type Fallo } from "./intenciones-destinos";
import { buscarEn, pregunta } from "./intenciones-ref";
import type { ContextoVoz, DestinoSubida, Intencion } from "./intenciones-tipos";

type Salida = Intencion | Fallo | null;
const SOBRE = (ctx: ContextoVoz, creado: boolean) => (creado || !ctx.mundoActual ? "lo-creado" : "mundo-actual") as "lo-creado" | "mundo-actual";

const CIELOS: [RegExp, string][] = [
    [/\b(?:sin cielo|ningun cielo|cielo ninguno)\b/, "ninguno"], [/\b(?:nebulosa|galaxia|espacio|estrellas)\b/, "nebulosa"],
    [/\b(?:amanecer|alba|madrugada)\b/, "amanecer"], [/\b(?:mediodia|de dia|soleado)\b/, "mediodia"],
    [/\b(?:atardecer|ocaso|tarde)\b/, "atardecer"], [/\b(?:noche|nocturno)\b/, "noche"], [/\b(?:estudio|neutro|fondo blanco)\b/, "estudio"],
];
const GRAVEDAD: [RegExp, "cero" | "luna" | "normal"][] = [[/\b(?:gravedad cero|sin gravedad|flotando|ingravido)\b/, "cero"], [/\b(?:gravedad (?:de la )?luna|gravedad lunar)\b/, "luna"], [/\bgravedad normal\b/, "normal"]];

export function crearMundo(c: string): Salida {
    const m = /^(?:crea|crear|genera|hazme|haz|construye|monta|quiero|necesito)\s+(?:me\s+)?(?:un|una|el)?\s*(?:nuevo\s+)?(mundo|entorno|sala|escena|espacio)\b\s*(.*)$/.exec(c);
    if (!m) return null;
    const resto = m[2].replace(/^(?:virtual|virtuales|de realidad \w+)\b\s*/, "").replace(/^(?:con|que tenga|que tiene|donde|que sea|de)\s+/, "").trim();
    const caracteristicas = resto ? resto.split(/\s*(?:,|;|\by\b(?!\s+(?:a|al)\b))\s+/).map((x) => x.trim()).filter(Boolean) : [];
    const ar = /\b(?:en ar|realidad aumentada|passthrough|en mi (?:cuarto|habitacion|casa|salon))\b/.test(c);
    const vr = /\b(?:en vr|realidad virtual|inmersivo)\b/.test(c);
    return { tipo: "crear-mundo", descripcion: resto, caracteristicas, modo: ar && vr ? "ambos" : ar ? "ar" : "vr", libre: resto.length > 0 };
}

export function editarMundo(c: string, ctx: ContextoVoz, creado: boolean): Salida {
    if (!/^(?:pon|ponle|cambia|cambiale|pasa|quiero|haz|que (?:sea|haya|tenga))\b/.test(c)) return null;
    if (!/\b(?:cielo|gravedad|noche|dia|atardecer|amanecer)\b/.test(c)) return null;
    if (!creado && !ctx.mundoActual) return fallo("sin-contexto", "No hay ningún mundo abierto que cambiar. Di «crea un mundo…» o entra en uno.", ["crea un mundo con cielo de noche"]);
    const sobre = SOBRE(ctx, creado);
    const g = GRAVEDAD.find(([r]) => r.test(c));
    if (g) return { tipo: "editar-mundo", campo: "gravedad", valor: g[1], sobre };
    if (/\bcielo\b|\b(?:noche|dia|atardecer|amanecer)\b/.test(c)) {
        const cielo = CIELOS.find(([r]) => r.test(c));
        if (cielo) return { tipo: "editar-mundo", campo: "cielo", valor: cielo[1], sobre };
    }
    return { tipo: "editar-mundo", campo: "otro", texto: c, sobre };
}

export function invitar(c: string, ctx: ContextoVoz, creado: boolean): Salida {
    const m = /^(?:invita|invitales|invitalos|invitalas|invitale|convoca|trae)\b\s*(.*)$/.exec(c);
    if (!m) return null;
    if (!creado && !ctx.mundoActual) return fallo("sin-contexto", "No hay ningún mundo al que invitar. Crea uno o entra en uno primero.", []);
    if (!m[1].trim()) return fallo("falta-dato", "¿A quién invito? Dime un grupo o una persona.", ctx.grupos.slice(0, 3).map((g) => `invita al grupo ${g.nombre}`));
    const a = resolverVarias(m[1], ctx, ["persona", "grupo"], "persona o grupo");
    return esFallo(a) ? a : { tipo: "invitar", a, sobre: SOBRE(ctx, creado) };
}

const PIDE_DESTINO = fallo("falta-dato", "¿Dónde lo subo: a la biblioteca, a una estación, a una publicación o en un mensaje?", ["súbelo a la biblioteca", "publícalo para mi grupo", "mándaselo a Ana"]);

export function subir(c: string, ctx: ContextoVoz, creado: boolean): Salida {
    const m = /^(?:sube|subelo|subela|guardalo|guardala|publica|publicalo|publicala|mandalo|mandala|enviaselo|mandaselo|enviala|compartelo|compartela|comparte|envia|manda)\b\s*(.*)$/.exec(c);
    if (!m) return null;
    if (!creado && !ctx.mundoActual) return fallo("sin-contexto", "No hay ningún mundo que subir. Crea uno o entra en uno primero.", []);
    const resto = m[1];
    const sobre = SOBRE(ctx, creado);
    let destino: DestinoSubida | Fallo | null = null;
    if (/\bbiblioteca\b/.test(resto)) destino = { donde: "biblioteca" };
    else if (/\bestacion\b/.test(resto)) {
        if (/\bestacion nueva\b|\bnueva estacion\b|\buna estacion\b/.test(resto)) destino = { donde: "estacion", ref: null, nueva: true };
        else {
            const r = resolverUna(resto.replace(/^.*?\bestacion\b/, ""), ctx, ["estacion"], "estación");
            destino = esFallo(r) ? r : { donde: "estacion", ref: r, nueva: false };
        }
    } else if (/\b(?:publicacion|publica|publicalo|publicala|publicamente)\b/.test(c)) {
        const visibilidad = /\b(?:publicamente|a todos|todo el mundo|publica para todos)\b/.test(c) ? "publica" : /\b(?:solo para mi|privad[ao]|solo yo)\b/.test(c) ? "yo" : /\bgrupo\b|\bpara (?:mi|el|este)\b/.test(c) ? "grupo" : null;
        if (!visibilidad) return fallo("falta-dato", "¿Quién puede verlo: solo tú, un grupo o todo el mundo? No publico en abierto sin que lo digas.", ["solo para mí", "para el grupo", "públicamente"]);
        const r = visibilidad === "grupo" ? resolverUna(resto.replace(/^.*?\bgrupo\b/, ""), ctx, ["grupo"], "grupo") : null;
        destino = r && esFallo(r) ? r : { donde: "publicacion", visibilidad, ref: r && !esFallo(r) ? r : null };
    } else if (/\bmensaje\b/.test(c) || /^(?:mandalo|mandala|enviaselo|mandaselo|enviala|compartelo|compartela|comparte|envia|manda)\b/.test(c)) {
        const quien = resolverVarias(resto.replace(/^.*?\b(?:mensaje|a|para)\b\s*/, ""), ctx, ["persona", "grupo"], "persona o grupo");
        destino = esFallo(quien) ? quien : { donde: "mensaje", para: quien };
    }
    if (!destino) return PIDE_DESTINO;
    return esFallo(destino) ? destino : { tipo: "subir", destino, sobre };
}

export function irA(c: string, ctx: ContextoVoz): Salida {
    const m = /^(?:llevame|lleva me|ve|ir|vamos|entra|entrar|viaja|teletransportame)\b\s*(?:a la|al|a|en el|en la|en)?\s*(estacion|servidor|transmision|directo)?\s*(.*)$/.exec(c);
    if (!m) return null;
    const tipos = m[1] === "estacion" ? (["estacion"] as const) : m[1] ? (["servidor"] as const) : (["estacion", "servidor"] as const);
    if (!m[2].trim()) return fallo("falta-dato", "¿A qué estación o servidor voy?", [...ctx.estaciones, ...ctx.servidores].slice(0, 3).map((x) => `llévame a ${x.nombre}`));
    const b = buscarEn([...tipos], ctx, m[2]);
    if (b.estado === "exacto") return { tipo: "ir-a", destino: b.ref };
    if (b.estado === "ninguno") return fallo("falta-dato", pregunta(b, "ese destino", m[2]), []);
    return fallo("ambiguo", pregunta(b, "ese destino", m[2]), [], b.candidatos);
}

export function abrir(c: string, ctx: ContextoVoz): Salida {
    const m = /^(?:abre|abrir|inicia|empieza|haz|hacer|llama|llamar|ponme|quiero)\b\s*(?:una|la|un)?\s*(pizarra|llamada|videollamada|reunion)?\s*(?:a|con|para)?\s*(.*)$/.exec(c);
    if (!m || (!m[1] && !/^llam(?:a|ar)\b/.test(c))) return null;
    const con = m[2].trim() ? resolverVarias(m[2], ctx, ["persona", "grupo"], "persona o grupo") : [];
    return esFallo(con) ? con : { tipo: "abrir", que: m[1] === "pizarra" ? "pizarra" : "llamada", con };
}

export function sistema(c: string): Salida {
    const mapa: [RegExp, "recentrar" | "salir" | "ayuda" | "silenciar"][] = [
        [/^(?:recentra|recentrar|centra|centrame|vuelve al centro)\b/, "recentrar"], [/^(?:salir|sal|quitame|cierra el mundo|salgo)\b/, "salir"],
        [/^(?:ayuda|que puedo decir|comandos|como funciona)\b/, "ayuda"], [/^(?:silencio|silencia|calla|mute|silenciar)\b/, "silenciar"],
    ];
    const h = mapa.find(([r]) => r.test(c));
    return h ? { tipo: "sistema", orden: h[1] } : null;
}
