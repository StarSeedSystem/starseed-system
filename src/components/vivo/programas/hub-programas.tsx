"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppWindow, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import { crearVivoPrograma, listarMiosPrograma } from "@/lib/vivo/programa";
import { plantillaPorId, type IdPlantilla } from "@/lib/vivo/programas/plantillas";
import { Aviso, Boton, estilos as s } from "../juegos/comun";
import { GaleriaPlantillas } from "./galeria-plantillas";

type Programa = { refId: string; titulo: string; ruta: string };

/** Portada de los programas en vivo: crear uno desde una plantilla, volver a los tuyos y saber sus límites. */
export function HubProgramas() {
    const router = useRouter();
    const [nombre, setNombre] = useState("");
    const [creando, setCreando] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [programas, setProgramas] = useState<Programa[] | null>(null);
    const [errorLista, setErrorLista] = useState(false);

    const cargar = useCallback(async () => {
        setErrorLista(false);
        setProgramas(null);
        try {
            setProgramas(await listarMiosPrograma());
        } catch {
            setErrorLista(true);
            setProgramas([]);
        }
    }, []);

    useEffect(() => {
        void cargar();
    }, [cargar]);

    const crear = async (plantilla: IdPlantilla) => {
        setCreando(true);
        setError(null);
        try {
            const titulo = nombre.trim() || plantillaPorId(plantilla)?.titulo || "Programa";
            const { ruta } = await crearVivoPrograma(titulo, { plantilla });
            router.push(ruta);
        } catch (e) {
            setError(e instanceof Error ? e.message : "No se pudo crear el programa.");
            setCreando(false);
        }
    };

    return (
        <div className={s.sala}>
            <header className={`${s.vidrio} ${s.cabecera}`}>
                <span className={s.icono} style={{ background: "rgba(236,72,153,.14)", boxShadow: "inset 0 0 0 1px rgba(236,72,153,.45)", color: "#EC4899" }}>
                    <AppWindow size={24} aria-hidden="true" />
                </span>
                <div className={s.titulos}>
                    <h1 className={s.titulo}>Programas en vivo</h1>
                    <span className={s.subtitulo}>Encuestas, listas, tableros, contadores y formularios que todo el grupo usa a la vez.</span>
                </div>
            </header>

            <div className={s.cuerpo}>
                <section className={`${s.vidrio} ${s.panel}`} style={{ padding: 20 }} aria-label="Nuevo programa">
                    <h2 className={s.titulo}>Crear un programa</h2>
                    <div className={s.campo}>
                        <label className={s.rotulo} htmlFor="nombre-programa">
                            Nombre del programa (opcional)
                        </label>
                        <input
                            id="nombre-programa"
                            className={s.entrada}
                            value={nombre}
                            onChange={(e) => setNombre(e.target.value)}
                            maxLength={80}
                            placeholder="Por ejemplo: Cena de fin de curso"
                            autoComplete="off"
                        />
                    </div>
                    <GaleriaPlantillas etiquetaConfirmar="Crear programa y entrar" ocupado={creando} alConfirmar={crear} />
                    {error && (
                        <Aviso tipo="error" alCerrar={() => setError(null)}>
                            {error}
                        </Aviso>
                    )}
                </section>

                <aside className={s.lateral}>
                    <section className={`${s.vidrio} ${s.panel}`} aria-label="Tus programas">
                        <div className={s.panelTitulo}>
                            <span className={s.rotulo}>Tus programas</span>
                            <Boton redondo onClick={() => void cargar()} aria-label="Actualizar la lista de programas" style={{ width: 34, minHeight: 34 }}>
                                <RefreshCw size={15} aria-hidden="true" />
                            </Boton>
                        </div>
                        {programas === null && (
                            <p className={s.nota} role="status" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <Loader2 size={16} className="animate-spin" aria-hidden="true" /> Buscando tus programas…
                            </p>
                        )}
                        {errorLista && <Aviso>No se pudo leer tu lista. Comprueba tu conexión y actualiza.</Aviso>}
                        {programas !== null && programas.length === 0 && !errorLista && <p className={s.nota}>Aún no has creado ningún programa.</p>}
                        {programas !== null && programas.length > 0 && (
                            <ul className={s.lista}>
                                {programas.map((pr) => (
                                    <li key={pr.refId}>
                                        <Link href={pr.ruta} className={s.listaItem}>
                                            <AppWindow size={18} aria-hidden="true" style={{ flexShrink: 0, color: "#EC4899" }} />
                                            <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere", fontWeight: 600 }}>{pr.titulo}</span>
                                            <ChevronRight size={16} aria-hidden="true" />
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>

                    <section className={`${s.vidrio} ${s.panel}`} aria-label="Qué es un programa">
                        <span className={s.rotulo}>Qué es (y qué no es)</span>
                        <p className={s.nota}>
                            Un programa es una mini-app hecha con bloques ya preparados: texto, lista de tareas, contador, encuesta, tablero kanban y formulario. Todos ven los cambios al instante.
                        </p>
                        <p className={s.nota}>
                            No ejecuta código de nadie: no puedes escribir programas con instrucciones propias. Es un catálogo cerrado de bloques, elegido a propósito para que compartir un programa nunca ponga en riesgo tu dispositivo.
                        </p>
                        <p className={s.nota}>
                            Los votos y las respuestas los ve todo el grupo. Un enlace público solo deja mirar; para participar hay que tener cuenta e invitación.
                        </p>
                    </section>
                </aside>
            </div>
        </div>
    );
}
