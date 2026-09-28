"use client";

import { Check } from "lucide-react";
import { datosDeTipo, resultadosEncuesta } from "@/lib/vivo/programas/derivados";
import { K, type BloqueEncuesta } from "@/lib/vivo/programas/tipos";
import { estilos as s } from "../juegos/comun";
import { usePrograma } from "./contexto";
import { MarcoBloque } from "./marco-bloque";
import p from "./programas.module.css";

/** Encuesta en vivo: cada persona vota (y puede cambiar o retirar su voto); los resultados se ven al instante. */
export function BloqueEncuestaVista({ bloque }: { bloque: BloqueEncuesta }) {
    const { estado, yoUid, puedeParticipar, enviar } = usePrograma();
    const dat = datosDeTipo(estado.datos[bloque.id], "encuesta");
    const cerrada = dat?.cerrada ?? false;
    const r = resultadosEncuesta(bloque, dat?.votos ?? {}, yoUid);
    const multiple = bloque.maxElecciones > 1;
    const misVotos = r.opciones.filter((o) => o.mia).map((o) => o.id);

    const alPulsar = (id: string) => {
        if (!puedeParticipar || cerrada) return;
        let nuevo: string[];
        if (multiple) nuevo = misVotos.includes(id) ? misVotos.filter((x) => x !== id) : [...misVotos, id];
        else nuevo = misVotos.includes(id) ? [] : [id];
        enviar(K.votar, { b: bloque.id, o: nuevo });
    };

    const resumen = r.votantes === 0 ? "Nadie ha votado todavía" : `${r.votantes} ${r.votantes === 1 ? "persona ha votado" : "personas han votado"}`;

    return (
        <MarcoBloque
            bloque={bloque}
            titulo={bloque.titulo}
            subtitulo={resumen}
            cierre={{ cerrado: cerrada, cerrar: "Cerrar la votación", abrir: "Reabrir la votación", accion: K.encuestaCerrar }}
            etiquetas={cerrada ? <span className={p.pildoraColor}>Cerrada</span> : undefined}
        >
            {bloque.pregunta && <p className={p.parrafo} style={{ fontWeight: 600 }}>{bloque.pregunta}</p>}
            <ul className={p.opcionesVoto} role={multiple ? "group" : "radiogroup"} aria-label={bloque.pregunta || bloque.titulo}>
                {r.opciones.map((o) => {
                    const gana = cerrada && r.ganadoras.includes(o.id);
                    return (
                        <li key={o.id}>
                            <button
                                type="button"
                                role={multiple ? "checkbox" : "radio"}
                                aria-checked={o.mia}
                                aria-label={`${o.texto}: ${o.votos} ${o.votos === 1 ? "voto" : "votos"}, ${o.porcentaje} por ciento${o.mia ? ", tu voto" : ""}`}
                                className={`${p.opcionVoto} ${o.mia ? p.opcionVotoMia : ""} ${gana ? p.opcionVotoGana : ""}`}
                                disabled={!puedeParticipar || cerrada}
                                onClick={() => alPulsar(o.id)}
                            >
                                <span className={p.barraVoto} style={{ width: `${o.porcentaje}%` }} aria-hidden="true" />
                                <span className={`${p.opcionMarca} ${multiple ? p.opcionMarcaCuadrada : ""}`} aria-hidden="true">
                                    {o.mia && <Check size={14} strokeWidth={3} />}
                                </span>
                                <span className={p.opcionTexto}>{o.texto}</span>
                                <span className={p.opcionCifras} aria-hidden="true">
                                    <span className={p.opcionPorcentaje}>{o.porcentaje} %</span>
                                    <span className={p.etiquetaPequena}>
                                        {o.votos} {o.votos === 1 ? "voto" : "votos"}
                                    </span>
                                </span>
                            </button>
                        </li>
                    );
                })}
            </ul>
            <p className={s.nota}>
                {multiple ? `Puedes marcar hasta ${bloque.maxElecciones} opciones. ` : "Una opción por persona: vuelve a pulsarla para retirar tu voto o pulsa otra para cambiarlo. "}
                Los votos no son secretos: el grupo puede saber quién votó qué.
            </p>
            {!puedeParticipar && <p className={s.nota}>Puedes mirar los resultados, pero no votar.</p>}
        </MarcoBloque>
    );
}
