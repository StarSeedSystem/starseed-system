/**
 * Grabadora local de la llamada (LLA1108C): `MediaRecorder` sobre el flujo de la llamada, trozos en memoria y,
 * al parar, un Blob que se guarda en OPFS (almacén local del navegador). Nada sale del aparato. Dependencias
 * inyectables para probarla sin navegador.
 */
export interface GrabadoraMinima {
  state: string;
  mimeType: string;
  ondataavailable: ((e: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
  start(ms?: number): void;
  stop(): void;
}
export type CtorGrabadora = (new (s: MediaStream, o?: { mimeType?: string }) => GrabadoraMinima) & { isTypeSupported?: (t: string) => boolean };

export interface GrabadoraLocal {
  parar(): Promise<Blob>;
  mimeType: string;
}

const PREFERIDOS = ["video/webm;codecs=vp9,opus", "video/webm", "audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

export function elegirMime(ctor: CtorGrabadora, conVideo: boolean): string | undefined {
  const lista = conVideo ? PREFERIDOS : PREFERIDOS.filter((m) => m.startsWith("audio"));
  return lista.find((m) => ctor.isTypeSupported?.(m));
}

export function iniciarGrabadoraLocal(stream: MediaStream, ctor: CtorGrabadora, conVideo: boolean): GrabadoraLocal {
  const mime = elegirMime(ctor, conVideo);
  const r = new ctor(stream, mime ? { mimeType: mime } : undefined);
  const trozos: Blob[] = [];
  r.ondataavailable = (e) => { if (e.data && (e.data as Blob).size > 0) trozos.push(e.data); };
  r.start(1000);
  return {
    mimeType: r.mimeType || mime || "application/octet-stream",
    parar: () =>
      new Promise<Blob>((ok) => {
        r.onstop = () => ok(new Blob(trozos, { type: r.mimeType || mime || "application/octet-stream" }));
        if (r.state === "inactive") r.onstop?.();
        else r.stop();
      }),
  };
}

export interface DirectorioMinimo {
  getFileHandle(nombre: string, o: { create: boolean }): Promise<{ createWritable(): Promise<{ write(b: Blob): Promise<void>; close(): Promise<void> }> }>;
}

/** Guarda en OPFS bajo `grabaciones-llamada/`. Devuelve la ruta o null si el aparato no tiene OPFS. */
export async function guardarEnOpfs(blob: Blob, nombre: string, raiz: { getDirectoryHandle(n: string, o: { create: boolean }): Promise<DirectorioMinimo> } | null): Promise<string | null> {
  if (!raiz) return null;
  try {
    const dir = await raiz.getDirectoryHandle("grabaciones-llamada", { create: true });
    const h = await dir.getFileHandle(nombre, { create: true });
    const w = await h.createWritable();
    await w.write(blob);
    await w.close();
    return `grabaciones-llamada/${nombre}`;
  } catch {
    return null;
  }
}
