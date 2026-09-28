"use client";
/** Contenido de las ventanitas para elegir una opción o una persona (con búsqueda y teclado). */
import { Plus, X } from "lucide-react";
import { useMemo, useState, type KeyboardEvent } from "react";
import { normalizarNombre, opcionesOrdenadas, type Columna } from "@/lib/vivo/tabla/modelo";
import { AvatarPersona, useBusquedaPersonas, type PerfilCorto } from "./personas";
import css from "./tabla.module.css";

interface FilaSel {
    clave: string;
    nodo: React.ReactNode;
    alElegir: () => void;
}

function ListaSeleccionable({ filas, placeholder, etiqueta, texto, setTexto, alCerrar, extra }: {
    filas: FilaSel[];
    placeholder: string;
    etiqueta: string;
    texto: string;
    setTexto: (t: string) => void;
    alCerrar: () => void;
    extra?: React.ReactNode;
}) {
    const [activo, setActivo] = useState(0);
    const idx = Math.min(activo, Math.max(0, filas.length - 1));
    const teclas = (e: KeyboardEvent) => {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setActivo((idx + 1) % Math.max(1, filas.length));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActivo((idx - 1 + filas.length) % Math.max(1, filas.length));
        } else if (e.key === "Enter") {
            e.preventDefault();
            filas[idx]?.alElegir();
        } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            alCerrar();
        } else if (e.key === "Tab") {
            alCerrar();
        }
    };
    return (
        <>
            <input
                className={css.entrada}
                autoFocus
                value={texto}
                onChange={(e) => {
                    setTexto(e.target.value);
                    setActivo(0);
                }}
                onKeyDown={teclas}
                placeholder={placeholder}
                aria-label={etiqueta}
                role="combobox"
                aria-expanded="true"
                aria-controls="lista-selector"
                aria-activedescendant={filas[idx] ? `sel-${filas[idx].clave}` : undefined}
            />
            <div className={css.listaOpciones} role="listbox" id="lista-selector" aria-label={etiqueta}>
                {filas.map((f, i) => (
                    <button
                        key={f.clave}
                        id={`sel-${f.clave}`}
                        type="button"
                        role="option"
                        aria-selected={i === idx}
                        data-activo={i === idx}
                        className={css.filaOpcion}
                        onMouseEnter={() => setActivo(i)}
                        onClick={f.alElegir}
                    >
                        {f.nodo}
                    </button>
                ))}
                {!filas.length ? <span className={css.ayuda} style={{ padding: "8px 10px" }}>Sin coincidencias.</span> : null}
            </div>
            {extra}
        </>
    );
}

export function SelectorOpcion({ col, valorActual, puedeCrear, alElegir, alCrear, alCerrar }: {
    col: Columna;
    valorActual: string | null;
    puedeCrear: boolean;
    alElegir: (id: string | null) => void;
    alCrear: (nombre: string) => string | null;
    alCerrar: () => void;
}) {
    const [texto, setTexto] = useState("");
    const todas = opcionesOrdenadas(col);
    const q = normalizarNombre(texto);
    const filas = useMemo<FilaSel[]>(() => {
        const lista: FilaSel[] = todas
            .filter((o) => !q || normalizarNombre(o.nombre).includes(q))
            .map((o) => ({
                clave: o.id,
                nodo: (
                    <span className={css.opcion} style={{ ["--c" as string]: o.color }}>
                        {o.nombre}
                        {o.id === valorActual ? " · actual" : ""}
                    </span>
                ),
                alElegir: () => alElegir(o.id),
            }));
        const exacta = todas.some((o) => normalizarNombre(o.nombre) === q);
        if (puedeCrear && texto.trim() && !exacta) {
            lista.push({
                clave: "nueva",
                nodo: (
                    <>
                        <Plus size={16} aria-hidden="true" />
                        <span>Crear «{texto.trim()}»</span>
                    </>
                ),
                alElegir: () => {
                    const id = alCrear(texto.trim());
                    if (id) alElegir(id);
                },
            });
        }
        if (valorActual) {
            lista.push({
                clave: "vaciar",
                nodo: (
                    <>
                        <X size={16} aria-hidden="true" />
                        <span>Vaciar la celda</span>
                    </>
                ),
                alElegir: () => alElegir(null),
            });
        }
        return lista;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [col, q, texto, valorActual, puedeCrear]);
    return (
        <ListaSeleccionable
            filas={filas}
            placeholder={puedeCrear ? "Buscar o crear una opción…" : "Buscar una opción…"}
            etiqueta={`Opciones de ${col.nombre.v}`}
            texto={texto}
            setTexto={setTexto}
            alCerrar={alCerrar}
        />
    );
}

export function SelectorPersona({ candidatos, valorActual, alElegir, alCerrar }: {
    candidatos: PerfilCorto[];
    valorActual: string | null;
    alElegir: (uid: string | null) => void;
    alCerrar: () => void;
}) {
    const [texto, setTexto] = useState("");
    const { resultados, buscando } = useBusquedaPersonas(texto);
    const q = normalizarNombre(texto.replace(/^@/, ""));
    const filas = useMemo<FilaSel[]>(() => {
        const vistos = new Set<string>();
        const lista: FilaSel[] = [];
        const poner = (p: PerfilCorto) => {
            if (vistos.has(p.uid)) return;
            vistos.add(p.uid);
            lista.push({
                clave: p.uid,
                nodo: (
                    <>
                        <AvatarPersona uid={p.uid} nombre={p.nombre} avatar={p.avatar} chico />
                        <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                            <span className={css.texto}>{p.nombre}{p.uid === valorActual ? " · actual" : ""}</span>
                            <span className={css.secundario}>@{p.usuario}</span>
                        </span>
                    </>
                ),
                alElegir: () => alElegir(p.uid),
            });
        };
        for (const p of candidatos) if (!q || normalizarNombre(p.nombre).includes(q) || normalizarNombre(p.usuario).includes(q)) poner(p);
        for (const p of resultados) poner(p);
        if (valorActual) {
            lista.push({
                clave: "vaciar",
                nodo: (
                    <>
                        <X size={16} aria-hidden="true" />
                        <span>Quitar a la persona</span>
                    </>
                ),
                alElegir: () => alElegir(null),
            });
        }
        return lista;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [candidatos, resultados, q, valorActual]);
    return (
        <ListaSeleccionable
            filas={filas}
            placeholder="Nombre o @usuario…"
            etiqueta="Buscar una persona"
            texto={texto}
            setTexto={setTexto}
            alCerrar={alCerrar}
            extra={
                <span className={css.ayuda}>
                    {buscando ? "Buscando…" : "Aparecen quienes ya colaboran aquí; escribe para buscar a cualquier persona de StarSeed."}
                </span>
            }
        />
    );
}
