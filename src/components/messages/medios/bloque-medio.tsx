"use client";

/**
 * Medio de transmisión — ajustes por chat y generales (MSJ1107A · 2026-11-07).
 *
 *  · «Automático» (recomendado): cada mensaje sale por el camino que haya, de la malla sin
 *    internet a cualquier internet disponible.
 *  · «Solo métodos elegidos»: qué medios, en qué orden y qué hacer si ninguno está disponible
 *    (esperar y reintentar, o avisar).
 *
 * `BloqueMedioTransmision` va en los ajustes de cada chat, grupo, correo o neurona (con «usar los
 * ajustes generales»); `PreferenciasMedioForm` lo reusa la sección general de Ajustes de Mensajería.
 */

import { ArrowDown, ArrowUp, Check, Route } from "lucide-react";
import { cn } from "@/lib/utils";
import { ACENTO, pildoraFantasma } from "@/components/messages/marco/estilos";
import { FilaAjuste, Interruptor, RotuloSeccion, Segmentado, Tarjeta } from "@/components/messages/info/piezas";
import { ICONOS_MEDIO } from "@/components/messages/medios/iconos-medio";
import { mediosAdmitidos, NO_ADMITIDOS, ORDEN_AUTO, resumenPreferencias } from "@/lib/mensajeria/medios/medios";
import { usePreferenciasMedio } from "@/lib/mensajeria/medios/preferencias-store";
import {
    INFO_MEDIOS, MEDIOS_TRANSMISION, type MedioTransmision, type ModoMedio, type PreferenciasMedio, type SiNingunMedio, type TipoChatMedio,
} from "@/lib/mensajeria/medios/tipos";

export type AmbitoMedio = TipoChatMedio | "global";

/** Medios que se pueden elegir en ese ámbito (en los generales, todos). */
export function mediosDeAmbito(ambito: AmbitoMedio): MedioTransmision[] {
    return ambito === "global" ? [...ORDEN_AUTO.neurona, "correo"] : mediosAdmitidos(ambito);
}

const OPCIONES_MODO: { id: ModoMedio; etiqueta: string; titulo: string }[] = [
    { id: "auto", etiqueta: "Automático (recomendado)", titulo: "Por la malla o cualquier internet disponible" },
    { id: "elegidos", etiqueta: "Solo métodos elegidos", titulo: "Tú eliges qué medios y en qué orden" },
];

const OPCIONES_SI_NINGUNO: { id: SiNingunMedio; etiqueta: string; titulo: string }[] = [
    { id: "esperar", etiqueta: "Esperar y reintentar", titulo: "Se guarda aquí y sale solo en cuanto haya un medio" },
    { id: "avisar", etiqueta: "Avisarme", titulo: "No se envía y te lo digo" },
];

const DESCRIPCION_AUTO: Record<AmbitoMedio, string> = {
    global: "Cada mensaje sale por el camino que haya: la malla sin internet, tu red local o cualquier internet disponible.",
    neurona: "Primero lo más directo (enlace sin internet, tu red local), luego internet y el canal de tu cuenta en el servidor.",
    dm: "Por el servidor StarSeed, que guarda el historial compartido; si no hay internet, por la malla si alcanza a la otra persona.",
    grupo: "Por el servidor StarSeed, que guarda el historial del grupo; si no hay internet, por la malla a quien alcance.",
    correo: "Por el buzón @star.seed del servidor StarSeed.",
};

/** Lista seleccionable y ordenable de medios. */
export function ListaMedios({
    ambito,
    preferencias,
    onCambiar,
}: {
    ambito: AmbitoMedio;
    preferencias: PreferenciasMedio;
    onCambiar: (p: PreferenciasMedio) => void;
}) {
    const disponibles = mediosDeAmbito(ambito);
    const elegidos = preferencias.elegidos.filter((m) => disponibles.includes(m));
    const resto = disponibles.filter((m) => !elegidos.includes(m));
    const noAdmitidos = ambito === "global" ? [] : MEDIOS_TRANSMISION.filter((m) => !disponibles.includes(m));

    const alternar = (m: MedioTransmision) => {
        const esta = elegidos.includes(m);
        if (esta && elegidos.length <= 1) return; // al menos uno
        onCambiar({ ...preferencias, elegidos: esta ? preferencias.elegidos.filter((x) => x !== m) : [...preferencias.elegidos, m] });
    };
    const mover = (m: MedioTransmision, delta: -1 | 1) => {
        const lista = [...elegidos];
        const i = lista.indexOf(m);
        const j = i + delta;
        if (i < 0 || j < 0 || j >= lista.length) return;
        [lista[i], lista[j]] = [lista[j], lista[i]];
        onCambiar({ ...preferencias, elegidos: [...lista, ...preferencias.elegidos.filter((x) => !disponibles.includes(x))] });
    };

    const fila = (m: MedioTransmision, activo: boolean, posicion?: number) => {
        const info = INFO_MEDIOS[m];
        const Icono = ICONOS_MEDIO[m];
        const color = info.familia === "malla" ? ACENTO.esmeralda : ACENTO.aurora;
        const ultimo = activo && elegidos.length <= 1;
        return (
            <li key={m} className="flex items-start gap-2.5 rounded-2xl px-2.5 py-2" style={pildoraFantasma(color, activo)}>
                <button
                    type="button"
                    role="checkbox"
                    aria-checked={activo}
                    aria-disabled={ultimo}
                    onClick={() => alternar(m)}
                    title={ultimo ? "Deja al menos un medio elegido" : activo ? "Quitar de los elegidos" : "Añadir a los elegidos"}
                    aria-label={`${info.nombre}${activo ? " (elegido)" : ""}`}
                    className={cn(
                        "ss-redondo mt-0.5 grid h-5 w-5 shrink-0 cursor-pointer place-items-center rounded-md transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7C5CFF]",
                        activo ? "text-white" : "text-transparent",
                        ultimo && "cursor-not-allowed",
                    )}
                    style={{ background: activo ? color : "rgba(255,255,255,.06)", boxShadow: `inset 0 0 0 1px ${activo ? color : "rgba(255,255,255,.2)"}` }}
                >
                    <Check className="h-3.5 w-3.5" />
                </button>
                <span className="mt-0.5 shrink-0" style={{ color }}>
                    <Icono className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-1.5 text-[13.5px] font-medium text-white/90">
                        {typeof posicion === "number" && <span className="text-[11px] font-bold text-white/50">{posicion}.</span>}
                        {info.nombre}
                        <span className="rounded-full px-1.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color, background: `${color}1a` }}>
                            {info.familia === "malla" ? "Malla" : "Internet"}
                        </span>
                    </span>
                    <span className="mt-0.5 block text-[12px] leading-snug text-white/55">{info.descripcion}</span>
                </span>
                {activo && elegidos.length > 1 && (
                    <span className="flex shrink-0 flex-col gap-0.5">
                        <button
                            type="button"
                            onClick={() => mover(m, -1)}
                            disabled={posicion === 1}
                            aria-label={`Subir ${info.nombre}`}
                            className="ss-redondo grid h-6 w-6 cursor-pointer place-items-center rounded-full text-white/65 hover:bg-white/10 hover:text-white disabled:cursor-default disabled:opacity-30"
                        >
                            <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                            type="button"
                            onClick={() => mover(m, 1)}
                            disabled={posicion === elegidos.length}
                            aria-label={`Bajar ${info.nombre}`}
                            className="ss-redondo grid h-6 w-6 cursor-pointer place-items-center rounded-full text-white/65 hover:bg-white/10 hover:text-white disabled:cursor-default disabled:opacity-30"
                        >
                            <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                    </span>
                )}
            </li>
        );
    };

    return (
        <div className="space-y-2">
            <p className="px-1 text-[12px] text-white/55">Se prueban en este orden; el primero que llegue se queda con el mensaje.</p>
            <ul className="space-y-1.5" aria-label="Medios elegidos, en orden">
                {elegidos.map((m, i) => fila(m, true, i + 1))}
            </ul>
            {resto.length > 0 && (
                <>
                    <p className="px-1 pt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45">Sin elegir</p>
                    <ul className="space-y-1.5" aria-label="Medios sin elegir">
                        {resto.map((m) => fila(m, false))}
                    </ul>
                </>
            )}
            {noAdmitidos.length > 0 && ambito !== "global" && (
                <p className="px-1 pt-1 text-[11.5px] leading-relaxed text-white/45">
                    No disponibles aquí: {noAdmitidos.map((m) => INFO_MEDIOS[m].corto).join(", ")}. {NO_ADMITIDOS[ambito]}
                </p>
            )}
        </div>
    );
}

/** Modo, lista y «si ningún medio está disponible» (sin la tarjeta). */
export function PreferenciasMedioForm({
    ambito,
    preferencias,
    onCambiar,
}: {
    ambito: AmbitoMedio;
    preferencias: PreferenciasMedio;
    onCambiar: (p: PreferenciasMedio) => void;
}) {
    const disponibles = mediosDeAmbito(ambito);
    const cambiarModo = (modo: ModoMedio) => {
        if (modo === "auto") {
            onCambiar({ ...preferencias, modo });
            return;
        }
        const yaElegidos = preferencias.elegidos.filter((m) => disponibles.includes(m));
        onCambiar({ ...preferencias, modo, elegidos: yaElegidos.length ? preferencias.elegidos : [...disponibles] });
    };
    return (
        <div className="space-y-3">
            <Segmentado etiqueta="Medio de transmisión" opciones={OPCIONES_MODO} valor={preferencias.modo} onCambiar={cambiarModo} color={ACENTO.esmeralda} />
            {preferencias.modo === "auto" ? (
                <p className="px-1 text-[12.5px] leading-relaxed text-white/60">{DESCRIPCION_AUTO[ambito]}</p>
            ) : (
                <ListaMedios ambito={ambito} preferencias={preferencias} onCambiar={onCambiar} />
            )}
            <div className="space-y-1.5 pt-1">
                <p className="px-1 text-[13px] font-medium text-white/85">Si ningún medio está disponible</p>
                <Segmentado
                    etiqueta="Si ningún medio está disponible"
                    opciones={OPCIONES_SI_NINGUNO}
                    valor={preferencias.siNinguno}
                    onCambiar={(v) => onCambiar({ ...preferencias, siNinguno: v })}
                    color={ACENTO.ambar}
                />
                <p className="px-1 text-[12px] text-white/50">
                    {preferencias.siNinguno === "esperar"
                        ? "Se queda en este aparato y sale solo en cuanto vuelva un medio (o al pulsar «Reintentar»)."
                        : "No se envía: te avisamos para que decidas."}
                </p>
            </div>
        </div>
    );
}

/** Bloque «Medio de transmisión» para los ajustes de UN chat, grupo, correo o neurona. */
export function BloqueMedioTransmision({ tipo, clave }: { tipo: TipoChatMedio; clave: string }) {
    const api = usePreferenciasMedio(clave);
    const hereda = !api.propias;
    const idHereda = `medio-hereda-${clave.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
    return (
        <Tarjeta id="ajustes-medio">
            <RotuloSeccion className="mb-1">Medio de transmisión</RotuloSeccion>
            <FilaAjuste
                icono={<Route className="h-4 w-4" />}
                titulo="Usar los ajustes generales"
                descripcion={`Ahora: ${resumenPreferencias(api.global, tipo)} · si no hay medio, ${api.global.siNinguno === "esperar" ? "espera y reintenta" : "avisa"}`}
                htmlFor={idHereda}
            >
                <Interruptor
                    id={idHereda}
                    etiqueta="Usar los ajustes generales"
                    activo={hereda}
                    onCambiar={(v) => api.cambiarChat(v ? null : { ...api.global, elegidos: [...api.global.elegidos] })}
                />
            </FilaAjuste>
            {!hereda && api.propias && (
                <div className="pt-1">
                    <PreferenciasMedioForm ambito={tipo} preferencias={api.propias} onCambiar={(p) => api.cambiarChat(p)} />
                </div>
            )}
        </Tarjeta>
    );
}

export default BloqueMedioTransmision;
