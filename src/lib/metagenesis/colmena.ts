/**
 * Colmena (COL1012) · lo que la PANTALLA decide para cada neurona: botón «Desconectar», «Usar como
 * contenedor» y, si el aparato no tiene el trabajador, cómo instalarlo y cuánto podría aportar.
 * Contrato: architecture/colmena-relevo-contenedores.md. Las decisiones del nodo y del líder viven en
 * scripts/puente/colmena_logica.py; aquí van los MISMOS umbrales (6 GB, 4 agentes, (RAM − 2) ÷ 2).
 * PURO: sin `window`, sin red. Las señales del navegador las pasa quien llama.
 */

export const RAM_MIN_GB = 6;
export const TOPE_AGENTES = 4;

export type SO = "macos" | "linux" | "windows" | "android" | "ios" | "otro";

export interface ContenedorNodo {
    activo: boolean;
    agentes: number;
    apto: boolean;
    motivo: string;
}

export interface NeuronaColmena {
    /** Id del nodo de MetaGenesis si el aparato tiene el trabajador; null si solo hay navegador. */
    nodo: string | null;
    vivo: boolean;
    so: SO;
    enCurso: number;
    contenedor?: ContenedorNodo | null;
    desconectando?: boolean;
}

export interface Boton {
    visible: boolean;
    habilitado: boolean;
    etiqueta: string;
    explica: string;
    confirmar?: boolean;
}

export interface SenalesNavegador {
    userAgent: string;
    plataforma?: string;
    /** `navigator.deviceMemory`: solo Chromium, redondeada y con techo de 8. */
    memoriaGB?: number | null;
    nucleos?: number | null;
    bateria?: { cargando: boolean; nivel: number } | null;
    redMedida?: boolean;
}

const OCULTO: Boton = { visible: false, habilitado: false, etiqueta: "", explica: "" };

/** PURA. Sistema del aparato a partir de lo que dice el navegador (iPad moderno se presenta como Mac con pantalla táctil). */
export function soDesdeAgente(ua: string, plataforma = "", tactil = false): SO {
    const t = `${ua} ${plataforma}`.toLowerCase();
    if (/iphone|ipad|ipod/.test(t) || (/macintosh|mac os x/.test(t) && tactil)) return "ios";
    if (/android/.test(t)) return "android";
    if (/windows/.test(t)) return "windows";
    if (/macintosh|mac os x|macintel/.test(t)) return "macos";
    if (/linux|x11|cros/.test(t)) return "linux";
    return "otro";
}

/** PURA. Lo que este aparato podría aportar SI instalara el trabajador (estimación honesta desde el navegador). */
export function estimarDesdeNavegador(s: SenalesNavegador, tactil = false): { so: SO; agentes: number | null; explica: string } {
    const so = soDesdeAgente(s.userAgent, s.plataforma ?? "", tactil);
    if (so === "ios") return { so, agentes: 0, explica: "iPhone y iPad no pueden trabajar como contenedor; sí pueden mirar y mandar órdenes." };
    if (so === "otro") return { so, agentes: null, explica: "No reconozco este sistema." };
    const mem = typeof s.memoriaGB === "number" ? s.memoriaGB : null;
    if (mem === null) return { so, agentes: null, explica: "Este navegador no dice cuánta memoria tiene el aparato: el trabajador lo medirá al instalarse." };
    if (mem < RAM_MIN_GB) return { so, agentes: 0, explica: "Con menos de 6 GB de RAM no cabe la comprobación de tipos de los agentes." };
    const nucleos = Math.max(1, Math.floor(s.nucleos ?? 1));
    let n = Math.min(TOPE_AGENTES, Math.floor((mem - 2) / 2), nucleos);
    if (so === "android") n = Math.min(n, 1);
    if (s.bateria && !s.bateria.cargando) n = s.bateria.nivel < 0.2 ? 0 : Math.min(n, 1);
    if (s.redMedida) n = Math.min(n, 1);
    // deviceMemory tiene techo de 8: con 8 puede haber más, así que se dice «al menos».
    const alMenos = mem >= 8 ? "al menos " : "";
    return { so, agentes: n, explica: `Con el trabajador instalado, ${alMenos}${n} agente(s) a la vez.` };
}

/** PURA. Los botones de una neurona en /metagenesis y en Neuronas. */
export function botonesNeurona(n: NeuronaColmena): { desconectar: Boton; contenedor: Boton; instalar: Boton } {
    const c = n.contenedor ?? null;
    let desconectar = OCULTO;
    if (n.nodo && n.desconectando) {
        desconectar = { visible: true, habilitado: false, etiqueta: "Desconectando…", explica: "Guarda el trabajo a medias y lo pasa a otro contenedor." };
    } else if (n.nodo && n.vivo) {
        const trabajo = n.enCurso > 0 || !!c?.activo;
        desconectar = {
            visible: true,
            habilitado: trabajo,
            etiqueta: "Desconectar",
            explica: trabajo
                ? `Guarda el trabajo a medias de sus ${n.enCurso} agente(s) y lo pasa a otro contenedor antes de que este aparato se quede sin internet.`
                : "No tiene trabajo en curso: puedes apagarlo sin más.",
            confirmar: n.enCurso > 0,
        };
    }
    let contenedor = OCULTO;
    if (n.nodo && c) {
        if (!c.apto) contenedor = { visible: true, habilitado: false, etiqueta: "Usar como contenedor", explica: c.motivo };
        else if (c.activo) contenedor = { visible: true, habilitado: n.vivo, etiqueta: "Dejar de usar como contenedor", explica: "Termina lo que lleva y no coge más.", confirmar: n.enCurso > 0 };
        else contenedor = {
            visible: true,
            habilitado: n.vivo && c.agentes > 0,
            etiqueta: `Usar como contenedor (${c.agentes} agente${c.agentes === 1 ? "" : "s"})`,
            explica: c.agentes > 0 ? "Este aparato coge tareas de la cola como la Mac." : c.motivo,
        };
    }
    const instalable = n.so === "macos" || n.so === "linux" || n.so === "windows" || n.so === "android";
    const instalar: Boton = !n.nodo && instalable
        ? {
              visible: true,
              habilitado: true,
              etiqueta: "Instalar el trabajador",
              explica: n.so === "windows" ? "En Windows se instala dentro de WSL2." : n.so === "android" ? "En Android, dentro de Termux (experimental, 1 agente)." : "Un comando en la terminal de este aparato.",
          }
        : OCULTO;
    return { desconectar, contenedor, instalar };
}

/** PURA. El comando exacto para instalar el trabajador (o null si el origen o el código no son válidos). */
export function comandoInstalar(origen: string, codigo: string): string | null {
    if (!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(origen) || !/^[A-Z0-9-]{6,20}$/.test(codigo)) return null;
    return `curl -fsSL ${origen}/trabajador.sh | bash -s -- --emparejar ${codigo}`;
}

/** PURA. Las órdenes (sin firmar) que mandan los botones; las firma y valida la misma lista blanca del nodo. */
export function ordenDesconectar(nodo: string): { accion: "desconectar"; para: string; args: Record<string, never> } {
    return { accion: "desconectar", para: nodo, args: {} };
}

export function ordenContenedor(nodo: string, activo: boolean, agentes?: number) {
    const args: { activo: boolean; trabajadores?: number } = { activo };
    if (activo && typeof agentes === "number") args.trabajadores = Math.max(1, Math.min(TOPE_AGENTES, Math.floor(agentes)));
    return { accion: "contenedor" as const, para: nodo, args };
}
