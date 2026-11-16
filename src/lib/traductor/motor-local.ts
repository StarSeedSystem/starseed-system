/** Motor de traducción local usando modelos paquete (ONNX/OPUS).
 *  MotorTraduccion con id "paquete-local", alcance "aparato", disponible si el modelo está instalado.
 *  Traduce por lotes de ≤8 textos, un par a la vez en memoria (~1 GB máximo).
 *  Sin red: funciona offline sobre modelos locales.
 */

import type { MotorTraduccion, AlcanceMotor } from "../traduccion/motor";
import { modeloPara, type PaqueteModelo } from "./modelos-locales";

export interface AlmacenIndice {
    getItem(clave: string): string | null;
    setItem(clave: string, valor: string): void;
    removeItem(clave: string): void;
    datos?: Map<string, string>;
    romper?: boolean;
}

const CLAVE_INDICE = "starseed:traductor-paquetes";

function leerInstalados(almacen: AlmacenIndice): string[] {
    try {
        if (almacen.romper) return [];
        const raw = almacen.getItem(CLAVE_INDICE);
        if (!raw) return [];
        const parseado = JSON.parse(raw);
        if (!Array.isArray(parseado)) return [];
        return parseado.map((e: unknown) => (typeof e === "object" && e !== null && "par" in e && typeof (e as Record<string, unknown>).par === "string") ? (e as Record<string, unknown>).par as string : "").filter(Boolean);
    } catch {
        return [];
    }
}

export interface DependenciasPaquete {
    instalado: (origen: string, destino: string) => Promise<boolean>;
    cargarPipeline: (modelo: PaqueteModelo) => Promise<(textos: string[]) => Promise<string[]>>;
    alcance?: AlcanceMotor;
    almacen?: AlmacenIndice;
    descargarPipeline?: () => Promise<void>;
}

let pipelineActual: ((textos: string[]) => Promise<string[]>) | null = null;
let parActual: string | null = null;

export function motorPaqueteLocal(deps: DependenciasPaquete): MotorTraduccion {
    const alcance: AlcanceMotor = deps.alcance ?? "aparato";
    const almacen = deps.almacen ?? {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
    };

    async function estaInstalado(origen: string, destino: string): Promise<boolean> {
        const instalados = leerInstalados(almacen);
        const modelo = modeloPara(origen, destino);
        if (!modelo) return false;
        if (instalados.includes(modelo.repo as unknown as string)) return true;
        const resultado = await deps.instalado(origen, destino);
        if (resultado) {
            almacen.setItem(CLAVE_INDICE, JSON.stringify([...instalados, { 
                id: `pkg-${origen}-${destino}`, 
                par: `${origen}-${destino}`, 
                bytes: 60_000_000, 
                hash: "", 
                version: "1", 
                instaladoEn: Date.now() 
            }]));
        }
        return resultado;
    }

    async function traducir(textos: string[], origen: string, destino: string): Promise<string[]> {
        if (textos.length === 0) return [];
        
        const modelo = modeloPara(origen, destino);
        if (!modelo) {
            throw new Error(`No hay modelo local para ${origen} → ${destino}`);
        }
        
        if (!await estaInstalado(origen, destino)) {
            throw new Error("No se pudo cargar el motor local");
        }
        
        if (deps.descargarPipeline && parActual !== `${origen}-${destino}`) {
            await deps.descargarPipeline();
            pipelineActual = null;
            parActual = null;
        }
        
        if (!pipelineActual || parActual !== `${origen}-${destino}`) {
            pipelineActual = await deps.cargarPipeline(modelo);
            parActual = `${origen}-${destino}`;
        }
        
        const lotes: string[][] = [];
        for (let i = 0; i < textos.length; i += 8) {
            lotes.push(textos.slice(i, i + 8));
        }
        
        const resultados: string[] = [];
        for (const lote of lotes) {
            const traducciones = await pipelineActual!(lote);
            resultados.push(...traducciones);
        }
        
        return resultados;
    }

    return {
        id: "paquete-local",
        alcance,
        disponible: estaInstalado,
        traducir,
    };
}