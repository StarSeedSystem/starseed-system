'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { createClient } from '@/utils/supabase/client';
import { mergeUserPrefs } from '@/lib/sync/user-prefs';
import { crearDatosVariaciones } from '@/lib/variaciones/datos';
import { CLAVE_VARIACION_VISTA, CLAVE_VISTAS, codificarVistas, configuracionCompartible, crearVista, decodificarVistas, migrarVista, motivosCompartir, type EstiloForma, type FormaVista, type PermisoCompartir, type Vista4D } from '@/lib/ramas4d/vistas';
const CLASE = 'min-h-11 w-full min-w-0 rounded-xl border border-border bg-background/80 px-3 py-2 text-sm leading-snug text-foreground outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-ring';
const NOMBRES: Record<string, string> = { educacion: 'Educación', cerebros: 'Cerebros', politica: 'Política', ia: 'IA', creacion: 'Creación', metagenesis: 'MetaGenesis', privado: 'Privado', grupo: 'Grupo', publico: 'Público', lectura: 'Lectura', edicion: 'Edición', herencia: 'Herencia', 'var(--primary)': 'Primario', 'var(--accent)': 'Acento', 'var(--trinity-azure)': 'Azure', 'var(--trinity-violet)': 'Violeta', 'var(--trinity-emerald)': 'Esmeralda', 'var(--trinity-amber)': 'Ámbar', 'var(--trinity-cyan)': 'Cian', 'var(--background)': 'Fondo del tema' };
type Opcion = { valor: string; etiqueta: string };
const opciones = (...valores: string[]): Opcion[] => valores.map((valor) => ({ valor, etiqueta: NOMBRES[valor] ?? valor }));
const PLANTILLAS = opciones('educacion', 'cerebros', 'politica', 'cultura', 'ia', 'creacion', 'metagenesis');
const PERSPECTIVAS = opciones('yo', 'mi-grupo', 'mi-comunidad', 'esta-neurona');
const CAPAS = opciones('conciencia', 'capacidades', 'senales', 'alcance', 'sistema', 'universosParalelos');
const FORMAS: FormaVista[] = ['estrella', 'planeta', 'cometa', 'orbita', 'constelacion', 'cristal'];
const TIPOS = Object.keys(crearVista().formas);
const TOKENS = opciones('var(--primary)', 'var(--accent)', 'var(--trinity-azure)', 'var(--trinity-violet)', 'var(--trinity-emerald)', 'var(--trinity-amber)', 'var(--trinity-cyan)', 'var(--background)');
const PERMISOS: PermisoCompartir[] = ['lectura', 'edicion', 'herencia'];
interface Props { vistaInicial?: Vista4D; onGuardada?: (vista: Vista4D) => void }
function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return <fieldset className="min-w-0 rounded-2xl border border-border/60 bg-card/70 p-5"><legend className="px-2 text-sm font-semibold text-foreground">{titulo}</legend><div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">{children}</div></fieldset>;
}
function Campo({ etiqueta, children, ancho }: { etiqueta: string; children: ReactNode; ancho?: boolean }) {
  return <label className={`flex min-w-0 flex-col gap-1.5 ${ancho ? 'sm:col-span-2' : ''}`}><span className="break-words text-xs font-medium leading-snug text-muted-foreground">{etiqueta}</span>{children}</label>;
}
function Texto({ etiqueta, valor, cambiar, ancho }: { etiqueta: string; valor: string; cambiar: (v: string) => void; ancho?: boolean }) {
  return <Campo etiqueta={etiqueta} ancho={ancho}><input className={CLASE} value={valor} onChange={(e) => cambiar(e.target.value)} /></Campo>;
}
function Opciones({ etiqueta, valor, opciones: items, cambiar, ancho }: { etiqueta: string; valor: string; opciones: Opcion[]; cambiar: (v: string) => void; ancho?: boolean }) {
  return <Campo etiqueta={etiqueta} ancho={ancho}><select className={`${CLASE} cursor-pointer`} value={valor} onChange={(e) => cambiar(e.target.value)}>{items.map((item) => <option key={item.valor} value={item.valor}>{item.etiqueta}</option>)}</select></Campo>;
}
function Rango({ etiqueta, valor, min, max, paso, cambiar }: { etiqueta: string; valor: number; min: number; max: number; paso: number; cambiar: (v: number) => void }) {
  return <Campo etiqueta={`${etiqueta}: ${valor}`}><input type="range" className="h-11 w-full cursor-pointer accent-[var(--primary)]" min={min} max={max} step={paso} value={valor} onChange={(e) => cambiar(Number(e.target.value))} /></Campo>;
}
function Interruptor({ etiqueta, activo, cambiar }: { etiqueta: string; activo: boolean; cambiar: (v: boolean) => void }) {
  return <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-border bg-background/70 px-3 text-sm"><input type="checkbox" className="size-4 shrink-0 cursor-pointer accent-[var(--primary)]" checked={activo} onChange={(e) => cambiar(e.target.checked)} /><span className="break-words leading-snug text-foreground">{etiqueta}</span></label>;
}
export default function PersonalizarVista({ vistaInicial, onGuardada }: Props) {
  const [vista, setVista] = useState(() => crearVista(vistaInicial));
  const [guardadas, setGuardadas] = useState<Vista4D[]>([]);
  const [permiso, setPermiso] = useState<PermisoCompartir>('lectura');
  const [estado, setEstado] = useState('');
  useEffect(() => {
    const local = decodificarVistas(window.localStorage.getItem(CLAVE_VISTAS), Date.now());
    if (local.length) { setGuardadas(local); if (!vistaInicial) setVista(local[0]) }
    let vivo = true;
    void (async () => {
      const sb = createClient(), { data } = await sb.auth.getSession(), id = data.session?.user?.id;
      if (id) { const { data: fila } = await sb.from('user_settings').select('prefs').eq('user_id', id).maybeSingle(), prefs = fila?.prefs && typeof fila.prefs === 'object' ? fila.prefs as Record<string, unknown> : {};
        const remotas = decodificarVistas(JSON.stringify(prefs[CLAVE_VISTAS] ?? null), Date.now());
        if (vivo && remotas.length) { setGuardadas(remotas); if (!vistaInicial) setVista(remotas[0]) } }
    })().catch(() => setEstado('Sin conexión: usamos las vistas guardadas en este dispositivo.'));
    return () => { vivo = false };
  }, [vistaInicial]);
  const cambiar = (parcial: Partial<Vista4D>) => setVista((v) => ({ ...v, ...parcial }));
  const editarForma = (tipo: string, parcial: Partial<EstiloForma>) => setVista((v) => ({ ...v, formas: { ...v.formas, [tipo]: { ...v.formas[tipo], ...parcial } } }));
  async function guardar() {
    const normal = migrarVista({ ...vista, actualizada: Date.now() }, Date.now()) ?? vista, lista = [...guardadas.filter((v) => v.id !== normal.id), normal];
    const json = codificarVistas(lista), valor: unknown = JSON.parse(json);
    window.localStorage.setItem(CLAVE_VISTAS, json); setGuardadas(lista); setVista(normal); onGuardada?.(normal);
    const res = await mergeUserPrefs({ [CLAVE_VISTAS]: valor });
    setEstado(res.ok ? (res.sinCambios ? 'Guardada aquí; tu cuenta ya tenía esta versión.' : 'Guardada y sincronizada con tu cuenta StarSeed.') : `Guardada aquí; cuenta: ${res.error ?? 'sin conexión'}`);
  }
  function compartir() {
    const config = configuracionCompartible(vista, permiso), motivos = motivosCompartir(config);
    if (motivos.length) { setEstado(motivos[0]); return }
    setEstado(`Configuración lista con permiso de ${NOMBRES[permiso]}: sin contenido privado.`);
    void navigator.clipboard?.writeText(JSON.stringify(config, null, 2)).catch(() => setEstado('Portapapeles no disponible: la configuración sigue preparada sin datos privados.'));
  }
  async function publicar() {
    const config = configuracionCompartible(vista, 'lectura'), motivos = motivosCompartir(config);
    if (motivos.length) { setEstado(motivos[0]); return }
    const res = await crearDatosVariaciones(createClient()).publicarVariacion({ clave: CLAVE_VARIACION_VISTA, titulo: vista.nombre || 'Vista de Ramas 4D', descripcion: 'Solo la configuración de la vista; sin contenido privado ni referencias.', payload: config, licencia: 'CC-BY-4.0', etiquetas: ['ramas4d', 'vista', vista.plantilla], tema: 'multiverso' });
    setEstado(res.ok ? 'Variación pública enviada: solo contiene la configuración.' : `No se pudo publicar: ${res.motivos[0] ?? 'sin conexión'}`);
  }
  return (
    <section aria-label="Personalizar vista de Ramas 4D" className="w-full min-w-0 space-y-5 text-foreground">
      <header className="min-w-0"><h2 className="text-xl font-semibold leading-snug">Personalizar vista</h2><p className="break-words text-sm leading-snug text-muted-foreground">Plantilla, capas, perspectiva, formas, colores, física, fondo, sonido y etiquetas. Por persona o por grupo, sin contenido privado.</p></header>
      <div className="max-h-[min(80vh,48rem)] min-w-0 space-y-4 overflow-y-auto pr-1">
        <Grupo titulo="1 · Identidad y ámbito">
          <Texto etiqueta="Nombre de la vista" valor={vista.nombre} cambiar={(v) => cambiar({ nombre: v })} ancho />
          <Opciones etiqueta="Ámbito" valor={vista.ambito} opciones={opciones('persona', 'grupo')} cambiar={(v) => cambiar({ ambito: v as Vista4D['ambito'] })} />
          {vista.ambito === 'grupo' && <Texto etiqueta="Grupo" valor={vista.grupoId} cambiar={(v) => cambiar({ grupoId: v })} />}
        </Grupo>
        <Grupo titulo="2 · Estructura y perspectiva">
          <Opciones etiqueta="Plantilla" valor={vista.plantilla} opciones={PLANTILLAS} cambiar={(v) => cambiar({ plantilla: v })} />
          <Opciones etiqueta="Perspectiva" valor={vista.perspectiva} opciones={PERSPECTIVAS} cambiar={(v) => cambiar({ perspectiva: v })} />
          <Campo etiqueta="Capas activas" ancho><div className="flex flex-wrap gap-2">{CAPAS.map((c) => { const activa = vista.capas.includes(c.valor); return <button key={c.valor} type="button" aria-pressed={activa} onClick={() => cambiar({ capas: activa ? vista.capas.filter((x) => x !== c.valor) : [...vista.capas, c.valor] })} className={`min-h-11 cursor-pointer rounded-full border px-3 text-xs leading-snug transition-colors duration-200 ${activa ? 'border-primary bg-primary/15 text-foreground' : 'border-border bg-background/60 text-muted-foreground'}`}>{c.etiqueta}</button> })}</div></Campo>
        </Grupo>
        <Grupo titulo="3 · Formas e iconos por tipo">
          {TIPOS.map((tipo) => <div key={tipo} className="col-span-full grid min-w-0 gap-2 rounded-xl border border-border/50 bg-background/50 p-3 sm:grid-cols-3"><span className="break-words text-xs font-semibold capitalize text-foreground">{NOMBRES[tipo] ?? tipo}</span>
            <Opciones etiqueta="Forma" valor={vista.formas[tipo].forma} opciones={FORMAS.map((f) => ({ valor: f, etiqueta: f }))} cambiar={(v) => editarForma(tipo, { forma: v as FormaVista })} /><Texto etiqueta="Icono" valor={vista.formas[tipo].icono} cambiar={(v) => editarForma(tipo, { icono: v })} />
            <Opciones etiqueta="Color" valor={vista.formas[tipo].color} opciones={TOKENS} cambiar={(v) => editarForma(tipo, { color: v })} ancho /></div>)}
        </Grupo>
        <Grupo titulo="4 · Colores de la vista">
          <Opciones etiqueta="Acento" valor={vista.colores.acento} opciones={TOKENS} cambiar={(v) => cambiar({ colores: { ...vista.colores, acento: v } })} />
          <Opciones etiqueta="Aristas" valor={vista.colores.aristas} opciones={TOKENS} cambiar={(v) => cambiar({ colores: { ...vista.colores, aristas: v } })} />
          <Opciones etiqueta="Fondo" valor={vista.colores.fondo} opciones={TOKENS} cambiar={(v) => cambiar({ colores: { ...vista.colores, fondo: v } })} />
          <Texto etiqueta="Variable CSS personalizada (acento)" valor={vista.colores.acento} cambiar={(v) => cambiar({ colores: { ...vista.colores, acento: v } })} ancho />
        </Grupo>
        <Grupo titulo="5 · Física">
          <Rango etiqueta="Gravedad" valor={vista.fisica.gravedad} min={0} max={2} paso={0.1} cambiar={(v) => cambiar({ fisica: { ...vista.fisica, gravedad: v } })} />
          <Rango etiqueta="Distancia" valor={vista.fisica.distancia} min={1} max={40} paso={1} cambiar={(v) => cambiar({ fisica: { ...vista.fisica, distancia: v } })} />
          <Rango etiqueta="Velocidad" valor={vista.fisica.velocidad} min={0.1} max={4} paso={0.1} cambiar={(v) => cambiar({ fisica: { ...vista.fisica, velocidad: v } })} />
        </Grupo>
        <Grupo titulo="6 · Fondo, sonido y etiquetas">
          <Opciones etiqueta="Fondo de escena" valor={vista.fondo} opciones={TOKENS} cambiar={(v) => cambiar({ fondo: v })} />
          <Interruptor etiqueta="Sonido espacial" activo={vista.sonidoEspacial} cambiar={(v) => cambiar({ sonidoEspacial: v })} />
          <Interruptor etiqueta="Mostrar etiquetas" activo={vista.etiquetas.visible} cambiar={(v) => cambiar({ etiquetas: { ...vista.etiquetas, visible: v } })} />
          <Opciones etiqueta="Tamaño de etiquetas" valor={vista.etiquetas.tamano} opciones={opciones('compacto', 'normal', 'amplio')} cambiar={(v) => cambiar({ etiquetas: { ...vista.etiquetas, tamano: v as Vista4D['etiquetas']['tamano'] } })} />
        </Grupo>
        <Grupo titulo="7 · Guardar, compartir y publicar">
          <div className="col-span-full flex flex-wrap items-end gap-3"><button type="button" onClick={() => void guardar()} className="min-h-11 cursor-pointer rounded-xl border border-border bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors duration-200">Guardar vista</button>
            <div className="min-w-48 flex-1"><Opciones etiqueta="Permiso al compartir" valor={permiso} opciones={opciones(...PERMISOS)} cambiar={(v) => setPermiso(v as PermisoCompartir)} /></div><button type="button" onClick={compartir} className="min-h-11 cursor-pointer rounded-xl border border-border bg-background/70 px-4 text-sm text-foreground transition-colors duration-200">Compartir configuración</button>
            <button type="button" onClick={() => void publicar()} className="min-h-11 cursor-pointer rounded-xl border border-border bg-background/70 px-4 text-sm text-foreground transition-colors duration-200">Publicar variación pública</button></div>
          <p role="status" className="col-span-full break-words text-xs leading-snug text-muted-foreground">{estado || 'Solo se comparte la configuración: nunca contenido privado ni referencias a datos ajenos.'}</p>
        </Grupo>
      </div>
    </section>
  );
}
