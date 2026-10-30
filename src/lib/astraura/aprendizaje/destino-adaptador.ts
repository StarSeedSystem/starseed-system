/**
 * Destino de la personalización (Ola 1025U) — módulo PURO.
 * ────────────────────────────────────────────────────────
 * El adaptador que sale de la Fábrica (QVAC, Soup u onebitllms) se REGISTRA para un sujeto:
 * una personalidad, un agente, un bot o una capa de conciencia. Este módulo decide, ANTES de
 * entrenar, si esa personalización es legítima y a qué ámbito pertenece:
 *
 *   · PRIVADO (personal): lo ejecuta la persona o sus agentes personales. Puede haber visto memoria
 *     de cualquier alcance de la persona, con el sello de consentimiento de cada archivo. Se queda
 *     en su neurona.
 *   · COLECTIVO (público): lo ejecuta un agente de grupo, de comunidad, de página o público, o la
 *     capa de conciencia colectiva. Solo puede haber visto memoria de grupo o pública, y la de
 *     grupo con la aprobación de la entidad. NUNCA memoria personal ni de perfil: un adaptador es
 *     un archivo que otros cargan, y lo que aprendió se puede recitar.
 *
 * La regla es la de `alcance-memoria.ts` (personal › perfil › grupo › pública, nunca al revés): el
 * alcance del adaptador es el del dato MÁS privado que vio, y solo lo cargan actores que podrían leer
 * ese dato. Es una red de seguridad, no una garantía criptográfica.
 *
 * Sin I/O ni `node:*` (CLAUDE.md, trampa 11). `import type` de `mando/aprendizaje.ts` no contamina.
 */

import { CAPAS, type CapaConciencia } from "@/lib/astraura/capas-conciencia";
import type { AdaptadorAprendizaje } from "@/lib/mando/aprendizaje";
import {
    ORDEN_ALCANCE,
    alcanceVisiblePara,
    type ActorMemoria,
    type AlcanceMemoria,
    type TipoActor,
} from "@/lib/nucleo/alcance-memoria";
import {
    MOTORES,
    elegirFabrica,
    type DecisionFabrica,
    type FamiliaBase,
    type MedioFabrica,
    type MotorFabrica,
    type NecesidadFabrica,
} from "./fabricas";
import type { DestinoModelo } from "./dataset-llamafactory";
import {
    elegirAfinado,
    recetaEntrenamiento,
    recetaFusion,
    sanearAmbito,
    type DondeEjecutar,
    type Etapa,
    type ModoAfinado,
} from "./receta-llamafactory";
import { rutaRelativaSegura, slugSujeto, type TipoSujeto } from "./soup";

export type AmbitoAdaptador = "privado" | "colectivo";
export type FormatoAdaptador = "lora-gguf" | "gguf-fusionado" | "base-nuevo";

export interface SujetoAdaptador {
    tipo: TipoSujeto;
    /** Personalidad: su id. Agente o bot: su id de origen. Capa: local, mesh, nube o colectiva. */
    id: string;
    /** Quién ejecutará el adaptador: de ahí sale lo que puede haber visto. */
    actor: ActorMemoria;
}

/** Un archivo del corpus que alimentaría el entrenamiento. */
export interface FuenteAdaptador {
    /** Ruta RELATIVA del archivo exportado. */
    ruta: string;
    alcance: AlcanceMemoria;
    /** Sello de consentimiento del corpus (lo pone el Curador por entrada). */
    consentimiento: boolean;
    /** Para memoria de grupo: la entidad (grupo, comunidad, página) aprobó entrenar con ella. */
    aprobadoPorEntidad?: boolean;
    turnos?: number;
}

export interface PeticionAdaptador {
    sujeto: SujetoAdaptador;
    fuentes: FuenteAdaptador[];
    necesidad: NecesidadFabrica;
    medio: MedioFabrica;
    /** Modelo base: id de Hugging Face o el BitNet 1.58 de Astraura. */
    base: string;
    /** Consentimiento explícito para que el archivo de entrenamiento salga a un medio que no es de la persona. */
    autorizaNube?: boolean;
    /** Plantilla de chat (template) de LlamaFactory; sin ella no se genera la receta YAML. */
    plantilla?: string;
    ahora?: Date;
}

/** Recetas YAML de LlamaFactory que acompañan al plan, listas para `llamafactory-cli`. */
export interface RecetasAdaptador {
    modo: ModoAfinado;
    etapa: Etapa;
    entrenamiento: string;
    fusion?: string;
    dondeEjecutar: DondeEjecutar;
    avisos: string[];
}

/** Entrada del registro `starseed_memory_root/aprendizaje/adaptadores.json`: compatible con la que ya lee Genesis. */
export interface RegistroAdaptador extends AdaptadorAprendizaje {
    sujeto: { tipo: TipoSujeto; id: string };
    ambito: AmbitoAdaptador;
    alcance: AlcanceMemoria;
    /** Tipo de actor que lo carga (de ahí sale quién puede usarlo). */
    actor: TipoActor;
    motor: MotorFabrica;
    base: string;
    familiaBase: FamiliaBase;
    formato: FormatoAdaptador;
    cargaCon: string;
    /** Ruta lógica relativa del archivo del adaptador. */
    archivo: string;
    fuentes: { ruta: string; alcance: AlcanceMemoria }[];
    /** Nace siempre candidato: solo la puerta de regresión del Evaluador lo hace activo. */
    estado: "candidato";
    requiereEvaluacion: true;
}

export type PlanAdaptador =
    | {
        ok: true;
        ambito: AmbitoAdaptador;
        alcance: AlcanceMemoria;
        fuentesUsadas: FuenteAdaptador[];
        fuentesExcluidas: { ruta: string; motivo: string }[];
        entrenamiento: DecisionFabrica;
        registro: RegistroAdaptador;
        explicacion: string;
        avisos: string[];
        /** Recetas de LlamaFactory generadas con las salvaguardas de `receta-llamafactory`. */
        recetas?: RecetasAdaptador;
    }
    | { ok: false; errores: string[] };

const SIN_PERSONAL: readonly AlcanceMemoria[] = ["personal", "perfil"];

/** Privado o colectivo: lo decide quién lo ejecuta, y la capa colectiva es colectiva siempre. */
export function ambitoDeSujeto(s: SujetoAdaptador): AmbitoAdaptador {
    if (s.tipo === "capa" && s.id === "colectiva") return "colectivo";
    return s.actor.tipo === "usuario" || s.actor.tipo === "agente-personal" ? "privado" : "colectivo";
}

/** El actor contra el que se comprueba: la capa colectiva se trata como pública aunque la lance una persona. */
function actorEfectivo(s: SujetoAdaptador): ActorMemoria {
    return s.tipo === "capa" && s.id === "colectiva" ? { tipo: "agente-publico" } : s.actor;
}

/** Alcance del adaptador = el del dato MÁS privado que vio. */
export function alcanceDelAdaptador(alcances: readonly AlcanceMemoria[]): AlcanceMemoria {
    return ORDEN_ALCANCE.find((a) => alcances.includes(a)) ?? "publica";
}

// Meta^n no fabrica adaptadores: mejora el proceso, no los pesos, y se decide fuera de esta puerta.
const FORMATO_POR_MOTOR: Record<Exclude<MotorFabrica, "meta-n">, FormatoAdaptador> = {
    qvac: "lora-gguf",
    soup: "gguf-fusionado",
    onebitllms: "base-nuevo",
};

const CARGA_POR_FORMATO: Record<FormatoAdaptador, string> = {
    "lora-gguf": "llama-server --lora <archivo> sobre el mismo BitNet 1.58 con el que se entrenó",
    "gguf-fusionado": "llama-server -m <archivo>: modelo completo fusionado con su base estándar (no se carga sobre el BitNet)",
    "base-nuevo": "reemplaza el base por el canal de despliegue, con su rollback",
};

/** Texto para la persona: qué significa el ámbito de este adaptador. */
export function explicarAmbito(ambito: AmbitoAdaptador, alcance: AlcanceMemoria): string {
    if (ambito === "privado") {
        return alcance === "publica"
            ? "Privado: lo carga tu persona o tus agentes personales y se queda en tu neurona. Solo vio datos públicos."
            : `Privado: lo cargan tu persona y tus agentes personales, y se queda en tu neurona. Vio memoria de alcance «${alcance}», así que nunca se publica ni lo carga un agente de grupo o público.`;
    }
    return alcance === "publica"
        ? "Colectivo: lo pueden cargar agentes públicos y de grupo. Solo vio memoria pública con consentimiento; ningún dato personal ni de perfil."
        : "Colectivo: lo cargan agentes del grupo o de la entidad. Solo vio memoria del grupo aprobada por la entidad y pública; ningún dato personal ni de perfil.";
}

/** ¿Este actor puede cargar este adaptador? Solo si podría leer el dato más privado que vio. */
export function puedeUsarAdaptador(reg: Pick<RegistroAdaptador, "alcance">, actor: ActorMemoria): boolean {
    return alcanceVisiblePara(actor).includes(reg.alcance);
}

/** Un adaptador solo vale sobre la familia de base con la que se entrenó. */
export function adaptadorCompatibleConBase(reg: Pick<RegistroAdaptador, "familiaBase" | "formato">, baseActiva: FamiliaBase): boolean {
    return reg.formato === "gguf-fusionado" ? true : reg.familiaBase === baseActiva;
}

function fechaCompacta(d: Date): string {
    return d.toISOString().slice(0, 10).replace(/-/g, "");
}

/**
 * Planifica la personalización de un sujeto: filtra las fuentes por consentimiento y por ámbito, calcula el alcance,
 * elige la fábrica para el medio y deja el borrador del registro (siempre «candidato»). No entrena ni escribe nada.
 */
export function planificarAdaptador(p: PeticionAdaptador): PlanAdaptador {
    const errores: string[] = [];
    const avisos: string[] = [];
    const s = p.sujeto;
    const slug = slugSujeto(s?.id);
    if (!slug) errores.push("El sujeto necesita un id.");
    if (s?.tipo === "capa" && !CAPAS.includes(s.id as CapaConciencia)) {
        errores.push(`La capa de conciencia «${String(s.id)}» no existe (hay: ${CAPAS.join(", ")}).`);
    }
    if (s?.actor?.tipo === "agente-grupo" && !s.actor.grupoId?.trim()) {
        errores.push("Un agente de grupo tiene que declarar a qué grupo sirve antes de personalizarse con su memoria.");
    }
    if (!Array.isArray(p.fuentes) || p.fuentes.length === 0) errores.push("No hay ningún archivo de corpus para entrenar.");
    for (const f of p.fuentes ?? []) {
        if (!rutaRelativaSegura(f.ruta)) errores.push(`La ruta «${String(f.ruta)}» debe ser relativa, sin «..» ni .env.`);
    }
    if (errores.length > 0) return { ok: false, errores };

    const ambito = ambitoDeSujeto(s);
    const actor = actorEfectivo(s);

    // 1) Nada de memoria personal en un adaptador colectivo: se rechaza, no se filtra en silencio.
    if (ambito === "colectivo") {
        const personales = p.fuentes.filter((f) => SIN_PERSONAL.includes(f.alcance));
        if (personales.length > 0) {
            return {
                ok: false,
                errores: [
                    `Un adaptador colectivo no puede entrenarse con memoria personal ni de perfil (${personales.map((f) => f.ruta).join(", ")}): quien lo cargue podría recitarla. Sepárala en el corpus o entrena un adaptador privado.`,
                ],
            };
        }
    }

    // 2) Consentimiento (y aprobación de la entidad para la memoria de grupo en un adaptador colectivo).
    const usadas: FuenteAdaptador[] = [];
    const excluidas: { ruta: string; motivo: string }[] = [];
    for (const f of p.fuentes) {
        if (f.consentimiento !== true) excluidas.push({ ruta: f.ruta, motivo: "Sin sello de consentimiento." });
        else if (ambito === "colectivo" && f.alcance === "grupo" && f.aprobadoPorEntidad !== true) {
            excluidas.push({ ruta: f.ruta, motivo: "Memoria de grupo sin la aprobación de la entidad." });
        } else usadas.push(f);
    }
    if (usadas.length === 0) {
        return { ok: false, errores: ["Ningún archivo del corpus tiene el consentimiento necesario: no se entrena nada.", ...excluidas.map((e) => `${e.ruta}: ${e.motivo}`)] };
    }

    // 3) El alcance del adaptador y quién puede cargarlo.
    const alcance = alcanceDelAdaptador(usadas.map((f) => f.alcance));
    if (!alcanceVisiblePara(actor).includes(alcance)) {
        return {
            ok: false,
            errores: [`Un actor «${actor.tipo}» no puede cargar un adaptador que vio memoria de alcance «${alcance}»: quedaría la memoria más privada en manos de un agente que no podría leerla.`],
        };
    }

    // 4) Salidas de la neurona: una GPU prestada, o una capa que se sirve fuera del aparato.
    const sirveFuera = s.tipo === "capa" && s.id !== "local";
    if ((!p.medio.local || sirveFuera) && alcance === "personal" && p.autorizaNube !== true) {
        return { ok: false, errores: ["El corpus tiene memoria personal y saldría de tu neurona (GPU prestada o capa que se sirve fuera): hace falta tu consentimiento explícito."] };
    }
    if (!p.medio.local && p.autorizaNube !== true) {
        return { ok: false, errores: [`El archivo de entrenamiento saldría de la neurona hacia «${p.medio.nombre}»: hace falta el consentimiento explícito.`] };
    }
    if (!p.medio.local && alcance === "personal") avisos.push("Memoria personal en una GPU prestada: usa un dataset privado, y borra la sesión y los datos al acabar.");
    if (sirveFuera && alcance === "personal") avisos.push("Este adaptador se serviría fuera de tu aparato: queda como privado y solo lo carga tu persona.");

    // 5) La fábrica que toca en este medio.
    const entrenamiento = elegirFabrica(p.medio, p.necesidad);
    if (entrenamiento.motor === null) return { ok: false, errores: [entrenamiento.motivo] };
    if (entrenamiento.modo === "sin-camino") return { ok: false, errores: [entrenamiento.motivo, ...entrenamiento.falta] };
    if (entrenamiento.modo === "preparar") avisos.push(`Aquí solo se prepara: ${entrenamiento.derivarA.length > 0 ? `entrena en ${entrenamiento.derivarA.join(" o ")}` : "falta un medio con GPU"}.`);
    avisos.push(...entrenamiento.avisos);

    const motor = entrenamiento.motor;
    if (motor === "meta-n") return { ok: false, errores: ["Meta^n no fabrica adaptadores: mejora el proceso de la capa, no los pesos."] };
    const formato = FORMATO_POR_MOTOR[motor];
    const ahora = p.ahora ?? new Date();
    const id = `ad-${motor}-${s.tipo}-${slug}-${fechaCompacta(ahora)}`;
    const registro: RegistroAdaptador = {
        id,
        // Genesis lee `personalidad` como etiqueta del sujeto: la personalidad por su id, el resto con su tipo delante.
        personalidad: s.tipo === "personalidad" ? s.id : `${s.tipo}:${s.id}`,
        fecha: ahora.toISOString(),
        sujeto: { tipo: s.tipo, id: s.id },
        ambito,
        alcance,
        actor: actor.tipo,
        motor,
        base: p.base,
        familiaBase: p.necesidad.base,
        formato,
        cargaCon: CARGA_POR_FORMATO[formato],
        archivo: `starseed_memory_root/aprendizaje/adaptadores/${id}.gguf`,
        fuentes: usadas.map((f) => ({ ruta: f.ruta, alcance: f.alcance })),
        estado: "candidato",
        requiereEvaluacion: true,
    };
    if (excluidas.length > 0) avisos.push(`Se dejaron fuera ${excluidas.length} archivo(s) sin consentimiento o sin aprobación.`);

    // 6) Recetas YAML de LlamaFactory para este mismo sujeto y corpus. Solo con el tamaño
    //    del modelo y la plantilla de chat conocidos; en BitNet/Needle la receta se rechaza.
    let recetas: RecetasAdaptador | undefined;
    if (p.plantilla?.trim() && p.necesidad.parametros_b !== undefined) {
        const etapa: Etapa = p.necesidad.tarea === "preferencias" ? "kto" : "sft";
        const destino: DestinoModelo =
            ambito === "privado" ? "privado" : alcance === "publica" ? "publico" : "ambito";
        const carpeta = sanearAmbito(s.id);
        const vramGb = p.medio.vram_gb ?? p.medio.ram_gb;
        const afinado = elegirAfinado(p.necesidad.parametros_b, vramGb);
        const entrenamiento = recetaEntrenamiento({
            ambito: carpeta,
            destino,
            baseHf: p.base,
            parametrosB: p.necesidad.parametros_b,
            vramGb,
            etapa,
            dataset: `${carpeta}_${etapa}`,
            plantilla: p.plantilla,
        });
        if (entrenamiento.ok) {
            const fusion = recetaFusion({
                ambito: carpeta,
                baseHf: p.base,
                adaptadorDir: `saves/${carpeta}/${etapa}-lora`,
                plantilla: p.plantilla,
            });
            recetas = {
                modo: afinado.modo,
                etapa,
                entrenamiento: entrenamiento.yaml,
                dondeEjecutar: entrenamiento.dondeEjecutar,
                avisos: entrenamiento.avisos,
                ...(fusion.ok ? { fusion: fusion.yaml } : {}),
            };
        }
    }

    return {
        ok: true,
        ambito,
        alcance,
        fuentesUsadas: usadas,
        fuentesExcluidas: excluidas,
        entrenamiento,
        registro,
        explicacion: `${explicarAmbito(ambito, alcance)} Lo fabrica ${MOTORES[motor].nombre}.`,
        avisos,
        recetas,
    };
}
