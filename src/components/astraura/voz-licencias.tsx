"use client";

/**
 * VOZ · LICENCIA POR CONTEXTO (Ola 1018V · tarea L): lista los motores del
 * catálogo con su etiqueta de licencia (Libre / Con condiciones / Solo
 * personal) y por qué sí o NO sonaría en el contexto actual.
 * Contrato `architecture/voz-voicestudio.md` §4: un motor «personal» (no
 * comercial) solo suena en lo personal; en grupo, comunidad, público o
 * comercio solo entran los libres y las condicionadas ya cumplidas.
 * El veredicto lo da el elector puro `motoresPermitidos` (`licencia-voz.ts`); aquí solo se pinta.
 * Probado sin red, disco ni procesos.
 */

import { cn } from "@/lib/utils";
import { MOTORES_VOZ, type MotorVozCatalogo } from "@/lib/aurora/catalogo-voces";
import { motoresPermitidos } from "@/lib/aurora/voz-starseed/licencia-voz";
import type { CapasPrefs } from "@/lib/modelos/preferencias-capas";

export type ContextoVoz = "personal" | "grupo" | "comunidad" | "publico" | "comercial";

export type ClaseLicencia = MotorVozCatalogo["claseLicencia"];

export type EstadoVoicestudioNeurona = "vivo" | "no-detectado" | "sin-comprobar";

export const ETIQUETA_CLASE: Record<ClaseLicencia, string> = {
    libre: "Libre",
    condicionada: "Con condiciones",
    personal: "Solo personal",
};

export interface FichaMotorLicencia {
    id: string;
    nombre: string;
    clase: ClaseLicencia;
    licenciaPesos: string;
    etiqueta: string;
    suena: boolean;
    motivo: string | null;
}

/**
 * Capas con las que el panel consulta el elector: las condicionadas se juzgan
 * por su condición y los pesos personales solo se abren en lo personal. Así lo
 * personal nunca es la opción por defecto en grupo, comunidad, público ni
 * comercio.
 */
function capasDelPanel(contexto: ContextoVoz): CapasPrefs {
    return {
        comunidad: "condicionada",
        grupo: "condicionada",
        ...(contexto === "personal" ? { persona: "personal" as const } : {}),
    };
}

/** Aplica `motoresPermitidos` a un motor y devuelve si suena y por qué no. */
function evaluarMotor(
    motor: { id: string; claseLicencia: ClaseLicencia },
    contexto: ContextoVoz,
    condicionCumplida: boolean,
): { suena: boolean; motivo: string | null } {
    const resultado = motoresPermitidos(
        [{ id: motor.id, claseLicencia: motor.claseLicencia, condicionCumplida }],
        contexto,
        capasDelPanel(contexto),
    );
    return {
        suena: resultado.permitidos.length === 1,
        motivo: resultado.excluidos[0]?.motivo ?? null,
    };
}

/**
 * Por qué un motor de esta clase no suena en el contexto dado
 * (`null` si suena sin problema). Pura: nada de red, disco ni reloj.
 */
export function motivoLicencia(
    clase: ClaseLicencia,
    contexto: ContextoVoz,
    condicionCumplida: boolean,
): string | null {
    return evaluarMotor({ id: "motor", claseLicencia: clase }, contexto, condicionCumplida).motivo;
}

/** Ficha lista para la interfaz (pura). */
export function fichaLicencia(
    motor: MotorVozCatalogo,
    contexto: ContextoVoz,
    condicionCumplida = false,
    estadoStudio: EstadoVoicestudioNeurona = "sin-comprobar",
): FichaMotorLicencia {
    const { suena: suenaPorLicencia, motivo: motivoBase } = evaluarMotor(motor, contexto, condicionCumplida);
    let suena = suenaPorLicencia;
    let motivo = motivoBase;
    if (motor.id === "voicestudio" && estadoStudio === "no-detectado" && suena) {
        suena = false;
        motivo = "No responde en esta neurona ahora mismo: sin voz de estudio hasta que se detecte.";
    }
    return {
        id: motor.id,
        nombre: motor.nombre,
        clase: motor.claseLicencia,
        licenciaPesos: motor.licenciaPesos,
        etiqueta: ETIQUETA_CLASE[motor.claseLicencia],
        suena,
        motivo,
    };
}

export function textoEstadoVoicestudio(estado: EstadoVoicestudioNeurona): string {
    if (estado === "vivo") return "VoiceStudio está vivo en esta neurona: voz de estudio disponible.";
    if (estado === "no-detectado") return "VoiceStudio no responde en esta neurona.";
    return "VoiceStudio sin comprobar todavía en esta neurona.";
}

export function VozLicencias(props: {
    contexto?: ContextoVoz;
    condicionCumplida?: boolean;
    estadoVoicestudio?: EstadoVoicestudioNeurona;
}) {
    const { contexto = "personal", condicionCumplida = false, estadoVoicestudio = "sin-comprobar" } = props;
    const fichas = MOTORES_VOZ.map((m) => fichaLicencia(m, contexto, condicionCumplida, estadoVoicestudio));
    return (
        <section aria-label="Licencia de los motores de voz por contexto" className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-[11px] font-semibold text-white/80">Licencia de los motores · contexto</span>
                <span className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-1.5 py-px text-[9.5px] text-cyan-200">{contexto}</span>
                <span className="text-[10px] text-white/45">{textoEstadoVoicestudio(estadoVoicestudio)}</span>
            </div>
            <p className="mt-1 text-[10.5px] text-white/50">
                Un motor «Solo personal» nunca suena en grupo, comunidad, público ni comercio; los «Con condiciones» solo si consta su condición.
            </p>
            <div className="mt-2 space-y-1.5">
                {fichas.map((f) => (
                    <div key={f.id} className="flex flex-wrap items-baseline gap-2 text-[10.5px]">
                        <span className={cn("h-1.5 w-1.5 shrink-0 self-center rounded-full", f.suena ? "bg-emerald-400" : "bg-rose-400/70")} />
                        <span className="font-medium text-white/85">{f.nombre}</span>
                        <span className={cn("rounded-full border px-1.5 py-px text-[9px]", f.clase === "libre" ? "border-emerald-400/30 text-emerald-200" : f.clase === "condicionada" ? "border-amber-400/30 text-amber-200" : "border-rose-400/30 text-rose-200")}>
                            {f.etiqueta}
                        </span>
                        <span className="text-white/35">· {f.licenciaPesos}</span>
                        {f.motivo && <span className="basis-full pl-3.5 text-[10px] text-white/50">{f.motivo}</span>}
                    </div>
                ))}
            </div>
        </section>
    );
}
