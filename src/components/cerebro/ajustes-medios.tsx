"use client";

/**
 * Medios de un cerebro, una memoria o una carpeta (CB1013S, contrato §8 de cerebros-fusion-telepatia.md).
 * Controlado por props: enseña `valor` y avisa con `onCambio`; no guarda nada. Capacidades: «auto» más
 * los servidores del cerebro y las neuronas de la malla. Almacenamiento: destinos de
 * `getMemoryDestinations`, con una línea por destino explicando adónde va cada dato (destinosDe).
 */

import { useEffect, useMemo, useState } from "react";
import { Layers } from "lucide-react";
import type { Neuron } from "@/lib/neurons/neurons";
import { listNeurons } from "@/lib/neurons/neurons";
import { getMemoryDestinations } from "@/lib/brains/memory-destinations";
import type { Brain } from "@/lib/brains/brains";
import { APLICACION, CAPACIDADES, type AjustesObjetivo, type Capacidad } from "@/lib/cerebros/ajustes";
import { claseDato, ID_AUTO, opcionesCapacidad, panelAlmacenamiento, type DestinoPanel } from "@/lib/cerebros/medios-panel";
import { MarcaAplicacion, type NivelAjustes } from "@/components/cerebro/ajustes-seguridad";

export interface AjustesMediosProps {
  valor: Pick<AjustesObjetivo, "medios" | "privacidad">;
  onCambio: (parcial: Partial<AjustesObjetivo>) => void;
  cerebro: Brain;
  nivel: NivelAjustes;
}
