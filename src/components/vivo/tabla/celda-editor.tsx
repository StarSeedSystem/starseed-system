"use client";
/**
 * Editor de UNA celda dentro de la rejilla: una entrada sobre la celda para texto, número, enlace
 * y fecha, y una ventanita con búsqueda para selección y persona. Enter confirma y baja, Tab
 * confirma y va a la derecha (Mayús+Tab a la izquierda), Esc cancela, salir de la celda confirma.
 */
import * as Popover from "@radix-ui/react-popover";
import { useEffect, useRef } from "react";
import { numeroParaEditar, type Columna, type Tabla, type ValorCelda } from "@/lib/vivo/tabla/modelo";
import { valorDe } from "./celda-vista";
import type { PerfilCorto } from "./personas";
import { SelectorOpcion, SelectorPersona } from "./selectores";
import css from "./tabla.module.css";

export type Mover = "abajo" | "arriba" | "derecha" | "izquierda" | "ninguno";

export type FinEdicion =
    | { tipo: "texto"; texto: string; mover: Mover }
    | { tipo: "valor"; valor: ValorCelda; mover: Mover }
    | { tipo: "cancelar" };

export function textoParaEditar(t: Tabla, col: Columna, filaId: string): string {
    const v = valorDe(t, filaId, col.id);
    if (v === null || v === undefined) return "";
    if (col.tipo.v === "numero" && typeof v === "number") return numeroParaEditar(v);
    return String(v);
}

export function EditorCelda({
    tabla,
    col,
    filaId,
    tecleado,
    candidatosPersonas,
    puedeCrearOpcion,
    crearOpcion,
    alTerminar,
}: {
    tabla: Tabla;
    col: Columna;
    filaId: string;
    /** Carácter con el que se empezó a escribir (sustituye el contenido); null si se abrió con Enter/F2/doble clic. */
    tecleado: string | null;
    candidatosPersonas: PerfilCorto[];
    puedeCrearOpcion: boolean;
    crearOpcion: (colId: string, nombre: string) => string | null;
    alTerminar: (fin: FinEdicion) => void;
}) {
    const tipo = col.tipo.v;
    if (tipo === "seleccion" || tipo === "persona") {
        const actual = valorDe(tabla, filaId, col.id);
        const actualTxt = typeof actual === "string" ? actual : null;
        return (
            <Popover.Root open onOpenChange={(o) => !o && alTerminar({ tipo: "cancelar" })}>
                <Popover.Anchor asChild>
                    <span style={{ position: "absolute", inset: 0, pointerEvents: "none" }} />
                </Popover.Anchor>
                <Popover.Portal>
                    <Popover.Content
                        className={css.flotante}
                        align="start"
                        sideOffset={4}
                        collisionPadding={12}
                        onCloseAutoFocus={(e) => e.preventDefault()}
                    >
                        {tipo === "seleccion" ? (
                            <SelectorOpcion
                                col={col}
                                valorActual={actualTxt}
                                puedeCrear={puedeCrearOpcion}
                                alElegir={(id) => alTerminar({ tipo: "valor", valor: id, mover: "ninguno" })}
                                alCrear={(nombre) => crearOpcion(col.id, nombre)}
                                alCerrar={() => alTerminar({ tipo: "cancelar" })}
                            />
                        ) : (
                            <SelectorPersona
                                candidatos={candidatosPersonas}
                                valorActual={actualTxt}
                                alElegir={(uid) => alTerminar({ tipo: "valor", valor: uid, mover: "ninguno" })}
                                alCerrar={() => alTerminar({ tipo: "cancelar" })}
                            />
                        )}
                    </Popover.Content>
                </Popover.Portal>
            </Popover.Root>
        );
    }
    return <EntradaCelda tabla={tabla} col={col} filaId={filaId} tecleado={tecleado} alTerminar={alTerminar} />;
}

function EntradaCelda({ tabla, col, filaId, tecleado, alTerminar }: {
    tabla: Tabla;
    col: Columna;
    filaId: string;
    tecleado: string | null;
    alTerminar: (fin: FinEdicion) => void;
}) {
    const ref = useRef<HTMLInputElement>(null);
    const terminado = useRef(false);
    const tipo = col.tipo.v;
    const inicial = tecleado !== null && tipo !== "fecha" ? tecleado : textoParaEditar(tabla, col, filaId);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        el.focus();
        if (tecleado !== null && tipo !== "fecha") {
            const fin = el.value.length;
            try {
                el.setSelectionRange(fin, fin);
            } catch {
                /* type=date no admite selección */
            }
        } else {
            try {
                el.select();
            } catch {
                /* nada */
            }
        }
        // solo al abrir
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const terminar = (mover: Mover) => {
        if (terminado.current) return;
        terminado.current = true;
        alTerminar({ tipo: "texto", texto: ref.current?.value ?? "", mover });
    };

    return (
        <input
            ref={ref}
            className={css.entradaCelda}
            data-tipo={tipo}
            type={tipo === "fecha" ? "date" : "text"}
            inputMode={tipo === "numero" ? "decimal" : undefined}
            defaultValue={inicial}
            maxLength={2000}
            aria-label={`Editar ${col.nombre.v}`}
            autoComplete="off"
            spellCheck={tipo === "texto"}
            onMouseDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return;
                if (e.key === "Enter") {
                    e.preventDefault();
                    e.stopPropagation();
                    terminar(e.shiftKey ? "arriba" : "abajo");
                } else if (e.key === "Tab") {
                    e.preventDefault();
                    e.stopPropagation();
                    terminar(e.shiftKey ? "izquierda" : "derecha");
                } else if (e.key === "Escape") {
                    e.preventDefault();
                    e.stopPropagation();
                    terminado.current = true;
                    alTerminar({ tipo: "cancelar" });
                } else {
                    e.stopPropagation(); // que las flechas y las letras no las tome la rejilla
                }
            }}
            onBlur={() => terminar("ninguno")}
        />
    );
}
