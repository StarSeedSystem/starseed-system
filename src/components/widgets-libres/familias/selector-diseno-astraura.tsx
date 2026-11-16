import React, { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { DISENOS, type EleccionDiseno } from "@/lib/widgets/astraura/disenos";
import { Settings } from "lucide-react";

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
          <Settings className="size-5" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-popover p-6 rounded-lg shadow-lg border">
          <Dialog.Title className="text-lg font-medium mb-4">Diseño</Dialog.Title>
          <div role="radiogroup" aria-label="Selección de diseño" className="flex flex-col gap-2">
            <button onClick={() => { onCambiar("auto"); setAbierto(false); }} className={`p-2 rounded text-left ${valor === "auto" ? "bg-accent" : ""}`}>
              Automático (según el tamaño y el aparato)
            </button>
            {Object.entries(DISENOS).map(([key, d]) => (
              <button key={key} onClick={() => { onCambiar(key as EleccionDiseno); setAbierto(false); }} className={`p-2 rounded text-left ${valor === key ? "bg-accent" : ""}`} aria-describedby={`desc-${key}`}>
                <div className="font-medium">{d.nombre}</div>
                <div id={`desc-${key}`} className="text-sm text-muted-foreground">{d.sirvePara}</div>
              </button>
            ))}
          </div>
          {degradado && <div role="status" className="mt-4 text-amber-500 text-sm">Este tamaño es pequeño: se muestra el diseño Mínimo; agranda el widget para ver el elegido.</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
