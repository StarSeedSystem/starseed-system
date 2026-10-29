'use client';

/**
 * CUERPO 3D DEL BOT (AV1011C). Contrato: architecture/astraura-avatares-3d.md §2, §6 y §8.
 *
 * La orbe del bot puede ser su avatar 3D: este widget monta el ADN del bot (o su orbe con el tono y
 * el aura) y le da vida con la emoción expresada, las visemas del habla y el motor único de movimiento
 * (que respeta `adn.movimiento`). Se pausa al ocultarse la pestaña y no anima con prefers-reduced-motion
 * (lo resuelven `useMovimiento` y `AvatarVivo`). No lee red: el ADN sale del almacén local una vez.
 */

import { useEffect, useMemo, useState } from 'react';
import type { AvatarCalidad } from '@/lib/xr/calidad-perfiles';
import type { Bot, EstadoEmocional } from '@/lib/astraura-bots/tipos';
import type { AdnAvatar } from '@/lib/avatares/adn/adn';
import { adnActualDeDueno, parseAdnEntry } from '@/lib/avatares/adaptadores/almacen-adn';
import { adnConEmocion, adnConVisemas, adnDeBot, gestoDeBot, usaAdnDeBot } from '@/lib/avatares/adaptadores/adn-de-bot';
import { AvatarVivo } from '@/components/avatares/avatar-vivo';
import { useMovimiento } from '@/components/avatares/usar-movimiento';
import { cn } from '@/lib/utils';

export interface Cuerpo3dBotProps {
  bot: Bot;
  estadoEmocional?: EstadoEmocional | null;
  /** Lo que el bot dice ahora mismo; alimenta visemas y gesto. */
  texto?: string;
  hablando?: boolean;
  activo?: boolean;
  tamano?: number;
  calidad?: AvatarCalidad;
  className?: string;
}

export function Cuerpo3dBot({
  bot,
  estadoEmocional = null,
  texto = '',
  hablando = false,
  activo = true,
  tamano = 168,
  calidad = 'vrm',
  className,
}: Cuerpo3dBotProps) {
  const [guardado, setGuardado] = useState<AdnAvatar | null>(null);
  const [visible, setVisible] = useState(true);

  // Una lectura del ADN guardado por bot (el almacén ya cachea por referencia); si no hay, se crea.
  useEffect(() => {
    let vivo = true;
    const entry = adnActualDeDueno({ tipo: 'bot', id: bot.id });
    if (!entry) {
      setGuardado(null);
      return () => { vivo = false; };
    }
    void parseAdnEntry(entry)
      .then((adn) => { if (vivo) setGuardado(adn); })
      .catch(() => { if (vivo) setGuardado(null); });
    return () => { vivo = false; };
  }, [bot.id, bot.cuerpo.avatarRef]);

  // Pausa al ocultarse la pestaña: ni gesto ni clip mientras nadie mira.
  useEffect(() => {
    const mirar = () => setVisible(!document.hidden);
    mirar();
    document.addEventListener('visibilitychange', mirar);
    return () => document.removeEventListener('visibilitychange', mirar);
  }, []);

  const adn = useMemo(() => adnDeBot(bot, guardado), [bot, guardado]);
  const conEmocion = useMemo(() => adnConEmocion(adn, estadoEmocional), [adn, estadoEmocional]);
  const gesto = useMemo(
    () => (hablando && texto.trim() ? gestoDeBot(conEmocion, texto, estadoEmocional) : null),
    [hablando, texto, conEmocion, estadoEmocional],
  );
  const { clip, fotograma, nivel } = useMovimiento(gesto, {
    personalidadId: bot.id,
    activo: activo && visible,
  });
  const mostrado = useMemo(
    () => (hablando && texto.trim() ? adnConVisemas(conEmocion, texto) : conEmocion),
    [hablando, texto, conEmocion],
  );

  if (!usaAdnDeBot(bot)) return null;

  const raiz = clip?.raiz?.[fotograma]?.[1] ?? 0;
  const giro = clip?.rotaciones?.[fotograma]?.[0] ?? 0;
  const movimiento = clip
    ? `translateY(${Math.max(-4, Math.min(4, raiz * 160)).toFixed(2)}px) rotate(${Math.max(-4, Math.min(4, giro * 40)).toFixed(2)}deg)`
    : undefined;

  return (
    <div
      className={cn('relative inline-flex select-none flex-col items-center gap-1', className)}
      style={{ width: tamano + 8 }}
      data-nivel-movimiento={nivel ?? undefined}
      aria-label={`Avatar 3D de ${bot.nombre}${mostrado.expresionBase.neutral ? ' en calma' : ''}`}
    >
      <div style={movimiento ? { transform: movimiento, transition: 'transform 90ms linear' } : undefined}>
        <AvatarVivo adn={mostrado} calidad={calidad} tamano={tamano} />
      </div>
    </div>
  );
}
