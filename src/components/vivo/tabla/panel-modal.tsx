"use client";
/** Diálogo de vidrio oscuro: centrado en escritorio y hoja inferior en móvil. */
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import css from "./tabla.module.css";

export function PanelModal({
    abierto,
    alCambiar,
    titulo,
    descripcion,
    lado = "centro",
    children,
}: {
    abierto: boolean;
    alCambiar: (abierto: boolean) => void;
    titulo: string;
    descripcion?: string;
    lado?: "centro" | "abajo";
    children: ReactNode;
}) {
    return (
        <Dialog.Root open={abierto} onOpenChange={alCambiar}>
            <Dialog.Portal>
                <Dialog.Overlay className={css.velo} />
                <Dialog.Content
                    className={`${css.modal} ${lado === "abajo" ? css.modalAbajo : css.modalCentro}`}
                    aria-describedby={descripcion ? undefined : undefined}
                >
                    <div className={css.modalCabeza}>
                        <div>
                            <Dialog.Title className={css.modalTitulo}>{titulo}</Dialog.Title>
                            {descripcion ? <Dialog.Description className={css.modalDescripcion}>{descripcion}</Dialog.Description> : null}
                        </div>
                        <Dialog.Close className={`${css.cerrar} ss-redondo`} aria-label="Cerrar">
                            <X size={18} aria-hidden="true" />
                        </Dialog.Close>
                    </div>
                    {children}
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
