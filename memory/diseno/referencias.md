# Referencias de diseño

Catálogo para elegir entre dos y cuatro referencias por brief. Las fuentes internas fijan la
identidad; las galerías sirven para comparar patrones contemporáneos; los repos y skills aportan
una técnica concreta. Ninguna referencia externa autoriza copiar una interfaz ni instalar una
dependencia sin tarea propia (`architecture/director-diseno.md:57-65`; `architecture/director-diseno.md:144-164`).

## Fuentes del proyecto

- [`DESIGN.md`](../../DESIGN.md): atmósfera ontocrática, Trinity, cristal líquido, perímetro y presets de material; es la referencia conceptual del OS (`DESIGN.md:4-98`).
- [`DESIGN_RULES.md`](../../design-system/starseed-system/DESIGN_RULES.md): tokens, contraste, overflow, dianas, estados y checklist multitema; se consulta antes de diseñar un componente (`design-system/starseed-system/DESIGN_RULES.md:9-49`; `design-system/starseed-system/DESIGN_RULES.md:53-109`; `design-system/starseed-system/DESIGN_RULES.md:202-218`).
- [`theme_params.json`](../../theme-antigravity-flux/config/theme_params.json): valores ejecutables de Antigravity Flux para paleta, tipografía, geometría, elevación y accesibilidad (`theme-antigravity-flux/config/theme_params.json:13-82`; `theme-antigravity-flux/config/theme_params.json:97-155`).
- [`globals.css`](../../src/app/globals.css): verdad de runtime para tokens globales, tipografía y espacio fluidos, Materia Viva, Café y Audiomorphic (`src/app/globals.css:17-125`; `src/app/globals.css:2449-2507`; `src/app/globals.css:2567-3190`).
- [`mando-cristal.css`](../../src/components/mando/mando-cristal.css): patrón de cristal de bajo coste para paneles operativos, con presupuesto estricto de motion (`src/components/mando/mando-cristal.css:1-19`; `src/components/mando/mando-cristal.css:22-172`).
- [`curated-presets.ts`](../../src/lib/themes/curated-presets.ts): doce identidades completas para briefs por estado de ánimo; cada una coordina swatch, fondo, material, tipo y motion (`src/lib/themes/curated-presets.ts:16-41`; `src/lib/themes/curated-presets.ts:43-458`).
- [`theme-catalog.ts`](../../src/lib/design/theme-catalog.ts): catálogo ampliado de temas claro/oscuro y derivación de tokens HSL, cristal, material y radio responsivo (`src/lib/design/theme-catalog.ts:3-28`; `src/lib/design/theme-catalog.ts:99-188`; `src/lib/design/theme-catalog.ts:193-410`).
- [`design-system-figma.md`](../../architecture/design-system-figma.md): mapa de archivos Figma por marca y especificación común de identidad, temas y WidgetShell (`architecture/design-system-figma.md:5-20`; `architecture/design-system-figma.md:22-48`).
- [`packages.ts`](../../src/lib/library/packages.ts): inventario honesto de recursos instalables; Taste Skill ya está registrado y Audiomorphic declara sus capacidades y límites (`src/lib/library/packages.ts:783-790`; `src/lib/library/packages.ts:1400-1407`).
- [`.agent/skills/`](../../.agent/skills): procedimientos locales para analizar, especificar, implementar y verificar diseños; se elige la skill por la tarea, no por novedad.

## Galerías y referencias externas

- [21st.dev](https://21st.dev/) — componentes y microinteracciones de React; referencia para una tarjeta o control aislado.
- [Awwwards](https://www.awwwards.com/) — dirección de arte, narrativa y ejecución premiada; útil para landing y experiencias editoriales.
- [CSS Design Awards](https://www.cssdesignawards.com/) — composición y técnica CSS contemporánea; contrastar motion, layout y detalle.
- [The FWA](https://thefwa.com/) — experiencias digitales experimentales; referencia para inmersión, 3D y multimedia.
- [Godly](https://godly.website/) — patrones visuales de producto y marketing; comparar ritmo, hero y transiciones.
- [Mobbin](https://mobbin.com/) — flujos reales de producto móvil y web; referencia para onboarding, ajustes y tareas recurrentes.
- [Land-book](https://land-book.com/) — layouts de landing y portafolio; estudiar jerarquía y secciones, no identidad de marca.
- [Lapa Ninja](https://www.lapa.ninja/) — landing pages por industria y bloque; referencia para estructura y conversión.
- [SiteInspire](https://www.siteinspire.com/) — sitios seleccionados por estilo y tipología; comparar sistemas visuales completos.
- [Dribbble](https://dribbble.com/) — exploración visual y detalle; usar como hipótesis, nunca como prueba de usabilidad.
- [Behance](https://www.behance.net/) — casos extensos de identidad y proceso; útil para entender sistema, marca y aplicaciones.

Las galerías alimentan `tendencias.md` semanalmente con fecha, enlace y encaje por identidad; no
reemplazan las fuentes internas (`architecture/director-diseno.md:66-68`).

## Repos de interfaz y agentes

- [assistant-ui](https://github.com/assistant-ui/assistant-ui) — chats, hilos, streaming y composición conversacional para Chat Director, Astraura y mensajería.
- [Tambo](https://github.com/tambo-ai/tambo) — interfaz generativa donde un modelo elige componentes registrados; proponer cuando la respuesta debe convertirse en UI.
- [CopilotKit](https://github.com/copilotkit/copilotkit) — copilotos embebidos y acciones del agente sobre la interfaz; referencia para colaboración humano/agente visible.
- [Vercel AI SDK](https://github.com/vercel/ai) — streaming de modelos, mensajes y herramientas en React/Next; ya hay uso en el proyecto, por lo que se reutiliza y no se duplica.
- [Mastra](https://github.com/mastra-ai/mastra) — agentes y flujos TypeScript del lado de la aplicación; adecuado para experiencias guiadas de varios pasos.
- [LangGraph.js](https://github.com/langchain-ai/langgraphjs) — grafos de agentes con estado; referencia para representar ramas, espera, revisión y reanudación.
- [OpenDesign](https://github.com/nexu-io/open-design) y su [variante de manalkaff](https://github.com/manalkaff/opendesign) — espacio agéntico de diseño para piezas, carteles, paneles y prototipos; comparar capacidades antes de proponer una integración.
- [taste-skill](https://github.com/Leonxlnx/taste-skill) — criterio estético para agentes; ya figura en la Biblioteca como `iatool-taste-skill` (`src/lib/library/packages.ts:783-790`).
- [UI-TARS](https://github.com/bytedance/UI-TARS) y [UI-TARS-desktop](https://github.com/bytedance/UI-TARS-desktop) — agente que ve y usa una interfaz; referencia para recorrido y verificación visual, no sustituto de las mediciones mecánicas.

Estos nueve repos se proponen en el brief cuando encajan. Ninguno se instala o cablea desde una
tarea de diseño; requiere alcance propio (`architecture/director-diseno.md:144-164`).

## Skills disponibles en el repositorio

- [`design-md`](../../.agent/skills/design-md/SKILL.md) — sintetiza un sistema semántico desde un proyecto Stitch (`.agent/skills/design-md/SKILL.md:2-3`).
- [`enhance-prompt`](../../.agent/skills/enhance-prompt/SKILL.md) — convierte una idea de UI en un prompt estructurado con contexto del sistema (`.agent/skills/enhance-prompt/SKILL.md:2-3`).
- [`grafo-codigo`](../../.agent/skills/grafo-codigo/SKILL.md) — consulta dependencias e impacto en GitNexus antes de tocar componentes (`.agent/skills/grafo-codigo/SKILL.md:2-3`).
- [`react-components`](../../.agent/skills/react-components/SKILL.md) — transforma diseños Stitch en componentes React modulares y validados (`.agent/skills/react-components/SKILL.md:2-3`).
- [`remotion`](../../.agent/skills/remotion/SKILL.md) — produce walkthroughs con transiciones, zoom y rótulos (`.agent/skills/remotion/SKILL.md:2-3`).
- [`shadcn-ui`](../../.agent/skills/shadcn-ui/SKILL.md) — descubre, integra y adapta componentes accesibles de shadcn/ui (`.agent/skills/shadcn-ui/SKILL.md:2-3`).
- [`stitch-loop`](../../.agent/skills/stitch-loop/SKILL.md) — itera sitios Stitch mediante un relevo documentado y verificación visual (`.agent/skills/stitch-loop/SKILL.md:2-3`).

## Selección por tipo de pantalla

| Pantalla o pieza | Referencias prioritarias |
|---|---|
| Chat, hilo o mensajería | assistant-ui + Mobbin + identidad del área |
| Copiloto dentro de una app | CopilotKit + Vercel AI SDK + Mobbin |
| UI generada por un modelo | Tambo + taste-skill + 21st.dev |
| Flujo agéntico con estado | Mastra o LangGraph.js + patrón visual interno |
| Tarjeta, control o widget | 21st.dev + `DESIGN_RULES.md` + preset activo |
| Landing o portal narrativo | Awwwards/Godly + SiteInspire + identidad Figma |
| Lienzo o pieza gráfica | OpenDesign + Behance + sistema Figma correspondiente |
| Inmersión, 3D o audio | The FWA + Audiomorphic + geometría ya implementada |
| Verificación de un recorrido | UI-TARS + Playwright contractual + checklist interno |
| Vídeo de demostración | Remotion + guion visual del producto |

## Criterio de uso

1. Empezar por propósito, público e identidad; una tendencia nunca decide la marca.
2. Elegir de dos a cuatro referencias: al menos una interna y, si aporta valor, una externa o técnica.
3. Registrar qué se toma: estructura, interacción, material, motion o validación; no «estilo general».
4. Comprobar móvil, tablet, escritorio, TV y plegable, además de tacto, puntero y movimiento reducido.
5. Descartar la referencia si exige romper tokens, contraste 4.5:1, dianas de 44 px o el foco único.
6. Usar Lucide en vez de emojis y mantener textos directos en español (`design-system/starseed-system/DESIGN_RULES.md:222-227`).
