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
    /**
     * ¿Está activo en esta colmena el traspaso de trabajo entre contenedores (puntos de control subidos al A1,
     * el líder que sigue las tareas de un nodo perdido, el aparato que suelta lo ya seguido: COL1012E/G/H)?
     * Solo `true` activa los botones y los textos del contrato; `false` y `undefined` (sin dato) = aún no: los botones
     * que no cambiarían nada se ven desactivados y los textos no prometen traspaso ni reparto.
     */
    relevoActivo?: boolean;
    /** El nodo todavía no informa de su trabajo (latido viejo o su medida falló): no se afirma «sin trabajo». */
    sinDatosTrabajo?: boolean;
    /** El nodo todavía no informa de lo que puede aportar como contenedor. */
    sinDatosCapacidad?: boolean;
    /**
     * Hay un orquestador en marcha en el aparato. Con `enCurso` = 0 no basta para decir «sin trabajo»: puede estar
     * entre dos tareas, y apagar el aparato en ese hueco corta la siguiente que coja.
     */
    orquestadorVivo?: boolean;
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

/**
 * PURA. Los botones de una neurona en /metagenesis y en Neuronas.
 *
 * «Basta de ilusiones»: mientras `relevoActivo` no sea `true` (hoy nadie sube los puntos de control al A1 ni
 * reparte tareas a un contenedor: COL1012E/G/H), un botón que no cambiaría nada NO se ofrece como pulsable:
 *   · «Desconectar» no traspasa trabajo, así que se ve, desactivado, diciéndolo (apagar el contenedor ya lo hace
 *     «Dejar de usar como contenedor»);
 *   · «Usar como contenedor» solo escribiría una marca que el líder no lee: desactivado, con esa razón.
 * Sin el dato (`undefined`) se trata como «no activo»: quien llame sin la bandera no hereda una promesa falsa.
 */
export function botonesNeurona(n: NeuronaColmena): { desconectar: Boton; contenedor: Boton; instalar: Boton } {
    const c = n.contenedor ?? null;
    const sinTraspaso = n.relevoActivo !== true;
    let desconectar = OCULTO;
    if (n.nodo && n.desconectando) {
        desconectar = {
            visible: true,
            habilitado: false,
            etiqueta: "Desconectando…",
            explica: sinTraspaso
                ? "Ya no se ofrece como contenedor. El traspaso del trabajo a otro contenedor aún no está activo."
                : "Guarda el trabajo a medias y lo pasa a otro contenedor.",
        };
    } else if (n.nodo && n.vivo && n.sinDatosTrabajo) {
        desconectar = {
            visible: true,
            habilitado: false,
            etiqueta: "Desconectar",
            explica: "Este nodo aún no informa de su trabajo, así que no sé si tiene algo a medias. Actualiza su nodo de MetaGenesis.",
        };
    } else if (n.nodo && n.vivo && sinTraspaso) {
        desconectar = {
            visible: true,
            habilitado: false,
            etiqueta: "Desconectar",
            explica: c?.activo
                ? "Hoy desconectar solo dejaría de ofrecer este aparato como contenedor, que es lo que hace «Dejar de usar como contenedor»: usa ese botón. El traspaso del trabajo a otro contenedor aún no está activo."
                : n.enCurso > 0
                  ? `El traspaso del trabajo a otro contenedor aún no está activo: desconectar no cambiaría nada. Puedes apagar este aparato cuando acaben sus ${n.enCurso} tarea(s).`
                  : n.orquestadorVivo
                    ? "Tiene un orquestador en marcha aunque ahora no publique tareas: puede estar entre dos. Páralo antes de apagar este aparato."
                    : "No tiene trabajo en curso: puedes apagarlo sin más.",
        };
    } else if (n.nodo && n.vivo) {
        const trabajo = n.enCurso > 0 || !!c?.activo || n.orquestadorVivo === true;
        desconectar = {
            visible: true,
            habilitado: trabajo,
            etiqueta: "Desconectar",
            explica: !trabajo
                ? "No tiene trabajo en curso: puedes apagarlo sin más."
                : n.enCurso > 0
                  ? `Guarda el trabajo a medias de sus ${n.enCurso} agente(s) y lo pasa a otro contenedor antes de que este aparato se quede sin internet.`
                  : "Pasa a otro contenedor lo que tenga a medias antes de que este aparato se quede sin internet.",
            confirmar: n.enCurso > 0,
        };
    }
    let contenedor = OCULTO;
    const dejarDeUsar = (explica: string, confirmar: boolean): Boton => ({
        visible: true,
        habilitado: n.vivo,
        etiqueta: "Dejar de usar como contenedor",
        explica,
        confirmar,
    });
    if (n.nodo && n.sinDatosCapacidad) {
        contenedor = {
            visible: true,
            habilitado: false,
            etiqueta: "Usar como contenedor",
            explica: "Este nodo aún no informa de lo que puede aportar. Actualiza su nodo de MetaGenesis.",
        };
    } else if (n.nodo && c) {
        if (c.activo && !c.apto) {
            // Se apuntó como contenedor y luego dejó de poder (falta una herramienta, poca RAM…): hay que poder apagarlo.
            contenedor = dejarDeUsar(`Ya no puede ser contenedor (${c.motivo || "sin motivo"}). Deja de ofrecer este aparato como contenedor.`, false);
        } else if (!c.apto) {
            contenedor = { visible: true, habilitado: false, etiqueta: "Usar como contenedor", explica: c.motivo };
        } else if (c.activo) {
            contenedor = sinTraspaso
                ? dejarDeUsar("Deja de ofrecer este aparato como contenedor. No para lo que ya esté corriendo.", false)
                : dejarDeUsar("Termina lo que lleva y no coge más.", n.enCurso > 0);
        } else {
            contenedor = {
                visible: true,
                habilitado: n.vivo && c.agentes > 0 && !sinTraspaso,
                etiqueta: `Usar como contenedor (${c.agentes} agente${c.agentes === 1 ? "" : "s"})`,
                explica:
                    c.agentes <= 0
                        ? c.motivo
                        : sinTraspaso
                          ? "El reparto de tareas a contenedores aún no está activo (COL1012G): apuntar este aparato como contenedor no cambiaría nada hoy."
                          : "Este aparato coge tareas de la cola como la Mac.",
            };
        }
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
