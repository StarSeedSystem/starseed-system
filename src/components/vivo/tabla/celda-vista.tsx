"use client";
/** Cómo se ve el valor de una celda según el tipo de su columna (solo lectura). */
import { Check } from "lucide-react";
import type { Calculadora } from "@/lib/vivo/tabla/formulas";
import { textoCalculado } from "@/lib/vivo/tabla/formulas";
import {
    claveCelda,
    enlaceSeguro,
    estaVacio,
    fechaLegible,
    formatearNumero,
    nombreDeOpcion,
    opcionesOrdenadas,
    type Columna,
    type Tabla,
    type ValorCelda,
} from "@/lib/vivo/tabla/modelo";
import { AvatarPersona, type PerfilCorto } from "./personas";
import css from "./tabla.module.css";

export interface PropsCeldaVista {
    tabla: Tabla;
    col: Columna;
    filaId: string;
    calc: Calculadora;
    perfil: (uid: string) => PerfilCorto | undefined;
    puedeEditar: boolean;
    /** Para la casilla: alterna el valor. */
    alAlternar?: () => void;
    /** En tarjetas y hojas el texto puede ocupar varias líneas. */
    multilinea?: boolean;
    /** Dentro de algo pulsable (una tarjeta): sin enlaces ni casillas pulsables, para no anidar controles. */
    dentroDeBoton?: boolean;
}

export function valorDe(t: Tabla, filaId: string, colId: string): ValorCelda {
    return t.celdas[claveCelda(filaId, colId)]?.v ?? null;
}

export function CeldaVista({ tabla, col, filaId, calc, perfil, puedeEditar, alAlternar, multilinea, dentroDeBoton }: PropsCeldaVista) {
    const tipo = col.tipo.v;
    if (tipo === "calculado") {
        const v = calc.calculada(filaId, col.id);
        if (!v) return <span className={css.celdaAviso}>Sin fórmula</span>;
        return <span className={v.ok ? css.texto : css.celdaError}>{textoCalculado(v)}</span>;
    }
    const v = valorDe(tabla, filaId, col.id);
    if (tipo === "casilla" && dentroDeBoton) {
        return (
            <span role="img" aria-label={`${col.nombre.v}: ${v === true ? "marcada" : "sin marcar"}`} className={`${css.celdaBoton} ss-redondo`} style={{ cursor: "inherit" }}>
                {v === true ? <Check size={15} strokeWidth={3} aria-hidden="true" /> : null}
            </span>
        );
    }
    if (tipo === "casilla") {
        return (
            <button
                type="button"
                role="checkbox"
                aria-checked={v === true}
                aria-label={`${col.nombre.v}: ${v === true ? "marcada" : "sin marcar"}`}
                className={`${css.celdaBoton} ss-redondo`}
                disabled={!puedeEditar}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                    e.stopPropagation();
                    alAlternar?.();
                }}
            >
                {v === true ? <Check size={15} strokeWidth={3} aria-hidden="true" /> : null}
            </button>
        );
    }
    if (estaVacio(v)) return tipo === "seleccion" || tipo === "persona" ? <span className={css.vacioSel} /> : null;
    if (tipo === "numero") return <span className={css.texto}>{typeof v === "number" ? formatearNumero(v) : String(v)}</span>;
    if (tipo === "fecha") return <span className={css.texto}>{typeof v === "string" ? fechaLegible(v) : String(v)}</span>;
    if (tipo === "seleccion") {
        const o = opcionesOrdenadas(col).find((x) => x.id === v);
        if (!o) return <span className={css.vacioSel}>{nombreDeOpcion(col, v) ?? ""}</span>;
        return (
            <span className={css.opcion} style={{ ["--c" as string]: o.color }}>
                {o.nombre}
            </span>
        );
    }
    if (tipo === "persona") {
        const uid = String(v);
        const p = perfil(uid);
        return (
            <span className={css.persona}>
                <AvatarPersona uid={uid} nombre={p?.nombre ?? "?"} avatar={p?.avatar} chico />
                <span className={css.texto}>{p?.nombre ?? "Persona"}</span>
            </span>
        );
    }
    const texto = String(v);
    if (tipo === "enlace") {
        const href = dentroDeBoton ? null : enlaceSeguro(texto);
        // Solo se pinta un enlace pulsable si la dirección es http(s) o mailto; lo demás es texto plano.
        if (href) {
            return (
                <a
                    className={css.enlace}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                >
                    {texto}
                </a>
            );
        }
    }
    return <span className={`${css.texto} ${multilinea ? css.textoMultilinea : ""}`}>{texto}</span>;
}
