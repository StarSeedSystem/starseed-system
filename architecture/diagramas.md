# Diagramas con Diagram Design: para Claude y para Astraura en todos los medios (2D, 3D y XR)

> **Petición de Alex (2026-10-18):** «instala esta repo tanto para nosotros en Claude en todos nuestros chats para el
> desarrollo de diagramas 3D tanto en los chats de Astraura como en la Protomolécula y en el lienzo universal de
> creación en todos los medios de la red, en pizarras, escritorios, en capas que Astraura puede traer de widgets
> flotantes de los resultados o en los chats o en mensajes o publicaciones y también autoactualizable en todos sus
> medios y en la Librería de StarSeed OS: https://github.com/cathrynlavery/diagram-design».

Amplía `protomolecula.md`, `laya-y-habilidades.md` (habilidades por capa), `fondos-shaders.md` (marca y tema por
perfil), `video-hyperframes.md` (las mismas superficies) y `starseed-xr.md`.

## 1. Qué es Diagram Design (comprobado el 2026-10-18)

- **Qué es:** una *skill* para agentes que dibuja diagramas como UN archivo HTML con SVG dentro, con estilo editorial
  y la marca de quien lo usa. 45 tipos: arquitectura (y su delta), estado actual de TI, flujo, secuencia, máquina de
  estados, entidad-relación, línea de tiempo, carriles, cuadrante, radar, polar, bucle, anidado, árbol, organigrama,
  pila de capas, **despiece y planta axonométrica (vistas en perspectiva)**, Venn, pirámide/embudo, barras, cascada,
  treemap, mapa de calor, líneas, Gantt, dispersión, Sankey, espina de pescado, Wardley, kanban, viaje de usuario,
  despliegue, dependencias, blueprint de servicio, clases UML, story map, esquema, ciclo de vida… Importa draw.io,
  Mermaid y Excalidraw; exporta SVG y PNG; anima con su guía de movimiento; perfiles de marca guardables.
- **Licencia: MIT.** Versión del plugin 2.6.110 (16-10-2026). **Sin servidor, sin cuentas y sin telemetría** (su
  PRIVACY.md); lo único externo es que el HTML generado carga sus fuentes de Google Fonts.
- **Lo que NO es:** un motor 3D. Dibuja en 2D; su «3D» son las vistas axonométricas y de despiece. El 3D real (girar,
  entrar en el diagrama, verlo en AR/VR) es la extensión de StarSeed de §3.
- **Los ejemplos animados llevan JavaScript** (6 de 217): por eso todo diagrama se muestra en un iframe aislado (§3).

## 2. Instalado hoy

- **Claude Code de la Mac:** plugin `diagram-design@diagram-design` 2.6.110 desde su marketplace de GitHub (solo las
  carpetas del plugin, 7 MB) con **autoactualización activada**. De paso, HyperFrames pasó de la copia local a su
  marketplace de GitHub, también con autoactualización (`extraKnownMarketplaces.*.autoUpdate`; copia de los ajustes
  en `~/.claude/settings.json.antes-1018`).
- **Chats de claude.ai (todos):** el directorio de plugins de Anthropic no lo tiene; Alex sube el `.zip` de la skill
  una vez en Ajustes de claude.ai (se le entregó `diagram-design-skill.zip`).
- **Para Astraura:** copia en `vendor/habilidades/diagram-design/` (SKILL.md, las 45 guías, scripts y plantillas).

## 3. Cómo entra en StarSeed

1. **Habilidad de Astraura** con sus tres tamaños (tarjeta, resumen, completa) y Laya eligiendo el tipo de diagrama
   entre los 45 por la petición (`choice` con la descripción de cada tipo).
2. **Herramienta `diagrama.crear`** en chats, agentes y bots: Astraura escribe el HTML+SVG con la marca del contexto
   (los tokens de tema de la persona, página o grupo, y los del fondo elegido) y el OS lo valida antes de mostrarlo.
3. **Mostrar siempre aislado:** iframe `sandbox` sin `allow-same-origin` (los scripts de una animación, si los hay,
   no tocan el OS), política de contenido que bloquea red y recursos externos, fuentes servidas por el OS (sin
   Google Fonts), tamaño máximo. Si no pasa la validación, se muestra el motivo, no el diagrama.
4. **Dónde aparece** (como los demás widgets y ventanas): mensajes y respuestas de Astraura, publicaciones y lienzo
   universal (bloque de la Protomolécula), pizarra (ventana), escritorio y dashboard (widget), capa flotante que
   Astraura trae con un resultado, y átomo «diagrama» de la Protomolécula para combinarlo con otros.
5. **3D y XR propios:** del SVG se extrae la estructura (nodos, aristas, capas y grupos); los tipos de capas,
   despiece y planta axonométrica se apilan en profundidad y los de grafo se reparten en el espacio, con Three.js
   (ya en el OS), para girarlos, recorrerlos y llevarlos a salas 3D y AR/VR.
6. **Edición en grupo:** lo que se sincroniza en una sala es la especificación del diagrama (tipo, nodos, textos,
   colores), con la misma fusión de `sincronia-sala.ts`; el HTML se regenera en cada neurona.
7. **Se actualiza solo:** el vigía vigila el repo y su manifiesto de plugin; la copia de `vendor/` se renueva entera.

## 4. Tareas (Ola 1018D, `cola-diagramas-1018.json`)

| Bloque | Tareas |
|---|---|
| Fichas | A Biblioteca · B Protomolécula (pizarras-diagramas) |
| Seguridad y marca | C aislar y validar el HTML · D fuentes del OS · E perfil de marca desde los tokens de tema |
| IA | F herramienta `diagrama.crear` · G habilidad por capas y elección del tipo con Laya |
| Superficies | H átomo «diagrama» · I vista con zoom y exportar · J widget, pizarra, escritorio y flotante · K bloque en lienzo, publicaciones y mensajes |
| 3D, importar y grupo | L diagrama 3D y XR · M importar draw.io, Excalidraw y Mermaid · N edición en grupo · O vigía |

Cada tarea toca como mucho 3 archivos y 120 líneas por archivo. Las escribe el enjambre; Claude dirige y verifica en
localhost (chat de Astraura, pizarra y una publicación con un diagrama).
