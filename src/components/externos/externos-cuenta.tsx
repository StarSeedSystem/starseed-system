"use client";

// ══════════════════════════════════════════════════════════════
// ExternosCuenta — vista global de TODOS los vínculos de la cuenta (E6A)
// ──────────────────────────────────────────────────────────────
// Agrupa por ámbito, filtra por estado (activo/caducado/revocado), avisa de
// caducidades < 24 h, permite revocar en bloque (con confirmación del número)
// y monta el panel «Nuevo vínculo de toda la cuenta» reutilizando PanelExternos.
// Nunca muestra un token completo: solo prefijos `ssk_xxxxx…` y ejemplos curl.
// ══════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckSquare,
  Link2,
  RefreshCw,
  Trash2,
} from "lucide-react";
import type { AmbitoTipo, Vinculo } from "@/lib/externos/tipos";
import {
  listarVinculos,
  revocarVinculo,
  resumenPermisos,
  ejemploCurl,
  urlApiV1,
} from "@/lib/externos/cliente";
import {
  activosPorAmbito,
  caducaEnMenosDeMs,
  estadoVinculo,
  HORAS_24,
  ETIQUETAS_AMBITO,
  type EstadoVinculo,
} from "@/lib/externos/cuenta";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { PanelExternos } from "@/components/externos/panel-externos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type FiltroEstado = "todos" | EstadoVinculo;

const AMBITOS_ORDEN: AmbitoTipo[] = [
  "cuenta", "chat", "personalidad", "agente",
  "cerebro", "carpeta", "memoria", "perfil",
];

/** Etiqueta legible del estado para chips y filtros. */
const ETIQUETA_ESTADO: Record<FiltroEstado, string> = {
  todos: "Todos",
  activo: "Activos",
  caducado: "Caducados",
  revocado: "Revocados",
};

/** Valor del filtro de ámbito: "todos" o un ámbito concreto. */
type FiltroAmbito = "todos" | AmbitoTipo;

export function ExternosCuenta() {
  const [vinculos, setVinculos] = useState<Vinculo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string>("");
  const [fEstado, setFEstado] = useState<FiltroEstado>("todos");
  const [fAmbito, setFAmbito] = useState<FiltroAmbito>("todos");
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [revocando, setRevocando] = useState(false);
  const confirm = useConfirm();

  // La API de vínculos devuelve TODOS los del dueño (ignora el filtro de ámbito):
  // se consulta una sola vez desde aquí para agrupar localmente por ámbito.
  const recargar = useCallback(async () => {
    setCargando(true);
    setError("");
    const r = await listarVinculos({ tipo: "cuenta", id: "cuenta", nombre: "Toda la cuenta" });
    setVinculos(r.vinculos);
    setError(r.error ?? "");
    setCargando(false);
  }, []);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  const togglear = useCallback((id: string) => {
    setSeleccion((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const revocarSeleccion = useCallback(async () => {
    if (seleccion.size === 0) return;
    const n = seleccion.size;
    const ok = await confirm({
      title: `Revocar ${n} vínculo${n === 1 ? "" : "s"}`,
      description: `Se revocarán ${n} vínculos de acceso externo. Los conectores que los usen dejarán de funcionar de inmediato.`,
    });
    if (!ok) return;
    setRevocando(true);
    await Promise.all([...seleccion].map((id) => revocarVinculo(id)));
    setRevocando(false);
    setSeleccion(new Set());
    void recargar();
  }, [seleccion, confirm, recargar]);

  const activos = useMemo(() => activosPorAmbito(vinculos), [vinculos]);

  const filtrados = useMemo(() => {
    return vinculos.filter((v) => {
      if (fEstado !== "todos" && estadoVinculo(v) !== fEstado) return false;
      if (fAmbito !== "todos" && v.ambito_tipo !== fAmbito) return false;
      return true;
    });
  }, [vinculos, fEstado, fAmbito]);

  const porCaducar = useMemo(
    () => vinculos.filter((v) => caducaEnMenosDeMs(v, HORAS_24)),
    [vinculos],
  );

  const seleccionables = useMemo(
    () => filtrados.filter((v) => estadoVinculo(v) === "activo"),
    [filtrados],
  );

  return (
    <div className="space-y-4" data-testid="externos-cuenta">
      {/* Encabezado: totales + botón recargar */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">Externos y APIs</p>
          <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[11px] text-white/70">
            {vinculos.length} vínculo{vinculos.length === 1 ? "" : "s"}
          </span>
        </div>
        <Button variant="ghost" size="icon" onClick={() => void recargar()} aria-label="Recargar vínculos">
          <RefreshCw className={cargando ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
        </Button>
      </div>

      {/* Tarjetas por ámbito (número de activos) + aviso <24h */}
      {error ? (
        <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</p>
      ) : null}

      <TarjetasAmbito activos={activos} />

      {porCaducar.length > 0 ? (
        <AvisoCaducidad n={porCaducar.length} />
      ) : null}

      {/* Filtros */}
      <Filtros fEstado={fEstado} fAmbito={fAmbito} onEstado={setFEstado} onAmbito={setFAmbito} />

      {/* Acciones de selección */}
      {seleccionables.length > 0 ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/30 px-4 py-2.5">
          <p className="text-[11px] text-white/70">
            {seleccion.size === 0 ? "Selecciona vínculos activos para revocar en bloque." : `${seleccion.size} seleccionado${seleccion.size === 1 ? "" : "s"}.`}
          </p>
          <Button
            size="sm"
            variant="destructive"
            disabled={seleccion.size === 0 || revocando}
            onClick={() => void revocarSeleccion()}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {revocando ? "Revocando…" : "Revocar seleccionados"}
          </Button>
        </div>
      ) : null}

      {/* Lista completa filtrada */}
      <ListaVinculos
        vinculos={filtrados}
        seleccion={seleccion}
        onToggle={togglear}
        cargando={cargando}
      />

      {/* Nuevo vínculo de toda la cuenta (reutiliza el panel existente) */}
      <PanelExternos
        ambito={{ tipo: "cuenta", id: "cuenta", nombre: "Toda la cuenta" }}
      />

      {/* Ejemplos de uso de la API v1 (sin token completo, solo prefijos) */}
      <BloqueCurl prefijos={vinculos.map((v) => v.prefijo)} />
    </div>
  );
}

/** Tarjetas por ámbito con el número de vínculos activos en cada uno. */
function TarjetasAmbito({ activos }: { activos: Record<AmbitoTipo, number> }) {
  const total = AMBITOS_ORDEN.reduce((n, a) => n + activos[a], 0);
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
      {AMBITOS_ORDEN.map((a) => (
        <div key={a} className="rounded-xl border border-white/10 bg-black/30 p-4 backdrop-blur">
          <p className="text-2xl font-bold">{activos[a]}</p>
          <p className="text-[11px] text-white/70">{ETIQUETAS_AMBITO[a]}</p>
        </div>
      ))}
      <div className="rounded-xl border border-white/10 bg-black/30 p-4 backdrop-blur col-span-2 sm:col-span-4">
        <p className="text-[11px] text-white/70">
          {total} vínculo{total === 1 ? "" : "s"} activo{total === 1 ? "" : "s"} en toda la cuenta.
        </p>
      </div>
    </div>
  );
}

/** Aviso destacado cuando hay vínculos que caducan en menos de 24 horas. */
function AvisoCaducidad({ n }: { n: number }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3">
      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
      <p className="text-sm text-amber-200">
        {n} vínculo{n === 1 ? "" : "s"} caduca{n === 1 ? "" : "n"} en menos de 24 horas.
        Renuévalo{n === 1 ? "" : "s"} o revócalo{n === 1 ? "" : "s"} antes de que caduque{n === 1 ? "" : "n"}.
      </p>
    </div>
  );
}

/** Filtros por estado y por ámbito (chips seleccionables). */
function Filtros({
  fEstado,
  fAmbito,
  onEstado,
  onAmbito,
}: {
  fEstado: FiltroEstado;
  fAmbito: FiltroAmbito;
  onEstado: (v: FiltroEstado) => void;
  onAmbito: (v: FiltroAmbito) => void;
}) {
  const estados: FiltroEstado[] = ["todos", "activo", "caducado", "revocado"];
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {estados.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => onEstado(e)}
            className={
              "cursor-pointer rounded-full border px-2 py-0.5 text-[11px] " +
              (fEstado === e ? "border-primary/50 bg-primary/20 text-white" : "border-white/10 text-white/70")
            }
          >
            {ETIQUETA_ESTADO[e]}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => onAmbito("todos")}
          className={
            "cursor-pointer rounded-full border px-2 py-0.5 text-[11px] " +
            (fAmbito === "todos" ? "border-primary/50 bg-primary/20 text-white" : "border-white/10 text-white/70")
          }
        >
          Todos los ámbitos
        </button>
        {AMBITOS_ORDEN.map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => onAmbito(a)}
            className={
              "cursor-pointer rounded-full border px-2 py-0.5 text-[11px] " +
              (fAmbito === a ? "border-primary/50 bg-primary/20 text-white" : "border-white/10 text-white/70")
            }
          >
            {ETIQUETAS_AMBITO[a]}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Lista completa de vínculos filtrados con casilla de selección (solo activos). */
function ListaVinculos({
  vinculos,
  seleccion,
  onToggle,
  cargando,
}: {
  vinculos: Vinculo[];
  seleccion: Set<string>;
  onToggle: (id: string) => void;
  cargando: boolean;
}) {
  if (cargando) {
    return <p className="text-sm text-white/70">Cargando vínculos…</p>;
  }
  if (vinculos.length === 0) {
    return <p className="text-sm text-white/70">Sin vínculos para este filtro.</p>;
  }
  return (
    <ul className="space-y-2">
      {vinculos.map((v) => (
        <FilaVinculo
          key={v.id}
          vinculo={v}
          marcado={seleccion.has(v.id)}
          onToggle={onToggle}
        />
      ))}
    </ul>
  );
}

/** Fila de un vínculo: prefijo, permisos, caducidad y casilla si está activo. */
function FilaVinculo({
  vinculo,
  marcado,
  onToggle,
}: {
  vinculo: Vinculo;
  marcado: boolean;
  onToggle: (id: string) => void;
}) {
  const estado = estadoVinculo(vinculo);
  const activo = estado === "activo";
  const permisos = resumenPermisos(vinculo.permisos);
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/30 p-3 backdrop-blur">
      <div className="flex min-w-0 items-center gap-2">
        {activo ? (
          <button
            type="button"
            onClick={() => onToggle(vinculo.id)}
            aria-label={`Seleccionar ${vinculo.nombre || vinculo.prefijo}`}
            className="cursor-pointer text-white/70 hover:text-white"
          >
            <CheckSquare className={marcado ? "h-4 w-4 text-primary" : "h-4 w-4"} />
          </button>
        ) : null}
        <code className="truncate font-mono text-xs">{`ssk_${vinculo.prefijo}…`}</code>
        {vinculo.nombre ? <span className="truncate text-xs text-white/70">{vinculo.nombre}</span> : null}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {permisos.map((p) => (
          <Badge key={p} variant="secondary">{p}</Badge>
        ))}
        <Badge variant="outline">{ETIQUETAS_AMBITO[vinculo.ambito_tipo]}</Badge>
        <Badge variant="outline">{ETIQUETA_ESTADO[estado]}</Badge>
      </div>
    </li>
  );
}

/** Ejemplos curl de la API v1, con prefijo y `••••` (nunca el token completo). */
function BloqueCurl({ prefijos }: { prefijos: string[] }) {
  const ejemplo = prefijos[0] ?? "xxxxxxxx";
  const texto = ejemploCurl(ejemplo, { tipo: "cuenta", id: "cuenta", nombre: "Toda la cuenta" });
  return (
    <div className="rounded-xl border border-white/10 bg-black/30 p-4 backdrop-blur">
      <p className="mb-2 text-xs font-semibold">Ejemplo de uso (API v1)</p>
      <p className="mb-2 text-[11px] text-white/70">
        <code className="text-xs">{urlApiV1()}</code> · sustituye el prefijo y el token con el tuyo
        (solo se muestra el prefijo, nunca el token completo).
      </p>
      <pre className="overflow-x-auto rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-[11px] whitespace-pre-wrap">
        {texto}
      </pre>
    </div>
  );
}