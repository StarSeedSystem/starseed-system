/**
 * Astraura y la Protomolécula sobre otras neuronas (REM1126B · parte 1).
 * Cuando la persona lo pide, arma la orden tipada de REM1126A (ajustes) o de la terminal
 * (TRM1125B/D) hacia la neurona nombrada, enseña qué cambiaría y la deja lista para el «sí».
 * Puro, sin `node:*`, nunca lanza. Lo que Astraura propone por su cuenta queda «protegido».
 */

import type { Args } from "@/lib/control-remoto/niveles";
import { CLAVES_SEGURIDAD, validarArgsAjusteRemoto, type AmbitoAjuste, type ValorAjuste } from "@/lib/control-remoto/ajustes-remotos";
import { comandoTerminal, validarComandoTerminal } from "@/lib/control-remoto/terminal";

export type OrigenPeticion = "persona" | "astraura";
/** «pregunta»: hace falta el sí; «sin-preguntar»: la persona lo marcó para esa neurona; «protegido»: idea de Astraura, siempre el sí. */
export type NivelConfirmacion = "pregunta" | "sin-preguntar" | "protegido";

export interface NeuronaDestino {
    id: string;
    nombre: string;
    /** Permiso «configurar a distancia» encendido en ese aparato. */
    configurarADistancia: boolean;
    /** Nivel de terminal que ese aparato concede a este control. */
    terminal: "ninguno" | "usuario" | "administrador";
}

export type PeticionRemota =
    | { origen: OrigenPeticion; neurona: string; tipo: "ajuste"; clave: string; valor: ValorAjuste; ambito: AmbitoAjuste; anterior?: ValorAjuste | null }
    | { origen: OrigenPeticion; neurona: string; tipo: "terminal"; comando: string; args: Args };

export interface CambioVista {
    clave: string;
    ambito: AmbitoAjuste;
    anterior: ValorAjuste | null;
    nuevo: ValorAjuste;
}
export interface OrdenRemota {
    neuronaId: string;
    nombre: string;
    args: Args;
}
export interface VistaPrevia {
    titulo: string;
    cambios: CambioVista[];
    reversible: boolean;
}
export type MotivoRechazo = "neurona-desconocida" | "neurona-ambigua" | "permiso-apagado" | "terminal-insuficiente" | "seguridad" | "argumentos";

export type ResultadoPropuesta =
    | { ok: true; nivel: NivelConfirmacion; orden: OrdenRemota; vista: VistaPrevia }
    | { ok: false; motivo: MotivoRechazo; ayuda: string };

/** Neuronas marcadas «sin preguntar» para ajustes corrientes, por id. */
export type SinPreguntarPorNeurona = Readonly<Record<string, boolean>>;

function norm(s: string): string {
    return s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

/** Busca la neurona por nombre (sin acentos ni mayúsculas) o por id. */
export function buscarNeurona(nombre: string, neuronas: readonly NeuronaDestino[]): NeuronaDestino | "ambigua" | null {
    const n = norm(nombre);
    if (!n) return null;
    const exactas = neuronas.filter((x) => x.id === nombre || norm(x.nombre) === n);
    if (exactas.length === 1) return exactas[0];
    if (exactas.length > 1) return "ambigua";
    const parecidas = neuronas.filter((x) => norm(x.nombre).includes(n));
    return parecidas.length === 1 ? parecidas[0] : parecidas.length > 1 ? "ambigua" : null;
}

function ayudaPermiso(n: NeuronaDestino): string {
    return `«${n.nombre}» no deja configurarla a distancia. Para darlo: abre Ajustes en esa neurona, entra en «Control entre mis neuronas» y enciende «Configurar a distancia».`;
}

function ayudaTerminal(n: NeuronaDestino, admin: boolean): string {
    const nivel = admin ? "administrador" : "usuario";
    return `«${n.nombre}» no concede terminal de nivel ${nivel}. Para darlo: en esa neurona abre «Control entre mis neuronas» › Terminal y concede el nivel ${nivel}.`;
}

function nivelDe(p: PeticionRemota, n: NeuronaDestino, sinPreguntar: SinPreguntarPorNeurona): NivelConfirmacion {
    if (p.origen !== "persona") return "protegido";
    // «Sin preguntar» solo vale para ajustes corrientes: nunca permisos ni terminal.
    if (p.tipo === "ajuste" && p.ambito !== "permiso" && sinPreguntar[n.id] === true) return "sin-preguntar";
    return "pregunta";
}

/** Pedido → orden tipada + vista previa, o el motivo de rechazo con cómo arreglarlo. */
export function armarPropuestaRemota(
    p: PeticionRemota,
    neuronas: readonly NeuronaDestino[],
    sinPreguntar: SinPreguntarPorNeurona = {},
): ResultadoPropuesta {
    const n = buscarNeurona(p.neurona, neuronas);
    if (n === null) return { ok: false, motivo: "neurona-desconocida", ayuda: `No encuentro una neurona llamada «${p.neurona}».` };
    if (n === "ambigua") return { ok: false, motivo: "neurona-ambigua", ayuda: `Hay varias neuronas que encajan con «${p.neurona}»: dime el nombre completo.` };
    const nivel = nivelDe(p, n, sinPreguntar);

    if (p.tipo === "ajuste") {
        if (CLAVES_SEGURIDAD.includes(p.clave)) {
            return { ok: false, motivo: "seguridad", ayuda: `«${p.clave}» es de seguridad: solo se cambia en la propia neurona, nunca a distancia.` };
        }
        if (!n.configurarADistancia) return { ok: false, motivo: "permiso-apagado", ayuda: ayudaPermiso(n) };
        const args = validarArgsAjusteRemoto("poner-ajuste", { clave: p.clave, valor: p.valor, ambito: p.ambito });
        if (!args) return { ok: false, motivo: "argumentos", ayuda: "El ajuste pedido no tiene una forma válida." };
        const cambio: CambioVista = { clave: p.clave, ambito: p.ambito, anterior: p.anterior ?? null, nuevo: p.valor };
        return {
            ok: true,
            nivel,
            orden: { neuronaId: n.id, nombre: "poner-ajuste", args },
            vista: { titulo: `Cambiar «${p.clave}» en ${n.nombre}`, cambios: [cambio], reversible: true },
        };
    }

    const cmd = comandoTerminal(p.comando);
    const args = cmd ? validarComandoTerminal(p.comando, p.args) : null;
    if (!cmd || !args) return { ok: false, motivo: "argumentos", ayuda: `«${p.comando}» no es una orden de terminal conocida o sus argumentos no valen.` };
    const hayTerminal = cmd.requiereAdminCompleto ? n.terminal === "administrador" : n.terminal !== "ninguno";
    if (!hayTerminal) return { ok: false, motivo: "terminal-insuficiente", ayuda: ayudaTerminal(n, cmd.requiereAdminCompleto) };
    return {
        ok: true,
        nivel,
        orden: { neuronaId: n.id, nombre: p.comando, args },
        vista: { titulo: `${cmd.descripcion} en ${n.nombre}`, cambios: [], reversible: false },
    };
}

/** Tras el «sí» de la persona (o sin preguntar), ¿puede salir la orden ya? Lo «protegido» siempre exige el sí. */
export function puedeEnviarse(nivel: NivelConfirmacion, personaDijoSi: boolean): boolean {
    if (nivel === "sin-preguntar") return true;
    return personaDijoSi;
}
