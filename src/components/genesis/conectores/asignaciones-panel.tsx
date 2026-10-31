"use client";

/* Panel de asignaciones por papel y director (Ola 1019G · GCA1019N). Una fila por papel o director
 * con su cadena ordenable, el peldaño (local, malla, contenedor, gratis, pago) y su motivo. En
 * PoliGenesis democrático, guardar crea una propuesta en vez de aplicar. Las funciones puras se
 * exportan para probarlas sin red, sin disco y sin reloj; los textos van en español con acentos. */

import { useMemo, useState } from "react";
import { GripVertical, RotateCcw, Save, Trash2 } from "lucide-react";
import type { Director } from "@/lib/genesis/conectores/asignaciones";
import type { OpcionCatalogo, Papel } from "@/lib/genesis/conectores/catalogo-opciones";
import type { ContenedorOpcion } from "@/lib/genesis/conectores/contenedores";
import type { OfertaContexto } from "@/lib/genesis/conectores/escalera";
import type { PermisoLanzamiento } from "@/lib/genesis/conectores/cupo-cloudroom";
import { cupoRestante, ritmoDiario } from "@/lib/genesis/conectores/cupo-cloudroom";
import { asignacionesDesdeFilas } from "@/lib/genesis/conectores/opciones-ambito";
import { sugerirParaAmbito } from "@/lib/genesis/conectores/sugerir";

export type ModoPanel = "aplicar" | "proponer" | "sin-permiso";
export type Peldano = "local" | "malla" | "contenedor" | "gratis" | "pago";
export type ClavePanel = Papel | Director;

export interface FilaPanel {
  tipo: "papel" | "director";
  clave: ClavePanel;
  cadena: string[];
}

export interface EntradaFila {
  id: string;
  nombre: string;
  peldano: Peldano;
  motivo: string;
}

/** Avisos del contexto para pintar Cloudroom con honestidad (CRM1024F). */
export interface AvisosContenedores {
  /** Ofertas MEDIDAS del ámbito (neuronas y servidores del cerebro); vacía si nadie midió. */
  ofertas?: readonly OfertaContexto[];
  /** Entradas del catálogo de contenedores (contenedores.ts) para el sugeridor. */
  contenedores?: readonly ContenedorOpcion[];
  /** Datos del cupo Cloudroom declarados por la cuenta; ausente = sin plan declarado. */
  cupoCloudroom?: PermisoLanzamiento | null;
  /** La tarea actual es de código larga o debe seguir con el aparato apagado. */
  relevanteCloudroom?: boolean;
}

export interface PropsPanel {
  catalogo: readonly OpcionCatalogo[];
  modo?: ModoPanel;
  filasIniciales?: readonly FilaPanel[];
  onGuardar?: (filas: FilaPanel[]) => void | Promise<void>;
  /** Avisos del contexto (ofertas medidas, cupo Cloudroom) con los que pinta Cloudroom. */
  avisos?: AvisosContenedores;
}

export const PAPELES: readonly Papel[] = ["escritor", "revisor", "chat", "visión", "voz", "imagen", "código"];
export const DIRECTORES: readonly Director[] = ["chat", "optimizador", "diseno", "produccion", "nube", "medidores", "aprendizaje"];

const NOMBRES: Record<string, string> = {
  escritor: "Escritor", revisor: "Revisor", chat: "Chat", visión: "Visión", voz: "Voz", imagen: "Imagen",
  código: "Código", optimizador: "Optimizador", diseno: "Diseño", produccion: "Producción", nube: "Nube",
  medidores: "Medidores", aprendizaje: "Aprendizaje",
};

export function peldanoDe(opcion: OpcionCatalogo): Peldano {
  if (opcion.tipo === "contenedor") return "contenedor";
  if (opcion.privacidad === "local") return "local";
  if (opcion.gratis === null) return "pago";
  return opcion.tipo === "modelo" ? "malla" : "gratis";
}

export function motivoDe(opcion: OpcionCatalogo): string {
  const base: Record<Peldano, string> = {
    local: "Corre en esta cuenta: nada sale del aparato.",
    malla: "Modelo de la malla: solo si no cabe en local.",
    contenedor: "Contenedor para los procesos del agente.",
    gratis: "Gratis con la cuenta del ámbito o vinculándola en el enlace oficial.",
    pago: "De pago: solo con el permiso y el tope del ámbito.",
  };
  const nota = opcion.gratis?.nota ? `Límite según catálogo: ${opcion.gratis.nota}${opcion.verificado ? "" : " (sin verificar)"}.` : "Límite no verificado.";
  return `${base[peldanoDe(opcion)]} ${nota}`;
}

export function entradasDeFila(fila: FilaPanel, catalogo: readonly OpcionCatalogo[]): EntradaFila[] {
  const porId = new Map(catalogo.map((o) => [o.id, o]));
  return fila.cadena.flatMap((id) => {
    const opcion = porId.get(id);
    return opcion ? [{ id, nombre: opcion.nombre, peldano: peldanoDe(opcion), motivo: motivoDe(opcion) }] : [];
  });
}

/** Estado honesto de Cloudroom en esta neurona: app de escritorio verificada (o no) y cupo
 * restante del contexto calculado con `cupo-cloudroom.ts`. PURO: sin red, disco ni reloj. */
export function estadoCloudroom(avisos?: AvisosContenedores | null): string {
  const base = avisos?.ofertas?.some((o) => o.escritorioCompatible === true)
    ? "App de escritorio compatible verificada en esta neurona."
    : "App de escritorio sin verificar en esta neurona.";
  const cupo = avisos?.cupoCloudroom;
  if (!cupo) return `${base} Cupo restante: declara tu plan de Cloudroom para verlo.`;
  const restante = cupoRestante(cupo.plan, cupo.consumos, cupo.inicioCiclo, cupo.ahora);
  if (restante === null) return `${base} Cupo restante: sin cifras declaradas del plan.`;
  if (restante === 0) return `${base} Cupo agotado hasta el próximo ciclo de 30 días.`;
  const ritmo = ritmoDiario(restante, cupo.diasQueQuedan);
  return `${base} Cupo restante del ciclo: ${restante} agentes (ritmo diario: ${ritmo}).`;
}

/** Etiqueta de una opción en el selector «Añadir del catálogo…»: «Sugerida · nombre» solo si el
 * sugeridor del ámbito (`sugerirParaAmbito`) la devuelve. PURO. */
export function etiquetaOpcion(o: OpcionCatalogo, sugeridas: ReadonlySet<string>): string {
  return sugeridas.has(o.id) ? `Sugerida · ${o.nombre}` : o.nombre;
}

/** Ids que `sugerirParaAmbito` devuelve para las filas del panel. PURO: sin red ni disco. */
export function idsSugeridas(
  filas: readonly FilaPanel[],
  catalogo: readonly OpcionCatalogo[],
  avisos?: AvisosContenedores | null,
): Set<string> {
  const grupos = sugerirParaAmbito({
    asignaciones: asignacionesDesdeFilas(filas.map((f) => ({ clave: f.clave, cadena: [...f.cadena] }))),
    catalogo: [...catalogo],
    ofertas: [...(avisos?.ofertas ?? [])],
    vinculadas: new Set<string>(),
    contenedores: [...(avisos?.contenedores ?? [])],
    relevanteCloudroom: avisos?.relevanteCloudroom === true,
  });
  return new Set(grupos.flatMap((g) => (g.clave === "sin-opcion" ? [] : g.opciones.map((o) => o.id))));
}

export function disponiblesParaFila(fila: FilaPanel, catalogo: readonly OpcionCatalogo[]): OpcionCatalogo[] {
  const sirven = fila.tipo === "papel"
    ? catalogo.filter((o) => o.papeles.includes(fila.clave as Papel))
    : [...catalogo];
  return sirven.filter((o) => !fila.cadena.includes(o.id));
}

export function moverEnCadena(cadena: readonly string[], desde: number, hasta: number): string[] {
  if (desde === hasta || desde < 0 || hasta < 0 || desde >= cadena.length || hasta >= cadena.length) return [...cadena];
  const copia = [...cadena];
  const [movido] = copia.splice(desde, 1);
  copia.splice(hasta, 0, movido);
  return copia;
}

export function agregarACadena(cadena: readonly string[], id: string): string[] {
  return cadena.includes(id) ? [...cadena] : [...cadena, id];
}

export function quitarDeCadena(cadena: readonly string[], id: string): string[] {
  return cadena.filter((x) => x !== id);
}

const PESO: readonly Peldano[] = ["local", "malla", "contenedor", "gratis", "pago"];

const ETIQUETA_PELDANO: Record<Peldano, string> = {
  local: "Local", malla: "Malla", contenedor: "Contenedor", gratis: "Gratis", pago: "Pago",
};

export function etiquetaPeldano(peldano: Peldano): string {
  return ETIQUETA_PELDANO[peldano] ?? peldano;
}

export function filasSugeridas(catalogo: readonly OpcionCatalogo[], max = 3): FilaPanel[] {
  const orden = [...catalogo].sort((a, b) => PESO.indexOf(peldanoDe(a)) - PESO.indexOf(peldanoDe(b)) || a.nombre.localeCompare(b.nombre));
  const fila = (tipo: FilaPanel["tipo"], clave: ClavePanel): FilaPanel => ({
    tipo, clave,
    cadena: orden.filter((o) => tipo === "director" || o.papeles.includes(clave as Papel)).slice(0, max).map((o) => o.id),
  });
  return [...PAPELES.map((p) => fila("papel", p)), ...DIRECTORES.map((d) => fila("director", d))];
}

export function accionGuardar(modo: ModoPanel): "aplicar" | "proponer" | "nada" {
  return modo === "sin-permiso" ? "nada" : modo === "proponer" ? "proponer" : "aplicar";
}

export function etiquetaFila(fila: FilaPanel): string {
  return `${fila.tipo === "papel" ? "Papel" : "Director"} · ${NOMBRES[fila.clave] ?? fila.clave}`;
}

const BOTON = "min-h-11 min-w-11 cursor-pointer rounded-lg border border-white/15 p-1.5 text-white/60 transition-colors duration-150 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-9 sm:min-w-9";
const ACCION = "min-h-11 cursor-pointer rounded-full border border-white/15 px-3 py-1.5 text-[11px] text-white/75 transition-colors duration-150 hover:border-emerald-300/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-9 inline-flex items-center gap-1";

export function AsignacionesPanel({ catalogo, modo = "aplicar", filasIniciales, onGuardar, avisos }: PropsPanel) {
  const [filas, setFilas] = useState<FilaPanel[]>(() => (filasIniciales ? filasIniciales.map((f) => ({ ...f, cadena: [...f.cadena] })) : filasSugeridas(catalogo)));
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const sugeridas = useMemo(() => idsSugeridas(filas, catalogo, avisos), [filas, catalogo, avisos]);
  const soloLectura = modo === "sin-permiso";
  const cambiar = (i: number, cambio: (f: FilaPanel) => FilaPanel) => setFilas((lista) => lista.map((f, j) => (j === i ? cambio(f) : f)));
  const guardar = async () => {
    if (soloLectura) return;
    setGuardando(true);
    try {
      await onGuardar?.(filas);
      setAviso(accionGuardar(modo) === "proponer" ? "Propuesta creada para que la entidad la vote." : "Asignaciones guardadas en este ámbito.");
    } finally {
      setGuardando(false);
    }
  };
  return (
    <section className="space-y-4" aria-label="Asignaciones por papel y director">
      <header className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-white/85">Asignaciones por papel y director</h3>
          <p className="text-[11px] text-white/50">Arrastra o usa las flechas para ordenar. Lo local va primero; de pago solo con permiso.</p>
        </div>
        <button type="button" className={ACCION} disabled={soloLectura} onClick={() => { setFilas(filasSugeridas(catalogo)); setAviso(null); }}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Restaurar sugeridas
        </button>
        <button type="button" className={ACCION} disabled={soloLectura || guardando} onClick={() => void guardar()}>
          <Save className="h-3.5 w-3.5" aria-hidden /> {guardando ? "Guardando…" : accionGuardar(modo) === "proponer" ? "Proponer" : "Guardar"}
        </button>
      </header>
      {aviso ? <p role="status" className="rounded-lg border border-emerald-400/25 bg-emerald-500/10 p-2 text-[11px] text-emerald-100">{aviso}</p> : null}
      <ul className="space-y-2">
        {filas.map((fila, i) => {
          const entradas = entradasDeFila(fila, catalogo);
          const opciones = disponiblesParaFila(fila, catalogo);
          return (
            <li key={`${fila.tipo}:${fila.clave}`} className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="flex items-center gap-2">
                <h4 className="min-w-0 flex-1 truncate text-xs font-semibold text-white/80">{etiquetaFila(fila)}</h4>
                <select aria-label={`Añadir a ${etiquetaFila(fila)}`} className="min-h-11 max-w-[45%] cursor-pointer truncate rounded-lg border border-white/15 bg-black/30 p-1 text-[11px] text-white/75 disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-9" disabled={soloLectura || !opciones.length} value=""
                  onChange={(e) => { if (e.target.value) cambiar(i, (f) => ({ ...f, cadena: agregarACadena(f.cadena, e.target.value) })); }}>
                  <option value="">{opciones.length ? "Añadir del catálogo…" : "Sin opciones"}</option>
                  {opciones.map((o) => <option key={o.id} value={o.id}>{etiquetaOpcion(o, sugeridas)}</option>)}
                </select>
              </div>
              <ol className="mt-2 space-y-1">
                {entradas.length === 0 ? (
                  <li className="rounded-lg border border-amber-400/25 bg-amber-500/10 p-2 text-[11px] text-amber-100">Sin candidatos. Añade uno del catálogo.</li>
                ) : entradas.map((entrada, j) => (
                  <li key={entrada.id} draggable={!soloLectura} onDragStart={(e) => e.dataTransfer.setData("text/plain", `${fila.tipo}:${fila.clave}:${j}`)} onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const [tipo, clave, desdeTexto] = e.dataTransfer.getData("text/plain").split(":");
                      const desde = Number(desdeTexto);
                      if (tipo === fila.tipo && clave === fila.clave && Number.isInteger(desde)) cambiar(i, (f) => ({ ...f, cadena: moverEnCadena(f.cadena, desde, j) }));
                    }}
                    className="flex cursor-grab items-start gap-2 rounded-lg border border-white/5 bg-white/[0.03] p-2">
                    <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-white/30" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="shrink-0 text-[10px] uppercase tracking-wide text-emerald-300">{etiquetaPeldano(entrada.peldano)}</span>
                        <span className="truncate text-xs text-white/85">{j + 1}. {entrada.nombre}</span>
                      </div>
                      <p className="text-[11px] text-white/50">{entrada.motivo}</p>
                      {entrada.id === "cloudroom" ? (
                        <p className="mt-1 text-[11px] text-cyan-100/80">{estadoCloudroom(avisos)}</p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button type="button" className={BOTON} aria-label={`Subir ${entrada.nombre}`} disabled={soloLectura || j === 0} onClick={() => cambiar(i, (f) => ({ ...f, cadena: moverEnCadena(f.cadena, j, j - 1) }))}>↑</button>
                      <button type="button" className={BOTON} aria-label={`Bajar ${entrada.nombre}`} disabled={soloLectura || j === entradas.length - 1} onClick={() => cambiar(i, (f) => ({ ...f, cadena: moverEnCadena(f.cadena, j, j + 1) }))}>↓</button>
                      <button type="button" className={BOTON} aria-label={`Quitar ${entrada.nombre}`} disabled={soloLectura} onClick={() => cambiar(i, (f) => ({ ...f, cadena: quitarDeCadena(f.cadena, entrada.id) }))}><Trash2 className="h-3.5 w-3.5" aria-hidden /></button>
                    </div>
                  </li>
                ))}
              </ol>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

