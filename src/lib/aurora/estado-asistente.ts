export type EstadoAsistente = "calma" | "escuchando" | "hablando" | "error";

interface Snapshot {
  speaking: boolean;
  listening: boolean;
  actionStatus: string | null;
}

export function derivarEstado(snapshot: Snapshot, ultimaMs: number | null, ahoraMs: number): EstadoAsistente {
  if (snapshot.actionStatus && snapshot.actionStatus.includes("error")) {
    return "error";
  }
  if (snapshot.listening) return "escuchando";
  if (snapshot.speaking) return "hablando";
  return "calma";
}
