"use client";

import { useId, useState, type FormEvent } from "react";
import { Check, Send, Trash2 } from "lucide-react";
import { datosDeTipo, plazasLibres, respuestaDe, validarRespuesta } from "@/lib/vivo/programas/derivados";
import { K, type BloqueFormulario, type CampoFormulario, type Respuesta } from "@/lib/vivo/programas/tipos";
import { Aviso, Avatar, Boton, estilos as s } from "../juegos/comun";
import { usePrograma } from "./contexto";
import { MarcoBloque } from "./marco-bloque";
import p from "./programas.module.css";

type Borrador = Record<string, string | boolean>;

function borradorDe(b: BloqueFormulario, r: Respuesta | null): Borrador {
    const out: Borrador = {};
    for (const c of b.campos) {
        const v = r?.v[c.id];
        out[c.id] = c.tipo === "casilla" ? v === true : v === undefined ? "" : String(v);
    }
    return out;
}

function valorLegible(c: CampoFormulario, v: string | number | boolean | undefined): string {
    if (v === undefined) return "—";
    if (c.tipo === "casilla") return v === true ? "Sí" : "No";
    return String(v);
}

function CampoVista({ campo, valor, error, deshabilitado, alCambiar }: {
    campo: CampoFormulario;
    valor: string | boolean;
    error: string | null;
    deshabilitado: boolean;
    alCambiar: (v: string | boolean) => void;
}) {
    const base = useId();
    const id = `${base}-${campo.id}`;
    const rotulo = `${campo.etiqueta}${campo.obligatorio ? " *" : ""}`;
    const aviso = error ? <p className={p.errorCampo} id={`${id}-error`} role="alert">{error}</p> : null;
    if (campo.tipo === "casilla") {
        return (
            <div className={s.campo}>
                <label className={p.campoCasilla} htmlFor={id}>
                    <input id={id} type="checkbox" checked={valor === true} disabled={deshabilitado} onChange={(e) => alCambiar(e.target.checked)} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} />
                    <span>{rotulo}</span>
                </label>
                {aviso}
            </div>
        );
    }
    return (
        <div className={s.campo}>
            <label className={s.rotulo} htmlFor={id}>{rotulo}</label>
            {campo.tipo === "largo" ? (
                <textarea id={id} className={`${s.entrada} ${p.area}`} value={String(valor)} disabled={deshabilitado} maxLength={1000} onChange={(e) => alCambiar(e.target.value)} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} />
            ) : campo.tipo === "opcion" ? (
                <select id={id} className={`${s.entrada} ${p.selector}`} value={String(valor)} disabled={deshabilitado} onChange={(e) => alCambiar(e.target.value)} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined}>
                    <option value="">Elige una opción</option>
                    {(campo.opciones ?? []).map((o) => (
                        <option key={o} value={o}>{o}</option>
                    ))}
                </select>
            ) : (
                <input id={id} className={s.entrada} type="text" inputMode={campo.tipo === "numero" ? "decimal" : undefined} value={String(valor)} disabled={deshabilitado} maxLength={200} onChange={(e) => alCambiar(e.target.value)} autoComplete="off" aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} />
            )}
            {aviso}
        </div>
    );
}

function Formulario({ bloque, mia, sinPlazas, cerrado }: { bloque: BloqueFormulario; mia: Respuesta | null; sinPlazas: boolean; cerrado: boolean }) {
    const { puedeParticipar, yoNombre, enviar } = usePrograma();
    const [borrador, setBorrador] = useState<Borrador>(() => borradorDe(bloque, mia));
    const [error, setError] = useState<{ campo?: string; motivo: string } | null>(null);
    const bloqueado = !puedeParticipar || cerrado || (sinPlazas && !mia);

    const enviarForm = (e: FormEvent) => {
        e.preventDefault();
        const v = validarRespuesta(bloque, borrador);
        if (!v.ok) {
            setError({ campo: v.campo, motivo: v.motivo });
            return;
        }
        setError(null);
        enviar(K.respuesta, { b: bloque.id, nom: yoNombre, v: v.v });
    };

    return (
        <form className={p.formulario} onSubmit={enviarForm} noValidate aria-label={`Formulario «${bloque.titulo}»`}>
            {bloque.campos.map((c) => (
                <CampoVista
                    key={c.id}
                    campo={c}
                    valor={borrador[c.id] ?? (c.tipo === "casilla" ? false : "")}
                    error={error?.campo === c.id ? error.motivo : null}
                    deshabilitado={bloqueado}
                    alCambiar={(v) => {
                        setBorrador((b) => ({ ...b, [c.id]: v }));
                        if (error?.campo === c.id) setError(null);
                    }}
                />
            ))}
            {error && !error.campo && <p className={p.errorCampo} role="alert">{error.motivo}</p>}
            {!bloqueado && (
                <div className={s.filaBotones}>
                    <Boton type="submit" variante="primario" icono={mia ? <Check size={16} aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}>
                        {mia ? "Guardar cambios" : "Apuntarme"}
                    </Boton>
                    {mia && (
                        <Boton variante="peligro" icono={<Trash2 size={16} aria-hidden="true" />} onClick={() => enviar(K.respuestaQuitar, { b: bloque.id })}>
                            Retirar mi respuesta
                        </Boton>
                    )}
                </div>
            )}
        </form>
    );
}

/** Formulario compartido con cupo: se ve quién se ha apuntado y cuántas plazas quedan. */
export function BloqueFormularioVista({ bloque }: { bloque: BloqueFormulario }) {
    const { estado, yoUid, puedeParticipar, puedeEstructura, enviar } = usePrograma();
    const dat = datosDeTipo(estado.datos[bloque.id], "formulario");
    const respuestas = dat?.respuestas ?? [];
    const cerrado = dat?.cerrado ?? false;
    const libres = plazasLibres(bloque, respuestas);
    const mia = respuestaDe(respuestas, yoUid);
    const sinPlazas = libres === 0;

    const subtitulo =
        libres === null
            ? `${respuestas.length} ${respuestas.length === 1 ? "respuesta" : "respuestas"}`
            : `${respuestas.length} de ${bloque.cupo} plazas ocupadas`;

    return (
        <MarcoBloque
            bloque={bloque}
            titulo={bloque.titulo}
            subtitulo={subtitulo}
            cierre={{ cerrado, cerrar: "Cerrar el formulario", abrir: "Reabrir el formulario", accion: K.formularioCerrar }}
            etiquetas={
                cerrado ? <span className={p.pildoraColor}>Cerrado</span> : sinPlazas ? <span className={p.pildoraColor}>Sin plazas</span> : libres !== null ? <span className={p.pildoraColor}>{libres} {libres === 1 ? "plaza libre" : "plazas libres"}</span> : undefined
            }
        >
            {bloque.descripcion && <p className={p.parrafo}>{bloque.descripcion}</p>}
            {mia && <Aviso tipo="info">{bloque.confirmacion}</Aviso>}
            {cerrado && !mia && <Aviso>El formulario está cerrado: ya no admite respuestas.</Aviso>}
            {sinPlazas && !mia && !cerrado && <Aviso>Ya no quedan plazas.</Aviso>}
            <Formulario key={mia ? `mia-${mia.t}` : "nueva"} bloque={bloque} mia={mia} sinPlazas={sinPlazas} cerrado={cerrado} />
            {!puedeParticipar && <p className={s.nota}>Puedes mirar las respuestas, pero no apuntarte.</p>}

            <div className={p.galeriaEtiqueta}>
                <span className={s.rotulo}>Respuestas del grupo</span>
            </div>
            {respuestas.length === 0 ? (
                <p className={p.vacio}>Todavía no se ha apuntado nadie.</p>
            ) : (
                <ul className={p.respuestas} aria-label="Respuestas del grupo">
                    {respuestas.map((r) => (
                        <li key={r.uid} className={`${p.respuesta} ${r.uid === yoUid ? p.respuestaMia : ""}`}>
                            <div className={p.respuestaCabecera}>
                                <Avatar uid={r.uid} nombre={r.nombre || "Persona"} tamano={28} />
                                <strong style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>
                                    {r.nombre || "Persona"}
                                    {r.uid === yoUid ? " (tú)" : ""}
                                </strong>
                                {puedeEstructura && puedeParticipar && r.uid !== yoUid && (
                                    <Boton redondo className={p.pequenoRedondo} onClick={() => enviar(K.respuestaQuitar, { b: bloque.id, uid: r.uid })} aria-label={`Quitar la respuesta de ${r.nombre || "esta persona"}`} title="Quitar esta respuesta">
                                        <Trash2 size={14} aria-hidden="true" />
                                    </Boton>
                                )}
                            </div>
                            <dl className={p.respuestaDatos}>
                                {bloque.campos.map((c) => (
                                    <div key={c.id} style={{ display: "contents" }}>
                                        <dt>{c.etiqueta}</dt>
                                        <dd>{valorLegible(c, r.v[c.id])}</dd>
                                    </div>
                                ))}
                            </dl>
                        </li>
                    ))}
                </ul>
            )}
            <p className={s.nota}>Las respuestas las ve todo el grupo: no pongas datos privados.</p>
        </MarcoBloque>
    );
}
