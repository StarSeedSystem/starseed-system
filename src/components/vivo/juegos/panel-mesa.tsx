"use client";

import { LogOut, Monitor, UserPlus, Users } from "lucide-react";
import { etiquetaAsiento } from "@/lib/vivo/juegos/asientos";
import type { EstadoMesa } from "@/lib/vivo/juegos/mesa";
import { juegoDe } from "@/lib/vivo/juegos/mesa";
import type { Datos, Presente } from "@/lib/vivo/juegos/tipos";
import { Boton, estilos as s } from "./comun";

export interface PropsPanelMesa {
    estado: EstadoMesa;
    presentes: Presente[];
    yoUid: string | null;
    yoNombre: string;
    puedeActuar: boolean;
    enviar: (k: string, d?: Datos) => boolean;
}

/** Quién juega dónde, quién mira, y cómo sentarse o levantarse. */
export function PanelMesa({ estado, presentes, yoUid, yoNombre, puedeActuar, enviar }: PropsPanelMesa) {
    const juego = juegoDe(estado.juego);
    const max = juego?.jugadores.max ?? 2;
    const dosLados = max === 2 && !!juego?.autoInicio;
    const mios = estado.asientos.flatMap((a, i) => (a && a.uid === yoUid ? [i] : []));
    const libres = estado.asientos.filter((a) => a === null).length;
    const puedoSentarme = puedeActuar && !estado.iniciada && !estado.fin && mios.length === 0 && libres > 0;
    const sentadosUid = new Set(estado.asientos.filter(Boolean).map((a) => a!.uid));
    const mirando = presentes.filter((p) => !sentadosUid.has(p.uid));
    const nombre = yoNombre || "Jugador";

    // En los juegos de muchas personas se enseñan los asientos ocupados y un solo hueco.
    const indices = dosLados ? estado.asientos.map((_, i) => i) : estado.asientos.flatMap((a, i) => (a ? [i] : []));
    const soloVacios = indices.length === 0;

    const sentarDoble = () => {
        if (enviar("sentar", { lado: 0, nombre, doble: true })) enviar("sentar", { lado: 1, nombre, doble: true });
    };

    return (
        <section className={`${s.vidrio} ${s.panel}`} aria-label="La mesa">
            <div className={s.panelTitulo}>
                <span className={s.rotulo}>La mesa</span>
                <span className={s.nota}>
                    {estado.asientos.filter(Boolean).length} de {max}
                </span>
            </div>

            {soloVacios && <p className={s.nota}>Nadie se ha sentado todavía.</p>}
            <ul className={s.asientos}>
                {indices.map((i) => {
                    const a = estado.asientos[i];
                    const et = etiquetaAsiento(estado.juego, i);
                    const esMio = !!a && a.uid === yoUid;
                    const activo = estado.turno === i && estado.iniciada && !estado.fin;
                    const ganador = estado.fin?.ganador === i;
                    return (
                        <li key={i} className={`${s.asiento} ${activo ? s.asientoActivo : ""} ${ganador ? s.asientoGanador : ""}`}>
                            <span
                                className={s.ficha}
                                style={{ background: et.color, boxShadow: et.color === "#1A1740" ? "inset 0 0 0 1px rgba(255,255,255,.55)" : undefined, width: 20, height: 20 }}
                                aria-hidden="true"
                            />
                            <span className={s.asientoNombre}>
                                <span className={s.asientoQuien}>{a ? a.nombre : "Libre"}{esMio ? " (tú)" : ""}</span>
                                <span className={s.asientoRol}>
                                    {dosLados ? et.nombre : `Asiento ${i + 1}`}
                                    {activo ? " · le toca" : ""}
                                    {ganador ? " · ganador" : ""}
                                </span>
                            </span>
                            <span className={s.asientoBotones}>
                                {!a && puedeActuar && !estado.iniciada && !estado.fin && mios.length === 0 && (
                                    <Boton onClick={() => enviar("sentar", { lado: i, nombre })} icono={<UserPlus size={16} aria-hidden="true" />} aria-label={`Sentarme con ${et.nombre}`}>
                                        Sentarme
                                    </Boton>
                                )}
                                {esMio && puedeActuar && !estado.iniciada && !estado.fin && (
                                    <Boton onClick={() => enviar("levantar", { lado: i })} icono={<LogOut size={16} aria-hidden="true" />} aria-label="Levantarme de la mesa">
                                        Levantarme
                                    </Boton>
                                )}
                            </span>
                        </li>
                    );
                })}
            </ul>

            {!dosLados && puedoSentarme && (
                <Boton variante="primario" onClick={() => enviar("sentar", { nombre })} icono={<UserPlus size={16} aria-hidden="true" />}>
                    Sentarme a jugar
                </Boton>
            )}

            {dosLados && puedeActuar && !estado.iniciada && !estado.fin && mios.length === 0 && libres === 2 && (
                <Boton onClick={sentarDoble} icono={<Monitor size={16} aria-hidden="true" />}>
                    Jugar los dos lados aquí
                </Boton>
            )}

            {!puedeActuar && <p className={s.nota}>Solo puedes mirar esta sala.</p>}
            {mios.length === 0 && puedeActuar && estado.iniciada && !estado.fin && (
                <p className={s.nota}>La partida ya empezó: estás mirando. En la siguiente podrás sentarte.</p>
            )}

            {mirando.length > 0 && (
                <div>
                    <span className={s.rotulo} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <Users size={13} aria-hidden="true" /> Mirando
                    </span>
                    <p className={s.nota} style={{ marginTop: 4, overflowWrap: "anywhere" }}>
                        {mirando.map((p) => p.nombre || "Persona").join(", ")}
                    </p>
                </div>
            )}
        </section>
    );
}
