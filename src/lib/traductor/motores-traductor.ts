import type { MotorTraduccion, AlcanceMotor } from "@/lib/traduccion/motor";
import type { IdMotor } from "./tipos";

export interface MotorConPrivacidad {
    motor: MotorTraduccion;
    sale: boolean;
}

export function construirMotores(deps: {
    local: MotorTraduccion;
    navegador: MotorTraduccion;
    libretranslate?: MotorTraduccion;
    astraura?: MotorTraduccion;
    malla?: MotorTraduccion;
    permitidos: Partial<Record<IdMotor, boolean>>;
}): MotorTraduccion[] {
    const orden: IdMotor[] = ["paquete-local", "navegador", "libretranslate", "astraura", "malla"];
    const mapa: Record<IdMotor, MotorTraduccion | undefined> = {
        "paquete-local": deps.local,
        navegador: deps.navegador,
        libretranslate: deps.libretranslate,
        astraura: deps.astraura,
        malla: deps.malla,
    };
    const resultado: MotorTraduccion[] = [];
    for (const id of orden) {
        const motor = mapa[id];
        if (!motor) continue;
        if (deps.permitidos[id] === false) continue;
        resultado.push(motor);
    }
    return resultado;
}

const ALCANCES_PRIVADOS: AlcanceMotor[] = ["aparato", "cuenta", "cerebro"];

function motorSacaTexto(motor: MotorTraduccion): boolean {
    return !ALCANCES_PRIVADOS.includes(motor.alcance);
}

export function crearServicioTraduccion(opciones: {
    privado: boolean;
    motores: MotorTraduccion[];
    topeCache?: number;
}) {
    const { privado, motores, topeCache } = opciones;

    if (privado) {
        const publicos = motores.filter((m) => m.alcance === "malla" || m.alcance === "publico");
        if (publicos.length > 0) {
            throw new Error(
                `Modo privado: se intentó añadir motor(es) de alcance público/malla: ${publicos.map((m) => m.id).join(", ")}`
            );
        }
    }

    const habilitados = privado
        ? motores.filter((m) => ALCANCES_PRIVADOS.includes(m.alcance))
        : motores;

    return {
        traducir: async (textos: string[], origen: string, destino: string) => {
            const modulo = await import("@/lib/traduccion/motor");
            const traductor = modulo.crearTraductor(habilitados, { privado, topeCache });
            return traductor.traducir(textos, origen, destino);
        },
    };
}

export function motoresDeEsteTexto(
    motores: MotorTraduccion[],
    par: { origen: string; destino: string },
    privado: boolean
): Promise<MotorConPrivacidad[]> {
    const habilitados = privado
        ? motores.filter((m) => ALCANCES_PRIVADOS.includes(m.alcance))
        : motores;

    const resultados: MotorConPrivacidad[] = [];
    for (const motor of habilitados) {
        const disponible = await motor.disponible(par.origen, par.destino).catch(() => false);
        if (disponible) {
            resultados.push({ motor, sale: motorSacaTexto(motor) });
        }
    }
    return resultados;
}