"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Brush, Eraser, RefreshCw, Send, SkipForward, Trash2, Trophy, Undo2 } from "lucide-react";
import { etiquetaAsiento } from "@/lib/vivo/juegos/asientos";
import {
    BONUS_TODOS,
    ESPERA_ELEGIR_MS,
    ESPERA_SALTAR_MS,
    compromisoDePalabra,
    type TableroDibujo,
} from "@/lib/vivo/juegos/dibujo";
import { sanearIntento, sanearVeredicto, veredictoDe, MAX_LARGO_INTENTO } from "@/lib/vivo/juegos/dibujo-mensajes";
import { GROSORES, INDICE_BORRADOR, PALETA, claveRonda } from "@/lib/vivo/juegos/dibujo-trazos";
import { normalizarPalabra, opcionesDePalabras } from "@/lib/vivo/juegos/palabras";
import { Aviso, Boton, estilos as s, useReloj } from "./comun";
import { LienzoDibujo } from "./lienzo-dibujo";
import { borrarSecreto, guardarSecreto, leerSecreto, salAzar, type SecretoDibujo } from "./secreto-dibujo";
import { useFotoGuardada, useLienzoDibujante, useLienzoRemoto } from "./usar-lienzo";
import type { PropsVista } from "./vista";

const PAUSA_REVELADA_MS = 7000;
const PAUSA_SIGUIENTE_MANUAL_MS = 2000;
const MAX_MENSAJES = 80;

interface Mensaje {
    id: string;
    tipo: "intento" | "acierto" | "cerca" | "sistema" | "pendiente";
    autor?: string;
    texto: string;
}

function formatoTiempo(ms: number): string {
    const seg = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, "0")}`;
}

function idCorto(): string {
    return Math.random().toString(36).slice(2, 10);
}

function Temporizador({ desde, hasta, ahora, etiqueta }: { desde: number; hasta: number; ahora: number; etiqueta: string }) {
    const total = Math.max(1, hasta - desde);
    const resto = Math.max(0, hasta - ahora);
    const pct = Math.max(0, Math.min(100, (resto / total) * 100));
    return (
        <div style={{ width: "100%", maxWidth: 860 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span className={s.rotulo}>{etiqueta}</span>
                <span role="timer" aria-live="off" style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                    {formatoTiempo(resto)}
                </span>
            </div>
            <div className={s.temporizador} aria-hidden="true">
                <div className={s.temporizadorRelleno} style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
}

export function VistaDibujo({ estado, inst, controlador, misAsientos, puedeActuar, enviar, panelMesa, resultado, sonidos }: PropsVista) {
    const t = estado.tablero as TableroDibujo;
    const registroId = inst.registro?.id ?? "";
    const rondaKey = claveRonda(registroId, t.ronda);
    const soyDibujante = t.dibujante !== null && misAsientos.includes(t.dibujante);
    const jugando = misAsientos.length > 0;
    const yoUid = inst.yo.uid ?? "";
    const yoNombre = inst.yo.nombre || "Yo";
    const nombreDe = useCallback((seat: number) => estado.asientos[seat]?.nombre || `Asiento ${seat + 1}`, [estado.asientos]);
    const dibujanteNombre = t.dibujante !== null ? nombreDe(t.dibujante) : "";
    const yaAcerte = t.aciertos.some((a) => misAsientos.includes(a.seat));
    const enPlazo = t.fase === "eligiendo" || t.fase === "dibujando" || t.fase === "revelada";
    const ahora = useReloj(enPlazo, 500);

    // ── Lienzo ──
    const foto = useFotoGuardada(inst.extras.lienzo);
    const remoto = useLienzoRemoto(controlador, rondaKey, foto);
    const dib = useLienzoDibujante(soyDibujante ? controlador : null, rondaKey, foto);
    const lienzo = soyDibujante ? dib.lienzo : remoto;
    const [color, setColor] = useState(0);
    const [grosor, setGrosor] = useState(1);
    const [lleno, setLleno] = useState(false);

    // ── Palabra secreta (solo quien dibuja) ──
    const [secreto, setSecreto] = useState<SecretoDibujo | null>(null);
    const [barajado, setBarajado] = useState(0);
    useEffect(() => {
        if (!soyDibujante) {
            setSecreto(null);
            return;
        }
        setSecreto(leerSecreto(registroId, t.ronda));
    }, [soyDibujante, registroId, t.ronda, t.commit]);
    const opciones = useMemo(
        () => (soyDibujante && t.fase === "eligiendo" ? opcionesDePalabras(Math.random, 3) : []),
        // `barajado` fuerza otras palabras; la ronda decide cuándo hacen falta
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [soyDibujante, t.fase, t.ronda, barajado],
    );

    const elegirPalabra = (palabra: string) => {
        const sal = salAzar();
        const nuevo: SecretoDibujo = { rid: registroId, ronda: t.ronda, palabra, sal };
        guardarSecreto(nuevo);
        setSecreto(nuevo);
        if (!enviar("elegir", { c: compromisoDePalabra(palabra, sal), l: normalizarPalabra(palabra).length })) {
            borrarSecreto();
            setSecreto(null);
        }
    };

    // ── Chat de intentos ──
    const [mensajes, setMensajes] = useState<Mensaje[]>([]);
    const [texto, setTexto] = useState("");
    const aciertosMostrados = useRef(0);
    const pendientes = useRef(new Map<string, ReturnType<typeof setTimeout>>());
    const estadoRef = useRef(estado);
    estadoRef.current = estado;
    const secretoRef = useRef(secreto);
    secretoRef.current = secreto;
    const tableroRef = useRef(t);
    tableroRef.current = t;

    const agregar = useCallback((m: Mensaje) => {
        setMensajes((prev) => [...prev.slice(-(MAX_MENSAJES - 1)), m]);
    }, []);

    useEffect(() => {
        setMensajes([]);
        aciertosMostrados.current = 0;
        for (const id of pendientes.current.values()) clearTimeout(id);
        pendientes.current.clear();
    }, [rondaKey]);
    useEffect(() => {
        const pend = pendientes.current;
        return () => {
            for (const id of pend.values()) clearTimeout(id);
            pend.clear();
        };
    }, []);

    // Los aciertos vienen del diario: el aviso es igual para todas.
    useEffect(() => {
        if (t.aciertos.length <= aciertosMostrados.current) return;
        const nuevos = t.aciertos.slice(aciertosMostrados.current);
        aciertosMostrados.current = t.aciertos.length;
        for (const a of nuevos) {
            agregar({ id: `a${a.seat}-${a.t}`, tipo: "acierto", texto: `${nombreDe(a.seat)} ha acertado (+${a.puntos})` });
            if (Date.now() - a.t < 8000) sonidos.tocar("acierto"); // no al cargar una partida ya empezada
        }
        if (hanAcertadoMios(nuevos, misAsientos)) setMensajes((prev) => prev.filter((m) => m.tipo !== "pendiente"));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [t.aciertos]);

    // Veredictos de quien dibuja (para quien adivina) y arbitraje (para quien dibuja).
    useEffect(() => {
        return controlador.alEfimero("veredicto", (carga) => {
            const v = sanearVeredicto(carga);
            if (!v) return;
            const pend = pendientes.current.get(v.i);
            if (pend) {
                clearTimeout(pend);
                pendientes.current.delete(v.i);
            }
            if (v.ok) {
                // El aviso de acierto llega por el diario; solo retiramos el «enviando».
                setMensajes((prev) => prev.filter((m) => m.id !== `p${v.i}`));
                return;
            }
            const autor = estadoRef.current.asientos.find((a) => a?.uid === v.u)?.nombre ?? "Alguien";
            setMensajes((prev) => {
                const sin = prev.filter((m) => m.id !== `p${v.i}`);
                return [...sin.slice(-(MAX_MENSAJES - 1)), { id: `v${v.i}`, tipo: v.cerca ? "cerca" : "intento", autor, texto: v.x ?? "" }];
            });
        });
    }, [controlador]);

    useEffect(() => {
        if (!soyDibujante || t.fase !== "dibujando") return;
        return controlador.alEfimero("intento", (carga) => {
            const it = sanearIntento(carga);
            const secretoActual = secretoRef.current;
            const tab = tableroRef.current;
            if (!it || !secretoActual || tab.fase !== "dibujando" || tab.dibujante === null) return;
            const est = estadoRef.current;
            const asiento = est.asientos.findIndex((a, i) => a?.uid === it.u && i !== tab.dibujante && tab.orden.includes(i));
            if (asiento < 0 || tab.aciertos.some((a) => a.seat === asiento)) return;
            const v = veredictoDe(it, secretoActual.palabra);
            if (v.ok) controlador.proponer("acierto", { s: asiento });
            controlador.enviarEfimero("veredicto", v);
            if (!v.ok) {
                const autor = est.asientos[asiento]?.nombre ?? "Alguien";
                agregar({ id: `v${it.i}`, tipo: v.cerca ? "cerca" : "intento", autor, texto: it.x });
            }
        });
    }, [controlador, soyDibujante, t.fase, agregar]);

    const puedoAdivinar = puedeActuar && jugando && !soyDibujante && t.fase === "dibujando" && !yaAcerte && yoUid !== "";
    const enviarIntento = (e: FormEvent) => {
        e.preventDefault();
        const limpio = texto.replace(/\s+/g, " ").trim().slice(0, MAX_LARGO_INTENTO);
        if (!limpio || !puedoAdivinar) return;
        const i = idCorto();
        setTexto("");
        agregar({ id: `p${i}`, tipo: "pendiente", autor: yoNombre, texto: limpio });
        controlador.enviarEfimero("intento", { i, u: yoUid, x: limpio });
        pendientes.current.set(
            i,
            setTimeout(() => {
                pendientes.current.delete(i);
                setMensajes((prev) => prev.map((m) => (m.id === `p${i}` ? { ...m, tipo: "sistema", texto: `«${limpio}»: sin respuesta de ${dibujanteNombre || "quien dibuja"}` } : m)));
            }, 12_000),
        );
    };

    // ── Árbitro: quien dibuja cierra su ronda y pasa a la siguiente ──
    const adivinadores = Math.max(0, t.orden.length - 1);
    useEffect(() => {
        if (!soyDibujante || t.fase !== "dibujando" || !secreto || t.hasta === null) return;
        const todos = adivinadores >= 1 && t.aciertos.length >= adivinadores;
        const espera = todos ? 1200 : Math.max(0, t.hasta - Date.now());
        const id = setTimeout(() => {
            dib.cerrar();
            enviar("revelar", { p: secreto.palabra, s: secreto.sal });
        }, espera);
        return () => clearTimeout(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [soyDibujante, t.fase, secreto, t.hasta, t.aciertos.length, adivinadores]);

    useEffect(() => {
        if (t.fase !== "revelada") return;
        if (soyDibujante) dib.cerrar();
        borrarSecretoSiEs(soyDibujante);
        if (!soyDibujante) return;
        const id = setTimeout(() => enviar("siguiente"), PAUSA_REVELADA_MS);
        return () => clearTimeout(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [t.fase, t.ronda, soyDibujante]);

    const puedeSaltar =
        puedeActuar &&
        jugando &&
        !soyDibujante &&
        ((t.fase === "eligiendo" && ahora >= t.desde + ESPERA_ELEGIR_MS) ||
            (t.fase === "dibujando" && t.hasta !== null && ahora >= t.hasta + ESPERA_SALTAR_MS));
    const puedeSiguienteManual = puedeActuar && jugando && t.fase === "revelada" && ahora >= t.desde + PAUSA_SIGUIENTE_MANUAL_MS;

    // ── Dibujo ──
    const empezarTrazo = (x: number, y: number) => {
        if (!dib.empezar(x, y, color, grosor)) setLleno(true);
        else setLleno(false);
    };

    // ── Piezas de la escena ──
    const sentados = estado.asientos.filter(Boolean).length;
    const pistaLetras = t.largo ?? 0;
    const puedeEmpezar = puedeActuar && jugando && sentados >= 2 && !estado.iniciada;
    const velo =
        t.fase === "eligiendo" && !soyDibujante ? (
            <div className={s.velo}>
                <Brush size={30} aria-hidden="true" />
                <strong>{dibujanteNombre} está eligiendo palabra…</strong>
            </div>
        ) : null;

    const clasificacion = t.orden
        .map((seat) => ({ seat, puntos: t.puntos[seat] ?? 0 }))
        .sort((a, b) => b.puntos - a.puntos || a.seat - b.seat);
    const totalGrupo = t.puntos.reduce((a, b) => a + b, 0);

    return (
        <>
            <section className={`${s.vidrio} ${s.escenario}`} aria-label="Dibujo-adivina">
                {resultado}

                {!estado.iniciada && (
                    <div className={s.resultado} style={{ maxWidth: 620 }}>
                        <Brush size={34} aria-hidden="true" />
                        <h2 className={s.resultadoTitulo}>Sala de espera</h2>
                        <p className={s.nota}>
                            {sentados < 2
                                ? "Hacen falta al menos dos personas sentadas para empezar."
                                : `Hay ${sentados} personas sentadas. Quien se siente ahora juega; después, solo se mira.`}
                        </p>
                        <p className={s.nota}>
                            Juego cooperativo: una persona dibuja y las demás adivinan; los puntos suman para todo el grupo. Cada persona dibuja {t.vueltas === 1 ? "una vez" : `${t.vueltas} veces`}, con {Math.round(t.duracionMs / 1000)} segundos por dibujo.
                        </p>
                        <Boton variante="primario" onClick={() => enviar("empezar")} disabled={!puedeEmpezar}>
                            Empezar la partida
                        </Boton>
                    </div>
                )}

                {estado.iniciada && t.fase !== "fin" && (
                    <>
                        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
                            <span className={s.rotulo}>
                                Ronda {t.ronda + 1} de {t.totalRondas}
                            </span>
                            <span className={s.pildora} style={{ background: `${etiquetaAsiento("dibujo", t.dibujante ?? 0).color}33`, boxShadow: `inset 0 0 0 1px ${etiquetaAsiento("dibujo", t.dibujante ?? 0).color}99` }}>
                                <Brush size={14} aria-hidden="true" />
                                {soyDibujante ? "Dibujas tú" : `Dibuja ${dibujanteNombre}`}
                            </span>
                        </div>

                        {t.fase === "eligiendo" && (
                            <Temporizador desde={t.desde} hasta={t.desde + ESPERA_ELEGIR_MS} ahora={ahora} etiqueta="Tiempo para elegir" />
                        )}
                        {t.fase === "dibujando" && t.hasta !== null && (
                            <Temporizador desde={t.hasta - t.duracionMs} hasta={t.hasta} ahora={ahora} etiqueta="Tiempo del dibujo" />
                        )}

                        {t.fase === "eligiendo" && soyDibujante && (
                            <div className={s.resultado} style={{ maxWidth: 720 }}>
                                <h2 className={s.resultadoTitulo}>Elige lo que vas a dibujar</h2>
                                <p className={s.nota}>Solo tú ves las palabras. Las demás personas verán cuántas letras tiene.</p>
                                <div className={s.opcionesPalabra}>
                                    {opciones.map((p) => (
                                        <button key={p} type="button" className={s.palabraOpcion} onClick={() => elegirPalabra(p)} disabled={!puedeActuar}>
                                            {p}
                                        </button>
                                    ))}
                                </div>
                                <Boton onClick={() => setBarajado((n) => n + 1)} icono={<RefreshCw size={16} aria-hidden="true" />}>
                                    Otras palabras
                                </Boton>
                            </div>
                        )}

                        {(t.fase === "dibujando" || t.fase === "revelada" || (t.fase === "eligiendo" && !soyDibujante)) && (
                            <>
                                {t.fase === "dibujando" && soyDibujante && (
                                    <div className={s.palabraSecreta} aria-live="polite">
                                        {secreto ? (
                                            <>
                                                <span className={s.rotulo} style={{ display: "block" }}>Dibuja</span>
                                                {secreto.palabra}
                                            </>
                                        ) : (
                                            <Aviso tipo="aviso">
                                                Esta palabra no está guardada en este dispositivo (¿recargaste desde otro?). Nadie podrá comprobarla: la ronda se anulará al acabar el tiempo.
                                            </Aviso>
                                        )}
                                    </div>
                                )}
                                {t.fase === "dibujando" && !soyDibujante && pistaLetras > 0 && (
                                    <div className={s.pista} role="img" aria-label={`La palabra tiene ${pistaLetras} letras`}>
                                        {Array.from({ length: pistaLetras }, (_, i) => (
                                            <span key={i} className={s.pistaLetra} />
                                        ))}
                                    </div>
                                )}
                                {t.fase === "revelada" && (
                                    <div className={`${s.resultado} ${t.anulada ? s.resultadoPierde : s.resultadoGana}`} role="status">
                                        {t.anulada ? (
                                            <>
                                                <h2 className={s.resultadoTitulo}>Ronda anulada</h2>
                                                <p className={s.nota}>No se pudo comprobar la palabra (tiempo agotado, o no coincidía con el compromiso). No suma ni resta puntos.</p>
                                            </>
                                        ) : (
                                            <>
                                                <span className={s.rotulo}>La palabra era</span>
                                                <h2 className={s.resultadoTitulo} style={{ fontSize: 28 }}>{t.palabra}</h2>
                                                <p className={s.nota}>
                                                    {t.aciertos.length === 0
                                                        ? "Nadie la adivinó esta vez."
                                                        : `${t.aciertos.length} de ${adivinadores} ${adivinadores === 1 ? "persona la adivinó" : "personas la adivinaron"}.`}
                                                    {adivinadores >= 2 && t.aciertos.length === adivinadores ? ` Bonus de grupo: +${BONUS_TODOS} para todas.` : ""}
                                                </p>
                                            </>
                                        )}
                                    </div>
                                )}

                                <LienzoDibujo
                                    lienzo={lienzo}
                                    editable={soyDibujante && t.fase === "dibujando" && puedeActuar}
                                    alEmpezar={empezarTrazo}
                                    alMover={dib.punto}
                                    alTerminar={dib.terminar}
                                    etiqueta={soyDibujante ? "Lienzo: dibuja aquí con el ratón o el dedo" : `Dibujo de ${dibujanteNombre}`}
                                >
                                    {velo}
                                </LienzoDibujo>

                                {soyDibujante && t.fase === "dibujando" && puedeActuar && (
                                    <div className={`${s.vidrio} ${s.herramientas}`} role="toolbar" aria-label="Herramientas de dibujo">
                                        <div className={s.paleta} role="radiogroup" aria-label="Color">
                                            {PALETA.map((c, i) => (
                                                <button
                                                    key={c.nombre}
                                                    type="button"
                                                    role="radio"
                                                    aria-checked={color === i}
                                                    aria-label={i === INDICE_BORRADOR ? "Borrador" : `Color ${c.nombre}`}
                                                    className={`${s.color} ss-redondo ${color === i ? s.colorSel : ""}`}
                                                    style={{ background: c.valor }}
                                                    onClick={() => setColor(i)}
                                                >
                                                    {i === INDICE_BORRADOR && <Eraser size={16} aria-hidden="true" color="#F8FAFC" />}
                                                </button>
                                            ))}
                                        </div>
                                        <div className={s.grosores} role="radiogroup" aria-label="Grosor del trazo">
                                            {GROSORES.map((g, i) => (
                                                <button
                                                    key={g.nombre}
                                                    type="button"
                                                    role="radio"
                                                    aria-checked={grosor === i}
                                                    aria-label={`Trazo ${g.nombre.toLowerCase()}`}
                                                    className={`${s.grosor} ss-redondo ${grosor === i ? s.grosorSel : ""}`}
                                                    onClick={() => setGrosor(i)}
                                                >
                                                    <span className={s.grosorPunto} style={{ width: 4 + i * 5, height: 4 + i * 5 }} />
                                                </button>
                                            ))}
                                        </div>
                                        <div className={s.filaBotones}>
                                            <Boton onClick={dib.deshacer} icono={<Undo2 size={16} aria-hidden="true" />}>
                                                Deshacer
                                            </Boton>
                                            <Boton onClick={dib.borrar} icono={<Trash2 size={16} aria-hidden="true" />}>
                                                Borrar todo
                                            </Boton>
                                        </div>
                                    </div>
                                )}
                                {lleno && soyDibujante && (
                                    <Aviso tipo="aviso" alCerrar={() => setLleno(false)}>
                                        El lienzo está lleno: borra algo o deshaz un trazo para seguir dibujando.
                                    </Aviso>
                                )}
                            </>
                        )}

                        {puedeSaltar && (
                            <Boton onClick={() => enviar("saltar")} icono={<SkipForward size={16} aria-hidden="true" />}>
                                {dibujanteNombre} no responde: saltar esta ronda
                            </Boton>
                        )}
                        {t.fase === "revelada" && (
                            <Boton variante="primario" onClick={() => enviar("siguiente")} disabled={!puedeSiguienteManual} icono={<SkipForward size={16} aria-hidden="true" />}>
                                {t.ronda + 1 >= t.totalRondas ? "Ver el resultado final" : "Siguiente ronda"}
                            </Boton>
                        )}
                    </>
                )}

                {t.fase === "fin" && (
                    <div className={s.resultado} style={{ maxWidth: 620 }}>
                        <Trophy size={34} aria-hidden="true" />
                        <h2 className={s.resultadoTitulo}>Fin de la partida</h2>
                        <p className={s.grande}>{totalGrupo} puntos</p>
                        <p className={s.nota}>Marcador del grupo: sumáis todas y todos.</p>
                        <ol className={s.marcador} style={{ width: "100%" }}>
                            {clasificacion.map((c, i) => (
                                <li key={c.seat} className={s.marcadorFila}>
                                    <span className={s.ficha} style={{ background: etiquetaAsiento("dibujo", c.seat).color }} />
                                    <span>
                                        {i + 1}. {nombreDe(c.seat)}
                                    </span>
                                    <span className={s.marcadorPuntos}>{c.puntos}</span>
                                </li>
                            ))}
                        </ol>
                    </div>
                )}
            </section>

            <aside className={s.lateral} aria-label="Marcador y chat">
                {panelMesa}

                {estado.iniciada && (
                    <section className={`${s.vidrio} ${s.panel}`} aria-label="Marcador">
                        <div className={s.marcadorGrupo}>
                            <span className={s.rotulo}>Marcador del grupo</span>
                            <span className={s.grande}>{totalGrupo}</span>
                        </div>
                        <ul className={s.marcador}>
                            {clasificacion.map((c) => (
                                <li key={c.seat} className={s.marcadorFila}>
                                    <span className={s.ficha} style={{ background: etiquetaAsiento("dibujo", c.seat).color }} />
                                    <span style={{ overflowWrap: "anywhere" }}>{nombreDe(c.seat)}</span>
                                    {t.dibujante === c.seat && t.fase !== "fin" && <Brush size={14} aria-label="dibuja" />}
                                    <span className={s.marcadorPuntos}>{c.puntos}</span>
                                </li>
                            ))}
                        </ul>
                    </section>
                )}

                {estado.iniciada && t.fase !== "fin" && (
                    <section className={`${s.vidrio} ${s.panel} ${s.chat}`} aria-label="Chat para adivinar">
                        <span className={s.rotulo}>Adivina aquí</span>
                        <ul className={s.mensajes} aria-live="polite" aria-label="Intentos">
                            {mensajes.length === 0 && <li className={`${s.mensaje} ${s.mensajeSistema}`}>Los intentos aparecerán aquí.</li>}
                            {mensajes.map((m) => (
                                <li
                                    key={m.id}
                                    className={`${s.mensaje} ${m.tipo === "acierto" ? s.mensajeAcierto : ""} ${m.tipo === "cerca" ? s.mensajeCerca : ""} ${m.tipo === "sistema" ? s.mensajeSistema : ""}`}
                                    style={m.tipo === "pendiente" ? { opacity: 0.6 } : undefined}
                                >
                                    {m.autor && m.tipo !== "acierto" && m.tipo !== "sistema" && <span className={s.mensajeAutor}>{m.autor}</span>}
                                    {m.texto}
                                    {m.tipo === "cerca" && <em> — ¡casi!</em>}
                                    {m.tipo === "pendiente" && <em> — enviando…</em>}
                                </li>
                            ))}
                        </ul>
                        <form className={s.formularioChat} onSubmit={enviarIntento}>
                            <input
                                className={s.entrada}
                                value={texto}
                                onChange={(e) => setTexto(e.target.value)}
                                maxLength={MAX_LARGO_INTENTO}
                                placeholder={
                                    soyDibujante
                                        ? "Tú dibujas: no puedes adivinar"
                                        : yaAcerte
                                          ? "¡Ya acertaste!"
                                          : puedoAdivinar
                                            ? "Escribe tu intento"
                                            : jugando
                                              ? "Espera a que empiece el dibujo"
                                              : "Estás mirando"
                                }
                                aria-label="Escribe tu intento"
                                disabled={!puedoAdivinar}
                                autoComplete="off"
                            />
                            <Boton variante="primario" type="submit" disabled={!puedoAdivinar || texto.trim() === ""} icono={<Send size={16} aria-hidden="true" />}>
                                Enviar
                            </Boton>
                        </form>
                    </section>
                )}

                <details className={`${s.vidrio} ${s.panel}`}>
                    <summary style={{ cursor: "pointer", fontWeight: 600 }}>Cómo funciona y sus límites</summary>
                    <p className={s.nota} style={{ marginTop: 8 }}>
                        Quien dibuja hace de árbitro de su ronda: elige la palabra, compara los intentos y avisa de los aciertos. Para que no pueda cambiarla a mitad, publica antes una huella (hash) de la palabra y al final la revela: cualquiera comprueba que coincide; si no, la ronda se anula.
                    </p>
                    <p className={s.nota}>
                        No es a prueba de trampas: los intentos viajan por el canal de la sala y alguien con conocimientos podría leerlos. Está pensado para jugar entre personas de confianza.
                    </p>
                </details>
            </aside>
        </>
    );
}

function hanAcertadoMios(nuevos: { seat: number }[], mios: number[]): boolean {
    return nuevos.some((a) => mios.includes(a.seat));
}

function borrarSecretoSiEs(soyDibujante: boolean): void {
    if (soyDibujante) borrarSecreto();
}
