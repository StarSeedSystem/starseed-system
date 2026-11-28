"use client";

// Panel de personalización ilimitada de una vista de Ramas 4D (MV1125J).
// Guarda por persona y por grupo, y comparte solo la configuración (nunca datos
// privados). Toda la estética usa tokens del tema activo; nada de colores sueltos.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Copy, RotateCcw, Save, Share2, Sparkles, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CAPAS_VISTA, COLORES_TOKEN, FORMAS_VISTA, ICONOS_VISTA, PERSPECTIVAS,
  PLANTILLAS, TIPOS_VISTA, crearAlmacenNavegador, crearVista, guardarVista, leerVistas,
  compartirVista, comoVariacionPublica, type AlcanceCompartir, type AlmacenVistas,
  type VistaGuardada,
} from "@/lib/ramas4d/vistas";

const CLASE_SELECT = "h-9 w-full min-w-0 cursor-pointer truncate rounded-md border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function idNuevo(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `vista-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function Seccion({ titulo, children, className }: { titulo: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("min-w-0 rounded-lg border border-border/70 bg-background/40 p-3", className)}>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Deslizador({ etiqueta, valor, min, max, paso, onCambio }: {
  etiqueta: string; valor: number; min: number; max: number; paso: number; onCambio: (v: number) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
        <span className="min-w-0 truncate">{etiqueta}</span>
        <span className="shrink-0 tabular-nums text-foreground">{valor.toFixed(2)}</span>
      </span>
      <input type="range" min={min} max={max} step={paso} value={valor} onChange={(e) => onCambio(Number(e.target.value))}
        className="w-full cursor-pointer accent-[var(--primary)]" />
    </label>
  );
}

function Interruptor({ etiqueta, activo, onCambio }: { etiqueta: string; activo: boolean; onCambio: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={activo} onClick={() => onCambio(!activo)}
      className="flex w-full cursor-pointer items-center justify-between gap-3 text-left text-sm text-foreground">
      <span className="min-w-0">{etiqueta}</span>
      <span className={cn("relative h-5 w-9 shrink-0 rounded-full border border-border transition-colors duration-200", activo ? "bg-primary" : "bg-muted")}>
        <span className={cn("absolute top-0.5 h-3.5 w-3.5 rounded-full bg-background shadow-sm transition-transform duration-200", activo ? "translate-x-[18px]" : "translate-x-0.5")} />
      </span>
    </button>
  );
}

function FilaColor({ etiqueta, valor, onCambio }: { etiqueta: string; valor: string; onCambio: (v: string) => void }) {
  const esToken = valor.startsWith("var(--");
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="min-w-0 truncate text-sm capitalize text-muted-foreground">{etiqueta}</span>
      <div className="flex shrink-0 items-center gap-1.5">
        <select aria-label={`Color de ${etiqueta}`} value={esToken ? valor : "personalizado"}
          onChange={(e) => onCambio(e.target.value === "personalizado" ? "#7c3aed" : e.target.value)}
          className={cn(CLASE_SELECT, "w-28")}>
          {COLORES_TOKEN.map((t) => <option key={t} value={`var(--${t})`}>{t}</option>)}
          <option value="personalizado">Personalizado</option>
        </select>
        <input type="color" aria-label={`Color personalizado de ${etiqueta}`} value={esToken ? "#000000" : valor}
          disabled={esToken} onChange={(e) => onCambio(e.target.value)}
          className="h-8 w-8 cursor-pointer rounded border border-input bg-transparent p-0.5 disabled:cursor-not-allowed disabled:opacity-40" />
      </div>
    </div>
  );
}

export interface PersonalizarVistaProps {
  dueno: string;
  vistaInicial?: VistaGuardada;
  onGuardada?: (vista: VistaGuardada) => void;
}

export default function PersonalizarVista({ dueno, vistaInicial, onGuardada }: PersonalizarVistaProps) {
  const [vista, setVista] = useState<VistaGuardada>(() => vistaInicial ?? crearVista(dueno, Date.now(), idNuevo, { nombre: "Mi vista" }));
  const [guardadas, setGuardadas] = useState<VistaGuardada[]>([]);
  const [alcance, setAlcance] = useState<AlcanceCompartir>("privado");
  const [mensaje, setMensaje] = useState<string | null>(null);
  const almacenRef = useRef<AlmacenVistas | null>(null);

  useEffect(() => {
    const almacen = crearAlmacenNavegador();
    almacenRef.current = almacen;
    const lista = leerVistas(almacen, dueno);
    setGuardadas(lista);
    if (!vistaInicial && lista[0]) setVista(lista[0]);
  }, [dueno, vistaInicial]);

  const cambiar = (parcial: Partial<VistaGuardada>) => setVista((v) => ({ ...v, ...parcial }));
  const cambiarColor = (rol: "base" | "nodo" | "arista" | "senal", valor: string) => setVista((v) => {
    const personalizados = valor.startsWith("#") && !v.colores.personalizados.includes(valor)
      ? [...v.colores.personalizados, valor].slice(0, 12) : v.colores.personalizados;
    return { ...v, colores: { ...v.colores, [rol]: valor, personalizados } };
  });
  const alternarCapa = (capa: string) => setVista((v) => ({
    ...v, capas: v.capas.includes(capa) ? v.capas.filter((c) => c !== capa) : [...v.capas, capa],
  }));

  function alGuardar() {
    const guardada = guardarVista(almacenRef.current, vista);
    if (!guardada) { setMensaje("No se pudo guardar: este dispositivo no tiene almacén disponible."); return; }
    setVista(guardada);
    setGuardadas(leerVistas(almacenRef.current, dueno));
    onGuardada?.(guardada);
    setMensaje(`Vista «${guardada.nombre}» guardada para ${guardada.grupo ? `el grupo ${guardada.grupo}` : "ti"}.`);
  }

  function alCompartir() {
    const resultado = compartirVista(vista, alcance);
    setMensaje(resultado.ok
      ? "Configuración lista para compartir: solo viaja la vista, nunca tus datos."
      : resultado.motivos.join(" · "));
  }

  function alExportar() {
    const variacion = comoVariacionPublica(vista);
    setMensaje(variacion
      ? `Variación pública preparada como ${variacion.clave}.`
      : "Marca la vista como pública y ponle nombre para exportarla como variación.");
  }

  async function alCopiar() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(compartirVista(vista, alcance).configuracion, null, 2));
      setMensaje("Configuración copiada al portapapeles.");
    } catch {
      setMensaje("No se pudo copiar en este medio; usa el archivo de variación pública.");
    }
  }

  return (
    <div className="flex h-full w-full min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card/85 text-card-foreground backdrop-blur-md">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">Personalizar vista</h2>
          <p className="text-sm text-muted-foreground">Plantilla, capas, formas, física, fondo, sonido y etiquetas, sin límite.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setVista(vistaInicial ?? crearVista(dueno, Date.now(), idNuevo))}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-input px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground">
            <RotateCcw className="h-4 w-4" /> Restablecer
          </button>
          <button type="button" onClick={alGuardar}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            <Save className="h-4 w-4" /> Guardar
          </button>
        </div>
      </header>
      <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 md:grid-cols-2 xl:grid-cols-3">
        <Seccion titulo="Identidad y alcance">
          <label className="block min-w-0 space-y-1 text-sm">
            <span className="text-muted-foreground">Nombre</span>
            <input value={vista.nombre} maxLength={80} onChange={(e) => cambiar({ nombre: e.target.value })}
              placeholder="Mi galaxia" className={CLASE_SELECT} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block min-w-0 space-y-1 text-sm">
              <span className="text-muted-foreground">Plantilla</span>
              <select value={vista.plantilla} onChange={(e) => cambiar({ plantilla: e.target.value })} className={CLASE_SELECT}>
                {PLANTILLAS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <label className="block min-w-0 space-y-1 text-sm">
              <span className="text-muted-foreground">Perspectiva</span>
              <select value={vista.perspectiva} onChange={(e) => cambiar({ perspectiva: e.target.value })} className={CLASE_SELECT}>
                {PERSPECTIVAS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
          </div>
          <label className="block min-w-0 space-y-1 text-sm">
            <span className="text-muted-foreground">Grupo (opcional)</span>
            <input value={vista.grupo ?? ""} maxLength={80} placeholder="Mi sangha"
              onChange={(e) => cambiar({ grupo: e.target.value.trim() || null })} className={CLASE_SELECT} />
          </label>
          <Interruptor etiqueta="Vista pública" activo={vista.publica} onCambio={(v) => cambiar({ publica: v })} />
        </Seccion>

        <Seccion titulo="Capas">
          <div className="flex flex-wrap gap-1.5">
            {CAPAS_VISTA.map((capa) => {
              const activa = vista.capas.includes(capa);
              return (
                <button key={capa} type="button" aria-pressed={activa} onClick={() => alternarCapa(capa)}
                  className={cn("cursor-pointer rounded-full border px-2.5 py-1 text-xs transition-colors duration-150",
                    activa ? "border-primary bg-primary/15 text-foreground" : "border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground")}>
                  {capa}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">Se encienden y apagan sin ocultar la configuración.</p>
        </Seccion>

        <Seccion titulo="Formas e iconos por tipo" className="md:col-span-2">
          <div className="grid max-h-64 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
            {TIPOS_VISTA.map((tipo) => {
              const forma = vista.formas[tipo] ?? { forma: "planeta", icono: "punto" };
              const cambiarForma = (parcial: { forma?: string; icono?: string }) =>
                cambiar({ formas: { ...vista.formas, [tipo]: { ...forma, ...parcial } } });
              return (
                <div key={tipo} className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1.1fr)] items-center gap-1.5">
                  <span className="truncate text-xs text-muted-foreground">{tipo}</span>
                  <select aria-label={`Forma de ${tipo}`} value={forma.forma} onChange={(e) => cambiarForma({ forma: e.target.value })} className={CLASE_SELECT}>
                    {FORMAS_VISTA.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                  <select aria-label={`Icono de ${tipo}`} value={forma.icono} onChange={(e) => cambiarForma({ icono: e.target.value })} className={CLASE_SELECT}>
                    {ICONOS_VISTA.map((i) => <option key={i} value={i}>{i}</option>)}
                  </select>
                </div>
              );
            })}
          </div>
        </Seccion>

        <Seccion titulo="Colores">
          {(["nodo", "arista", "senal"] as const).map((rol) => (
            <FilaColor key={rol} etiqueta={rol} valor={vista.colores[rol]} onCambio={(v) => cambiarColor(rol, v)} />
          ))}
          <div className="flex flex-wrap gap-1.5">
            {COLORES_TOKEN.map((token) => (
              <button key={token} type="button" title={`Token ${token}`} aria-label={`Usar token ${token}`}
                onClick={() => cambiarColor("nodo", `var(--${token})`)}
                className="h-7 w-7 cursor-pointer rounded-full border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                style={{ background: `var(--${token})` }} />
            ))}
          </div>
        </Seccion>

        <Seccion titulo="Física">
          <Deslizador etiqueta="Gravedad" valor={vista.fisica.gravedad} min={0} max={2} paso={0.05}
            onCambio={(v) => cambiar({ fisica: { ...vista.fisica, gravedad: v } })} />
          <Deslizador etiqueta="Distancia" valor={vista.fisica.distancia} min={0.2} max={4} paso={0.1}
            onCambio={(v) => cambiar({ fisica: { ...vista.fisica, distancia: v } })} />
          <Deslizador etiqueta="Velocidad" valor={vista.fisica.velocidad} min={0.1} max={4} paso={0.1}
            onCambio={(v) => cambiar({ fisica: { ...vista.fisica, velocidad: v } })} />
        </Seccion>

        <Seccion titulo="Fondo">
          <label className="block min-w-0 space-y-1 text-sm">
            <span className="text-muted-foreground">Estilo</span>
            <select value={vista.fondo.tipo} onChange={(e) => cambiar({ fondo: { ...vista.fondo, tipo: e.target.value as "tema" | "color" | "degradado" } })} className={CLASE_SELECT}>
              <option value="tema">Tema activo</option>
              <option value="color">Color</option>
              <option value="degradado">Degradado</option>
            </select>
          </label>
          <FilaColor etiqueta="Color" valor={vista.fondo.valor} onCambio={(v) => cambiar({ fondo: { ...vista.fondo, valor: v } })} />
          <Deslizador etiqueta="Opacidad" valor={vista.fondo.opacidad} min={0} max={1} paso={0.05}
            onCambio={(v) => cambiar({ fondo: { ...vista.fondo, opacidad: v } })} />
        </Seccion>

        <Seccion titulo="Sonido espacial">
          <Interruptor etiqueta="Sonido activo" activo={vista.sonido.activo}
            onCambio={(v) => cambiar({ sonido: { ...vista.sonido, activo: v } })} />
          <Deslizador etiqueta="Intensidad" valor={vista.sonido.intensidad} min={0} max={1} paso={0.05}
            onCambio={(v) => cambiar({ sonido: { ...vista.sonido, intensidad: v } })} />
        </Seccion>

        <Seccion titulo="Etiquetas">
          <label className="block min-w-0 space-y-1 text-sm">
            <span className="text-muted-foreground">Diseño</span>
            <select value={vista.etiquetas.diseno}
              onChange={(e) => cambiar({ etiquetas: { ...vista.etiquetas, diseno: e.target.value as VistaGuardada["etiquetas"]["diseno"] } })}
              className={CLASE_SELECT}>
              <option value="minimo">Mínimo</option>
              <option value="compacto">Compacto</option>
              <option value="detallado">Detallado</option>
            </select>
          </label>
          <Deslizador etiqueta="Tamaño" valor={vista.etiquetas.tamano} min={0.75} max={2} paso={0.05}
            onCambio={(v) => cambiar({ etiquetas: { ...vista.etiquetas, tamano: v } })} />
          <Interruptor etiqueta="Siempre visibles" activo={vista.etiquetas.siempre}
            onCambio={(v) => cambiar({ etiquetas: { ...vista.etiquetas, siempre: v } })} />
        </Seccion>
      </div>
      <footer className="space-y-3 border-t border-border p-4">
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1 space-y-1 text-sm">
            <span className="text-muted-foreground">Compartir con</span>
            <select value={alcance} onChange={(e) => setAlcance(e.target.value as AlcanceCompartir)} className={CLASE_SELECT}>
              <option value="privado">Solo yo</option>
              <option value="contactos">Mis contactos</option>
              <option value="grupo">Mi grupo</option>
              <option value="publico">Público</option>
            </select>
          </label>
          <button type="button" onClick={alCompartir}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-input px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground">
            <Share2 className="h-4 w-4" /> Compartir
          </button>
          <button type="button" onClick={alCopiar}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-input px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground">
            <Copy className="h-4 w-4" /> Copiar
          </button>
          <button type="button" onClick={alExportar}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-input px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground">
            <Sparkles className="h-4 w-4" /> Variación pública
          </button>
        </div>
        {mensaje && <p className="flex items-start gap-1.5 text-sm text-muted-foreground"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span className="min-w-0 break-words">{mensaje}</span></p>}
        <div className="min-w-0">
          <p className="mb-1 flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground"><Users className="h-3.5 w-3.5" /> Vistas guardadas</p>
          {guardadas.length === 0 ? <p className="text-sm text-muted-foreground">Aún no hay vistas guardadas en este dispositivo.</p> : (
            <ul className="flex flex-wrap gap-1.5">
              {guardadas.map((g) => (
                <li key={g.id}>
                  <button type="button" onClick={() => setVista(g)}
                    className={cn("max-w-[16rem] cursor-pointer truncate rounded-full border px-2.5 py-1 text-xs", g.id === vista.id ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground")}>
                    {g.nombre}{g.grupo ? ` · ${g.grupo}` : ""}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </footer>
    </div>
  );
}
