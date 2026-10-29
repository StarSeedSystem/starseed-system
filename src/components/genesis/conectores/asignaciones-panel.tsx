"use client";
/* AsignacionesPanel — una fila por papel o director con su cadena (arrastrar para ordenar, añadir
 * del catálogo, quitar), el peldaño (local, malla, contenedor, gratis, pago) con su motivo y
 * «Restaurar sugeridas». En PoliGenesis democrático guardar PROPONE. Sin red: guardado inyectado. */
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, GripVertical, RotateCcw, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { OpcionCatalogo, Papel } from "@/lib/genesis/conectores/catalogo-opciones";
import type { Director } from "@/lib/genesis/conectores/asignaciones";
import { elegirCandidatos, type Candidato, type OfertaContexto, type Preferencias } from "@/lib/genesis/conectores/escalera";
export type Rol = Papel | Director;
export type EtiquetaPeldano = "local" | "malla" | "contenedor" | "gratis" | "pago" | "sin-catalogar";
export type ModoGuardado = "aplicar" | "proponer";
export interface FilaAsignacionVista { clave: Rol; cadena: string[] }
export type ResultadoGuardado = { ok: true } | { ok: false; motivo: string };
export const planDeGuardado = (modo: ModoGuardado): { propone: boolean; etiqueta: string; aviso: string } => (modo === "proponer" ? { propone: true, etiqueta: "Proponer a votación", aviso: "Propuesta creada: la entidad la vota antes de aplicarse." } : { propone: false, etiqueta: "Guardar", aviso: "Asignaciones guardadas." });
const ETIQUETAS: Record<Candidato["peldano"], EtiquetaPeldano> = { 1: "local", 2: "local", 3: "malla", 4: "contenedor", 5: "gratis", 6: "pago" };
const PAPEL_DE: Record<Rol, Papel> = { escritor: "escritor", revisor: "revisor", chat: "chat", visión: "visión", voz: "voz", imagen: "imagen", código: "código", optimizador: "código", diseno: "imagen", produccion: "voz", nube: "código", medidores: "revisor", aprendizaje: "revisor" };
const NOMBRE_ROL: Record<Rol, string> = { escritor: "Escritor", revisor: "Revisor", chat: "Chat", visión: "Visión", voz: "Voz", imagen: "Imagen", código: "Código", optimizador: "Optimizador", diseno: "Diseño", produccion: "Producción", nube: "Nube", medidores: "Medidores", aprendizaje: "Aprendizaje" };
export const ROLES_POR_DEFECTO: readonly Rol[] = Object.keys(PAPEL_DE) as Rol[];
export function etiquetaPeldano(peldano: Candidato["peldano"]): EtiquetaPeldano { return ETIQUETAS[peldano]; }
export function moverEnCadena(cadena: readonly string[], desde: number, hasta: number): string[] {
  if (desde === hasta || desde < 0 || hasta < 0 || desde >= cadena.length || hasta >= cadena.length) return [...cadena];
  const copia = [...cadena];
  const [pieza] = copia.splice(desde, 1);
  copia.splice(hasta, 0, pieza);
  return copia;
}
export const anadirACadena = (cadena: readonly string[], id: string): string[] => (cadena.includes(id) ? [...cadena] : [...cadena, id]);
export const quitarDeCadena = (cadena: readonly string[], id: string): string[] => cadena.filter((x) => x !== id);
/** Preferencias del ámbito para la escalera: el pago solo si se permite; nunca se inventan topes. */
export function preferenciasDe(permitirPago: boolean, prohibidos: readonly string[] = []): Preferencias {
  return { permitirPago, topeDiario: null, prohibidos: [...prohibidos] };
}
export function candidatosDeRol(rol: Rol, catalogo: readonly OpcionCatalogo[], ofertas: readonly OfertaContexto[], vinculadas: ReadonlySet<string>, preferencias: Preferencias, privado = false): Candidato[] {
  return elegirCandidatos({ tarea: { papel: PAPEL_DE[rol], privado, tamano: 0 }, ofertas: [...ofertas], catalogo: [...catalogo], vinculadas: new Set(vinculadas), preferencias });
}
export function etiquetaDeCadena(id: string, candidatos: readonly Candidato[]): { etiqueta: EtiquetaPeldano; motivo: string } {
  const c = candidatos.find((x) => x.candidatoId === id);
  return c ? { etiqueta: ETIQUETAS[c.peldano], motivo: c.motivo } : { etiqueta: "sin-catalogar", motivo: "Esta opción no consta en el catálogo de este ámbito." };
}
export function filasPorDefecto(filas: readonly FilaAsignacionVista[], roles: readonly Rol[] = ROLES_POR_DEFECTO): FilaAsignacionVista[] {
  return roles.map((clave) => ({ clave, cadena: [...new Set((filas.find((f) => f.clave === clave)?.cadena ?? []).filter(Boolean))].slice(0, 8) }));
}
export function restaurarSugeridas(roles: readonly Rol[], catalogo: readonly OpcionCatalogo[], ofertas: readonly OfertaContexto[], vinculadas: ReadonlySet<string>, preferencias: Preferencias): FilaAsignacionVista[] {
  return roles.map((clave) => ({ clave, cadena: candidatosDeRol(clave, catalogo, ofertas, vinculadas, preferencias).slice(0, 3).map((c) => c.candidatoId) }));
}
interface Props {
  catalogo: readonly OpcionCatalogo[]; filas: readonly FilaAsignacionVista[];
  ofertas?: readonly OfertaContexto[]; vinculadas?: ReadonlySet<string>;
  permitirPago?: boolean; prohibidos?: readonly string[]; roles?: readonly Rol[];
  modo: ModoGuardado; alGuardar: (filas: FilaAsignacionVista[], modo: ModoGuardado) => Promise<ResultadoGuardado>;
}
export function AsignacionesPanel({ catalogo, filas, ofertas = [], vinculadas = new Set<string>(), permitirPago = false, prohibidos = [], roles = ROLES_POR_DEFECTO, modo, alGuardar }: Props) {
  const preferencias = useMemo(() => preferenciasDe(permitirPago, prohibidos), [permitirPago, prohibidos]);
  const [estado, setEstado] = useState<FilaAsignacionVista[]>(() => filasPorDefecto(filas, roles));
  const [arrastre, setArrastre] = useState<{ rol: Rol; indice: number } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const candidatos = useMemo(() => Object.fromEntries(roles.map((r) => [r, candidatosDeRol(r, catalogo, ofertas, vinculadas, preferencias)])) as Record<string, Candidato[]>, [roles, catalogo, ofertas, vinculadas, preferencias]);
  const nombre = (id: string) => catalogo.find((o) => o.id === id)?.nombre ?? id;
  const cambiar = (rol: Rol, cadena: string[]) => setEstado((xs) => xs.map((f) => (f.clave === rol ? { ...f, cadena } : f)));
  const guardar = async () => {
    setGuardando(true); setAviso(null);
    try {
      const r = await alGuardar(estado, modo);
      setAviso(r.ok ? planDeGuardado(modo).aviso : r.motivo);
    } finally { setGuardando(false); }
  };
  return (
    <section className="space-y-3 rounded-2xl border border-white/10 bg-black/20 p-3" aria-label="Asignaciones por papel y director" data-testid="asignaciones-panel">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-white/85">Asignaciones por papel y director</h3>
        <Button variant="ghost" size="sm" className="ml-auto h-8 cursor-pointer gap-1 text-xs" data-testid="asignaciones-restaurar" onClick={() => { setEstado(restaurarSugeridas(roles, catalogo, ofertas, vinculadas, preferencias)); setAviso(null); }}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Restaurar sugeridas
        </Button>
      </div>
      <ul className="space-y-2">
        {estado.map((fila) => {
          const cands = candidatos[fila.clave] ?? [];
          return (
            <li key={fila.clave} className="rounded-xl border border-white/10 bg-black/25 p-2" data-testid={`asignacion-${fila.clave}`}>
              <p className="mb-1 text-xs font-medium text-white/80">{NOMBRE_ROL[fila.clave]}</p>
              <ol className="space-y-1">
                {fila.cadena.map((id, indice) => {
                  const et = etiquetaDeCadena(id, cands);
                  return (
                    <li key={id} draggable className="flex cursor-grab flex-wrap items-center gap-1.5 rounded-lg bg-white/[0.03] px-2 py-1" data-testid={`cadena-${fila.clave}-${id}`} onDragStart={(e) => { e.dataTransfer.setData("text/plain", id); setArrastre({ rol: fila.clave, indice }); }} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (arrastre?.rol === fila.clave) cambiar(fila.clave, moverEnCadena(fila.cadena, arrastre.indice, indice)); setArrastre(null); }}>
                      <GripVertical className="h-3.5 w-3.5 shrink-0 text-white/30" aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-xs text-white/90">{nombre(id)}</span>
                      <span className="rounded-md border border-cyan-400/20 px-1 py-0.5 text-[10px] text-cyan-200">{et.etiqueta}</span>
                      <span className="w-full text-[10px] text-white/45">{et.motivo}</span>
                      <button type="button" className="flex h-7 w-7 cursor-pointer items-center justify-center text-white/40 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-30" aria-label={`Subir ${nombre(id)}`} disabled={indice === 0} onClick={() => cambiar(fila.clave, moverEnCadena(fila.cadena, indice, indice - 1))}><ArrowUp className="h-3.5 w-3.5" aria-hidden /></button>
                      <button type="button" className="flex h-7 w-7 cursor-pointer items-center justify-center text-white/40 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-30" aria-label={`Bajar ${nombre(id)}`} disabled={indice === fila.cadena.length - 1} onClick={() => cambiar(fila.clave, moverEnCadena(fila.cadena, indice, indice + 1))}><ArrowDown className="h-3.5 w-3.5" aria-hidden /></button>
                      <button type="button" className="flex h-7 w-7 cursor-pointer items-center justify-center text-white/40 hover:text-rose-300" aria-label={`Quitar ${nombre(id)}`} onClick={() => cambiar(fila.clave, quitarDeCadena(fila.cadena, id))}>
                        <X className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ol>
              <select className="mt-1 w-full cursor-pointer rounded-lg border border-white/15 bg-black/30 p-1.5 text-xs" value="" aria-label={`Añadir a la cadena de ${NOMBRE_ROL[fila.clave]}`} onChange={(e) => { if (e.target.value) cambiar(fila.clave, anadirACadena(fila.cadena, e.target.value)); }}>
                <option value="">Añadir del catálogo…</option>
                {cands.filter((c) => !fila.cadena.includes(c.candidatoId)).map((c) => (
                  <option key={c.candidatoId} value={c.candidatoId}>{nombre(c.candidatoId)} · {etiquetaPeldano(c.peldano)}</option>
                ))}
              </select>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        {aviso ? <p className="text-[11px] text-white/60" role="status">{aviso}</p> : null}
        <Button size="sm" className="ml-auto h-8 cursor-pointer gap-1 text-xs" disabled={guardando} onClick={() => void guardar()} data-testid="asignaciones-guardar">
          <Save className="h-3.5 w-3.5" aria-hidden /> {guardando ? "Guardando…" : planDeGuardado(modo).etiqueta}
        </Button>
      </div>
    </section>
  );
}
