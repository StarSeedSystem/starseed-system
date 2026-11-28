"use client";

/**
 * Panel «Personalizar vista» de Ramas 4D (MV1125J). Guarda plantilla, capas,
 * perspectiva, formas e iconos por tipo, colores del tema o propios, física,
 * fondo, sonido espacial y etiquetas, por persona y por grupo. Exporta una
 * variación pública y comparte SOLO la configuración (nunca id, dueño ni grupo).
 * Aquí no hay 3D: la escena se importa con next/dynamic({ ssr: false }) aparte.
 */
import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { Layers, Orbit, Palette, Save, Share2, Sparkles, Volume2 } from "lucide-react";
import { CAPAS_QUINTA_DIMENSION } from "@/lib/ramas4d/capas";
import {
  ALCANCES, FONDOS, FORMAS, PERSPECTIVAS, PLANTILLAS, TIPOS_VISUALES, TOKENS_COLOR, VISTA_FABRICA,
  aVariacionPublica, configuracionCompartible, guardarVista, leerColeccion, normalizarVista,
  type ColorVista, type Vista4D,
} from "@/lib/ramas4d/vistas";

const CAMPO = "w-full min-w-0 rounded-[var(--radius-sm)] border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring";
const BOTON = "inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-sm)] border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring";
const ROLES_COLOR = [["acento", "Acento"], ["nodo", "Nodo"], ["arista", "Arista"], ["texto", "Texto"]] as const;

function Seccion({ titulo, Icono, children }: { titulo: string; Icono: ComponentType<{ className?: string }>; children: ReactNode }) {
  return (
    <section className="min-w-0 space-y-3 rounded-[var(--radius)] border border-border bg-card/70 p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground"><Icono className="h-4 w-4 text-primary" />{titulo}</h3>
      {children}
    </section>
  );
}

function Campo({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground"><span className="break-words">{etiqueta}</span>{children}</label>;
}

export function PersonalizarVista({ inicial }: { inicial?: Vista4D }) {
  const [vista, setVista] = useState<Vista4D>(() => normalizarVista(inicial ?? VISTA_FABRICA));
  const [aviso, setAviso] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const coleccion = leerColeccion(window.localStorage);
    const guardada = coleccion.vistas.find((v) => v.alcance === "persona") ?? coleccion.vistas[0];
    if (guardada) setVista(guardada);
  }, []);
  const cambiar = (parche: Partial<Vista4D>) => setVista((v) => normalizarVista({ ...v, ...parche }));
  const alternarCapa = (capa: string) => cambiar({ capas: vista.capas.includes(capa) ? vista.capas.filter((c) => c !== capa) : [...vista.capas, capa] });
  const setColor = (rol: (typeof ROLES_COLOR)[number][0], nuevo: ColorVista) => { const colores = { ...vista.colores }; colores[rol] = nuevo; cambiar({ colores }); };
  const setFisica = (clave: "gravedad" | "distancia" | "velocidad", valor: number) => { const fisica = { ...vista.fisica }; fisica[clave] = valor; cambiar({ fisica }); };
  const copiar = (texto: string, mensaje: string) => { void navigator.clipboard?.writeText(texto).catch(() => {}); setAviso(mensaje); };
  const guardar = () => {
    if (typeof window === "undefined") return;
    const resultado = guardarVista(window.localStorage, vista);
    setAviso(resultado.ok ? "Vista guardada en tu cuenta." : "No se pudo guardar la vista.");
  };
  const exportar = () => copiar(JSON.stringify(aVariacionPublica(vista, { titulo: vista.nombre }), null, 2), "Variación pública copiada: solo lleva la configuración.");
  const compartir = () => copiar(JSON.stringify(configuracionCompartible(vista), null, 2), "Configuración copiada para compartir.");
  return (
    <div className="flex min-w-0 flex-col gap-4 text-foreground">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">Personalizar vista</h2>
          <p className="text-xs text-muted-foreground">Plantilla, capas, formas, colores y física. Se guarda por persona o por grupo.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={BOTON} onClick={guardar}><Save className="h-4 w-4" /> Guardar</button>
          <button type="button" className={BOTON} onClick={exportar}><Sparkles className="h-4 w-4" /> Variación</button>
          <button type="button" className={BOTON} onClick={compartir}><Share2 className="h-4 w-4" /> Compartir</button>
        </div>
      </header>
      {aviso && <p role="status" className="rounded-[var(--radius-sm)] border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">{aviso}</p>}
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <Seccion titulo="Identidad" Icono={Orbit}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="Nombre"><input className={CAMPO} value={vista.nombre} onChange={(e) => cambiar({ nombre: e.target.value })} /></Campo>
            <Campo etiqueta="Plantilla">
              <select className={CAMPO} value={vista.plantilla} onChange={(e) => cambiar({ plantilla: e.target.value as Vista4D["plantilla"] })}>
                {PLANTILLAS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </Campo>
            <Campo etiqueta="Perspectiva">
              <select className={CAMPO} value={vista.perspectiva} onChange={(e) => cambiar({ perspectiva: e.target.value as Vista4D["perspectiva"] })}>
                {PERSPECTIVAS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </Campo>
            <Campo etiqueta="Alcance">
              <select className={CAMPO} value={vista.alcance} onChange={(e) => cambiar({ alcance: e.target.value as Vista4D["alcance"] })}>
                {ALCANCES.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </Campo>
            {vista.alcance === "grupo" && (
              <Campo etiqueta="Grupo"><input className={CAMPO} value={vista.grupo ?? ""} onChange={(e) => cambiar({ grupo: e.target.value })} placeholder="id del grupo" /></Campo>
            )}
          </div>
        </Seccion>

        <Seccion titulo="Capas" Icono={Layers}>
          <div className="space-y-3">
            {Object.entries(CAPAS_QUINTA_DIMENSION).map(([categoria, valores]) => (
              <div key={categoria} className="min-w-0">
                <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">{categoria}</p>
                <div className="flex flex-wrap gap-1.5">
                  {valores.map((valor) => {
                    const capa = `${categoria}-${valor}`;
                    const activa = vista.capas.includes(capa);
                    return (
                      <button key={capa} type="button" aria-pressed={activa} onClick={() => alternarCapa(capa)} className={`cursor-pointer rounded-full border px-2.5 py-1 text-[11px] transition-colors ${activa ? "border-primary bg-primary/15 text-primary" : "border-border bg-background text-muted-foreground hover:bg-muted"}`}>{valor}</button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </Seccion>

        <Seccion titulo="Formas e iconos por tipo" Icono={Sparkles}>
          <div className="space-y-2">
            {TIPOS_VISUALES.map((tipo) => (
              <div key={tipo} className="grid min-w-0 gap-2 sm:grid-cols-[6.5rem_1fr_1fr] sm:items-center">
                <span className="text-xs text-muted-foreground">{tipo}</span>
                <select className={CAMPO} value={vista.formas[tipo] ?? "esfera"} onChange={(e) => cambiar({ formas: { ...vista.formas, [tipo]: e.target.value as Vista4D["formas"][string] } })} aria-label={`Forma de ${tipo}`}>
                  {FORMAS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
                <input className={CAMPO} value={vista.iconos[tipo] ?? ""} onChange={(e) => cambiar({ iconos: { ...vista.iconos, [tipo]: e.target.value } })} placeholder="Icono (Lucide)" aria-label={`Icono de ${tipo}`} />
              </div>
            ))}
          </div>
        </Seccion>

        <Seccion titulo="Colores" Icono={Palette}>
          <div className="space-y-2">
            {ROLES_COLOR.map(([rol, etiqueta]) => {
              const color = vista.colores[rol];
              return (
                <div key={rol} className="grid min-w-0 gap-2 sm:grid-cols-[5rem_6.5rem_1fr_2rem] sm:items-center">
                  <span className="text-xs text-muted-foreground">{etiqueta}</span>
                  <select className={CAMPO} value={color.tipo} onChange={(e) => setColor(rol, e.target.value === "token" ? { tipo: "token", valor: "--primary" } : { tipo: "personalizado", valor: "#7c3aed" })} aria-label={`Tipo de color ${etiqueta}`}>
                    <option value="token">Token</option>
                    <option value="personalizado">Propio</option>
                  </select>
                  {color.tipo === "token" ? (
                    <select className={CAMPO} value={color.valor} onChange={(e) => setColor(rol, { tipo: "token", valor: e.target.value })} aria-label={`Token ${etiqueta}`}>
                      {TOKENS_COLOR.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  ) : (
                    <input className={CAMPO} value={color.valor} onChange={(e) => setColor(rol, { tipo: "personalizado", valor: e.target.value })} placeholder="#7c3aed" aria-label={`Color ${etiqueta}`} />
                  )}
                  <span aria-hidden className="h-8 w-8 rounded-full border border-border" style={{ background: color.tipo === "token" ? `var(${color.valor})` : color.valor }} />
                </div>
              );
            })}
          </div>
        </Seccion>

        <Seccion titulo="Física" Icono={Orbit}>
          <div className="space-y-3">
            {([["gravedad", "Gravedad", 0, 5, 0.1], ["distancia", "Distancia", 0.5, 20, 0.5], ["velocidad", "Velocidad", 0.1, 5, 0.1]] as const).map(([clave, etiqueta, min, max, paso]) => (
              <Campo key={clave} etiqueta={`${etiqueta}: ${vista.fisica[clave]}`}>
                <input type="range" className="w-full cursor-pointer accent-[var(--primary)]" min={min} max={max} step={paso} value={vista.fisica[clave]} onChange={(e) => setFisica(clave, Number(e.target.value))} />
              </Campo>
            ))}
          </div>
        </Seccion>

        <Seccion titulo="Fondo y ambiente" Icono={Volume2}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="Fondo">
              <select className={CAMPO} value={vista.fondo} onChange={(e) => cambiar({ fondo: e.target.value as Vista4D["fondo"] })}>
                {FONDOS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </Campo>
            <Campo etiqueta="Sonido espacial">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                <input type="checkbox" className="h-4 w-4 cursor-pointer accent-[var(--primary)]" checked={vista.sonidoEspacial} onChange={(e) => cambiar({ sonidoEspacial: e.target.checked })} /> Activar
              </label>
            </Campo>
            <Campo etiqueta={`Tamaño de etiquetas: ${vista.etiquetas.tamano}`}>
              <input type="range" className="w-full cursor-pointer accent-[var(--primary)]" min={0.5} max={3} step={0.1} value={vista.etiquetas.tamano} onChange={(e) => cambiar({ etiquetas: { ...vista.etiquetas, tamano: Number(e.target.value) } })} />
            </Campo>
            <Campo etiqueta="Etiquetas siempre">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                <input type="checkbox" className="h-4 w-4 cursor-pointer accent-[var(--primary)]" checked={vista.etiquetas.siempre} onChange={(e) => cambiar({ etiquetas: { ...vista.etiquetas, siempre: e.target.checked } })} /> Mostrar siempre
              </label>
            </Campo>
          </div>
        </Seccion>
      </div>
    </div>
  );
}

export default PersonalizarVista;
