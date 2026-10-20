"use client";

import { useExpresionBot } from "@/lib/astraura-bots/adaptadores/expresion-orbe";
import { QuantumOrb } from "./quantum-orb";
import { botPredeterminado } from "@/lib/astraura-bots/predeterminado";
import { leerBots } from "@/lib/astraura-bots/adaptadores/almacen-bots";

export default function AuroraWidget() {
  // Obtener el bot predeterminado de almacenamiento o usar el por defecto
  const bots = leerBots("local", "local");
  const bot = bots[0] ?? botPredeterminado("local", "local");
  const params = useExpresionBot(bot);
  return params ? <QuantumOrb params={params} /> : null;
}