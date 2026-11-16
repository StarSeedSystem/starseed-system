import React, { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";

export type EleccionDiseno = "auto" | "minima" | "ligera" | "alta" | "estudio";

interface Props {
  valor: EleccionDiseno;
  onCambiar: (e: EleccionDiseno) => void;
  degradado: boolean;
}

export function SelectorDisenoAstraura({ valor, onCambiar, degradado }: Props) {
  const [abierto, setAbierto] = useState(false);

  return (
    <Dialog.Root open={abierto} onOpenChange={setAbierto}>
      <Dialog.Trigger asChild>
        <button aria-label="Cambiar diseño" className="cursor-pointer size-11 flex items-center justify-center">
          {/* Icono lucide aquí */}
          Diseño
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Content className="role-dialog">
          <div role="radiogroup" aria-label="Selección de diseño">
            {["auto", "minima", "ligera", "alta", "estudio"].map((d) => (
              <button key={d} onClick={() => { onCambiar(d as EleccionDiseno); setAbierto(false); }}>
                {d}
              </button>
            ))}
          </div>
          {degradado && <div role="status">Este tamaño es pequeño: se muestra el diseño Mínimo; agranda el widget para ver el elegido.</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
