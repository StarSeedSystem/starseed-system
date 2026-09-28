"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Gamepad2, Loader2, RefreshCw, Volume2, VolumeX } from "lucide-react";
import { infoJuego } from "@/lib/vivo/juegos/catalogo";
import type { TableroAjedrez as EstadoTableroAjedrez } from "@/lib/vivo/juegos/ajedrez-juego";
import { baseDePartida, buscarMotorMesa, juegoDe, type EstadoMesa } from "@/lib/vivo/juegos/mesa";
import { useSalaViva } from "@/lib/vivo/juegos/usar-sala-viva";
import { esIdJuego, type Asiento, type Datos, type IdJuego } from "@/lib/vivo/juegos/tipos";
import { Aviso, Boton, IndicadorConexion, PresenciaSala, estilos as s } from "./comun";
import { BannerResultado } from "./indicadores";
import { VistaDibujo } from "./escenario-dibujo";
import { PanelMesa } from "./panel-mesa";
import { SelectorJuego } from "./selector-juego";
import { useSonidos } from "./usar-sonidos";
import { VistaAjedrez, VistaC4, VistaTres } from "./vistas-mesa";

export interface PropsSalaJuegos {
    spaceId: string;
}

function semillaNueva(): number {
    return Math.floor(Date.now() % 2 ** 31);
}

/** Una sala de juegos: vestíbulo (elegir juego) o la partida en curso, en vivo. */
export function SalaJuegos({ spaceId }: PropsSalaJuegos) {
    const { controlador, instantanea: inst, reintentar } = useSalaViva(spaceId, "juego", buscarMotorMesa);
    const { sonidos, activo: sonidoActivo, alternar } = useSonidos();
    const [avisoLocal, setAvisoLocal] = useState<string | null>(null);
    const [cambiando, setCambiando] = useState(false);
    const [confirmarCambio, setConfirmarCambio] = useState<{ juego: IdJuego; opciones: Datos } | null>(null);

    const registro = inst.registro;
    const estado = (registro && inst.estado ? (inst.estado as EstadoMesa) : null) as EstadoMesa | null;
    const yoUid = inst.yo.uid;
    const puedeActuar = !inst.soloLectura && !!yoUid;
    const misAsientos = estado ? estado.asientos.flatMap((a, i) => (a && a.uid === yoUid ? [i] : [])) : [];

    // El aviso local se retira solo.
    useEffect(() => {
        if (!avisoLocal) return;
        const id = setTimeout(() => setAvisoLocal(null), 5000);
        return () => clearTimeout(id);
    }, [avisoLocal]);

    const enviar = useCallback(
        (k: string, d?: Datos): boolean => {
            if (!controlador) return false;
            const r = controlador.proponer(k, d);
            if (!r.ok) {
                setAvisoLocal(r.motivo);
                return false;
            }
            return true;
        },
        [controlador],
    );

    const rendirse = useCallback(() => {
        enviar("rendirse");
    }, [enviar]);

    // ── Sonidos ──
    const previo = useRef<{ rid: string; n: number } | null>(null);
    const fin = estado?.fin ?? null;
    const n = estado?.n ?? -1;
    const rid = registro?.id ?? "";
    useEffect(() => {
        if (!estado || !registro) {
            previo.current = null;
            return;
        }
        const p = previo.current;
        previo.current = { rid, n };
        if (!p || p.rid !== rid || n !== p.n + 1) return;
        const ultima = registro.log[registro.log.length - 1];
        if (!ultima) return;
        if (fin) {
            if (fin.ganador === null) sonidos.tocar("tablas");
            else if (misAsientos.includes(fin.ganador)) sonidos.tocar("victoria");
            else if (misAsientos.length > 0) sonidos.tocar("derrota");
            else sonidos.tocar("tablas");
            return;
        }
        if (ultima.k === "jugar") {
            if (estado.juego === "ajedrez") {
                const san = (estado.tablero as EstadoTableroAjedrez).san.at(-1) ?? "";
                sonidos.tocar(san.includes("+") ? "jaque" : san.includes("x") ? "captura" : "ficha");
            } else if (estado.juego !== "dibujo") {
                sonidos.tocar("ficha");
            }
        }
        // solo cuando llega una entrada nueva
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [n, rid]);

    // ── Acciones de la sala ──
    const empezarJuego = (juego: IdJuego, opciones: Datos) => {
        if (!controlador) return;
        const r = controlador.nuevoRegistro(juego, baseDePartida(juego, yoUid ?? "", semillaNueva(), opciones));
        if (!r.ok) setAvisoLocal(r.motivo);
        setCambiando(false);
        setConfirmarCambio(null);
    };

    const alElegirOtroJuego = (juego: IdJuego, opciones: Datos) => {
        if (estado && estado.iniciada && !estado.fin) setConfirmarCambio({ juego, opciones });
        else empezarJuego(juego, opciones);
    };

    const revancha = () => {
        if (!controlador || !estado || !registro) return;
        const anteriores = estado.asientos;
        let sentados: (Asiento | null)[] = anteriores;
        if (anteriores.length === 2) sentados = [anteriores[1], anteriores[0]];
        const opciones = (registro.base.opciones && typeof registro.base.opciones === "object" && !Array.isArray(registro.base.opciones) ? registro.base.opciones : {}) as Datos;
        const r = controlador.nuevoRegistro(estado.juego, baseDePartida(estado.juego, estado.creador, semillaNueva(), opciones, sentados));
        if (!r.ok) setAvisoLocal(r.motivo);
    };

    // ── Cabecera ──
    const juegoInfo = estado ? infoJuego(estado.juego) : null;
    const titulo = inst.titulo || "Sala de juegos";
    const cabecera = (
        <header className={`${s.vidrio} ${s.cabecera}`}>
            <Link href="/juego" className={s.volver} aria-label="Volver a los juegos">
                <ArrowLeft size={20} aria-hidden="true" />
            </Link>
            <div className={s.titulos}>
                <h1 className={s.titulo}>{titulo}</h1>
                <span className={s.subtitulo}>{juegoInfo ? juegoInfo.nombre : "Elige a qué jugar"}</span>
            </div>
            <div className={s.acciones}>
                <PresenciaSala presentes={inst.presentes} />
                {inst.fase === "listo" && <IndicadorConexion conexion={inst.conexion} />}
                {inst.pendientes > 0 && (
                    <span className={`${s.pildora} ${s.reconectando}`} role="status">
                        Guardando…
                    </span>
                )}
                <Boton
                    redondo
                    onClick={alternar}
                    aria-pressed={sonidoActivo}
                    aria-label={sonidoActivo ? "Silenciar los sonidos" : "Activar los sonidos"}
                    title={sonidoActivo ? "Sonidos activados" : "Sonidos silenciados"}
                >
                    {sonidoActivo ? <Volume2 size={18} aria-hidden="true" /> : <VolumeX size={18} aria-hidden="true" />}
                </Boton>
                {puedeActuar && registro && (
                    <Boton onClick={() => setCambiando((v) => !v)} aria-expanded={cambiando} icono={<Gamepad2 size={16} aria-hidden="true" />}>
                        Cambiar de juego
                    </Boton>
                )}
            </div>
        </header>
    );

    const avisos = (
        <>
            {inst.fase === "listo" && inst.soloLectura && (
                <Aviso tipo="info">
                    {yoUid
                        ? "Tienes permiso solo para mirar esta sala: puedes ver la partida pero no jugar."
                        : "Inicia sesión para jugar. Sin cuenta puedes mirar, pero no jugar."}
                </Aviso>
            )}
            {inst.aviso && <Aviso alCerrar={() => controlador?.descartarAviso()}>{inst.aviso}</Aviso>}
            {avisoLocal && <Aviso alCerrar={() => setAvisoLocal(null)}>{avisoLocal}</Aviso>}
        </>
    );

    // ── Estados de carga y error ──
    if (inst.fase === "cargando") {
        return (
            <div className={s.sala}>
                {cabecera}
                <div className={`${s.vidrio} ${s.panel}`} role="status" style={{ alignItems: "center", padding: 32 }}>
                    <Loader2 size={28} className="animate-spin" aria-hidden="true" />
                    <span>Abriendo la sala…</span>
                </div>
            </div>
        );
    }
    if (inst.fase === "error") {
        return (
            <div className={s.sala}>
                {cabecera}
                <Aviso tipo="error">{inst.error ?? "No se pudo abrir la sala."}</Aviso>
                <div>
                    <Boton onClick={reintentar} icono={<RefreshCw size={16} aria-hidden="true" />}>
                        Reintentar
                    </Boton>
                </div>
            </div>
        );
    }

    // ── Vestíbulo: aún no se ha elegido juego ──
    if (!registro || !estado || !controlador) {
        return (
            <div className={s.sala}>
                {cabecera}
                {avisos}
                <section className={`${s.vidrio} ${s.panel}`} style={{ padding: 20 }} aria-label="Elegir juego">
                    <h2 className={s.titulo}>¿A qué jugáis?</h2>
                    {puedeActuar ? (
                        <SelectorJuego etiquetaConfirmar="Empezar con este juego" alConfirmar={empezarJuego} />
                    ) : (
                        <p className={s.nota}>Aún no se ha elegido juego. Quien tenga permiso de edición puede hacerlo desde aquí.</p>
                    )}
                </section>
            </div>
        );
    }

    if (!esIdJuego(registro.tipo) || !juegoDe(registro.tipo)) {
        return (
            <div className={s.sala}>
                {cabecera}
                <Aviso tipo="error">Esta sala tiene un juego que esta versión del sistema no conoce. Actualiza la aplicación.</Aviso>
            </div>
        );
    }

    // ── Partida ──
    const propiedades = {
        estado,
        inst,
        controlador,
        misAsientos,
        puedeActuar,
        enviar,
        rendirse,
        sonidos,
        panelMesa: (
            <PanelMesa estado={estado} presentes={inst.presentes} yoUid={yoUid} yoNombre={inst.yo.nombre} puedeActuar={puedeActuar} enviar={enviar} />
        ),
        resultado: <BannerResultado estado={estado} misAsientos={misAsientos} puedeActuar={puedeActuar} alRevancha={revancha} />,
    };

    return (
        <div className={s.sala}>
            {cabecera}
            {avisos}

            {cambiando && (
                <section className={`${s.vidrio} ${s.panel}`} style={{ padding: 18 }} aria-label="Cambiar de juego">
                    <h2 className={s.titulo}>Cambiar de juego</h2>
                    {confirmarCambio ? (
                        <div className={s.confirmar} role="alertdialog" aria-label="Confirmar el cambio de juego">
                            <strong>Hay una partida en curso. Si cambias, se abandona.</strong>
                            <div className={s.filaBotones}>
                                <Boton variante="peligro" onClick={() => empezarJuego(confirmarCambio.juego, confirmarCambio.opciones)}>
                                    Sí, cambiar de juego
                                </Boton>
                                <Boton onClick={() => setConfirmarCambio(null)}>Seguir con esta partida</Boton>
                            </div>
                        </div>
                    ) : (
                        <SelectorJuego etiquetaConfirmar="Empezar con este juego" alConfirmar={alElegirOtroJuego} />
                    )}
                </section>
            )}

            <div className={s.cuerpo}>
                {estado.juego === "tres-en-raya" && <VistaTres {...propiedades} />}
                {estado.juego === "conecta-4" && <VistaC4 {...propiedades} />}
                {estado.juego === "ajedrez" && <VistaAjedrez {...propiedades} />}
                {estado.juego === "dibujo" && <VistaDibujo {...propiedades} />}
            </div>

            {inst.historial.length > 0 && (
                <section className={`${s.vidrio} ${s.panel}`} aria-label="Partidas anteriores">
                    <span className={s.rotulo}>Partidas anteriores</span>
                    <ul className={s.historial}>
                        {[...inst.historial].reverse().map((h) => (
                            <li key={h.id} className={s.historialItem}>
                                <span style={{ overflowWrap: "anywhere" }}>
                                    {infoJuego(h.juego)?.nombre ?? h.juego}: {h.nombres.filter(Boolean).join(" · ") || "sin nombres"}
                                </span>
                                <span className={s.nota}>
                                    {h.ganador === null ? h.motivo : `Ganó ${h.nombres[h.ganador] || `el asiento ${h.ganador + 1}`}`}
                                    {h.puntos && h.puntos.length > 0 ? ` · ${h.puntos.reduce((a, b) => a + b, 0)} pts` : ""}
                                </span>
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </div>
    );
}
