// ════════════════════════════════════════════════════════════════
// Modos de abrir una app en la malla (§5 de apps-en-la-malla.md)
// Puro: sin red, sin disco, sin reloj propio. Elige entre local,
// por-bandas, montada, transmitida y ramificada mirando lo que la
// neurona prestará y lo que la bolsa ya decidió.
// ════════════════════════════════════════════════════════════════

import type { ModoEjecucion, RequisitosApp } from "../../components/dashboard/apps/launcher-types";
import { OfertaNeurona, capacidadPrestable } from "./oferta";
import type { ResultadoPlanificacion } from "./bolsa";

/** App vista por el decisor de modos (no hace falta el icono ni la ruta). */
export interface AppApertura {
    id: string;
    /** Modos que la app admite. Sin campo = ["local"], como hoy. */
    ejecucion?: ModoEjecucion[];
    /** Lo que la app necesita para correr bien. */
    requisitos?: RequisitosApp;
}

/** Modo elegido, destino y motivo legible (siempre dice por qué). */
export interface ModoApertura {
    modo: ModoEjecucion;
    /** Id de la neurona o servidor donde corre, o "pasarela-local". */
    destino: string;
    motivo: string;
}

/** Qué le falta a la app en la parte prestable de esta neurona. */
function faltasLocales(
    req: RequisitosApp | undefined,
    prestable: {
        computo: { ramLibreMb: number; gpu: boolean; motores: string[] };
        almacen: { volumenes: string[] };
    }
): string[] {
    const faltas: string[] = [];
    if (req?.ramMb !== undefined && prestable.computo.ramLibreMb < req.ramMb) {
        faltas.push(`RAM ${req.ramMb} MB`);
    }
    if (req?.gpu === true && prestable.computo.gpu !== true) {
        faltas.push("GPU");
    }
    const sinMotor = (req?.motores ?? []).filter(
        (motor) => !prestable.computo.motores.includes(motor)
    );
    if (sinMotor.length > 0) faltas.push(`motores: ${sinMotor.join(", ")}`);
    if (req?.volumen !== undefined && !prestable.almacen.volumenes.includes(req.volumen)) {
        faltas.push(`volumen ${req.volumen}`);
    }
    return faltas;
}

/** Elige cómo abrir la app desde esta neurona con el plan de la bolsa. */
export function comoAbrir(
    app: AppApertura,
    neurona: OfertaNeurona,
    plan: ResultadoPlanificacion
): ModoApertura {
    const modos: ModoEjecucion[] = app.ejecucion ?? ["local"];
    const faltas = faltasLocales(app.requisitos, capacidadPrestable(neurona));
    const pideVolumen = app.requisitos?.volumen !== undefined;
    const faltaVolumen = faltas.some((falta) => falta.startsWith("volumen "));
    // «Solo falta cálculo»: el volumen ya está en esta neurona.
    const soloCalculo = !faltaVolumen && faltas.length > 0;

    if (modos.includes("local") && faltas.length === 0) {
        return {
            modo: "local",
            destino: neurona.nodoId,
            motivo: `Cabe en esta neurona (${neurona.medio}): las capacidades prestables la cubren.`,
        };
    }

    const bytes = plan.porParte["bytes"] ?? [];
    // Web/WASM con volumen pesado: se trae por bandas solo lo que se usa.
    if (modos.includes("por-bandas") && pideVolumen && faltaVolumen && bytes.length > 0) {
        return {
            modo: "por-bandas",
            destino: bytes[0].destino,
            motivo: `Volumen por bandas desde ${bytes[0].destino}; ${bytes[0].motivo}.`,
        };
    }

    // App nativa que no vive en este disco: el volumen se monta como disco
    // del sistema por la pasarela local (WebDAV en 127.0.0.1).
    if (modos.includes("montada") && pideVolumen && faltaVolumen && bytes.length > 0) {
        return {
            modo: "montada",
            destino: "pasarela-local",
            motivo: `Se monta el volumen (bandas desde ${bytes[0].destino}) por la pasarela local.`,
        };
    }

    // La app corre en otra neurona que la tiene prestada y la latencia sirve.
    const ventana = (plan.porParte["ventana"] ?? [])[0];
    if (modos.includes("transmitida") && ventana !== undefined) {
        return {
            modo: "transmitida",
            destino: ventana.destino,
            motivo: `${ventana.motivo}; la ventana llega por WebRTC y la latencia del enlace la sirve.`,
        };
    }

    // Interfaz en local y cálculo en otras neuronas.
    const computo = (plan.porParte["computo"] ?? [])[0];
    if (modos.includes("ramificada") && soloCalculo && computo !== undefined) {
        return {
            modo: "ramificada",
            destino: computo.destino,
            motivo: `La interfaz corre aquí y el cálculo en ${computo.destino}; ${computo.motivo}.`,
        };
    }

    // Suelo: nunca «nada». Se abre en local y se dice lo que falta.
    const aviso = faltas.length > 0 ? ` Falta aquí: ${faltas.join("; ")}.` : " Falta información de requisitos.";
    return { modo: "local", destino: neurona.nodoId, motivo: `Suelo: se abre en local porque la red no cubre lo que pide.${aviso}` };
}
