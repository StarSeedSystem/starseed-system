"use client";
import { useEffect, useState } from "react";
import { AlertTriangle, Check, FileDown, Loader2, Wrench } from "lucide-react";
import { cleanEndpoint, proxyFetch, proxyUpload } from "@/lib/integrations/clients/_proxy";
export interface ArchivoPdf { url?: string | null; nombre?: string | null; blob?: Blob | null; }
export interface ParametroPdf { clave: string; etiqueta: string; ayuda: string; defecto: string; tipo?: "texto" | "seleccion"; opciones?: string[]; }
export interface OperacionPdf { id: string; etiqueta: string; descripcion: string; ruta: string; alias: string[]; parametros: ParametroPdf[]; }
export interface ResultadoEdicion { ok: boolean; blob?: Blob; nombre?: string; error?: string; }
export interface ClientePdf { ejecutar(op: OperacionPdf, archivo: Blob, valores: Record<string, string>): Promise<ResultadoEdicion>; }
export interface CfgEditarPdf { endpoint?: string; apiKey?: string; capacidades?: readonly string[]; cliente?: ClientePdf; }
export interface PropsPanelEditarPdf { archivo: ArchivoPdf; alGuardar: (blob: Blob, nombre: string) => void | Promise<void>; cfg?: CfgEditarPdf; }
const parametro = (clave: string, etiqueta: string, defecto: string, ayuda: string, tipo: ParametroPdf["tipo"] = "texto", opciones?: string[]): ParametroPdf => ({ clave, etiqueta, defecto, ayuda, tipo, opciones });
export const CATALOGO_PDF: OperacionPdf[] = [
  { id: "rotar", etiqueta: "Rotar", descripcion: "Gira todas las páginas.", ruta: "/api/v1/general/rotate-pdf", alias: ["rotate-pdf", "rotar", "rotate"], parametros: [parametro("angle", "Ángulo", "90", "Giro en grados, múltiplo de 90.", "seleccion", ["90", "180", "270"])] },
  { id: "dividir", etiqueta: "Dividir", descripcion: "Separa las páginas elegidas en documentos.", ruta: "/api/v1/general/split-pages", alias: ["split-pages", "dividir", "split"], parametros: [parametro("pageNumbers", "Páginas", "all", "Ejemplo: 1,3,5-9 o all.")] },
  { id: "quitar", etiqueta: "Quitar páginas", descripcion: "Borra las páginas indicadas.", ruta: "/api/v1/general/remove-pages", alias: ["remove-pages", "quitar-paginas", "remove"], parametros: [parametro("pageNumbers", "Páginas a quitar", "1", "Ejemplo: 1,3,5-9.")] },
  { id: "reordenar", etiqueta: "Reordenar", descripcion: "Cambia el orden de las páginas.", ruta: "/api/v1/general/rearrange-pages", alias: ["rearrange-pages", "reordenar", "reorder"], parametros: [parametro("pageNumbers", "Nuevo orden", "1,2,3", "Páginas en el orden deseado.")] },
  { id: "comprimir", etiqueta: "Comprimir", descripcion: "Reduce el peso del PDF.", ruta: "/api/v1/misc/compress-pdf", alias: ["compress-pdf", "comprimir", "compress"], parametros: [parametro("optimizeLevel", "Nivel", "5", "De 1 (suave) a 9 (máxima compresión).", "seleccion", ["1", "2", "3", "4", "5", "6", "7", "8", "9"])] },
  { id: "ocr", etiqueta: "OCR", descripcion: "Hace buscable un PDF escaneado.", ruta: "/api/v1/misc/ocr-pdf", alias: ["ocr-pdf", "ocr"], parametros: [parametro("languages", "Idiomas", "eng", "Códigos Tesseract, por ejemplo eng o spa."), parametro("ocrType", "Modo", "skip-text", "skip-text respeta el texto que ya existe.", "seleccion", ["skip-text", "force-ocr", "auto"])] },
  { id: "marca", etiqueta: "Marca de agua", descripcion: "Escribe una marca sobre cada página.", ruta: "/api/v1/security/add-watermark", alias: ["add-watermark", "marca-de-agua", "watermark"], parametros: [parametro("watermarkText", "Texto", "Confidencial", "Texto de la marca.")] },
];
export function operacionesDisponibles(capacidades?: readonly string[] | null): OperacionPdf[] {
  const disponibles = capacidades && capacidades.length ? new Set(capacidades.map((c) => c.trim().toLowerCase())) : null;
  return disponibles ? CATALOGO_PDF.filter((op) => op.alias.some((a) => disponibles.has(a)) || disponibles.has(op.ruta.toLowerCase())) : CATALOGO_PDF;
}
export function nombreVersionNueva(nombre: string): string {
  const limpio = nombre.trim() || "documento.pdf"; const punto = limpio.lastIndexOf(".");
  return `${punto > 0 ? limpio.slice(0, punto) : limpio} (versión nueva)${punto > 0 ? limpio.slice(punto) : ".pdf"}`;
}
function textoDeError(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "No se pudo editar el PDF.";
}
function blobDesde(data: unknown): Blob | null {
  const datos = data as { base64?: unknown; contentType?: unknown } | null;
  if (!datos || typeof datos.base64 !== "string" || !datos.base64) return null;
  try {
    const binario = atob(datos.base64); const bytes = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
    return new Blob([bytes], { type: typeof datos.contentType === "string" ? datos.contentType : "application/octet-stream" });
  } catch { return null; }
}
async function ejecutarConStirling(cfg: CfgEditarPdf, op: OperacionPdf, archivo: Blob, valores: Record<string, string>): Promise<ResultadoEdicion> {
  const formulario = new FormData();
  formulario.append("__endpoint", cleanEndpoint(cfg.endpoint));
  formulario.append("__path", op.ruta);
  if (cfg.apiKey) formulario.append("__apiKey", cfg.apiKey);
  formulario.append("__accept", "binary");
  formulario.append("fileInput", archivo, "documento.pdf");
  for (const [clave, valor] of Object.entries(valores)) formulario.append(clave, valor);
  if (op.id === "reordenar") formulario.append("customMode", "CUSTOM");
  if (op.id === "ocr") formulario.append("ocrRenderType", "hocr");
  if (op.id === "marca") formulario.append("watermarkType", "text");
  const respuesta = await proxyUpload(formulario);
  if (!respuesta.ok) return { ok: false, error: respuesta.error || "Stirling-PDF no pudo completar la operación." };
  const blob = blobDesde(respuesta.data);
  if (!blob) return { ok: false, error: "Stirling-PDF respondió sin un archivo legible." };
  const datos = respuesta.data as { filename?: unknown };
  const nombre = typeof datos?.filename === "string" && datos.filename ? datos.filename : undefined;
  return { ok: true, blob, nombre };
}

export function PanelEditarPdf({ archivo, alGuardar, cfg }: PropsPanelEditarPdf) {
  const [capacidades, setCapacidades] = useState<readonly string[] | null | undefined>(cfg?.capacidades ?? (cfg?.endpoint && !cfg?.cliente ? [] : undefined));
  const [abierta, setAbierta] = useState<string | null>(null);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ blob: Blob; nombre: string; url: string | null } | null>(null);
  const [guardado, setGuardado] = useState<string | null>(null);
  const sinServidor = !cfg?.cliente && !cfg?.endpoint;
  const operaciones = operacionesDisponibles(sinServidor ? [] : capacidades);
  useEffect(() => {
    if (!cfg?.endpoint || cfg.capacidades || cfg.cliente) return;
    let vivo = true;
    proxyFetch({ id: "stirling-pdf", endpoint: cfg.endpoint, apiKey: cfg.apiKey, auth: cfg.apiKey ? "x-api-key" : "none", method: "GET", path: "/v1/api-docs" })
      .then((r) => {
        if (!vivo) return;
        const rutas = r.ok ? Object.keys((r.data as { paths?: Record<string, unknown> } | undefined)?.paths ?? {}) : [];
        setCapacidades(rutas);
        if (!r.ok) setError("No pude leer la descripción de API de Stirling-PDF; revisa el conector.");
      });
    return () => { vivo = false; };
  }, [cfg?.endpoint, cfg?.apiKey, cfg?.capacidades, cfg?.cliente]);
  const elegir = (op: OperacionPdf) => { setAbierta(op.id); setValores(Object.fromEntries(op.parametros.map((p) => [p.clave, p.defecto]))); setResultado(null); setError(null); setGuardado(null); };
  const aplicar = async () => {
    const op = operaciones.find((o) => o.id === abierta);
    if (!op) return;
    setCargando(true); setError(null); setResultado(null); setGuardado(null);
    try {
      const original = archivo.blob ?? (archivo.url ? await (await fetch(archivo.url)).blob() : null);
      if (!original) throw new Error("No pude leer el PDF original: falta el archivo o su dirección.");
      const cliente = cfg?.cliente ?? { ejecutar: (o: OperacionPdf, a: Blob, v: Record<string, string>) => ejecutarConStirling(cfg ?? {}, o, a, v) };
      const r = await cliente.ejecutar(op, original, valores);
      if (!r.ok || !r.blob) throw new Error(r.error || "Stirling-PDF no devolvió un archivo.");
      const nombre = nombreVersionNueva(r.nombre || archivo.nombre || "documento.pdf");
      const url = typeof URL !== "undefined" && typeof URL.createObjectURL === "function" ? URL.createObjectURL(r.blob) : null;
      setResultado({ blob: r.blob, nombre, url });
    } catch (e) { setError(textoDeError(e)); } finally { setCargando(false); }
  };
  const guardar = async () => {
    if (!resultado) return;
    setCargando(true);
    try { await alGuardar(resultado.blob, resultado.nombre); setGuardado(`Versión nueva guardada como «${resultado.nombre}». El original no se tocó.`); }
    catch (e) { setError(textoDeError(e)); } finally { setCargando(false); }
  };
  const op = operaciones.find((o) => o.id === abierta);
  return (
    <section aria-label="Editor de PDF" className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-white/80">
      <div className="flex items-center gap-2"><Wrench className="size-4 text-rose-300" aria-hidden="true" /><h3 className="text-sm font-semibold text-white/90">Editar PDF</h3></div>
      {sinServidor ? <p className="mt-2 text-xs text-amber-200" role="status">Editar PDF necesita un servidor Stirling-PDF; conecta uno en Conectores o deja que la malla lo busque.</p>
        : operaciones.length === 0 ? <p className="mt-2 text-xs text-amber-200" role="status">Esta instancia no ofrece operaciones de edición compatibles.</p>
          : <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Operaciones disponibles">{operaciones.map((o) => <button key={o.id} type="button" aria-pressed={abierta === o.id} onClick={() => elegir(o)} className="min-h-11 min-w-11 cursor-pointer rounded-lg border border-white/15 bg-white/[0.04] px-3 text-xs font-semibold hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-300">{o.etiqueta}</button>)}</div>}
      {op && !sinServidor && <div className="mt-3 space-y-2"><p className="text-[11px] text-white/60">{op.descripcion}</p>{op.parametros.map((p) => <label key={p.clave} className="block text-[11px] font-semibold text-white/70">{p.etiqueta}{p.tipo === "seleccion" ? <select aria-label={p.etiqueta} value={valores[p.clave] ?? p.defecto} onChange={(e) => setValores((v) => ({ ...v, [p.clave]: e.target.value }))} className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-black/30 px-2 text-sm text-white">{p.opciones?.map((o) => <option key={o} value={o}>{o}</option>)}</select> : <input aria-label={p.etiqueta} value={valores[p.clave] ?? p.defecto} onChange={(e) => setValores((v) => ({ ...v, [p.clave]: e.target.value }))} className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-black/30 px-2 text-sm text-white" />}<span className="mt-1 block text-[10px] font-normal text-white/40">{p.ayuda}</span></label>)}<button type="button" onClick={aplicar} disabled={cargando} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-rose-400/40 bg-rose-500/15 px-3 text-xs font-bold text-rose-100 hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-50">{cargando ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}Aplicar cambio</button></div>}
      {error && <p role="alert" className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-200"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />{error}</p>}
      {resultado && <div className="mt-3 rounded-lg border border-emerald-400/20 bg-emerald-500/5 p-2"><p className="text-xs font-semibold text-emerald-300" role="status">Resultado listo: «{resultado.nombre}»</p>{resultado.url ? <object data={resultado.url} type={resultado.blob.type || "application/pdf"} aria-label="Vista previa del PDF editado" className="mt-2 h-64 w-full rounded-lg bg-white" /> : <p className="mt-1 text-[11px] text-white/50">No puedo previsualizarlo en este navegador; puedes guardar la versión nueva.</p>}<button type="button" onClick={guardar} disabled={cargando} className="mt-2 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-emerald-400/40 bg-emerald-500/15 px-3 text-xs font-bold text-emerald-100 hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-50"><FileDown className="size-4" aria-hidden="true" />Guardar versión nueva</button></div>}
      {guardado && <p role="status" className="mt-2 text-[11px] text-emerald-300">{guardado}</p>}
    </section>
  );
}
