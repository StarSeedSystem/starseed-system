"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Gamepad2, Loader2, RefreshCw } from "lucide-react";
import { crearVivoJuego, listarMiosJuego } from "@/lib/vivo/juego";
import { JUEGOS_DISPONIBLES } from "@/lib/vivo/juegos/catalogo";
import type { Datos, IdJuego } from "@/lib/vivo/juegos/tipos";
import { Aviso, Boton, estilos as s } from "./comun";
import { SelectorJuego } from "./selector-juego";

type Sala = { refId: string; titulo: string; ruta: string };

/** Portada de los juegos en vivo: crear una sala, volver a las tuyas y saber cómo se juega con el chat. */
export function HubJuegos() {
    const router = useRouter();
    const [nombre, setNombre] = useState("");
    const [creando, setCreando] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [salas, setSalas] = useState<Sala[] | null>(null);
    const [errorLista, setErrorLista] = useState(false);

    const cargar = useCallback(async () => {
        setErrorLista(false);
        setSalas(null);
        try {
            setSalas(await listarMiosJuego());
        } catch {
            setErrorLista(true);
            setSalas([]);
        }
    }, []);

    useEffect(() => {
        void cargar();
    }, [cargar]);

    const crear = async (juego: IdJuego, opciones: Datos) => {
        setCreando(true);
        setError(null);
        try {
            const info = JUEGOS_DISPONIBLES.find((j) => j.id === juego);
            const titulo = nombre.trim() || `Sala de ${info?.nombre ?? "juegos"}`;
            const { ruta } = await crearVivoJuego(titulo, { juego, opciones });
            router.push(ruta);
        } catch (e) {
            setError(e instanceof Error ? e.message : "No se pudo crear la sala.");
            setCreando(false);
        }
    };

    return (
        <div className={s.sala}>
            <header className={`${s.vidrio} ${s.cabecera}`}>
                <span className={s.icono} style={{ background: "rgba(57,255,20,.14)", boxShadow: "inset 0 0 0 1px rgba(57,255,20,.45)", color: "#39FF14" }}>
                    <Gamepad2 size={24} aria-hidden="true" />
                </span>
                <div className={s.titulos}>
                    <h1 className={s.titulo}>Juegos en vivo</h1>
                    <span className={s.subtitulo}>Tres en raya, Conecta 4, ajedrez y Dibujo-adivina, con quien tú quieras y en tiempo real.</span>
                </div>
            </header>

            <div className={s.cuerpo}>
                <section className={`${s.vidrio} ${s.panel}`} style={{ padding: 20 }} aria-label="Nueva sala">
                    <h2 className={s.titulo}>Crear una sala</h2>
                    <div className={s.campo}>
                        <label className={s.rotulo} htmlFor="nombre-sala">
                            Nombre de la sala (opcional)
                        </label>
                        <input
                            id="nombre-sala"
                            className={s.entrada}
                            value={nombre}
                            onChange={(e) => setNombre(e.target.value)}
                            maxLength={60}
                            placeholder="Por ejemplo: Partida del viernes"
                            autoComplete="off"
                        />
                    </div>
                    <SelectorJuego etiquetaConfirmar="Crear sala y entrar" ocupado={creando} alConfirmar={crear} />
                    {error && <Aviso tipo="error" alCerrar={() => setError(null)}>{error}</Aviso>}
                </section>

                <aside className={s.lateral}>
                    <section className={`${s.vidrio} ${s.panel}`} aria-label="Tus salas">
                        <div className={s.panelTitulo}>
                            <span className={s.rotulo}>Tus salas</span>
                            <Boton redondo onClick={() => void cargar()} aria-label="Actualizar la lista de salas" style={{ width: 34, minHeight: 34 }}>
                                <RefreshCw size={15} aria-hidden="true" />
                            </Boton>
                        </div>
                        {salas === null && (
                            <p className={s.nota} role="status" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <Loader2 size={16} className="animate-spin" aria-hidden="true" /> Buscando tus salas…
                            </p>
                        )}
                        {errorLista && <Aviso>No se pudo leer tu lista. Comprueba tu conexión y actualiza.</Aviso>}
                        {salas !== null && salas.length === 0 && !errorLista && <p className={s.nota}>Aún no has creado ninguna sala.</p>}
                        {salas !== null && salas.length > 0 && (
                            <ul className={s.lista}>
                                {salas.map((sala) => (
                                    <li key={sala.refId}>
                                        <Link href={sala.ruta} className={s.listaItem}>
                                            <Gamepad2 size={18} aria-hidden="true" style={{ flexShrink: 0, color: "#39FF14" }} />
                                            <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere", fontWeight: 600 }}>{sala.titulo}</span>
                                            <ChevronRight size={16} aria-hidden="true" />
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>

                    <section className={`${s.vidrio} ${s.panel}`} aria-label="Cómo se juega">
                        <span className={s.rotulo}>Cómo se juega con tu chat</span>
                        <p className={s.nota}>
                            Crea la sala y compártela desde Mensajes como una app en vivo. Quien entra se sienta en un asiento libre y juega; el resto mira, y cada jugada se ve al instante.
                        </p>
                        <p className={s.nota}>
                            Cada dispositivo comprueba las jugadas con las mismas reglas: una jugada ilegal no se acepta en ningún sitio. Si recargas o entras tarde, la partida se reconstruye sola.
                        </p>
                        <p className={s.nota}>
                            Un enlace público solo deja mirar: para jugar hay que tener cuenta e invitación.
                        </p>
                    </section>
                </aside>
            </div>
        </div>
    );
}
