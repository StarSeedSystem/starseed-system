'use client';

import { useEffect, useRef } from 'react';
import type { Capa } from '../../lib/astraura-bots/capa-pantalla';

interface CapaPantallaBotProps {
  capas: Capa[];
  onRemoveCapa: (id: string) => void;
}

/** Componente que pinta las capas activas sobre la pantalla. */
export default function CapaPantallaBot({ capas, onRemoveCapa }: CapaPantallaBotProps) {
  const containerRef = useRef<HTMLElement | null>(null);
  const layerRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    // Crear el contenedor del overlay si no existe
    if (typeof document !== 'undefined' && document.body) {
      let container = document.getElementById('astraura-bots-screen-overlay');
      if (!container) {
        container = document.createElement('div');
        container.id = 'astraura-bots-screen-overlay';
        container.style.position = 'fixed';
        container.style.inset = '0';
        container.style.pointerEvents = 'none';
        container.style.zIndex = '400'; // Por encima del screen-overlay de Aurora (z-index 300)
        document.body.appendChild(container);
      }
      containerRef.current = container;

      // Limpiar capas anteriores cuando el componente se monta o cuando cambian las capas
      return () => {
        // No eliminamos el contenedor porque podría ser usado por otros componentes
        // Pero sí eliminamos las capas que creamos
        layerRefs.current.forEach((el) => {
          if (el.parentNode) {
            el.parentNode.removeChild(el);
          }
        });
        layerRefs.current.clear();
      };
    }
  }, [capas, onRemoveCapa]);

  useEffect(() => {
    if (!containerRef.current) return;

    // Eliminar capas que ya no están en el arreglo
    const currentIds = new Set(capas.map((c) => c.id));
    layerRefs.current.forEach((el, id) => {
      if (!currentIds.has(id)) {
        if (el.parentNode) {
          el.parentNode.removeChild(el);
        }
        layerRefs.current.delete(id);
      }
    });

    // Crear o actualizar capas
    capas.forEach((capa) => {
      let capaEl = layerRefs.current.get(capa.id);
      if (!capaEl) {
        capaEl = document.createElement('div');
        capaEl.style.position = 'absolute';
        capaEl.style.pointerEvents = 'auto'; // Para que los botones sean interactivos
        layerRefs.current.set(capa.id, capaEl);
        containerRef.current?.appendChild(capaEl);
      }

      // Actualizar el contenido de la capa según su tipo
      renderCapa(capaEl, capa, onRemoveCapa);
    });
  }, [capas, onRemoveCapa]);

  return null;
}

/**
 * Renderiza una capa en el elemento dado.
 */
function renderCapa(
  el: HTMLDivElement,
  capa: Capa,
  onRemoveCapa: (id: string) => void
): void {
  // Limpiar el contenido
  el.innerHTML = '';

  // Determinar la posición y tamaño basada en el objetivo
  let rect: DOMRect | null = null;
  if (capa.objetivo) {
    const targetEl = document.getElementById(capa.objetivo);
    if (targetEl) {
      rect = targetEl.getBoundingClientRect();
    }
  }

  // Si no hay objetivo o no se encontró el elemento, usar el centro de la pantalla
  if (!rect) {
    const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
    rect = {
      x: vw / 2,
      y: vh / 2,
      width: 0,
      height: 0,
      top: vh / 2,
      right: vw - vw / 2,
      bottom: vh - vh / 2,
      left: vw / 2,
    } as DOMRect;
  }

  // Estilo base de la capa
  el.style.left = `${rect.left}px`;
  el.style.top = `${rect.top}px`;
  // Nota: no establecemos width y height porque se ajustarán al contenido

  // Contenido de la capa según el tipo
  switch (capa.forma) {
    case 'resaltar': {
      // Dibujar un resaltado alrededor del objetivo
      const highlight = document.createElement('div');
      highlight.style.position = 'absolute';
      highlight.style.border = '2px solid #FFBF00'; // Ámbar Solar
      highlight.style.borderRadius = '4px';
      highlight.style.background = 'rgba(255, 191, 0, 0.1)';
      highlight.style.left = `-2px`;
      highlight.style.top = `-2px`;
      highlight.style.width = `${rect.width + 4}px`;
      highlight.style.height = `${rect.height + 4}px`;
      el.appendChild(highlight);
      break;
    }
    case 'nota': {
      // Una nota de texto cerca del objetivo
      const nota = document.createElement('div');
      nota.style.position = 'absolute';
      nota.style.background = 'rgba(10, 14, 24, 0.8)';
      nota.style.color = '#FFE9B8';
      nota.style.padding = '8px 12px';
      nota.style.borderRadius = '6px';
      nota.style.fontSize = '14px';
      nota.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
      nota.style.maxWidth = '200px';
      nota.style.wordBreak = 'break-word';
      nota.textContent = capa.texto || '';
      // Posicionar la nota arriba del objetivo, centrada horizontalmente
      nota.style.left = `${rect.left + rect.width / 2 - nota.offsetWidth / 2}px`;
      nota.style.top = `${rect.top - nota.offsetHeight - 8}px`;
      el.appendChild(nota);
      break;
    }
    case 'flecha': {
      // Una flecha apuntando al objetivo
      const flecha = document.createElement('div');
      flecha.style.position = 'absolute';
      flecha.style.width = '0';
      flecha.style.height = '0';
      flecha.style.borderLeft = '6px solid transparent';
      flecha.style.borderRight = '6px solid transparent';
      flecha.style.borderBottom = '12px solid #FFBF00';
      // Posicionar la flecha arriba del objetivo, centrada horizontalmente
      flecha.style.left = `${rect.left + rect.width / 2 - 6}px`;
      flecha.style.top = `${rect.top - 12}px`;
      el.appendChild(flecha);
      break;
    }
    case 'widget': {
      // Widget: mostrar el UiSpec o un mensaje de próximo renderizador
      const widget = document.createElement('div');
      widget.style.position = 'absolute';
      widget.style.background = 'rgba(10, 14, 24, 0.8)';
      widget.style.color = '#FFE9B8';
      widget.style.padding = '12px';
      widget.style.borderRadius = '6px';
      widget.style.fontSize = '14px';
      widget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
      widget.style.maxWidth = '300px';
      widget.style.maxHeight = '200px';
      widget.style.overflow = 'auto';
      // Si tuviéramos un renderizador de UiSpec, lo usaríamos aquí
      // Por ahora, mostramos un mensaje
      widget.textContent = 'Próximamente: renderizador de UiSpec';
      // Posicionar el widget arriba del objetivo
      widget.style.left = `${rect.left}px`;
      widget.style.top = `${rect.top - widget.offsetHeight - 8}px`;
      el.appendChild(widget);
      break;
    }
  }

  // Botón de quitar
  const botonQuitar = document.createElement('button');
  botonQuitar.textContent = 'Quitar';
  botonQuitar.style.position = 'absolute';
  botonQuitar.style.bottom = '-24px'; // Debajo de la capa
  botonQuitar.style.left = '50%';
  botonQuitar.style.transform = 'translateX(-50%)';
  botonQuitar.style.padding = '4px 8px';
  botonQuitar.style.background = 'rgba(30, 30, 30, 0.7)';
  botonQuitar.style.color = '#FFE9B8';
  botonQuitar.style.border = 'none';
  botonQuitar.style.borderRadius = '4px';
  botonQuitar.style.fontSize = '12px';
  botonQuitar.style.cursor = 'pointer';
  botonQuitar.style.pointerEvents = 'auto';
  botonQuitar.onclick = () => {
    onRemoveCapa(capa.id);
  };
  el.appendChild(botonQuitar);
}