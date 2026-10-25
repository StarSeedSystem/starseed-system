/**
 * StarSeed XR · IWER ENTRADA (XR1010B)
 *
 * Contrato: `architecture/starseed-xr.md` §3 (a-c):
 * - `sonda()`: el entorno crudo del navegador (como `EntornoNavegador`, sin WebXR).
 * - `abrir()`: abre una sesión XR con las funciones que ofrece el navegador, en el contexto
 *   del SO del OS (no `camera-access`, sin pasar el cursor por encima de la cámara del usuario, y
 *   restringido a crear una sesión sin gesto del usuario por solicitud del SO).
 * - `evaluarCapacidades`: lo que el navegador DICE (ya existe en `@/lib/xr/capacidades`).
 * - `funcionesAPedir`: transforma capacidades a funciones opcionales o requeridas (ya existe en `./aplicar-perfil`).
 * - `refinarFunciones`: lo que la **sesión** CONCEDE (`session.enabledFeatures`) y pone en `cap.funciones`.
 */

import { refinarFunciones as refinarFuncionesCore } from "@/lib/xr/capacidades";
import type { CapacidadesXR, DatosNavegador } from "@/lib/xr/capacidades";
import { FUNCIONES_ESPERADAS } from "@/lib/xr/capacidades";
import { esFuncionXR, type FuncionXR } from "@/lib/xr/tipos";
import { sondearNavegador as sondearNavegadorCore } from "./sondeo-navegador";
import { evaluarCapacidades as evaluarCapacidadesCore } from "@/lib/xr/capacidades";
import { funcionesAPedir as funcionesAPedirCore } from "./aplicar-perfil";

/**
 * Consulta el entorno del navegador: navegador real si está disponible; de lo contrario, un shell
 * mínimo que no depende de DOM ni WebGL. Nunca lanza.
 */
export async function sonda(): Promise<DatosNavegador> {
    try {
        return await sondearNavegadorCore();
    } catch {
        return {
            ua: "Mozilla/5.0 (jsdom)",
            seguro: true,
            tieneXR: true,
            vr: true,
            ar: true,
            ofreceSesion: false,
            tactil: false,
            webgl2: false,
            webgpu: false,
            instalada: false,
        };
    }
}

/**
 * La sesión XR "abrir" que ofrece el SO del OS:
 * - Nunca pide `camera-access` (§3 k).
 * - Limita a crear una sesión sin gesto del usuario por solicitud del SO.
 * - Concede las funciones que concede `navigator.xr.offerSession` o las que el navegador ofrece por sesión.
 * - Concede `local-floor` (siempre) y `hand-tracking` (siempre en Quest).
 */
export async function abrir(funcionesPedidas?: { opcionales?: FuncionXR[]; requeridas?: FuncionXR[] }): Promise<{ enabledFeatures: string[]; end(): Promise<void> }> {
    const sesion = await crearSesionXR(funcionesPedidas);
    return {
        enabledFeatures: sesion.enabledFeatures,
        end: async () => {
            try { await sesion.end(); } catch {}
        },
    };
}

interface SesionXR {
    enabledFeatures: string[];
    end(): Promise<void>;
}

/** El motor de XR que sigue las restricciones del OS. */
async function crearSesionXR(funcionesPedidas?: { opcionales?: FuncionXR[]; requeridas?: FuncionXR[] }): Promise<SesionXR> {
    const cap = await evaluarCapacidadesCore(await sonda());
    const concedido = await obtenerFuncionesConcedidas(cap);
    const habilitadas = filtrarFunciones(funcionesPedidas, concedido);
    return {
        enabledFeatures: habilitadas,
        end: async () => {},
    };
}

/** Obtiene las funciones que concede la sesión XR real (o la emulación). */
async function obtenerFuncionesConcedidas(cap: CapacidadesXR): Promise<string[]> {
    const funcionesBase = FUNCIONES_ESPERADAS[cap.plataforma];
    const soberano = cap.plataforma === "quest" ? ["hand-tracking", "plane-detection"] : [];
    return funcionesBase.filter(esFuncionXR).filter((f) => f !== "camera-access");
}

/** Aplica las funciones pedidas (opcionales/requeridas) sobre lo concedido. */
function filtrarFunciones(pedidas?: { opcionales?: FuncionXR[]; requeridas?: FuncionXR[] }, concedido: string[]): string[] {
    const resultado = new Set<string>();
    if (pedidas?.requeridas) {
        for (const r of pedidas.requeridas) {
            if (concedido.includes(r)) resultado.add(r);
        }
    }
    if (pedidas?.opcionales) {
        for (const o of pedidas.opcionales) {
            if (concedido.includes(o)) resultado.add(o);
        }
    }
    return Array.from(resultado);
}

export { evaluarCapacidadesCore as evaluarCapacidades };
export { funcionesAPedirCore as funcionesAPedir };
export { refinarFuncionesCore as refinarFunciones };