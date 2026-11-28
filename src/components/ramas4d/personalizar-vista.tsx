'use client';

import { useState, type ReactNode } from 'react';
import { Save, Share2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { CAPAS_QUINTA_DIMENSION } from '@/lib/ramas4d/capas';
import {
  ESTILOS_ETIQUETA, FONDOS, PERMISOS_COMPARTIR, PERSPECTIVAS, PLANTILLAS, TIPOS_BASE,
  configuracionPublica, permisoValido, variacionDesdeVista,
  type AmbitoVista, type PermisoCompartir, type VistaConfig,
} from '@/lib/ramas4d/vistas';

export interface PersonalizarVistaProps {
  config: VistaConfig;
  ambito: AmbitoVista;
  idAmbito: string;
  onChange: (config: VistaConfig) => void;
  onGuardar: (config: VistaConfig) => void;
  onCompartir: (config: VistaConfig, permiso: PermisoCompartir) => void;
  onExportar?: (variacion: ReturnType<typeof variacionDesdeVista>) => void; autor?: string;
}

const SELECT = 'w-full min-w-0 cursor-pointer rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground focus-visible:outline-ring';
const TEXTO = 'w-full min-w-0 cursor-text rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground';
const SECCION = 'space-y-3 rounded-[24px] border border-border/60 bg-muted/30 p-4';

const CAPAS = Object.values(CAPAS_QUINTA_DIMENSION).flat();
const NOMBRES: Record<string, string> = {
  educacion: 'Educación', cerebros: 'Cerebros', politica: 'Política', cultura: 'Cultura',
  ia: 'Astraura e IA', creacion: 'Creación', metagenesis: 'MetaGenesis', yo: 'Yo',
  grupo: 'Mi grupo', comunidad: 'Comunidad', neurona: 'Esta neurona', noche: 'Noche',
  aurora: 'Aurora', cristal: 'Cristal', vacio: 'Vacío', natural: 'Natural',
  compacta: 'Compacta', destacada: 'Destacada', contactos: 'Contactos', publico: 'Público',
};

function Campo({ rotulo, hijos }: { rotulo: string; hijos: ReactNode }) {
  return <div className="min-w-0 space-y-1"><Label className="text-xs text-muted-foreground">{rotulo}</Label>{hijos}</div>;
}

function Lista({ id, valor, opciones, alCambiar }: { id: string; valor: string; opciones: readonly string[]; alCambiar: (valor: string) => void }) {
  return <select id={id} aria-label={id} value={valor} onChange={(e) => alCambiar(e.target.value)} className={SELECT}>
    {opciones.map((opcion) => <option key={opcion} value={opcion}>{NOMBRES[opcion] ?? opcion}</option>)}
  </select>;
}

function Entrada({ id, rotulo, valor, alCambiar, tipo = 'text', paso }: { id: string; rotulo: string; valor: string | number; alCambiar: (valor: string) => void; tipo?: string; paso?: string }) {
  return <Campo rotulo={rotulo} hijos={<Input id={id} type={tipo} step={paso} className={TEXTO} value={valor} onChange={(e) => alCambiar(e.target.value)} />} />;
}

export default function PersonalizarVista(props: PersonalizarVistaProps) {
  const { config, ambito, idAmbito, onChange, onGuardar, onCompartir, onExportar, autor = 'yo' } = props;
  const [permiso, setPermiso] = useState<PermisoCompartir>('contactos'); const [aviso, setAviso] = useState('');
  const cambiar = (parche: Partial<VistaConfig>) => onChange({ ...config, ...parche });
  const numero = (valor: string, actual: number) => (valor === '' ? actual : Number(valor)); const publica = () => configuracionPublica(config);
  return (
    <div className="space-y-4 break-words" data-ss-personalizar-vista={ambito}>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">Personalizar vista</h2>
        <p className="text-xs leading-relaxed text-muted-foreground">Se guarda para {ambito === 'grupo' ? 'el grupo' : 'esta persona'} «{idAmbito}». Solo viaja la configuración: nunca se publica contenido privado ni referencias a él.</p>
      </div>
      <fieldset className={SECCION}>
        <legend className="text-sm font-medium text-foreground">Estructura y perspectiva</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Campo rotulo="Plantilla" hijos={<Lista id="pv-plantilla" valor={config.plantilla} opciones={PLANTILLAS} alCambiar={(v) => cambiar({ plantilla: v })} />} />
          <Campo rotulo="Perspectiva" hijos={<Lista id="pv-perspectiva" valor={config.perspectiva} opciones={PERSPECTIVAS} alCambiar={(v) => cambiar({ perspectiva: v })} />} />
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Capas visibles">
          {CAPAS.map((capa) => {
            const activa = config.capas.includes(capa);
            return <button key={capa} type="button" aria-pressed={activa} onClick={() => cambiar({ capas: activa ? config.capas.filter((c) => c !== capa) : [...config.capas, capa] })} className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs ${activa ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground hover:bg-muted'}`}>{NOMBRES[capa] ?? capa}</button>;
          })}
        </div>
      </fieldset>
      <fieldset className={SECCION}>
        <legend className="text-sm font-medium text-foreground">Formas e iconos por tipo</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {TIPOS_BASE.map((tipo) => <div key={tipo} className="grid grid-cols-2 gap-2">
            <Entrada id={`pv-forma-${tipo}`} rotulo={`Forma · ${NOMBRES[tipo] ?? tipo}`} valor={config.formasPorTipo[tipo] ?? ''} alCambiar={(v) => cambiar({ formasPorTipo: { ...config.formasPorTipo, [tipo]: v } })} />
            <Entrada id={`pv-icono-${tipo}`} rotulo={`Icono · ${NOMBRES[tipo] ?? tipo}`} valor={config.iconosPorTipo[tipo] ?? ''} alCambiar={(v) => cambiar({ iconosPorTipo: { ...config.iconosPorTipo, [tipo]: v } })} />
          </div>)}
        </div>
      </fieldset>
      <fieldset className={SECCION}>
        <legend className="text-sm font-medium text-foreground">Color, física y fondo</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Campo rotulo="Token de acento" hijos={<Input id="pv-token" className={TEXTO} value={config.colores.tokens.acento ?? ''} onChange={(e) => cambiar({ colores: { ...config.colores, tokens: { ...config.colores.tokens, acento: e.target.value } } })} />} />
          <Campo rotulo="Color personalizado (opcional)" hijos={<Input id="pv-color" className={TEXTO} placeholder="Solo si el tema no basta" value={config.colores.personalizados.acento ?? ''} onChange={(e) => cambiar({ colores: { ...config.colores, personalizados: { ...config.colores.personalizados, acento: e.target.value } } })} />} />
          <Entrada id="pv-gravedad" rotulo="Gravedad" tipo="number" paso="0.1" valor={config.fisica.gravedad} alCambiar={(v) => cambiar({ fisica: { ...config.fisica, gravedad: numero(v, config.fisica.gravedad) } })} />
          <Entrada id="pv-distancia" rotulo="Distancia" tipo="number" paso="0.5" valor={config.fisica.distancia} alCambiar={(v) => cambiar({ fisica: { ...config.fisica, distancia: numero(v, config.fisica.distancia) } })} />
          <Entrada id="pv-velocidad" rotulo="Velocidad" tipo="number" paso="0.1" valor={config.fisica.velocidad} alCambiar={(v) => cambiar({ fisica: { ...config.fisica, velocidad: numero(v, config.fisica.velocidad) } })} />
          <Campo rotulo="Fondo" hijos={<Lista id="pv-fondo" valor={config.fondo} opciones={FONDOS} alCambiar={(v) => cambiar({ fondo: v })} />} />
        </div>
      </fieldset>
      <fieldset className={SECCION}>
        <legend className="text-sm font-medium text-foreground">Sonido espacial y etiquetas</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2"><Label htmlFor="pv-sonido" className="cursor-pointer text-xs">Sonido espacial</Label><Switch id="pv-sonido" className="cursor-pointer" checked={config.sonidoEspacial.activo} onCheckedChange={(v) => cambiar({ sonidoEspacial: { ...config.sonidoEspacial, activo: v } })} /></div>
          <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2"><Label htmlFor="pv-etiquetas" className="cursor-pointer text-xs">Etiquetas visibles</Label><Switch id="pv-etiquetas" className="cursor-pointer" checked={config.etiquetas.visibles} onCheckedChange={(v) => cambiar({ etiquetas: { ...config.etiquetas, visibles: v } })} /></div>
          <Entrada id="pv-volumen" rotulo="Volumen (0 a 1)" tipo="number" paso="0.1" valor={config.sonidoEspacial.volumen} alCambiar={(v) => cambiar({ sonidoEspacial: { ...config.sonidoEspacial, volumen: numero(v, config.sonidoEspacial.volumen) } })} />
          <Entrada id="pv-tamano" rotulo="Tamaño de etiqueta" tipo="number" paso="0.1" valor={config.etiquetas.tamano} alCambiar={(v) => cambiar({ etiquetas: { ...config.etiquetas, tamano: numero(v, config.etiquetas.tamano) } })} />
          <Campo rotulo="Diseño de etiqueta" hijos={<Lista id="pv-estilo" valor={config.etiquetas.estilo} opciones={ESTILOS_ETIQUETA} alCambiar={(v) => cambiar({ etiquetas: { ...config.etiquetas, estilo: v } })} />} />
        </div>
      </fieldset>
      <div className="space-y-3 rounded-[24px] border border-border/60 bg-muted/30 p-4">
        <Campo rotulo="Permiso al compartir" hijos={<Lista id="pv-permiso" valor={permiso} opciones={PERMISOS_COMPARTIR} alCambiar={(v) => { if (permisoValido(v)) setPermiso(v); }} />} />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" className="cursor-pointer gap-1.5" onClick={() => { onGuardar(config); setAviso('Vista guardada.'); }}><Save className="h-3.5 w-3.5" /> Guardar</Button>
          <Button size="sm" variant="outline" className="cursor-pointer gap-1.5" onClick={() => { onCompartir(publica(), permiso); setAviso(`Vista compartida con ${NOMBRES[permiso] ?? permiso}.`); }}><Share2 className="h-3.5 w-3.5" /> Compartir</Button>
          <Button size="sm" variant="ghost" className="cursor-pointer gap-1.5" disabled={!onExportar} onClick={() => { onExportar?.(variacionDesdeVista(publica(), `Vista de ${ambito} ${idAmbito}`, autor)); setAviso('Variación pública preparada para la Librería.'); }}><Sparkles className="h-3.5 w-3.5" /> Exportar variación</Button>
        </div>
        {aviso && <p role="status" className="text-xs text-muted-foreground">{aviso}</p>}
        <p className="text-[11px] leading-relaxed text-muted-foreground">El grafo guarda referencias, nunca contenido privado. Al compartir solo se envía esta configuración.</p>
      </div>
    </div>
  );
}
