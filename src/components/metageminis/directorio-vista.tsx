"use client";

/*
 * DirectorioVista — el directorio de sitios de MetaGeminis (2026-10-10).
 * Dónde buscar donantes, voluntarios, fondos, convocatorias, redes de agentes y canales de difusión, con la verdad
 * de cada ficha: qué dicen sus normas de los agentes y de la IA, quién da el último paso, cuándo se verificó y cuánto
 * se leyó de verdad. Filtros por texto, categoría, estado, prioridad y rama; «Abrir» lleva al sitio.
 */

import { useMemo, useState } from "react";
import { ExternalLink, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { direccionSegura } from "@/lib/metageminis/cola";
import {
  ETIQUETA_AGENTES,
  ETIQUETA_CATEGORIA,
  ETIQUETA_ESTADO,
  ETIQUETA_PRIORIDAD,
  filtrarDirectorio,
  quienActua,
  resumirDirectorio,
  type FiltrosDirectorio,
} from "@/lib/metageminis/consulta";
import { DIRECTORIO, FECHA_VERIFICACION, type CategoriaSitio, type EstadoSitio, type NivelVerificacion, type SitioDirectorio } from "@/lib/metageminis/directorio";
import { RAMAS, nombreRama, type RamaId } from "@/lib/metageminis/tipos";

const ETIQUETA_VERIFICACION: Record<NivelVerificacion, string> = {
  "pagina-leida": "Página leída",
  "referencia-secundaria": "Solo referencias de terceros",
  busqueda: "Solo vista en buscador",
};

const ETIQUETA_IA: Record<SitioDirectorio["ia_en_texto"], string> = {
  permitida: "Texto de IA permitido",
  "con-declaracion": "Texto de IA si se declara",
  "no-aceptada": "No acepta texto de IA",
  "sin-verificar": "Norma sobre IA sin leer",
};

const ETIQUETA_QUIEN = { agente: "Puede enviar el agente", alex: "Lo envía una persona", nadie: "Sin acción", "solo-lee": "Solo lectura" } as const;

const COLOR_QUIEN = {
  agente: "border-emerald-400/40 text-emerald-200",
  alex: "border-cyan-400/40 text-cyan-200",
  nadie: "border-white/20 text-white/45",
  "solo-lee": "border-white/20 text-white/60",
} as const;

const COLOR_PRIORIDAD: Record<number, string> = {
  1: "border-amber-400/50 text-amber-200",
  2: "border-cyan-400/40 text-cyan-200",
  3: "border-white/25 text-white/70",
  4: "border-white/15 text-white/50",
  5: "border-white/10 text-white/40",
};

function diasHasta(fecha: string, hoy: Date): number {
  const [a, m, d] = fecha.split("-").map(Number);
  const t0 = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate());
  return Math.round((Date.UTC(a, m - 1, d) - t0) / 86_400_000);
}

function textoPlazo(fecha: string, hoy: Date): string {
  const n = diasHasta(fecha, hoy);
  if (n < 0) return `venció el ${fecha}`;
  if (n === 0) return "vence hoy";
  return `vence el ${fecha} (${n} ${n === 1 ? "día" : "días"})`;
}

function Ficha({ s, hoy }: { s: SitioDirectorio; hoy: Date }) {
  const quien = quienActua(s);
  const enlace = direccionSegura(s.url);
  const fuente = direccionSegura(s.fuente);
  return (
    <li data-testid="sitio" data-id={s.id} className="space-y-2 rounded-xl border border-white/10 bg-black/20 p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <h5 className="min-w-0 flex-1 truncate text-sm font-medium text-white">{s.nombre}</h5>
        <Badge variant="outline" className={cn("text-[10px]", COLOR_PRIORIDAD[s.prioridad])}>
          {ETIQUETA_PRIORIDAD[s.prioridad]}
        </Badge>
        <Badge variant="outline" className="text-[10px] text-white/70">
          {ETIQUETA_ESTADO[s.estado]}
        </Badge>
      </div>
      <p className="text-xs text-white/70">{s.que_es}</p>
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <Badge variant="outline" className="text-[10px] text-white/60">
          {ETIQUETA_CATEGORIA[s.categoria]}
        </Badge>
        <Badge variant="outline" className={cn("text-[10px]", COLOR_QUIEN[quien])}>
          {ETIQUETA_QUIEN[quien]}
        </Badge>
        <Badge variant="outline" className={cn("text-[10px]", s.ia_en_texto === "no-aceptada" ? "border-rose-400/40 text-rose-200" : "text-white/60")}>
          {ETIQUETA_IA[s.ia_en_texto]}
        </Badge>
        {s.vence ? (
          <Badge variant="outline" className="border-amber-400/40 text-[10px] text-amber-200">
            {textoPlazo(s.vence, hoy)}
          </Badge>
        ) : null}
      </div>
      <details className="group rounded-lg border border-white/10 bg-black/20 p-2 text-xs">
        <summary className="cursor-pointer list-none text-white/70 [&::-webkit-details-marker]:hidden">Ver detalle y normas</summary>
        <dl className="mt-2 space-y-1.5 text-white/75">
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-white/40">Para qué sirve a StarSeed</dt>
            <dd>{s.utilidad}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-white/40">Cómo se llega ({s.acceso})</dt>
            <dd>{s.api_o_formulario}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-white/40">Agentes · {ETIQUETA_AGENTES[s.agentes]}</dt>
            <dd>{s.reglas}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-white/40">Coste</dt>
            <dd>
              {s.coste.replace(/-/g, " ")}
              {s.coste_nota ? ` · ${s.coste_nota}` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-white/40">Lo mínimo que se pide a Alex</dt>
            <dd>{s.pasos_alex}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-white/40">Ramas</dt>
            <dd>{s.ramas.map((r) => nombreRama(r)).join(" · ")}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-white/40">Verificación</dt>
            <dd>
              {ETIQUETA_VERIFICACION[s.verificacion]} · {s.verificado}
              {fuente ? (
                <>
                  {" · "}
                  <a href={fuente} target="_blank" rel="noopener noreferrer" className="text-cyan-200 underline-offset-2 hover:underline">
                    fuente
                  </a>
                </>
              ) : null}
            </dd>
          </div>
        </dl>
      </details>
      {enlace ? (
        <a
          href={enlace}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-cyan-200 underline-offset-2 hover:underline"
          aria-label={`Abrir ${s.nombre} en una pestaña nueva`}
        >
          Abrir <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
      ) : null}
    </li>
  );
}

export function DirectorioVista({ base = DIRECTORIO, hoy = new Date() }: { base?: readonly SitioDirectorio[]; hoy?: Date }) {
  const [texto, setTexto] = useState("");
  const [categoria, setCategoria] = useState<CategoriaSitio | "todas">("todas");
  const [estado, setEstado] = useState<EstadoSitio | "todos">("todos");
  const [prioridadMax, setPrioridadMax] = useState(5);
  const [rama, setRama] = useState<RamaId | "todas">("todas");
  const [soloAgente, setSoloAgente] = useState(false);

  const filtros: FiltrosDirectorio = { texto, categoria, estado, prioridadMax, rama, soloAgente };
  const lista = useMemo(() => filtrarDirectorio(filtros, base), [texto, categoria, estado, prioridadMax, rama, soloAgente, base]); // eslint-disable-line react-hooks/exhaustive-deps
  const resumen = useMemo(() => resumirDirectorio(base), [base]);
  const categorias = Object.keys(ETIQUETA_CATEGORIA) as CategoriaSitio[];
  const selector = "cursor-pointer rounded-lg border border-white/15 bg-black/30 p-2 text-xs";

  return (
    <div className="space-y-3" data-testid="directorio-vista">
      <p className="text-xs text-white/60" data-testid="directorio-resumen">
        {resumen.total} sitios verificados el {FECHA_VERIFICACION}: {resumen.paraHoy} para hoy, {resumen.puedeEnviarElAgente} donde el agente puede enviar tras tu
        aprobación, {resumen.soloAlex} que envía una persona y {resumen.soloLectura} de solo lectura. Cada ficha dice cuánto se leyó de verdad; las que solo se
        conocen por terceros no se usan para enviar.
      </p>
      <div className="flex flex-wrap gap-2">
        <label className="relative min-w-[12rem] flex-1">
          <span className="sr-only">Buscar en el directorio</span>
          <Search className="pointer-events-none absolute left-2 top-2.5 h-3.5 w-3.5 text-white/40" aria-hidden />
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Buscar: donaciones, fondos, agentes…"
            className="w-full rounded-lg border border-white/15 bg-black/30 py-2 pl-7 pr-2 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
          />
        </label>
        <select aria-label="Categoría" className={selector} value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaSitio | "todas")}>
          <option value="todas">Todas las categorías</option>
          {categorias.map((c) => (
            <option key={c} value={c}>
              {ETIQUETA_CATEGORIA[c]}
            </option>
          ))}
        </select>
        <select aria-label="Estado" className={selector} value={estado} onChange={(e) => setEstado(e.target.value as EstadoSitio | "todos")}>
          <option value="todos">Cualquier estado</option>
          {(Object.keys(ETIQUETA_ESTADO) as EstadoSitio[]).map((e) => (
            <option key={e} value={e}>
              {ETIQUETA_ESTADO[e]}
            </option>
          ))}
        </select>
        <select aria-label="Prioridad" className={selector} value={prioridadMax} onChange={(e) => setPrioridadMax(Number(e.target.value))}>
          <option value={5}>Todas las prioridades</option>
          <option value={1}>Solo «Hoy»</option>
          <option value={2}>Hasta «Esta semana»</option>
          <option value={3}>Hasta «Este mes»</option>
        </select>
        <select aria-label="Rama" className={selector} value={rama} onChange={(e) => setRama(e.target.value as RamaId | "todas")}>
          <option value="todas">Todas las ramas</option>
          {RAMAS.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nombre}
            </option>
          ))}
        </select>
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-white/70">
          <input type="checkbox" checked={soloAgente} onChange={(e) => setSoloAgente(e.target.checked)} className="cursor-pointer" />
          Solo donde el agente puede enviar
        </label>
      </div>
      <p className="text-[11px] text-white/45" aria-live="polite" data-testid="directorio-cuenta">
        {lista.length} {lista.length === 1 ? "sitio" : "sitios"} con estos filtros
      </p>
      {lista.length === 0 ? (
        <p className="rounded-xl border border-white/10 p-3 text-xs text-white/60">Ningún sitio coincide. Prueba a quitar algún filtro.</p>
      ) : (
        <ul className="grid gap-2 lg:grid-cols-2">
          {lista.map((s) => (
            <Ficha key={s.id} s={s} hoy={hoy} />
          ))}
        </ul>
      )}
    </div>
  );
}
