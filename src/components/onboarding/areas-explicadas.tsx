"use client";

/**
 * AreasExplicadas — rejilla de áreas de la red en el último paso de la
 * bienvenida («Guía de la red»). Cada tarjeta abre una ventana que explica
 * qué es el área, cómo funciona y por dónde empezar, además de un botón
 * directo para ir a ella.
 */

import { useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  ChevronRight,
  Compass,
  Info,
  ListChecks,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type AreaTip = {
  path: string;
  label: string;
  icon: LucideIcon;
  tip: string;
  accent: string;
};

type ExplicacionArea = {
  queEs: string;
  comoFunciona: { icono: LucideIcon; texto: string }[];
  empiezaPor: string;
};

// Contenido real por ruta. Las claves coinciden con los `path` de AREAS.
const EXPLICACIONES: Record<string, ExplicacionArea> = {
  "/agent": {
    queEs:
      "El centro de mando de tu inteligencia. Aquí vive Astraura, tu agente personal: hablas con ella por voz o texto, eliges qué sistema de IA usa (local primero, nube si quieres más músculo) y configuras sus personalidades, memorias y herramientas.",
    comoFunciona: [
      { icono: Compass, texto: "Elige entre las áreas del Studio (chat, voz, proyectos, automatización…) desde el menú lateral." },
      { icono: Sparkles, texto: "Astraura intenta siempre la vía gratuita y local primero; si una fuente se agota, cambia sola a otra." },
      { icono: ListChecks, texto: "Cada personalidad puede tener su propio sistema de IA, voz y memoria, ajustable por neurona." },
    ],
    empiezaPor: "Abre el chat y pregúntale a Astraura qué puede hacer por ti hoy.",
  },
  "/memorias": {
    queEs:
      "Tu baúl de recuerdos y conocimiento. Guardas notas, ideas, enlaces y archivos, y los organizas en baúles vinculados que Astraura puede consultar para responderte con tu propio contexto.",
    comoFunciona: [
      { icono: ListChecks, texto: "Crea memorias sueltas o agrúpalas en baúles por tema o proyecto." },
      { icono: Compass, texto: "Todo es tuyo: se guarda en tu espacio y solo se comparte si tú lo decides." },
      { icono: Sparkles, texto: "Las memorias vinculadas a un cerebro alimentan sus respuestas y grafo." },
    ],
    empiezaPor: "Crea tu primer baúl y guarda en él tres notas de lo que más te importa ahora.",
  },
  "/cerebros": {
    queEs:
      "El grafo vivo de tu conocimiento. Cada cerebro conecta memorias, skills y fuentes en una red que Astraura usa para pensar contigo: ver cómo se relacionan tus ideas y activar lo relevante en cada momento.",
    comoFunciona: [
      { icono: Compass, texto: "Un cerebro enlaza memorias, habilidades y almacenamientos que tú eliges." },
      { icono: Sparkles, texto: "El grafo se recalcula solo cuando añades o quitas piezas." },
      { icono: ListChecks, texto: "Puedes tener varios cerebros (personal, trabajo, creatividad) con enrutado propio." },
    ],
    empiezaPor: "Abre tu cerebro principal y comprueba qué memorias ya tiene enlazadas.",
  },
  "/decisiones": {
    queEs:
      "La plaza donde la red decide. Propones iniciativas, debates con argumentos estructurados y votas: una persona, una voz. Las decisiones aprobadas quedan registradas con transparencia.",
    comoFunciona: [
      { icono: ListChecks, texto: "Cualquier miembro puede abrir una propuesta con contexto y opciones claras." },
      { icono: Compass, texto: "El debate queda ordenado por argumentos, no por ruido ni popularidad." },
      { icono: Sparkles, texto: "Puedes delegar tu voto en un tema concreto a alguien de confianza y revocarlo cuando quieras." },
    ],
    empiezaPor: "Entra, lee una propuesta activa y emite tu primer voto.",
  },
  "/pizarra": {
    queEs:
      "Un lienzo compartido para pensar en dibujos. Bosqueja ideas, mapas y esquemas a mano alzada, solo o en colaboración, y conviértelos en piezas del Lienzo Universal.",
    comoFunciona: [
      { icono: ListChecks, texto: "Dibuja, escribe y mueve elementos libremente sobre el lienzo." },
      { icono: Compass, texto: "Comparte la pizarra con otros para co-crear en tiempo real." },
      { icono: Sparkles, texto: "Todo lo que creas es una entidad única: al compartirse se referencia, no se duplica." },
    ],
    empiezaPor: "Abre una pizarra nueva y dibuja el mapa de tu próximo proyecto.",
  },
  "/navegador": {
    queEs:
      "Tu puerta de exploración por la red. Descubre páginas, nodos, contenidos y servicios del ecosistema StarSeed, y guarda ventanas y recorridos para retomarlos donde los dejaste.",
    comoFunciona: [
      { icono: Compass, texto: "Explora contenidos y nodos de la red desde un solo lugar." },
      { icono: ListChecks, texto: "Las ventanas que guardas se conservan y puedes reabrirlas luego." },
      { icono: Sparkles, texto: "Astraura puede sugerirte rutas según tus intereses y memorias." },
    ],
    empiezaPor: "Abre el navegador y explora las páginas destacadas de la red.",
  },
  "/conexiones": {
    queEs:
      "El panel donde vinculas personas, grupos y servicios externos a tu cuenta (correo, almacenamiento, calendarios…). Ojo: distinto de la conectividad de red (malla, Wi-Fi, Bluetooth), que vive en la Red Mesh y el Centro de Conexiones del escritorio.",
    comoFunciona: [
      { icono: Compass, texto: "Explora el catálogo de conectores disponibles y activa los que uses a diario." },
      { icono: ListChecks, texto: "Cada conector pide permisos claros antes de acceder a nada." },
      { icono: Sparkles, texto: "Toda vinculación es revocable: decides qué entra y cuándo deja de entrar." },
    ],
    empiezaPor: "Abre las conexiones y vincula un servicio que uses todos los días.",
  },
  "/correos": {
    queEs:
      "Tu correo soberano. Tu dirección interna @star.seed te identifica en la red, y puedes vincular tus correos externos para leerlos y enviarlos desde un solo buzón.",
    comoFunciona: [
      { icono: ListChecks, texto: "El primer correo externo que vinculas queda como tu vía de recuperación." },
      { icono: Compass, texto: "Los correos externos se sincronizan (DNS/sync) sin salir del OS." },
      { icono: Sparkles, texto: "Los mensajes internos viajan cifrados entre miembros de la red." },
    ],
    empiezaPor: "Reclama tu dirección @star.seed si aún no lo hiciste en la guía.",
  },
  "/seguridad": {
    queEs:
      "La caja fuerte de tu cuenta. Gestiona tus claves, sesiones, métodos de recuperación y la privacidad de tus datos: qué se comparte, con quién y dónde se guarda.",
    comoFunciona: [
      { icono: ListChecks, texto: "Revisa y cierra sesiones abiertas en otros dispositivos." },
      { icono: Compass, texto: "Configura correo, teléfono y canales verificados para recuperar tu cuenta." },
      { icono: Sparkles, texto: "Tus datos son privados por defecto; la transparencia es para lo público." },
    ],
    empiezaPor: "Comprueba que tienes al menos un método de recuperación verificado.",
  },
  "/library": {
    queEs:
      "La biblioteca universal de la red: contenidos, apps instalables y recursos educativos, tuyos y compartidos. Todo es una entidad única que se referencia, nunca se duplica.",
    comoFunciona: [
      { icono: ListChecks, texto: "Instala apps y recursos con un clic; aparecen en tu dock y catálogo." },
      { icono: Compass, texto: "Guarda libros, guías y piezas de cultura en tu colección personal." },
      { icono: Sparkles, texto: "Las actualizaciones de una pieza se reflejan en todas sus referencias." },
    ],
    empiezaPor: "Explora la biblioteca e instala una app que te llame la atención.",
  },
  "/hub": {
    queEs:
      "El punto de encuentro de las comunidades. Descubre y únete a sanghas y grupos, coordina eventos y conversa con las personas de la red alrededor de intereses comunes.",
    comoFunciona: [
      { icono: Compass, texto: "Explora el mapa de comunidades y nodos físicos activos." },
      { icono: ListChecks, texto: "Únete a grupos, participa en sus espacios y coordina encuentros." },
      { icono: Sparkles, texto: "Cada comunidad organiza sus propios espacios de decisión y cultura." },
    ],
    empiezaPor: "Entra al hub y únete a una comunidad cercana a tus intereses.",
  },
  "/crear": {
    queEs:
      "El Centro de Creación: tu puerta al Lienzo Universal. Publicas entidades únicas — textos, imágenes, piezas, páginas — que se referencian en toda la red sin duplicarse.",
    comoFunciona: [
      { icono: ListChecks, texto: "Elige qué crear (publicación, pieza, página) y el lienzo lo prepara." },
      { icono: Compass, texto: "Lo que publicas puede aparecer en tu perfil, la red y las comunidades." },
      { icono: Sparkles, texto: "Las actualizaciones se propagan a todas las instancias compartidas." },
    ],
    empiezaPor: "Crea tu primera publicación y compártela con la red.",
  },
  "/profile": {
    queEs:
      "Tu cara pública en la red. Una cuenta puede tener varios perfiles (cívico, artístico, profesional); cada uno muestra lo que tú decides, y la responsabilidad siempre recae en tu cuenta raíz.",
    comoFunciona: [
      { icono: ListChecks, texto: "Edita tu nombre, @handle, bio y fotos cuando quieras." },
      { icono: Compass, texto: "Crea perfiles distintos para facetas distintas de tu vida en la red." },
      { icono: Sparkles, texto: "Tu registro personal queda en la cuenta privada; el perfil es lo visible." },
    ],
    empiezaPor: "Abre tu perfil y completa la bio y la foto.",
  },
  "/escritorios": {
    queEs:
      "Tus espacios de trabajo visuales. Organiza ventanas, widgets y accesos en varios escritorios según lo que estés haciendo: crear, decidir, aprender o explorar.",
    comoFunciona: [
      { icono: ListChecks, texto: "Cada escritorio guarda su disposición de ventanas y widgets." },
      { icono: Compass, texto: "Cambia de escritorio para cambiar de contexto sin cerrar nada." },
      { icono: Sparkles, texto: "El dock y la barra superior te acompañan en todos los escritorios." },
    ],
    empiezaPor: "Crea un segundo escritorio y deja en él solo lo de un proyecto.",
  },
  "/red-mesh": {
    queEs:
      "El mapa vivo de la malla de la red: nodos LoRa/Meshtastic, rutas y señal en 3D. Ves cómo respira la infraestructura física que sostiene la red sin servidores centrales.",
    comoFunciona: [
      { icono: Compass, texto: "El mapa 3D muestra nodos, enlaces y topología en tiempo real." },
      { icono: ListChecks, texto: "Cada neurona puede actuar como nodo y federar su topología." },
      { icono: Sparkles, texto: "Los mensajes de la malla viajan por radio, cifrados y con duty cycle cuidado." },
    ],
    empiezaPor: "Abre el mapa y localiza tu neurona entre los nodos activos.",
  },
};

// Explicación genérica por si se añade un área sin texto propio todavía.
function explicacionDe(area: AreaTip): ExplicacionArea {
  return (
    EXPLICACIONES[area.path] ?? {
      queEs: area.tip,
      comoFunciona: [
        { icono: Compass, texto: "Entra y explora: la zona se explica sola con sus propias vistas." },
        { icono: Sparkles, texto: "Astraura puede guiarte dentro: pídele ayuda en cualquier momento." },
      ],
      empiezaPor: `Abre ${area.label} y mira a tu alrededor sin miedo.`,
    }
  );
}

export function AreasExplicadas({
  areas,
  onIr,
}: {
  areas: AreaTip[];
  onIr: (path: string) => void;
}) {
  const [abierta, setAbierta] = useState<AreaTip | null>(null);

  const explicacion = useMemo(
    () => (abierta ? explicacionDe(abierta) : null),
    [abierta],
  );

  return (
    <>
      <div className="grid sm:grid-cols-2 gap-2">
        {areas.map((a) => {
          const Icon = a.icon;
          return (
            <button
              key={a.path}
              type="button"
              onClick={() => setAbierta(a)}
              className="group cursor-pointer rounded-xl border border-white/10 bg-white/[0.02] p-3 text-left transition-all hover:border-white/20 hover:bg-white/[0.05]"
            >
              <div className="mb-1 flex items-center gap-2">
                <Icon className={cn("h-4 w-4", a.accent)} />
                <span className="text-sm font-semibold text-white/90">{a.label}</span>
                <ChevronRight className="ml-auto h-3.5 w-3.5 text-white/30 transition-transform group-hover:translate-x-0.5" />
              </div>
              <p className="text-[11px] leading-snug text-white/50">{a.tip}</p>
            </button>
          );
        })}
      </div>

      <Dialog open={!!abierta} onOpenChange={(v) => { if (!v) setAbierta(null); }}>
        <DialogContent className="w-[95vw] sm:max-w-md">
          {abierta && explicacion && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04]">
                    <abierta.icon className={cn("h-4 w-4", abierta.accent)} />
                  </span>
                  <span className={abierta.accent}>{abierta.label}</span>
                </DialogTitle>
                <DialogDescription className="sr-only">
                  Qué es {abierta.label}, cómo funciona y por dónde empezar.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 text-left">
                <div>
                  <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45">
                    <Info className="h-3.5 w-3.5" /> Qué es
                  </p>
                  <p className="text-[13px] leading-relaxed text-white/80">{explicacion.queEs}</p>
                </div>

                <div>
                  <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45">
                    <ListChecks className="h-3.5 w-3.5" /> Cómo funciona
                  </p>
                  <ul className="space-y-2">
                    {explicacion.comoFunciona.map((punto, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-[12.5px] leading-snug text-white/70">
                        <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.04]">
                          <punto.icono className={cn("h-3 w-3", abierta.accent)} />
                        </span>
                        {punto.texto}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45">
                    <Sparkles className="h-3.5 w-3.5" /> Empieza por
                  </p>
                  <p className="text-[12.5px] leading-snug text-white/75">{explicacion.empiezaPor}</p>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <Button variant="ghost" size="sm" onClick={() => setAbierta(null)}>
                    Cerrar
                  </Button>
                  <Button
                    size="sm"
                    className="gap-1.5 bg-gradient-to-r from-fuchsia-600 to-cyan-600 text-white hover:from-fuchsia-500 hover:to-cyan-500"
                    onClick={() => {
                      const destino = abierta.path;
                      setAbierta(null);
                      onIr(destino);
                    }}
                  >
                    Ir a {abierta.label} <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
