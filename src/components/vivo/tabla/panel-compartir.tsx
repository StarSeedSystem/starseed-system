"use client";
/**
 * Compartir un espacio vivo (tabla o panel): invitar por @usuario con rol, quitar acceso y
 * abrir/cerrar el enlace de solo lectura. Solo la persona dueña puede cambiar esto; el resto ve
 * quién tiene acceso. Sirve igual para la tabla y para el dashboard compartido.
 */
import { Check, Copy, Globe, Lock, Trash2, UserPlus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
    inviteToSpaceByUsername,
    listSpaceEditors,
    removeSpaceEditor,
    updateSpaceMeta,
    type SpaceEditor,
    type SpaceEditorRole,
} from "@/lib/spaces/spaces";
import { PanelModal } from "./panel-modal";
import { AvatarPersona, usePerfiles } from "./personas";
import css from "./tabla.module.css";

export function PanelCompartir({
    abierto,
    alCambiar,
    espacioId,
    esDueno,
    duenoUid,
    acceso,
    rutaPublica,
    nota,
    alCambiarAcceso,
}: {
    abierto: boolean;
    alCambiar: (a: boolean) => void;
    espacioId: string;
    esDueno: boolean;
    duenoUid: string | null;
    /** Acceso actual del espacio (`public` = cualquiera con el enlace puede mirar). */
    acceso: string | null;
    /** Ruta relativa que se copia como enlace (por ejemplo `/tabla/<id>`). */
    rutaPublica: string;
    /** Frase honesta sobre cómo se combinan los cambios de este tipo de espacio. */
    nota: string;
    alCambiarAcceso?: (acceso: string) => void;
}) {
    const [editores, setEditores] = useState<SpaceEditor[] | null>(null);
    const [usuario, setUsuario] = useState("");
    const [rol, setRol] = useState<SpaceEditorRole>("editor");
    const [ocupado, setOcupado] = useState(false);
    const [mensaje, setMensaje] = useState<{ texto: string; error: boolean } | null>(null);
    const [copiado, setCopiado] = useState(false);
    const [quitando, setQuitando] = useState<string | null>(null);
    const [accesoLocal, setAccesoLocal] = useState<string | null>(acceso);
    useEffect(() => setAccesoLocal(acceso), [acceso]);

    const recargar = useCallback(async () => {
        setEditores(await listSpaceEditors(espacioId));
    }, [espacioId]);
    useEffect(() => {
        if (abierto) void recargar();
    }, [abierto, recargar]);

    const uids = [duenoUid, ...(editores ?? []).map((e) => e.account)].filter((u): u is string => !!u);
    const perfil = usePerfiles(uids);
    const publico = accesoLocal === "public";

    const invitar = async () => {
        const limpio = usuario.trim().replace(/^@/, "");
        if (!limpio || ocupado) return;
        setOcupado(true);
        setMensaje(null);
        const ok = await inviteToSpaceByUsername(espacioId, limpio, rol);
        setOcupado(false);
        if (ok) {
            setUsuario("");
            setMensaje({ texto: `Invitación enviada a @${limpio}. La verá al abrir el enlace o en su lista.`, error: false });
            void recargar();
        } else {
            setMensaje({ texto: `No encontramos a @${limpio}, o no se pudo invitar. Revisa el nombre de usuario.`, error: true });
        }
    };

    const quitar = async (cuenta: string) => {
        setOcupado(true);
        const ok = await removeSpaceEditor(espacioId, cuenta);
        setOcupado(false);
        setQuitando(null);
        setMensaje(ok ? { texto: "Acceso quitado.", error: false } : { texto: "No se pudo quitar el acceso.", error: true });
        if (ok) void recargar();
    };

    const alternarPublico = async () => {
        setOcupado(true);
        const nuevo = publico ? "invite" : "public";
        const ok = await updateSpaceMeta(espacioId, { access: nuevo });
        setOcupado(false);
        if (ok) {
            setAccesoLocal(nuevo);
            alCambiarAcceso?.(nuevo);
            setMensaje({ texto: nuevo === "public" ? "El enlace ya permite mirar, sin editar." : "El enlace ya solo funciona para quien invitaste.", error: false });
        } else setMensaje({ texto: "No se pudo cambiar el acceso.", error: true });
    };

    const copiar = async () => {
        const url = `${window.location.origin}${rutaPublica}`;
        try {
            await navigator.clipboard.writeText(url);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2_000);
        } catch {
            setMensaje({ texto: `Copia el enlace a mano: ${url}`, error: false });
        }
    };

    return (
        <PanelModal abierto={abierto} alCambiar={alCambiar} titulo="Compartir" descripcion={esDueno ? "Elige quién puede abrir esto y qué puede hacer." : "Estas son las personas con acceso."}>
            <div className={css.seccion}>
                <span className={css.rotulo}>Enlace</span>
                <div className={css.filaEditable}>
                    <button type="button" className={css.boton} onClick={copiar}>
                        {copiado ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
                        {copiado ? "Enlace copiado" : "Copiar el enlace"}
                    </button>
                </div>
                <p className={css.ayuda}>
                    {publico
                        ? "Cualquier persona con cuenta que tenga el enlace puede mirar, sin editar."
                        : "Solo entran quienes invites. El enlace por sí solo no da acceso."}
                </p>
                {esDueno ? (
                    <button type="button" role="switch" aria-checked={publico} className={css.boton} disabled={ocupado} onClick={alternarPublico}>
                        {publico ? <Globe size={16} aria-hidden="true" /> : <Lock size={16} aria-hidden="true" />}
                        {publico ? "Cualquiera con el enlace puede mirar" : "Solo quienes invite pueden abrirlo"}
                    </button>
                ) : null}
            </div>

            {esDueno ? (
                <div className={css.seccion}>
                    <span className={css.rotulo}>Invitar a alguien</span>
                    <div className={css.campo}>
                        <label htmlFor="invitar-usuario">Nombre de usuario</label>
                        <input
                            id="invitar-usuario"
                            className={css.entrada}
                            value={usuario}
                            placeholder="@usuario"
                            autoCapitalize="none"
                            autoComplete="off"
                            maxLength={60}
                            onChange={(e) => setUsuario(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") void invitar();
                            }}
                        />
                    </div>
                    <div className={css.fichas} role="radiogroup" aria-label="Qué puede hacer">
                        <button type="button" role="radio" aria-checked={rol === "editor"} className={`${css.boton} ${rol === "editor" ? css.botonPrimario : ""}`} onClick={() => setRol("editor")}>
                            Puede editar
                        </button>
                        <button type="button" role="radio" aria-checked={rol === "viewer"} className={`${css.boton} ${rol === "viewer" ? css.botonPrimario : ""}`} onClick={() => setRol("viewer")}>
                            Solo puede mirar
                        </button>
                    </div>
                    <button type="button" className={`${css.boton} ${css.botonPrimario}`} disabled={ocupado || !usuario.trim()} onClick={() => void invitar()}>
                        <UserPlus size={16} aria-hidden="true" /> Enviar la invitación
                    </button>
                </div>
            ) : null}

            {mensaje ? (
                <div className={`${css.aviso} ${mensaje.error ? css.avisoError : css.avisoInfo}`} role={mensaje.error ? "alert" : "status"}>
                    {mensaje.texto}
                </div>
            ) : null}

            <div className={css.seccion}>
                <span className={css.rotulo}>Con acceso</span>
                <ul className={css.listaOpciones} style={{ margin: 0, padding: 0, listStyle: "none" }}>
                    {duenoUid ? (
                        <li className={css.persona1}>
                            <AvatarPersona uid={duenoUid} nombre={perfil(duenoUid)?.nombre ?? "?"} avatar={perfil(duenoUid)?.avatar} chico />
                            <span>{perfil(duenoUid)?.nombre ?? "Dueño"}</span>
                            <span className={css.secundario}>Dueño</span>
                        </li>
                    ) : null}
                    {editores === null ? <li className={css.ayuda}>Cargando…</li> : null}
                    {editores?.length === 0 && !duenoUid ? <li className={css.ayuda}>Nadie más.</li> : null}
                    {editores?.map((e) => {
                        const p = perfil(e.account);
                        const etiqueta = `${e.role === "editor" ? "Edita" : "Mira"}${e.status === "member" ? "" : " · aún no aceptó"}`;
                        return (
                            <li key={e.account} className={css.persona1}>
                                <AvatarPersona uid={e.account} nombre={p?.nombre ?? "?"} avatar={p?.avatar} chico />
                                <span>{p ? `${p.nombre} (@${p.usuario})` : "Cuenta"}</span>
                                <span className={css.secundario}>{etiqueta}</span>
                                {esDueno ? (
                                    quitando === e.account ? (
                                        <button type="button" className={`${css.boton} ${css.botonChico} ${css.botonPeligro}`} disabled={ocupado} onClick={() => void quitar(e.account)}>
                                            Sí, quitar
                                        </button>
                                    ) : (
                                        <button type="button" className={`${css.boton} ${css.botonChico}`} aria-label={`Quitar el acceso de ${p?.nombre ?? "esta cuenta"}`} onClick={() => setQuitando(e.account)}>
                                            <Trash2 size={14} aria-hidden="true" /> Quitar
                                        </button>
                                    )
                                ) : null}
                            </li>
                        );
                    })}
                </ul>
            </div>

            <p className={css.ayuda}>{nota}</p>
        </PanelModal>
    );
}
