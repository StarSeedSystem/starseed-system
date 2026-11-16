import type { ParIdiomas, ResultadoTraductor, IdMotor } from "./tipos";
import { detectarIdioma, type DeteccionIdioma } from "./detectar";
import { motoresDeEsteTexto, type MotorConPrivacidad } from "./motores-traductor";
import { registrar, type AlmacenHistorial, type OpcionesHistorial } from "./historial";
import { avisoPendiente, type AlmacenAvisos, AVISOS } from "./privacidad";
import type { MotorTraduccion } from "@/lib/traduccion/motor";

const MAX_CHARS = 5000;
const UMBRAL_CONFIANZA_AUTO = 0.6;

export interface DependenciasServicioTraductor {
    motores: MotorTraduccion[];
    almacenHistorial: AlmacenHistorial;
    almacenAvisos: AlmacenAvisos;
    opcionesHistorial: OpcionesHistorial;
    reloj: () => number;
}

export type ResultadoServicioTraductor =
    | ResultadoTraductor
    | { necesitaAviso: IdMotor }
    | { error: string; motor: IdMotor };

export function crearServicioTraductor(deps: DependenciasServicioTraductor) {
    const { motores, almacenHistorial, almacenAvisos, opcionesHistorial, reloj } = deps;

    async function traducir(texto: string, par: ParIdiomas): Promise<ResultadoServicioTraductor> {
        const inicio = reloj();

        let origen = par.origen;
        let avisoDeteccion: string | undefined;
        let origenDetectado: string;

        if (origen === "auto") {
            const deteccion = detectarIdioma(texto);
            if (deteccion.codigo === null || deteccion.confianza < UMBRAL_CONFIANZA_AUTO) {
                origenDetectado = "desconocido";
                avisoDeteccion = "No se pudo detectar el idioma con suficiente confianza. Elige el idioma de origen manualmente.";
            } else {
                origen = deteccion.codigo;
                origenDetectado = deteccion.codigo;
            }
        } else {
            origenDetectado = origen;
        }

        let textoProcesado = texto;
        let avisoLongitud: string | undefined;
        if (texto.length > MAX_CHARS) {
            textoProcesado = texto.slice(0, MAX_CHARS);
            avisoLongitud = `El texto se ha recortado a ${MAX_CHARS} caracteres.`;
        }

        const motoresDisponibles = await motoresDeEsteTexto(motores, { origen, destino: par.destino }, false);

        if (motoresDisponibles.length === 0) {
            return { error: `Ningún traductor disponible para ${origen} → ${par.destino}`, motor: "paquete-local" };
        }

        let ultimoError: { mensaje: string; motor: IdMotor } | null = null;

        for (const { motor, sale } of motoresDisponibles) {
            const saleDelAparato = AVISOS[motor.id]?.sale_del_aparato ?? false;
            if (saleDelAparato && avisoPendiente(motor.id, almacenAvisos)) {
                return { necesitaAviso: motor.id };
            }

            try {
                const [resultado] = await motor.traducir([textoProcesado], origen, par.destino);
                const ms = reloj() - inicio;

                const aviso = [avisoDeteccion, avisoLongitud].filter(Boolean).join(" ") || undefined;

                const resultadoFinal: ResultadoTraductor = {
                    texto: resultado.texto,
                    origenDetectado,
                    motor: motor.id,
                    local: !saleDelAparato,
                    ms,
                    aviso,
                };

                registrar(
                    {
                        origen: origenDetectado,
                        destino: par.destino,
                        textoOrigen: textoProcesado,
                        textoDestino: resultado.texto,
                        motor: motor.id,
                    },
                    almacenHistorial,
                    opcionesHistorial
                );

                return resultadoFinal;
            } catch (e) {
                const mensaje = e instanceof Error ? e.message : String(e);
                ultimoError = { mensaje, motor: motor.id };
            }
        }

        if (ultimoError) {
            return { error: ultimoError.mensaje, motor: ultimoError.motor };
        }
        return { error: `Ningún traductor disponible para ${origen} → ${par.destino}`, motor: "paquete-local" };
    }

    return { traducir };
}