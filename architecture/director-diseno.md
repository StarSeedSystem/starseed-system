# Director de diseño — contrato (Ola 1005D · 2026-10-04)

> **Petición de Alex (2026-10-04):** un director de diseño que tenga en cuenta el contexto completo de
> cada tarea y de cada agente para mejorarlo con herramientas, habilidades, conectores, plugins y
> memorias de estilos de diseño. Pide una estética coherente basada en patrones armónicos y geometría
> sagrada en todas las proporciones y escalas, y la identidad gráfica de cada contexto. Como
> referencias, las fuentes de diseño de StarSeed OS y de todo el proyecto, 21st.dev y sitios
> profesionales y premiados, más las tendencias actuales. Quiere innovación artística, creativa,
> multifuncional, intuitiva y súper atractiva. Debe pensar en todos los tamaños y proporciones de
> pantalla, tipos de dispositivo y sistemas operativos, e identificar el propósito y el objetivo de
> cada pantalla. Usa las herramientas que hemos desarrollado, los repos de diseño de la Biblioteca de
> StarSeed OS, y además: assistant-ui, Tambo, CopilotKit, Vercel AI SDK, Mastra, LangGraph.js,
> OpenDesign (nexu-io y la variante manalkaff), taste-skill y UI-TARS (y UI-TARS-desktop).

Este documento es la fuente de verdad del director de diseño. Lo que no esté aquí no forma parte
del contrato. Servicio: `diseno` (launchd `com.starseed.diseno`). Firma en el canal y en el Chat
Director: `director-diseno`.

## 1. Qué hace, en tres momentos de cada tarea de interfaz

Una tarea es **de interfaz** si declara algún archivo `.tsx`, `.css`, `.module.css` o `.mdx` bajo
`src/`, `tailwind.config.ts`, un tema, un widget, un fondo o un icono. La regla es la misma que usa
el rol `design` en `scripts/puente/roles_agente.py`.

1. **Antes de escribir, el brief (§3).** Al entrar la tarea en la tanda, el director le escribe un
   *Brief de diseño* con `mensajes_agente.anotar(olas, tid, texto, de="director-diseno")`. Llega a
   su worktree como `MENSAJES-DEL-DIRECTOR.md` y a su prompt por `para_prompt`. Además, las reglas
   fijas de diseño viven en `contexto_agente.REGLAS` (§6), así que llegan a todos los escritores y
   revisores sin gastar nada.
2. **Al revisar, la verificación de diseño (§4).** Cuando una tarea de interfaz pasa las puertas, el
   director captura sus rutas en la matriz de pantallas, mide y puntúa. Si no llega al umbral, deja
   un mensaje con los arreglos concretos al revisor y al agente.
3. **Después, aprender (§5).** Guarda el resultado en la memoria de diseño: qué funcionó, por área,
   por modelo y por tipo de pantalla. Una vez por semana pone al día las tendencias.

## 2. La memoria de diseño (`memory/diseno/`)

Es la fuente de verdad de estilo. La leen el brief, las reglas y los agentes.

- `identidades.md`: una ficha por contexto. Cada ficha lleva propósito, público, paleta (con sus
  tokens), tipografía, materiales, movimiento, motivos geométricos y qué NO hacer. Contextos:
  StarSeed OS/Nexus (Trinity de `DESIGN.md`: Zenith `#007FFF`, Creation `#10B981`, Logic `#FFBF00`,
  Anchor `#DC143C`), Astraura (cian `#00f0ff`), Mando (`mando-cristal.css`), Café (pergamino +
  terracota `#C05C3B`, Fraunces + Space Mono), Audiomorphic (violeta `#A855F7` + oro `#D4AF37`),
  Materia Viva y los 12 presets de `curated-presets.ts`. Las cifras y rutas se citan del código,
  nunca de memoria.
- `armonia.md`: la geometría.
  - Escala tipográfica φ (1.618; en pantallas chicas, 1.25).
  - Espaciado Fibonacci (2, 3, 5, 8, 13, 21, 34, 55, 89, 144 px).
  - Rejilla áurea (columnas 1 : 1.618) y radios armónicos.
  - Proporciones de tarjetas y medios: φ, 3:2, 16:9 y 1:1, cada una con su uso.
  - La geometría sagrada como **estructura de composición**: vesica piscis para superposiciones,
    Flor de la Vida y Semilla para vacíos y fondos, Metatrón y sólidos platónicos para escenas 3D,
    espiral áurea para el foco visual. Se reutiliza lo que ya existe en
    `src/lib/audiomorphic/geometry-drawers.ts` y `desktop-empty.tsx`, nunca como decoración que
    tape contenido.
- `referencias.md`: las referencias, con enlace y para qué sirve cada una.
  - **Las del proyecto:** `DESIGN.md`, `design-system/starseed-system/DESIGN_RULES.md`,
    `theme-antigravity-flux/`, `src/app/globals.css`, `src/components/mando/mando-cristal.css`,
    `src/lib/themes/curated-presets.ts`, `src/lib/design/theme-catalog.ts`,
    `architecture/design-system-figma.md`, la Biblioteca (`src/lib/library/packages.ts`) y las
    skills de `.agent/skills/`.
  - **Las externas:** 21st.dev, Awwwards, CSS Design Awards, The FWA, Godly, Mobbin, Land-book,
    Lapa Ninja, SiteInspire, Dribbble y Behance.
  - **Los repos de §7**, cada uno con su caso de uso.
- `tendencias.md`: fechado. Cada lunes, el director encola una tarea `DIST<AAMMDD>` que revisa las
  galerías de `referencias.md` y anota de 5 a 10 tendencias, cada una con su enlace y cómo encaja (o
  no) en cada identidad.
- `aprendizajes.md`: la línea de §5.

## 3. El brief (`scripts/puente/diseno_brief.py`, puro)

`es_de_interfaz(tarea) -> bool` y `brief(tarea, memoria, max_chars=2500) -> str`. El brief lleva, en
este orden:

1. **Propósito y objetivo** de la pantalla. Se deducen del título y el prompt de la tarea y de
   `src/lib/mando/areas.ts`. Si no se pueden deducir, se pide al agente que los escriba en una línea
   en el commit.
2. **Identidad** que aplica (§2), con sus tokens. Prohibidos los hex sueltos si existe el token.
3. **Matriz de pantallas.**
   - Tamaños: móvil 360×780 y 430×932, tablet 768×1024 y 1024×1366, escritorio 1280×800 y
     1920×1080, TV 3840×2160, y plegable 280 px.
   - Entradas: táctil y puntero.
   - Sistemas: iOS, Android, macOS, Windows y Linux. Las diferencias que importan son safe areas,
     scroll elástico, fuentes del sistema y teclado virtual.
   - Accesibilidad: `prefers-reduced-motion`, `prefers-color-scheme`, contraste ≥ 4.5:1 y dianas de
     44 px.
4. **Armonía** (§2) que aplica a ESTE componente: qué escala, qué rejilla y qué motivo.
5. **Referencias**: de 2 a 4 elegidas de `referencias.md` para este tipo de pantalla. Por ejemplo, un
   chat → assistant-ui; una tarjeta → 21st.dev.
6. **Herramientas y skills** útiles para la tarea (§7), con el comando o la ruta.
7. **Lo que hará la verificación** (§4), para que el agente lo compruebe antes de terminar.

## 4. Verificación de diseño

- `scripts/puente/diseno_verificar.mjs` (Playwright, ya instalado; sin dependencias nuevas): recibe
  las rutas y la matriz de §3.3. Por cada combinación guarda una captura en
  `starseed_memory_root/diseno/capturas/<tid>/` y mide:
  - Desbordes: un elemento visible con `scrollWidth > clientWidth + 1` y texto cortado.
  - Contraste del texto (WCAG, calculado en la página).
  - Dianas táctiles por debajo de 44 px en las anchuras de móvil.
  - Errores de consola.
  - Elementos fuera del viewport en horizontal.
  
  Devuelve JSON.
- `scripts/puente/diseno_reglas.py` (puro): convierte el JSON más el diff (hex sueltos frente a
  tokens, px fuera de la escala, `!important`, `z-index` disparatados) en una **nota de 0 a 100** y
  una lista de arreglos concretos. El umbral por defecto es 75.
- **Juez visual opcional:** un modelo de visión gratuito de la flota (por las pasarelas) mira las
  capturas de móvil y escritorio y puntúa coherencia con la identidad, jerarquía, armonía y
  atractivo. Si UI-TARS está disponible por API, se usa para recorrer la pantalla como un usuario.
  Jev (`puntuar`) combina la nota mecánica y la del juez. El juez nunca baja una nota mecánica de
  aprobado a suspenso por sí solo: frena, como Jev en el optimizador.

## 5. Aprender y mejorar

- Por cada tarea verificada se añade una línea a `memory/diseno/aprendizajes.md` con la nota, los
  fallos y el modelo que escribió.
- Por modelo y tipo de pantalla, `~/.starseed/diseno/pesos-modelos.json` guarda la nota media. El
  director **recomienda** al optimizador (no lo toca él) qué escritores van delante para tareas de
  interfaz: escribe en `~/.starseed/diseno/recomendacion-rotacion.json`, y el optimizador lo lee como
  una métrica más.
- Si un fallo se repite (por ejemplo, desbordes en 430 px), propone una regla nueva para §6. No la
  escribe solo: va al informe.

## 6. Reglas fijas para todos los agentes (`contexto_agente.REGLAS`)

Reglas cortas para escritor y revisor en tareas de interfaz. Cada una cita su fuente en
`memory/diseno/`:

- tokens antes que hex;
- escala φ y espaciado Fibonacci;
- un solo foco visual por vista;
- nada de texto cortado ni elementos pegados en 360 px;
- motion-safe;
- contraste ≥ 4.5:1;
- dianas de 44 px;
- la identidad del área manda;
- comprobar la matriz antes de terminar.

En `starseed-enjambre.py`, `AREAS_CONTEXTO` gana el área `diseno`, que salta con las palabras de
interfaz y apunta a `memory/diseno/`.

## 7. Herramientas y repos (qué es cada uno y cuándo se propone)

| Repo | Cuándo |
|---|---|
| assistant-ui — https://github.com/assistant-ui/assistant-ui | chats e hilos (Chat Director, Astraura, mensajería) |
| Tambo — https://github.com/tambo-ai/tambo | interfaz generativa: componentes que elige un modelo |
| CopilotKit — https://github.com/copilotkit/copilotkit | copilotos dentro de la app y acciones del agente sobre la UI |
| Vercel AI SDK — https://github.com/vercel/ai | streaming de modelos en la UI (ya en uso: no duplicar) |
| Mastra — https://github.com/mastra-ai/mastra | agentes y flujos en TS del lado del front |
| LangGraph.js — https://github.com/langchain-ai/langgraphjs | grafos de agentes con estado |
| OpenDesign — https://github.com/nexu-io/open-design (variante: https://github.com/manalkaff/opendesign) | espacio de diseño con agentes (piezas gráficas, carteles) |
| taste-skill — https://github.com/Leonxlnx/taste-skill | criterio estético para agentes (ya en la Biblioteca como `iatool-taste-skill`) |
| UI-TARS — https://github.com/bytedance/UI-TARS (escritorio: https://github.com/bytedance/UI-TARS-desktop) | agente que ve y usa la interfaz: verificación de §4 |

Ninguno se instala en el repo sin una tarea propia. El director los propone en el brief y la
Biblioteca los lista (`packages.ts`, sección «Herramientas de diseño»).

## 8. Integración

- `scripts/puente/director-diseno.py`: el bucle cada 120 s. Detecta tareas de interfaz nuevas → brief.
  Detecta tareas de interfaz integradas → verificación. Una vez por hora, informe al Chat Director
  (`director_chat.publicar(..., de="director-diseno")`) con las notas, los fallos repetidos, los
  modelos mejor y peor en interfaz y las tendencias nuevas. Admite `--una-vez` y `--seco`.
- `config_director.py` y `director-config.ts` (espejos): bloque `diseno: {activo: true, umbral: 75,
  juez_visual: true, max_capturas_tarea: 14, intervalo_s: 120}`.
- `src/lib/mando/director-datos.ts`: `"diseno"` en `DIRECTORES`, con el alias de `quien`
  `director-diseno`.
- `instalar-servicios.py`: servicio `diseno` envuelto con `lanzador-tcc.py`.
- Nunca toca claves, `git push`, Supabase ni datos de nadie. Las capturas viven en
  `starseed_memory_root/diseno/capturas/` y se podan a los 7 días.
