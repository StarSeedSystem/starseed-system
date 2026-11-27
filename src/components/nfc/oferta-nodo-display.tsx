"use client";

import { useState, useMemo } from "react";
import { X, Volume2, Play, Pause, Download, BookOpen, Globe, Zap, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Audioguia } from "./audioguia";
import type { ConfigNodo, OfertaNodo, TipoOferta } from "@/lib/nfc/nodo-oferta";
import type { ConfigAudioNodo, AudioDisponible } from "@/lib/nfc/nodo-audio";

const AUDIO_TIPOS: TipoOferta[] = ["audioguia", "descripcion_zona", "nodo_informativo"];

const NOMBRE_OFERTA: Record<TipoOferta, string> = {
  informacion: "Información",
  app: "App",
  publicacion: "Publicación",
  pagina: "Página de StarSeed OS",
  enlace: "Enlace funcional",
  archivo: "Archivo",
  folder: "Folder",
  capa: "Capa de conciencia",
  audioguia: "Audioguía",
  descripcion_zona: "Descripción de zona",
  nodo_informativo: "Nodo informativo",
};

const ICONO_OFERTA: Record<TipoOferta, React.ReactNode> = {
  informacion: <Globe className="w-5 h-5" />,
  app: <Zap className="w-5 h-5" />,
  publicacion: <BookOpen className="w-5 h-5" />,
  pagina: <Globe className="w-5 h-5" />,
  enlace: <ArrowLeft className="w-5 h-5" />,
  archivo: <Download className="w-5 h-5" />,
  folder: <BookOpen className="w-5 h-5" />,
  capa: <Zap className="w-5 h-5" />,
  audioguia: <Zap className="w-5 h-5" />,
  descripcion_zona: <Globe className="w-5 h-5" />,
  nodo_informativo: <BookOpen className="w-5 h-5" />,
};

interface Props {
  config: ConfigNodo;
  onCerrar: () => void;
  onReproducirAudio?: (audio: AudioDisponible, volumen: number) => void;
  onPausarAudio?: () => void;
  onGuardarBiblioteca?: (config: ConfigAudioNodo, audio: AudioDisponible) => void;
  online?: boolean;
}

export function OfertaNodoDisplay({
  config,
  onCerrar,
  onReproducirAudio,
  onPausarAudio,
  onGuardarBiblioteca,
  online = true,
}: Props) {
  const [ofertaSeleccionada, setOfertaSeleccionada] = useState<OfertaNodo | null>(null);

  const ofertasAudio = useMemo(
    () => config.ofertas.filter((o) => AUDIO_TIPOS.includes(o.tipo)),
    [config.ofertas]
  );

  const ofertasOtras = useMemo(
    () => config.ofertas.filter((o) => !AUDIO_TIPOS.includes(o.tipo)),
    [config.ofertas]
  );

  const volver = () => setOfertaSeleccionada(null);

  if (ofertaSeleccionada) {
    const esAudio = AUDIO_TIPOS.includes(ofertaSeleccionada.tipo);
    if (esAudio) {
      const configAudio: ConfigAudioNodo = {
        version: 1,
        tipo: ofertaSeleccionada.tipo as ConfigAudioNodo["tipo"],
        titulo: ofertaSeleccionada.titulo,
        audioUrl: ofertaSeleccionada.destino,
        duracionSegundos: 120,
        idioma: "es",
        volumen: 0.7,
      };
      return (
        <div className="flex flex-col h-full max-w-md mx-auto">
          <div className="flex items-center justify-between mb-4">
            <Button variant="ghost" size="icon" onClick={volver} aria-label="Volver">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h3 className="font-medium text-lg truncate flex-1 text-center px-4">{ofertaSeleccionada.titulo}</h3>
            <div className="w-10" />
          </div>
          <Audioguia
            config={configAudio}
            audiosDisponibles={[{ url: ofertaSeleccionada.destino, idioma: "es", tamanoBytes: 0, enNodo: true }]}
            online={online}
            onReproducir={onReproducirAudio}
            onPausar={onPausarAudio}
            onGuardarBiblioteca={onGuardarBiblioteca}
          />
        </div>
      );
    }
    return (
      <div className="flex flex-col h-full max-w-md mx-auto">
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" size="icon" onClick={volver} aria-label="Volver">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h3 className="font-medium text-lg truncate flex-1 text-center px-4">{ofertaSeleccionada.titulo}</h3>
          <div className="w-10" />
        </div>
        <Card className="w-full">
          <CardContent className="p-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-4 border border-white/10">
              {ICONO_OFERTA[ofertaSeleccionada.tipo]}
            </div>
            <p className="text-lg font-medium">{NOMBRE_OFERTA[ofertaSeleccionada.tipo]}</p>
            <p className="text-sm opacity-70 mt-2 truncate">{ofertaSeleccionada.destino}</p>
            <Button className="mt-4 w-full cursor-pointer" onClick={() => window.open(ofertaSeleccionada.destino, "_blank")}>
              Abrir
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full max-w-md mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-medium text-lg">{config.nombre}</h3>
        <Button variant="ghost" size="icon" onClick={onCerrar} aria-label="Cerrar">
          <X className="w-5 h-5" />
        </Button>
      </div>
      <div className="space-y-3 overflow-y-auto">
        {ofertasAudio.length > 0 && (
          <section>
            <h4 className="text-xs font-medium opacity-50 uppercase tracking-wider mb-2">Audio</h4>
            <div className="space-y-2">
              {ofertasAudio.map((o) => (
                <Button
                  key={o.titulo}
                  variant="outline"
                  className="w-full justify-start gap-3 cursor-pointer"
                  onClick={() => setOfertaSeleccionada(o)}
                >
                  <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/10 flex-shrink-0">
                    {ICONO_OFERTA[o.tipo]}
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <p className="font-medium truncate">{o.titulo}</p>
                    <p className="text-xs opacity-60">{NOMBRE_OFERTA[o.tipo]}</p>
                  </div>
                </Button>
              ))}
            </div>
          </section>
        )}
        {ofertasOtras.length > 0 && (
          <section>
            <h4 className="text-xs font-medium opacity-50 uppercase tracking-wider mb-2">Otras ofertas</h4>
            <div className="space-y-2">
              {ofertasOtras.map((o) => (
                <Button
                  key={o.titulo}
                  variant="outline"
                  className="w-full justify-start gap-3 cursor-pointer"
                  onClick={() => setOfertaSeleccionada(o)}
                >
                  <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/10 flex-shrink-0">
                    {ICONO_OFERTA[o.tipo]}
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <p className="font-medium truncate">{o.titulo}</p>
                    <p className="text-xs opacity-60">{NOMBRE_OFERTA[o.tipo]}</p>
                  </div>
                </Button>
              ))}
            </div>
          </section>
        )}
        {config.ofertas.length === 0 && (
          <div className="text-center py-8 opacity-50">
            <p>Este nodo no tiene ofertas configuradas.</p>
          </div>
        )}
      </div>
    </div>
  );
}