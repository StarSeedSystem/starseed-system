export function formatoTiempo(segundos: number): string {
  const mins = Math.floor(segundos / 60);
  const secs = Math.floor(segundos % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function etiquetaNivel(valor: number): string {
  if (valor === 0) return "Silencio";
  if (valor < 0.25) return "Muy bajo";
  if (valor < 0.5) return "Bajo";
  if (valor < 0.75) return "Medio";
  if (valor < 1) return "Alto";
  return "Máximo";
}

export function etiquetaEcualizador(valor: number): string {
  if (valor === 0) return "Plano";
  if (valor > 0) return `+${Math.round(valor * 12)} dB`;
  return `${Math.round(valor * 12)} dB`;
}

export function esControladora(
  neuronaId: string,
  modoControl: "una" | "elegidas" | "todas",
  neuronasControladoras: string[]
): boolean {
  if (modoControl === "todas") return true;
  if (modoControl === "una") return neuronasControladoras[0] === neuronaId;
  return neuronasControladoras.includes(neuronaId);
}

export function obtenerNeuronasUnicas(
  fuentes: Array<{ neuronaId: string; neuronaNombre: string }>
): Array<{ id: string; nombre: string }> {
  return fuentes.reduce<Array<{ id: string; nombre: string }>>((acc, f) => {
    if (!acc.some((n) => n.id === f.neuronaId)) {
      acc.push({ id: f.neuronaId, nombre: f.neuronaNombre });
    }
    return acc;
  }, []);
}