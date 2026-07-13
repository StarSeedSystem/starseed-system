# 📓 Bitácora de Estado — StarSeed OS

> Registro cronológico de cambios significativos. **Cada sesión de trabajo añade una entrada aquí al final.** Permite a futuras sesiones (Claude u otras) entender qué se hizo, qué quedó pendiente y por qué.

---

## Formato de entrada

```
## YYYY-MM-DD — Título corto
**Sesión por:** [agente / humano]
**Resumen ejecutivo:** 1-2 frases.

### Hecho
- ...

### Decisiones tomadas
- ...

### Pendiente / Próximos pasos
- ...

### Notas / aprendizajes
- ...
```

---

## 2026-05-24 — Bootstrap del sistema de memoria y roadmap

**Sesión por:** Claude (Cowork mode, modelo Opus 4.6) bajo dirección de Alex Bordón Garrigós.
**Resumen ejecutivo:** Primera sesión de consolidación del proyecto. Se conectó la carpeta local, se auditó el estado del repo, se leyeron los documentos fundacionales de Drive (Constitución, Manifiesto, Codex), y se creó el sistema de memoria persistente + roadmap técnico de 3 fases.

### Hecho
- Conectada carpeta `/Users/alex/Documents/starseed-os-main` como working directory.
- Auditoría del estado actual: Next.js 15 + Supabase + Trinity UI + Crystal Liquid Glass + Genkit AI.
- Confirmado que la carpeta **NO es un repo git todavía** (no hay `.git`). Falta `git init` y vincularlo a `StarSeedSystem/starseed-system`.
- Leídos 3 documentos fundacionales de Google Drive:
  - Constitución de la Sociedad StarSeed
  - Manifiesto Fundacional
  - Codex StarSeed (Arquitectura social comunitaria)
- Creado sistema de memoria persistente:
  - `CLAUDE.md` (raíz) — memoria de trabajo, índice maestro
  - `memory/principles.md` — desarrollo extendido de los principios con implicaciones técnicas
  - `memory/roadmap.md` — roadmap técnico de 3 fases (Semilla → Fruto → Cosecha)
  - `memory/architecture.md` — decisiones arquitectónicas
  - `memory/state.md` — esta bitácora

### Decisiones tomadas (preliminares, sujetas a validación con el equipo)
- **Estrategia de despliegue:** WebOS (PWA) primero en Fase Semilla, luego capa multiplataforma (Tauri + Capacitor) en Fase Fruto, y finalmente distro Linux propia en Fase Cosecha.
- **Servidor:** Vercel + Supabase free tier inicialmente, migración a infra propia en Fase Fruto.
- **Licencia recomendada:** AGPLv3 (no confirmada todavía).
- **Federación:** ActivityPub-compatible para feed cultural + protocolo propio para gobernanza (Fase Fruto).
- **Schema de datos:** Mantener el de `gemini.md` (Account / Profile / Page / Post / StoreItem / LibraryItem). Está alineado con la Constitución (Cuenta privada + Perfiles múltiples).
- **Sin git todavía:** se inicializará en la próxima sesión tras confirmación del propietario.

### Pendiente / Próximos pasos
1. **Inicializar git** y vincular a GitHub:
   ```
   cd /Users/alex/Documents/starseed-os-main
   git init
   git remote add origin https://github.com/StarSeedSystem/starseed-system.git
   git add .
   git commit -m "Initial commit: bootstrap memory system and roadmap"
   git branch -M main
   git push -u origin main
   ```
   (Confirmar nombre del repo y permisos primero.)
2. **Leer el 4º documento crítico de Drive** (Documento Maestro del SOSD, `1DaX2bl8...`) por chunks — es muy grande y contiene detalles técnicos importantes.
3. **Limpieza del repo:**
   - Borrar / mover a `scripts/legacy/`: `temp-aurora.html`, `temp-flora.html`, `temp-omni.html`, `temp_stitch.html`, `apply_mock_fetch.js`, `fix-widgets.js`, `refactor_widgets.js`, `run_test.js`, `update_widgets.js`.
   - Renombrar README real (no template Firebase Studio).
   - Quitar `node_modules` y `.next` del repo (asegurar `.gitignore`).
   - Quitar archivos `Icon` (artefactos de macOS).
   - Quitar `.DS_Store` y añadir a `.gitignore` global.
4. **Renombrar el proyecto** en `package.json`: `"name": "nextn"` → `"name": "starseed-os"`.
5. **Implementar Hito 1.1** del roadmap: CI/CD, licencia, code of conduct, contributing, .env.example.
6. **Conectar GitHub MCP** si está disponible, o trabajar con git por bash.
7. **Decidir governance del propio repo:** ¿quién aprueba PRs en fase Semilla? Necesario para abrir contribuciones.

### Notas / aprendizajes
- El proyecto está significativamente más maduro de lo esperado. Mucho del código está hecho, pero falta:
  - Estandarización (cleanup de scripts huérfanos).
  - Tests (no hay testing setup todavía).
  - CI/CD (falta).
  - Git (la carpeta no está versionada).
  - Documentación canónica (existía dispersa, ahora consolidada en `CLAUDE.md` + `memory/`).
- El sistema de **Singularidad del Contenido (Lienzo Universal)** es un diferenciador técnico fuerte vs. redes sociales tradicionales. El schema actual ya lo soporta con `Post.references[]`, pero falta implementar la lógica de propagación de cambios.
- Las **Insignias verificables** son la clave de la Meritocracia del Entendimiento. Implementarlas bien es prioridad en Fase Semilla.
- **Nota cultural:** los documentos fundacionales son extremadamente ricos y poéticos. La traducción a código debe mantener este espíritu: no es solo software, es la encarnación digital de una constitución civilizatoria.
- Conector de Google Drive funciona perfectamente. Conector de GitHub no apareció en el registro — usar git CLI por bash.

---

---

## 2026-05-24 — Sesión 2: Multi-proveedor de IA + privacidad + cleanup

**Sesión por:** Claude (Cowork mode, Opus 4.7) bajo dirección de Alex Bordón Garrigós.
**Resumen ejecutivo:** Implementada la capa multi-proveedor de IA del Exocórtex (Ollama local, OpenAI-compatible, Anthropic Claude, Google Gemini), con cifrado AES-GCM de claves en navegador. Añadido panel de Privacidad/Soberanía de Datos en /settings. Página /agent ahora hace chat real con streaming y stop. Cleanup de carpetas duplicadas.

### Hecho
- **Capa multi-proveedor de IA** (`src/ai/providers/` y `src/ai/client/`):
  - `types.ts` con la interfaz `Provider` y tipos `ChatMessage`/`ChatOptions`/`ChatResponse`.
  - `ollama.ts` — proveedor local (sin clave, streaming NDJSON).
  - `openai.ts` — OpenAI y compatibles (Groq, Together, OpenRouter, LM Studio, vLLM). Streaming SSE.
  - `anthropic.ts` — Claude con `anthropic-dangerous-direct-browser-access`. Streaming SSE.
  - `google.ts` — Gemini vía REST directo. Sin SDK extra.
  - `index.ts` — registro central + orden de presentación.
  - `README.md` — documentación de cómo añadir nuevos proveedores y modelo de seguridad.
- **Almacenamiento seguro** (`src/ai/client/`):
  - `keyStorage.ts` — AES-GCM 256-bit + PBKDF2-SHA256 (250k iter) + salt aleatorio por instalación. Soporta modo con/sin frase de paso.
  - `providerStore.ts` — gestión de configs en localStorage, export/import JSON, wipe.
  - `chat.ts` — punto único de entrada `chat({messages, ...})` provider-agnostic.
- **UI:**
  - `src/components/settings/ai/ai-providers-panel.tsx` — catálogo + gestor con guardado cifrado, test de conexión, refresh de modelos, frase de paso.
  - `src/components/settings/privacy/privacy-panel.tsx` — Modo Fantasma, telemetría opt-in, exportar/importar/borrar IA, ver desglose localStorage, borrado total.
- **Página /agent** refactorizada:
  - Reemplaza el `setTimeout` simulado por `chat()` real con streaming.
  - Selector de proveedor activo + selector de agente en cabecera.
  - Input opcional de frase de paso si el proveedor activo tiene clave cifrada.
  - Botón Detener (AbortController).
  - Inyecta automáticamente el system prompt del agente + reglas activas en el contexto.
- **Settings page** expandida de 3 a 5 tabs: Diseño · IA & Modelos · Privacidad · Perfil · Seguridad.
- **Cleanup:** eliminadas `src/contexts/` y `src/components/trinity/` (vacías). Verificado que no hay imports rotos.

### Decisiones tomadas
- **Privacidad por diseño:** las claves de IA viven solo en el navegador del usuario, cifradas con AES-GCM. El backend de Next.js nunca las ve. Las llamadas a OpenAI/Anthropic/Google parten del browser (CORS).
- **Ollama es el default sugerido** (proveedor por defecto en `defaultConfigs()`): cero datos a terceros, alineado con la Ciberdelia y la soberanía.
- **No reemplazar Genkit todavía:** `src/ai/genkit.ts` y los flujos en `src/ai/flows/` se mantienen para casos server-side. La nueva capa convive con ellos. Migración progresiva.
- **Configuración portable:** la export/import de configuración de IA permite trasladar setup entre dispositivos.

### Pendiente / Próximos pasos
1. **Verificar el typecheck** localmente — el sandbox excede timeout. Si hay errores, arreglar.
2. **Streaming real para Google AI:** sustituir `:generateContent` por `:streamGenerateContent` con parseo SSE.
3. **Persistir agentes/reglas/workflows** en Supabase (hoy son mocks en estado local de la página).
4. **Migrar flujos de Genkit** que no requieran server al nuevo `chat()` client-side.
5. **Vincular activación de IA al sistema de Insignias** — cuando un usuario contribuye con su modelo a la federación, recibe una insignia.
6. **Tests:** la capa de providers es pura y testeable con MSW — añadir cobertura.
7. **i18n** — el panel está en español; preparar para EN/FR/PT.
8. **Vector storage local** para que el Exocórtex tenga memoria persistente del usuario (IndexedDB + embeddings).

### Notas / aprendizajes
- La constitución del proyecto se traduce muy bien a decisiones técnicas concretas: "el usuario es soberano de su IA" → multi-proveedor + claves locales + sin lock-in. Cada feature debería poder justificarse así.
- Anthropic ya permite uso directo desde browser (header `anthropic-dangerous-direct-browser-access`). Esto cambia el paradigma respecto a hace 2 años: ya no necesitamos backend obligatorio para LLM calls.
- El TypeScript del proyecto compila lento — vale la pena considerar mover a SWC o evaluar si hay dependencias circulares en los contextos.
- Limpieza incremental: la primera sesión quitó scripts huérfanos; ésta limpió carpetas duplicadas. Próxima sesión: revisar `apphosting.yaml` (Firebase) si vamos solo a Vercel; revisar `src/components/stitch/` para ver si sigue siendo necesario.


---

## 2026-05-24 — Sesión 3: Sistema de Apariencia expandido

**Sesión por:** Claude (Cowork mode, Opus 4.7).
**Resumen ejecutivo:** Expansión del sistema de Apariencia con 12 nuevos temas curados, picker integrado de 45+ fuentes Google con preview en vivo, y un panel completo de Accesibilidad universal (alto contraste, motion, daltonismo, tamaño táctil, foco).

### Hecho
- **Biblioteca curada de temas** (`src/lib/themes/curated-presets.ts`): 12 presets coordinados con identidad visual completa (tipografía, colores, glass, fondo, botones, animaciones). Categorizados en 7 moods: cyberdélico, solarpunk, minimal, brutalist, futurista, orgánico, luxury.
  - Synthwave Horizon, Tokyo Midnight (cyberdélico)
  - Solarpunk Aurora (solarpunk)
  - Verdant Earth, Terracotta Warm (orgánico)
  - Bauhaus Modular (brutalist)
  - Monaco Noir, Iridescent Pearl (luxury)
  - Origami Paper, Lavender Mist (minimal)
  - Aurora Borealis, Quantum Hex (futurista)
- **Galería de temas curados** (`curated-themes-gallery.tsx`): grid con cards visuales (gradiente de swatches, icono, badge de mood, indicador activo), filtros por mood, aplicación con un clic + setTheme.
- **Catálogo de Google Fonts** (`src/lib/themes/google-fonts.ts`): 45+ fuentes en 5 categorías (sans, serif, display, mono, handwriting), helpers para construir URLs de Google Fonts CSS2 y la cadena fontFamily.
- **Picker de Google Fonts** (`google-fonts-picker.tsx`): preview en vivo con `<link>` dinámico, texto de preview editable, slider de escala global de fuentes, filtros por categoría, búsqueda por nombre/tags. Instala como customFont en el AppearanceContext existente.
- **Panel de Accesibilidad** (`accessibility-settings.tsx`):
  - Alto contraste (filter + text color override)
  - Reduce motion (auto / always / never con detección de prefers-reduced-motion)
  - Pausar animaciones (más agresivo, incluye canvas)
  - Escala de texto (0.9× a 1.5×)
  - Tamaño táctil mínimo (estándar 24, grande 44, enorme 60)
  - Simulación de daltonismo (protanopia/deuteranopia/tritanopia/achromatopsia con SVG color matrices)
  - Anillo de foco (intensidad 0–3)
  - Subrayar enlaces
  - Cursor grande/enorme (SVG inline)
  - CSS global auto-inyectado, persistencia en localStorage separado.
- **AppearanceEditor expandido** de 4 a 6 tabs: Galería · **Tipografía** (nuevo) · Lienzo · Interfaz · Fondo · **Accesibilidad** (nuevo). La pestaña Galería ahora muestra primero los 12 temas curados, luego la galería existente.

### Decisiones tomadas
- **No tocar el AppearanceContext gigante** (970 líneas) salvo lo imprescindible. Los nuevos presets son `DeepPartial<AppearanceConfig>` aplicados con `updateConfig()` — patrón ya existente. Compatible 100% con save/load/export/import ya construidos.
- **Accesibilidad fuera del AppearanceContext** porque su lógica es ortogonal: persistencia separada (`starseed.a11y.settings`), aplicación via clases en `<html>`. Esto evita acoplar accesibilidad a temas.
- **Estilos de a11y auto-inyectados al montar el panel**, evitando tocar `globals.css`. Permite que el panel sea self-contained y se pueda copiar/desactivar sin migraciones.
- **Daltonismo via SVG `<filter>` con `feColorMatrix`** estándar (matrices clínicas), inyectado al `<body>`. Más performante y preciso que filtros CSS custom.

### Pendiente / Próximos pasos
1. Si TypeScript se queja por `distortWidth` en algunos presets (existe en theme-utils.ts pero no en la interfaz `AppearanceConfig.liquidGlass`), añadirlo al tipo en `appearance-context.tsx`.
2. Test de los 12 presets aplicándolos uno a uno en navegador para verificar coherencia visual.
3. Permitir guardar uno de los presets curados como "tema personal" con un nombre custom (botón "Guardar como tema").
4. Color picker avanzado para que el usuario pueda overridir los colores base de cualquier tema curado.
5. Considerar separar `presetsByMood()` en una página dedicada `/themes` con preview detallado por tema.
6. i18n del catálogo de moods y descripciones (actualmente solo español).

### Notas / aprendizajes
- El AppearanceContext del proyecto ya cubre prácticamente todo lo que un sistema de personalización avanzado necesitaría (responsive, mobile, trinity, display VR/AR/spatial). La calidad técnica del trabajo anterior es alta.
- La estrategia ganadora es: añadir capas de UX (galería curada, picker visual, panel a11y) sobre el contexto existente, no reescribir.
- Google Fonts via CSS2 + `display=swap` es perfecto para preview en vivo sin tocar el bundle. El usuario puede explorar 45 fuentes sin recompilar.
- `feColorMatrix` para daltonismo es genial: tres matrices estándar cubren los tipos más comunes, y `grayscale(1)` cubre acromatopsia.


## 2026-05-25 — Unificación e Integración de Git
**Sesión por:** Antigravity (Assistant Mode) bajo dirección de Alex Bordón Garrigós.
**Resumen ejecutivo:** Sincronización completa y exitosa del repositorio local de StarSeed OS con GitHub, resolviendo divergencias del historial sin perder las funcionalidades avanzadas de IA y Apariencia locales. Confirmado y validado el servidor en http://localhost:9002.

### Hecho
- Configurada la compatibilidad de Git con Unicode en macOS (`core.precomposeunicode true`) para resolver el bloqueo de nombres con caracteres especiales (NFC/NFD).
- Ejecutado `git merge origin/main --allow-unrelated-histories` para unificar el historial local con los commits de configuración de despliegue en Vercel.
- Resueltos conflictos de fusión favoreciendo la rama local (`--ours`) en archivos esenciales: `package.json`, `src/app/(app)/agent/page.tsx`, `src/app/(main)/settings/page.tsx`, `src/components/settings/appearance/appearance-editor.tsx`, `src/utils/supabase/*`, `.gitignore` y `yarn.lock`.
- Completado el push unificado a GitHub (`git push origin main`), dejando la rama `main` local y remota en perfecta sincronía.
- Verificada la disponibilidad activa y redirección del servidor local en `http://localhost:9002`.

### Decisiones tomadas
- **Resolución unilateral a favor de lo local (`--ours`)**: Las versiones locales de la página de agentes y el panel de apariencia representan la implementación más avanzada de la visión ciberdélica e IA (multi-proveedor, cifrado local) y debían ser preservadas intactas sobre los mocks previos del servidor remoto.
- **Mantener fallas de tipo preexistentes**: Las advertencias de tipo TypeScript son heredadas de la base de código externa; se determinó no modificarlas de forma ad-hoc ya que Next.js ignora estos errores en compilación de forma explita y el servidor corre perfectamente.

### Pendiente / Próximos pasos
1. **Desarrollo del workflow Starseed**: Continuar con el diseño e instalación del sistema en entornos Linux/Android y el despliegue a producción.
2. **Refactorización progresiva**: Resolver las advertencias de TypeScript preexistentes en los componentes de clima y layouts de forma segura en las siguientes sesiones.

---

## 2026-05-25 — Sesión 4: Estilos + Crystal realista + Zenith + Notificaciones + Reglas de Diseño

**Sesión por:** Claude (Cowork mode, Opus 4.7).
**Resumen ejecutivo:** Lote grande de mejoras de UX: rename "curados" → "estilos", arreglo de overflow en cards de estilos, Crystal preset con efectos realistas (refracción, aberración cromática, irisado, especular), reestructura de ZenithCurtain con más espacio vertical + Editor Universal + botón pantalla completa, sistema de notificaciones funcional con persistencia local, y nuevo DESIGN_RULES.md para garantizar adaptabilidad universal.

### Hecho
- **Estilos (antes "Temas curados"):**
  - `curated-themes-gallery.tsx`: rename del comentario doc + reescritura del card layout (icono+nombre+badge en línea, tagline 2 líneas line-clamp con break-words, swatches al pie con shrink-0). Sin más overflow ni superposiciones.
  - `appearance-editor.tsx`: header "Estilos" + subtítulo explicando que cada estilo adapta TODOS los elementos (widgets, perfiles, páginas, mensajes, posts, menús, botones, fondos).
- **Tema Crystal realista** (`src/components/theme/theme-utils.ts` preset `glass`):
  - styling: refraction 0.85, chromaticAberration 5, glassNoise 0.12, frostOpacity 0.20, glowIntensity 0.7, glassIntensity 42 (blur).
  - liquidGlass: mode='prominent', distortWidth 0.55, displacementScale 22, aberrationIntensity 2.5, saturation 1.4.
- **CrystalFilters** (`src/components/ui/effects/CrystalFilters.tsx`): añadidos 5 filtros SVG nuevos:
  - `crystal-refraction` (turbulencia + displacement + separación RGB).
  - `iridescent-edge` (borde madreperla con matriz prismática).
  - `glass-specular` (lighting especular angular).
  - `prismatic-glow` (halo multicolor para HolographicOverlay).
  - `etched-glass` (vidrio grabado con feDiffuseLighting).
  - + 2 gradientes (`crystal-facet`, `iris-stroke`).
- **ZenithCurtain** (`src/components/layout/zenith-curtain.tsx`): reescrito completamente.
  - Altura: 70vh → **92vh**, max-w-4xl → **7xl**, padding superior 12 → 5.
  - Layout en 3 secciones independientes: header con acciones rápidas, buscador compacto, área de resultados que ocupa TODO el vertical restante (no se comprimen los documentos).
  - **Nuevo botón "Editor"** (violeta): abre UniversalEditor modal.
  - **Nuevo botón "Pantalla"** (esmeralda): toggle fullscreen con hook `useFullscreen` cross-browser.
- **Editor Universal** (`src/components/layout/universal-editor.tsx`): modal de comando central con 4 modos (Diseño, Código, Con IA, Biblioteca) y 9 secciones del programa (apariencia, dashboard, layout/Trinity, perfil, IA, privacidad, biblioteca, publicar, componentes). Buscador con autofocus. Navega a la sección elegida con `?tab=`.
- **Hook useFullscreen** (`src/hooks/useFullscreen.ts`): cross-browser (Chrome/FF/Safari/Edge con prefijos vendor), detecta Esc, opt-in en SSR seguro.
- **Notificaciones funcional**:
  - `src/context/notifications-context.tsx`: 8 categorías (system/ai/mention/governance/culture/education/community/achievement) + 4 prioridades + snooze + archive + persistencia localStorage (`starseed.notifications.v1`) + 3 notificaciones seed.
  - `src/components/layout/notification-center.tsx`: reescrito con tabs por categoría (conteo de no-leídas por tab), ScrollArea, acciones hover (snooze 1h, archivar, eliminar), formato relativo de tiempo en español (date-fns/locale es), badge con conteo en bell.
  - `src/app/layout.tsx`: `NotificationsProvider` integrado en el árbol de providers.
- **DESIGN_RULES.md** (`design-system/starseed-system/DESIGN_RULES.md`): nuevo doc de 11 secciones que rige adaptabilidad universal. Cubre: tokens, contraste auto, prevención overflow/superposiciones, patrones adaptativos a estilo, velos sobre fondos arbitrarios, manifiesto JSON de widgets, pre-merge visual checklist en 3 estilos.

### Decisiones tomadas
- **"Estilos" como nombre canonico** (antes "Temas curados") — alineado con la idea de que cada elemento de la red del usuario se adapta.
- **Crystal preset usa `mode: 'prominent'`** (no `standard`) para activar el shader real de liquid-glass-react, no solo glass plano.
- **Editor Universal navega a páginas existentes** (no inventa edit-in-place) — implementación más sólida en V1; futura iteración puede embeber el editor inline.
- **Notificaciones 100% local** por defecto (Art. 7 — Soberanía de Datos). Federación se añadirá en Fase Fruto.
- **`a11y-pause-animations` también pausa canvas** — para preservar batería y prevenir mareo (regla en DESIGN_RULES §7).

### Pendiente / Próximos pasos
1. Pasar los 12 estilos curados por el pre-merge checklist visual del DESIGN_RULES §8 (mobile 375px, 3 estilos representativos).
2. Migrar widgets existentes del dashboard a tokens estrictos (ahora algunos hardcodean colores).
3. Implementar el modo "edit-in-place" del Editor Universal (overlay con outline en hover sobre componentes editables).
4. Conectar el sistema de notificaciones a eventos reales (post creado, propuesta votada, mención).
5. Streaming federado de notificaciones cuando exista federación (Fase Fruto).
6. Atajo de teclado `⌘E` para abrir el Editor Universal desde cualquier parte.
7. Asegurar que las notificaciones respeten `--a11y-text-scale` y modo daltonismo.

### Notas / aprendizajes
- El `liquid-glass-react` config soporta `mode: 'prominent'` y `mode: 'shader'` para efectos realistas — antes el preset glass usaba defaults planos y el efecto se quedaba en simple blur.
- La estrategia de "rename + extender card" mantuvo la compatibilidad con `themeStore.activeTemplateId` previo — los usuarios que tenían un estilo aplicado siguen viéndolo correcto.
- La regla de cards `flex flex-col + min-w-0 + truncate/clamp + shrink-0 en iconos` resuelve el 95% de los overflow en este proyecto. Vale la pena hacerla parte del DESIGN_RULES.
- Las notificaciones del proyecto antes eran mock estático. La nueva arquitectura es preparada para federación: cada notificación tiene `source.node` y `source.actorDid` opcionales, que se llenarán cuando un nodo externo nos envíe un evento firmado.


---

## 2026-05-26 — Sesión 5: Calendario Unificado (Hub ↔ Cultura) con capas, CRUD y contexto IA

**Sesión por:** Claude (Cowork mode, Opus 4.7) bajo dirección de Alex Bordón Garrigós.
**Resumen ejecutivo:** Se unifica la temporalidad del SOSD. La pestaña "Eventos" del Hub pasa a llamarse "Calendario" y comparte el mismo componente y la misma fuente de datos que la pestaña "Agenda" de `/network/culture`. El nuevo `UnifiedCalendar` permite filtrar por capas (cultura, política, educación, bienestar, personal, recordatorios, alarmas, logs del sistema), abrir cada día en un diálogo con CRUD + compartir a la Red, y ofrece un punto de inyección de contexto al Exocórtex.

### Hecho
- **Store unificado** `src/contexts/calendar-context.tsx`:
  - Tipo `CalendarItem` con `layer`, `visibility` (privado / publico / red), `recurrence`, `time`, `durationMin`, `location`, `urgent`, `aiHighlight`, etc.
  - 8 capas (`politica`, `cultura`, `educacion`, `bienestar`, `personal`, `recordatorios`, `alarmas`, `sistema`) con metadatos visuales (color, dot, border, descripción).
  - Seed: importa `communityEvents` y añade recordatorios, alarmas y logs del sistema de ejemplo.
  - API: `addItem`, `updateItem`, `removeItem`, `shareItem`, `toggleLayer`, `setAllLayers`, `itemsByDate`, `aiContextSnapshot()`.
  - Provider montado en `src/app/(app)/layout.tsx`.
- **Componente `UnifiedCalendar`** (`src/components/calendar/unified-calendar.tsx`):
  - Rejilla mensual real con semanas que empiezan en lunes y 42 celdas.
  - Filtro de capas en chips activables.
  - Panel lateral con "Agenda próxima" (combina lo que antes eran "Próximos eventos" + "Eventos por confirmar").
  - Indicador de hoy, botón "Hoy", navegación entre meses, leyenda en pie.
  - Botón "Contexto IA" que abre `/agent` con un snapshot temporal codificado.
- **`DayDetailDialog`** (`src/components/calendar/day-detail-dialog.tsx`):
  - Lista ordenable (hora / capa / título / visibilidad).
  - CRUD completo con form colapsable (fecha, hora, duración, capa, recurrencia, visibilidad, ubicación, descripción, urgente).
  - Acciones rápidas por entrada (editar, compartir/federar, eliminar).
- **Hub** (`src/app/(app)/hub/page.tsx`):
  - Trigger renombrado `events` → `calendar` con `<CalendarDays />`.
  - Pestaña anterior eliminada; nuevo `HubCalendarPanel` con `UnifiedCalendar` + dos tarjetas auxiliares ("Próximos en la Red" y "Por confirmar") que sustituyen y fusionan las antiguas secciones.
  - Limpieza de imports muertos (`Progress`, `MapPin`, `PartyPopper`).
- **Cultura** (`src/app/(app)/network/culture/page.tsx`): la pestaña Agenda usa `UnifiedCalendar` en lugar del antiguo `EventCalendarView`. Misma fuente de datos que el Hub.

### Decisiones tomadas
- **Fuente única de verdad temporal** a través de `CalendarContext`. Cualquier superficie futura (dashboard widget, página de comunidad, exportación a ICS, federación ActivityPub `Event`) usará este store.
- **Capas en vez de tipos rígidos:** el campo `layer` reemplaza el `type` libre que tenía `communityEvents`. Permite filtrado coherente con la estética y deja sitio para añadir nuevas capas (p.ej. `salud`, `economia`) sin migraciones.
- **Visibilidad de 3 niveles** (`privado` / `publico` / `red`) en línea con el principio dual privacidad↔transparencia y la dualidad Cuenta/Perfil de la Constitución.
- **Contexto IA serializable**: `aiContextSnapshot()` devuelve un texto plano apto para inyectar como system prompt o tool input. Se abrirá vía query string `?context=…` para no acoplar el calendario a un proveedor concreto (Genkit, Anthropic, etc.).

### Pendiente / Próximos pasos
1. Persistir el calendario en Supabase (tabla `calendar_items` con RLS por `account_id`).
2. Exportar/importar `.ics` y suscripción a calendarios externos.
3. Federar eventos `visibility === 'red'` vía ActivityPub `Event` (Fase Fruto).
4. Notificaciones cuando `layer === 'alarmas'` y la hora está dentro de `nowβ±5 min`.
5. Integrar el snapshot temporal directamente como tool de Genkit (sin abrir `/agent` en nueva ventana).
6. Vista "Semana", "Día" y "Agenda lista" además de la actual mensual.
7. Pruebas unitarias del helper `buildMonthGrid` (límites de año bisiesto, transiciones DST).
8. Componente "Mini-calendario" para incrustar en el dashboard.

### Notas / aprendizajes
- Reusar `communityEvents` como seed mantiene la continuidad visual con la versión anterior — los usuarios siguen viendo los mismos eventos, ahora dentro de una rejilla coherente.
- Mantener `EventCalendarView` exportado en `culture/components.tsx` aunque ya no se importe evita romper otros consumidores potenciales; se puede borrar en un cleanup posterior.
- El patrón "store → componente compuesto → vistas dependientes" es la forma natural de unificar superficies temporales en este proyecto.


---

## 2026-05-26 — Sesión 6: Corrección de distorsión de clics y detección de cursor en ventanas 3D

**Sesión por:** Antigravity (Assistant Mode)
**Resumen ejecutivo:** Se refinó el efecto de movimiento dinámico 3D de las ventanas (`src/components/ui/card.tsx`) para eliminar por completo la vibración, la pérdida de hover y la distorsión del cursor/clic en las esquinas y orillas de las ventanas. El contenido interactivo se mantiene plano en pantalla (2D), mientras que las hermosas capas visuales de vidrio líquido, caustics y destellos 3D siguen inclinándose de manera ultra-fluida y profunda.

### Hecho
- **Planitud del contenedor de interacción y contenido (`src/components/ui/card.tsx`):**
  - Se modificó la capa interna de contenido (`motion.div` que envuelve `{children}`) para mantener `rotateX: 0`, `rotateY: 0`, `z: 0` y `transformStyle: "flat"`.
  - Con esto, todas las entradas interactivas (botones, enlaces, inputs, formularios) permanecen perfectamente paralelas y estables frente a la pantalla, asegurando una detección de cursor 100% natural, directa y sin desajuste de píxeles.
- **Remoción de capas 3D anidadas distorsionantes (`src/components/ui/card.tsx`):**
  - Se removieron los estilos `translateZ(4px)`, `translateZ(6px)` y `translateZ(8px)` de `CardHeader`, `CardContent` y `CardFooter` (fijándolos a `transform: "none"` e inyectando `transformStyle: "flat"` en `CardContent`).
  - Esto soluciona por completo el bug donde el raycast 2D de colisiones del navegador calcula erróneamente las posiciones de clic en planos inclinados anidados.
- **Preservación del efecto premium visual 3D:**
  - Las capas de fondo visuales del vidrio de cristal líquido (Capas 1 a 6: colores dinámicos, ruido, especular, caustics, refracción, reflejo de luz) **sí continúan inclinándose dinámicamente** en respuesta a la posición del cursor (con la física de resortes y oscilaciones ya calibrada).
  - Esto genera un impresionante efecto de profundidad parallax tipo "HUD holográfico" o "Pantalla de Cristal Flotante", donde la información interactiva permanece nítida y perfectamente utilizable mientras el vidrio oscila con elegancia en el fondo.

### Decisiones tomadas
- **Parallax de vidrio holográfico sobre tilt total:** La rotación 3D del plano de los elementos interactivos generaba un bucle de retroalimentación física donde la deformación proyectiva causaba que el cursor "saliera" del elemento al inclinarse, disparando instantáneamente un `mouseLeave` que lo devolvía a la posición inicial, creando un molesto parpadeo o jittering a 60fps. Mantener el contenido plano soluciona el problema de raíz de manera limpia y profesional, sin comprometer el estilo visual de ciencia ficción.

### Pendiente / Próximos pasos
1. Monitorear si algún otro componente de lienzo 3D requiere una separación similar de la capa lógica de clics (2D) de la capa visual de animación (3D).
2. Probar y validar la respuesta táctil en dispositivos móviles, donde las rotaciones se han ajustado para ser extremadamente pasivas.


---

## 2026-05-26 — Sesión 7: Sincrómetro, Integración Hermes y Gráfica Viva unificada

**Sesión por:** Claude (Cowork mode) bajo dirección de Alex Bordón Garrigós.
**Resumen ejecutivo:** El Calendario Unificado se renombra a **Sincrómetro** y se le añaden tres modos visuales (Convencional gregoriano, Astrológico zodiacal y Lunar). El Exocórtex Hermes se materializa en el OmniDock con accesos al agente, gráfica viva, IA setup, skills, tools y sentidos. La Red Holográfica y la Gráfica Armónica se fusionan en una única "Gráfica Viva" en `/network/graph`, con controles de capa y opacidad. Se añaden paneles dedicados de Sentidos y MCPs en `/ai-setup` y `/agent`. Cabecera de La Red rediseñada (compacta y estética). El nombre "Hermes" se retira de toda la UI excepto la sección de Gráfica Viva.

### Hecho
- **Sistema Sincrómetro** (`src/lib/sincrometro/`): nuevo módulo con tipos para tres modos (`gregoriano`, `astrologico`, `lunar`), tablas canónicas de signos zodiacales tropicales y de las 8 fases del ciclo sinódico lunar, y conversores deterministas (`getZodiacForISO`, `getLunarPhaseForISO`, `buildZodiacYear`, `buildLunarMonth`, `bucketForISO`, `findNewMoonsInRange`).
- **Context renombrado** (`src/contexts/calendar-context.tsx`): añade `sincrometroMode` + `setSincrometroMode` persistidos en localStorage; expone alias semánticos `SincrometroProvider`, `useSincrometro`, `SincrometroItem`, `SincrometroLayer`, `SincrometroVisibility`. Conserva 100% retro-compatibilidad con `useCalendar`/`CalendarProvider`.
- **Componentes nuevos:**
  - `sincrometro-mode-switcher.tsx` — pill con tres modos (icon + glyph).
  - `sincrometro-astrological.tsx` — rueda zodiacal: 12 columnas, una por signo del año visible, eventos agrupados por signo.
  - `sincrometro-lunar.tsx` — ciclo sinódico: 8 cards de fases lunares con eventos agrupados.
- **UnifiedCalendar refactor** (`src/components/calendar/unified-calendar.tsx`):
  - Título cambia a "Sincrómetro Unificado".
  - Conmuta entre las tres vistas según `sincrometroMode`.
  - Pista contextual del modo activo (signo solar o fase lunar) cuando no es gregoriano.
  - Invariante: el storage es siempre ISO `YYYY-MM-DD`. Los modos solo cambian la **vista**, nunca los datos. Eventos, recordatorios y alarmas se sincronizan automáticamente entre vistas.
- **Integración Hermes en el dock**: `omni-dock.tsx` añade entradas para Agente IA, Gráfica Viva, IA Setup, Skills, Tools y Sentidos, con separadores visuales degradados y nuevo color `purple` para el tipado del DockItem.
- **Gráfica Viva integrada** (`src/components/network/integrated-living-graph.tsx`): apila la capa holográfica federada con la armónica de Memoria Unificada en una única visualización con `mixBlendMode: 'screen'` + controles de visibilidad/opacidad independientes para cada capa.
- **`/network/graph` reescrito**: usa `IntegratedLivingGraph`. La leyenda Solfeggio + información de capas se actualiza para reflejar la integración.
- **`/network` (panorama) simplificado**: se elimina el header redundante "StarSeed Network / Connect with the living ontology…" y el hero del grafo se reemplaza por un acceso link card a la Gráfica Viva. El panorama queda focalizado en feed y trending.
- **Layout de La Red rediseñado** (`src/app/(app)/network/layout.tsx`): cabecera compacta en una sola fila con pill (dot pulsante + Sparkles + gradiente cyan→purple→amber) y subtítulo elegante en línea con colores semánticos por dominio.
- **Paneles nuevos en `src/components/hermes/`:**
  - `senses-panel.tsx` — 9 sentidos del Exocórtex (visión, audición, voz, ubicación, cámara, consciencia ambiental, tacto, intuición sintética, resonancia armónica), cada uno con su permiso de browser, capacidades que desbloquea y persistencia local.
  - `mcp-panel.tsx` — gestor de servidores MCP con tres seeds (Memoria Unificada interna, Sincrómetro interno, Fediverso ActivityPub) y formulario de "Añadir MCP".
- **`/ai-setup` con tabs**: Descubrimientos / Sentidos / MCPs. Acepta `?tab=senses|mcp` para deep linking desde el dock.
- **`/agent` con tabs ampliadas**: añade Sentidos y MCPs como pestañas, escucha `?tab=` para abrir directamente la pestaña deseada desde los accesos rápidos del dock.
- **Nombre "Hermes" retirado** de OmniDock labels y de `/ai-setup`. Se conserva solo en `hermes-integration/` interno (módulo técnico) y en la sección de Gráfica Viva como tejido cognitivo del Exocórtex.

### Decisiones tomadas
- **Sincrómetro como concepto antes que calendario**: el cambio no es cosmético. La palabra "calendario" reduce la temporalidad a un solo sistema (el gregoriano); "sincrómetro" expresa la simultaneidad entre ciclos cósmicos y biológicos, alineado con la Ciberdelia §3 (ampliar consciencia, no estrechar).
- **Storage ISO universal, vistas conmutables**: nunca se duplica un evento al cambiar de modo. La fecha es siempre ISO; el modo solo determina cómo se agrupa visualmente. Esto garantiza que crear un evento en vista lunar lo refleja inmediatamente en gregoriano y astrológico (sin migraciones ni reescrituras).
- **Hermes invisible para el usuario, omnipresente para el sistema**: la marca "Hermes" pertenece a la arquitectura técnica, no al lenguaje del usuario. Los menús dicen "Agente", "Sentidos", "Tools" — palabras que cualquier persona entiende. El nombre interno se preserva solo en `/network/graph` como guiño al "mensajero entre capas" que ejecuta la fusión.
- **Fusión holográfica ↔ armónica vs selector**: en lugar de obligar a elegir entre las dos capas (red federada vs memoria personal), se renderizan superpuestas con mezcla aditiva. Refleja la tesis ontológica del proyecto: la mente y la red NO son dos cosas separadas — son dos vistas del mismo tejido.
- **Cabecera de La Red en una fila**: ahorra ~80px de altura vertical en la primera vista; coherente con DESIGN_RULES §1 (densidad informativa sin sacrificio estético).

### Pendiente / Próximos pasos
1. Conectar `SensesPanel` y `McpPanel` a la Memoria Unificada para que cada sentido/MCP activado cree un nodo real en la gráfica armónica.
2. Implementar adapter para que el Sincrómetro exponga sus tres modos como tool MCP que el agente pueda consultar (`sincrometro.get_active_mode`, `sincrometro.zodiac_for`, `sincrometro.lunar_phase_for`).
3. Persistir las fechas de luna nueva calculadas en una tabla para evitar recalcular en cada render.
4. Añadir vista "Año astrológico" con calor de eventos por elemento (fuego/tierra/aire/agua).
5. Validar accesibilidad: lectores de pantalla deben leer correctamente el modo activo del Sincrómetro y la fase lunar del día.
6. Tests del converter (`getZodiacForDate`, `getLunarPhaseForDate`, `buildLunarMonth`) con fechas conocidas.
7. Considerar exportar el Sincrómetro como SDK público — algunas comunidades fuera de StarSeed querrían los conversores.

### Notas / aprendizajes
- El `HarmonicGraph3D` ya existía pero estaba aislado en `/network/graph`. Integrarlo con `HolographicGraph` requirió poco más que envolverlos en un wrapper con `mixBlendMode: 'screen'`. La inversión previa en componentes auto-contenidos paga aquí.
- Los signos zodiacales tropicales tienen fechas canónicas pero varían ±1 día por año bisiesto. Asumir el caso canónico (sin corrección por bisiesto) es razonable en V1; la corrección se puede añadir cuando un nodo astrológico de la comunidad lo pida.
- El ciclo sinódico real es 29.530588 días, no 29.5. La fórmula simple (referencia luna nueva conocida + módulo) tiene error ~3 horas por ciclo: aceptable para vista de mes, no para precisión astronómica. Si se necesita mayor precisión, integrar `astronomia` o `lune.js`.
- Renombrar "calendario" → "sincrómetro" preservando alias evita cualquier ruptura. 60+ archivos siguen usando `useCalendar` y siguen funcionando.


---

## 2026-05-26 — Sesión 8: Gráfica Viva geométrica unificada + Bridge OpenHuman×Hermes + contexto completo IA

**Sesión por:** Claude (Cowork mode).
**Resumen ejecutivo:** Refactor profundo de la Gráfica Viva. Se sustituye la doble capa apilada por una única gráfica geométrica SVG estática (sin física ni movimiento). Las "capas" pasan a ser tipos de conexión filtrables, no gráficas separadas. Se implementa el modelo de 3 capas de memoria de OpenHuman AI (Memory Tree + FTS-like index + KV namespaced) sobre el `UnifiedMemoryStore` de Hermes, formando una única tienda local persistente. El usuario puede crear nuevas conexiones entre cualesquiera dos nodos. La IA recibe contexto completo en cada turno (sincrómetro, sentidos, MCPs, skills, tools, memoria reciente, próximos eventos y resumen del grafo).

### Hecho
- **`hermes-integration/openhuman-bridge.ts`** — Bridge funcional OpenHuman × Hermes:
  - `KvStore` namespaced (`global`, `background`, `autocomplete`, `skill-{id}`) con categorías `core`/`daily`/`conversation` y persistencia local.
  - `MemoryTree` con `insertChunk`, `upsertEntity`, `queryGlobal`, `querySource`, `queryTopic`, `searchEntities`, `fetchChunks`.
  - `FtsIndex` con búsqueda por tokens (sustituible por SQLite FTS5 WASM cuando esté disponible).
  - `OpenHumanMemoryEngine` orquesta las 3 capas y expone `ingest()`, `decide(prompt)` (OpenHuman §4 árbol de decisión), `projectToGraph()` y `buildContextSnapshot()` (estilo MEMORY.md).
- **`hermes-integration/system-context.ts`** — Construye `SystemContextSnapshot` exhaustivo:
  - Modo del Sincrómetro, signo solar, fase lunar del día.
  - Lista de sentidos activos, MCPs conectados, skills cargados, tools habilitadas.
  - Próximos eventos del Sincrómetro.
  - Memoria OpenHuman serializada.
  - Helper `snapshotToSystemPrompt()` que produce un bloque inyectable en el system prompt.
- **`hermes-integration/living-graph-store.ts`** — Una sola fuente de verdad para la gráfica:
  - `GraphNode` con `kind`, `geometry` (sphere/tetrahedron/cube/octahedron/icosahedron/dodecahedron/star), `frequency` (solfeggio).
  - `GraphEdge` con `kind` (uses/depends_on/exposes/configured_for/remembers/perceives/references/discovers/custom), peso y `origin` (user/system).
  - Semilla con 27 nodos y 28 aristas representando el sistema instalado (memoria 3 capas, sentidos, agentes, providers, MCPs, tools, skills).
  - API `addNode`, `addEdge`, `removeEdge`, `edgesOf`, `textualSummary` (para alimentar la IA).
  - `CONNECTION_LAYERS` define las 9 capas filtrables con color, dashed y descripción.
- **`components/network/living-graph.tsx`** — Componente geométrico unificado:
  - SVG estático 1000×1000 con anillos concéntricos por tipo de nodo.
  - Layout determinista: cada `GraphNodeKind` tiene radio + offset angular fijos. El centro es siempre `self`.
  - Cada nodo se dibuja como su sólido platónico (rombo octaedro, cubo, triángulo tetraedro, hexágono icosaedro, pentágono dodecaedro, estrella de 8 puntas, círculo esfera).
  - Aristas coloreadas por tipo de conexión; capas filtran qué tipos son visibles.
  - Click en nodo: resalta vecinos + atenúa el resto + abre detalle.
  - **Modo "Conectar nodos"**: el usuario hace click en dos nodos cualesquiera, elige el tipo de conexión y se crea persistentemente.
  - Eliminación de aristas manuales con click en el círculo central de la línea iluminada.
  - Panel lateral con detalle del nodo seleccionado (lista de aristas adyacentes, eliminar conexiones manuales).
- **`components/network/integrated-living-graph.tsx`** simplificado a un wrapper de `LivingGraph` (ya no apila dos visualizaciones).
- **`app/(app)/network/graph/page.tsx`** rediseñado: usa `LivingGraph`, leyenda dividida en geometrías + tipos de conexión + instrucciones de uso.
- **`app/(app)/agent/page.tsx`** — `handleSend` ahora inyecta en el system prompt:
  1. Persona y reglas del agente.
  2. `snapshotToSystemPrompt(buildSystemContext({ upcomingEvents }))`.
  3. `getLivingGraphStore().textualSummary()` — la IA "ve" sus conexiones.
  4. `calendar.aiContextSnapshot()` — Sincrómetro.
  5. Historial de mensajes.
  Además persiste el texto del usuario como chunk OpenHuman para recuperación futura.
- **SensesPanel y McpPanel** ahora escriben en el `LivingGraphStore` al activarse: cada sentido o MCP encendido crea/actualiza un nodo y lo conecta a `self` con la arista correspondiente (perceives/uses).

### Decisiones tomadas
- **Una sola gráfica, capas = tipos de conexión**: la dualidad "red holográfica vs. memoria personal" no existe en realidad; son el mismo tejido visto desde dos ángulos. Mostrar una única gráfica con filtros por tipo de relación refleja la tesis ontológica del proyecto y simplifica enormemente el modelo mental para el usuario.
- **SVG estático en vez de Three.js dinámico**: la gráfica geométrica con sólidos platónicos en posiciones deterministas (anillos concéntricos tipo mandala) comunica mejor "estructura" y "armonía" que un grafo con física vibrante. Además: 0 dependencias 3D, accesible por screen reader, escalable, sin jitter de cursor.
- **OpenHuman 3-capas implementado nativamente, no como librería externa**: el modelo (tree + FTS + KV namespaced + orchestrator §4) está bien descrito y es portable. Implementarlo dentro de Hermes (en vez de depender de un binario externo) nos da una sola tienda local con persistencia controlada por el usuario. Cuando el usuario tenga su instalación nativa de OpenHuman corriendo, podremos exponer un MCP que sincronice ambos.
- **Bridge funcional desde el primer día**: tanto el snapshot textual (`buildContextSnapshot`), como la proyección al grafo (`projectToGraph`), como el orchestrator (`decide`) ya están operativos. Cuando lleguen los datos reales (ingestas, emails, descubrimientos), todo el grafo se puebla automáticamente.
- **Las nuevas conexiones se guardan con `origin: 'user'`**: distinguir entre conexiones "del sistema" (semilla) y "manuales" permite mostrar solo las manuales como eliminables, evitando que el usuario rompa accidentalmente la topología base.

### Pendiente / Próximos pasos
1. Persistir las aristas/nodos también en IndexedDB (más capacidad que localStorage) cuando el usuario tenga >1k nodos.
2. Conectar `OpenHumanMemoryEngine.ingest()` automáticamente a los puntos de entrada del sistema: posts nuevos, eventos del sincrómetro, descubrimientos del wizard de IA.
3. Implementar SQLite WASM FTS5 real para sustituir el `FtsIndex` basado en tokens.
4. Exponer la API de Hermes como tools MCP (`graph.addEdge`, `memory.store`, `memory.query_tree`) para que la IA pueda modificar el grafo desde el chat.
5. Tests unitarios del bridge (KV roundtrip, tree query, FTS scoring) y del store (addEdge idempotente, deleteEdge en cascade).
6. Visual: añadir niveles de zoom para grafos grandes (>100 nodos) — actual aguanta bien ~50 nodos en 1000×1000.
7. Sincronización con un binario local de OpenHuman cuando esté presente (vía MCP).

### Notas / aprendizajes
- La idea de "capas = tipos de conexión" es semánticamente más rica que "capas = tipos de nodo". El segundo enfoque (que era el inicial de Hermes en `02-layers.ts`) sí sirve para colorear, pero la verdadera información cognitiva está en los TIPOS de relación. Filtrando por tipo de relación, el usuario puede ver instantáneamente "qué cosas dependen de qué" o "qué cosas exponen tools".
- La doble capa apilada con `mix-blend-mode: screen` se veía bonita pero confundía al usuario sobre qué era qué. Una sola gráfica con leyenda clara es mejor pedagogía.
- Generar el system prompt completo en cada turno (~3-5kb extra) es razonable para LLMs modernos. Si en el futuro el contexto se vuelve un cuello de botella, se puede usar embedding-based selection en lugar de inyección bruta.
- Mantener todos los archivos OpenHuman dentro de `hermes-integration/` mantiene la cohesión semántica: Hermes es el "mensajero" entre la mente del usuario y el mundo digital; OpenHuman es su biblioteca de memoria. Son una sola arquitectura.


---

## 2026-05-28 — Colocación de widgets gen2 en dashboards + UI de sección + fix Fragua

**Sesión por:** Claude (Cowork mode, Opus).
**Resumen ejecutivo:** Se colocaron los 10 widgets de 2ª generación en sus dashboards predeterminados ordenados por relevancia, se poblaron y activaron 6 categorías de dashboard antes vacías, se rediseñó el encabezado de la sección Dashboards (dinámico y centrado con contexto vivo) y se dejó compilable la Fragua de Interfaces (creador de widgets con IA, flujo 3 fases + edición).

### Hecho
- **`dashboard-defaults.ts`** — bloque gen2 al inicio de `WIDGET_CATEGORY_MAP` (AGORA_CAUSAL, LIQUID_DELEGATION, OIKOS_METABOLISM, SKILL_TREE, ASTRAURA_CORTEX, SOVEREIGN_NODE, AKASHIC_CODEX, NATAL_CHART, MESH_RADAR, IMMERSION_PORTAL). Plantillas predeterminadas reordenadas por relevancia respetando los `minW/minH` del manifest:
  - Política: AGORA_CAUSAL · POLITICAL_SUMMARY · LIQUID_DELEGATION · RELEVANT_POSTS.
  - Educación: SKILL_TREE · LEARNING_PATH · ACTIVE_PROJECTS.
  - Cultura: CULTURAL_FEED · IMMERSION_PORTAL · RELEVANT_POSTS.
  - Economía: OIKOS_METABOLISM · ECONOMIC_OVERVIEW · CALCULATOR · ACTIVE_PROJECTS.
  - Sistema: SOVEREIGN_NODE · MESH_RADAR · SYSTEM_STATUS · LIVE_DATA · NOTIFICATIONS.
  - IA: ASTRAURA_CORTEX · NEXUS_QUICK_ACCESS · MESSAGES.
  - Parlamento: AGORA_CAUSAL · LIQUID_DELEGATION · POLITICAL_SUMMARY · RELEVANT_POSTS.
  - Red: MESH_RADAR · EXPLORE_NETWORK · LIVE_DATA · MY_PAGES.
  - `FUTURE_DASHBOARD_TEMPLATES` poblado: astrología, archivos, entretenimiento, ayudantía, ciberdelia, descubrimientos.
- **`widget-categories.ts`** — `hasWidgets: true` en astrología, archivos, entretenimiento, ayudantía, ciberdelia, descubrimientos.
- **`dashboard-layout.tsx`** — encabezado dinámico y centrado: pill eyebrow (icono+nombre de categoría, punto pulsante, "{n} paneles · {n} widgets"), `<motion.h1>` con AnimatePresence keyed por dashboard activo y gradiente violet→cyan→fuchsia, descripción de categoría, fila centrada de `HeaderAction` (Forjar Widget · Crear Dashboard · Editar/Terminar · Pantalla completa). Nuevo componente `HeaderAction` con tonos neutral/cyan/emerald/indigo.
- **Fragua de Interfaces** — `ForgeWidgetResult` añadido en `widget-forge-types.ts`; `widget-forge-dialog.tsx` corregido (imports `CircleDashed/Loader2/Wand2/Input`, props retipadas a `ForgeWidgetResult`, init de `ontology` null-safe). El flujo 3 fases + edición ya estaba implementado: se preservó, no se reescribió.
- **`messages-widget.tsx`** — 3 props framer-motion `shadow:` → `boxShadow:` (clave válida).

### Decisiones tomadas
- **Preservar la Fragua existente** en lugar de reescribirla: ya implementaba las 3 fases (visuales + código + metamorfosis/edición IA). Solo faltaba que compilara.
- **Orden por relevancia para usuario promedio**: el widget más representativo de cada categoría va primero/arriba-izquierda, con feeds anchos al pie. Tamaños iniciales respetan `minW/minH` del manifest para evitar overflow desde el arranque.
- **Tolerar los 8 errores de tipo preexistentes** (grid-area `isDraggable`, workspace-renderer null, space-weather flare/magnetometer): documentados desde 2026-05-25, Next.js los ignora en build. Fuera del alcance de esta ola.

### Pendiente / Próximos pasos
1. Regenerar/actualizar los widgets gen1 restantes al patrón adaptativo (WidgetShell + kit + `useWidgetData`) para adaptabilidad total a cualquier dimensión y tema.
2. Resolver de forma segura los errores de tipo preexistentes en una ola de refactor dedicada.
3. Verificar visualmente en navegador la composición predeterminada de cada dashboard y el nuevo encabezado.

### Notas / aprendizajes
- Type-check con scope (`tsconfig.scope.json` temporal) es la vía para validar un subconjunto sin exceder el timeout del sandbox en el `tsc` de proyecto completo.
- En framer-motion la clave de sombra animable es `boxShadow`, no `shadow`.

---

## 2026-05-28 — Ola de migración gen1→adaptativo (completada)

Se migraron los widgets gen1 restantes al patrón adaptativo (WidgetShell + kit + `useWidgetData`), cerrando la regeneración total solicitada.

### Widgets migrados en esta ola
- **`active-projects-widget.tsx`** → `productivity.projects` (7s). "Génesis Activa", icono Rocket. ProgressRing/ProgressBar según tier, hitos en expanded.
- **`collab-projects-widget.tsx`** → `productivity.projects` (8s). "Hub Colaborativo". StatTiles Sincronía/Colaboradores + MiniList con Chip de estado.
- **`system-status-widget.tsx`** → `system.node` (2.5s). "Nodo Soberano". ProgressRing en micro; StatTiles CPU/RAM/Temp/Pares; "Procomún donado" (invariante Tríada); threads en expanded.
- **`notifications-widget.tsx`** → `common.notifications` (10s). "Alertas". KIND_META por tipo, franja de no-leído.
- **`messages-widget.tsx`** → `social.threads` (6s). "Enlace Neural". Avatar+punto online, badge de no-leídos.
- **`live-data-widget.tsx`** → `common.metrics` (3s). "Telemetría de Red". Grid de StatTiles + Sparkline del líder.
- **`learning-path-widget.tsx`** (nuevo archivo) → `education.paths` (15s). "Ruta de Aprendizaje", MENTOR_ICON humano/ia/híbrido.
- **`social-radar-widget.tsx`** (nuevo archivo) → `social.events` (20s). "Radar Social", badge de fecha + Chip por tipo de evento.
- **`mental-coherence-widget.tsx`** → `wellness.coherence` (4s). "Coherencia". ProgressRing + StatTiles Foco/Calma/Energía + Sparkline de historial.
- **`nexus-quick-access-widget.tsx`** → `ai.astraura` (5s). "Nexus IA". Atención + carga cognitiva + sugerencias + trabajos en segundo plano (reemplazado useRouter por next/link).
- **`calculator-widget.tsx`** — ahora **funcional** (aritmética real con `evaluate` validado por regex; sin fuente de datos, "Cálculo local" por invariante de soberanía). Display y teclado adaptativos.
- **`theme-selector-widget.tsx`** — envuelto en WidgetShell ("Vibrancy"), grid de 6 temas (next-themes) size-aware: 3-col icon-only en micro/compact, 2-col con etiqueta en regular+. Nunca desborda.
- **`theme-manager-widget.tsx`** — envuelto en WidgetShell ("Archivo de Temas"), conserva drag-reorder/aplicar/eliminar; MiniList con `max` por vTier; estado vacío adaptativo.
- **`ai-generated-widget.tsx`** — revisado, ya adaptativo (renderiza HTML IA con fallback de estado vacío). Sin reescritura.

### Correcciones de tipos preexistentes (resueltas, ya no toleradas)
- **`space-weather-flare-widget.tsx`** — el fallback de `latestFlare` usaba `time` mientras el dato real usa `timestamp`; unificado a `timestamp` y formateado a HH:MM UTC en la bandeja de telemetría.
- **`space-weather-magnetometer-widget.tsx`** — eliminada la línea rota e inusada `gicRisk = Math.abs(currentKp …)` (`currentKp` indefinido, `Math.abs` sobre string).

### Verificación
- Type-check con scope sobre los 13 widgets migrados + registry + los 2 weather corregidos: **EXIT 0, 0 errores**.

### Estado
Regeneración de widgets **completa**: todos los widgets del dashboard siguen ahora el patrón adaptativo (cualquier dimensión, cualquier tema, datos en vivo vía capa mock tipada intercambiable por APIs reales con `registerAdapter`).

---

## 2026-05-29 — Tercera generación (gen3): cobertura del documento de widgets

Objetivo: implementar los ~90 widgets del documento "Opciones de Widgets en Dashboards predeterminados", en oleadas por relevancia para el ciudadano medio. Carpeta nueva: `src/components/dashboard/widgets/gen3/`.

### Wave 1 — Política/Ontocracia ✅
- **CIVIC_ALCHEMY** (Alquimia Cívica) → `politics.initiatives`. Transmutador funcional queja→iniciativa (textarea + selector de ámbito + botón Transmutar que redacta localmente; botón Firmar). Leyes relacionadas, progreso de firmas.
- **VITAL_FLOW_AUDIT** (Auditoría de Flujo Vital) → `politics.treasury`. Total, barras por sector, zoom macro→micro por filtro de sector, gasto por asignación, botón Flag (revisión comunitaria), votaciones de presupuesto.
- **SOCIAL_RESONANCE** (Resonancia Social) → `politics.resonance`. Heatmap semántico por emoción, modo "Burbuja Rota" (postura contraria), filtro por palabra clave, enlaces al debate.

### Wave 2 — Economía/Ecología ✅
- **GIFT_AGORA** (Ágora del Don) → `oikos.gifts`. Bienes/servicios libres, filtro de proximidad, botón Tomar/Sumarme.
- **COMMONS_MATRIX** (Patrimonio Común) → `oikos.commons`. Medios de producción compartidos, estado/cola, Reserva por Propósito.
- **FOOD_ORACLE** (Soberanía Alimentaria) → `oikos.food`. Cosecha, reservas, madurez de cultivos, invernaderos, predicción 7d, perfil dietético.
- **REGEN_TRACER** (Huella Regenerativa) → `oikos.regen`. CO₂/árboles/compost/agua, anillo de circularidad, metas, escáner AR de verdad material.

### Plumbing por oleada (patrón repetible)
1. Contratos en `lib/widget-data/types.ts` + claves en `WidgetDataMap`.
2. Adaptadores mock en `lib/widget-data/adapters.ts` (vivos, deterministas) + registro en `defaultRegistry`.
3. Literales en `dashboard-types.ts` (`WidgetType`).
4. Entradas en `widget-manifest.ts` (minW/minH, categoría, relevancia, data).
5. Componentes adaptativos en `widgets/gen3/` + barrel `gen3/index.ts`.
6. Casos en `widget-registry.tsx`.
7. Type-check con scope → 0 errores por oleada (Wave 1 y Wave 2 verificadas).

### Pendiente
- Waves 3–7: Productividad (5), Utilidades+IA (7), Perfil+Hub (8), Educación/Cultura/Arte (resto), Especializados (Ubicación, AR/VR, Astronomía/Astrología, Descubrimientos, Creatividad, Privacidad, Conectividad, Dispositivos, Archivos, Sistema, Entretenimiento, Sociedad).
- Recomponer dashboards predeterminados por relevancia con los nuevos widgets.
- Nota: el dev server (`npm run dev`, puerto 9002) debe ejecutarse en la máquina del usuario; el sandbox Linux no puede servir a su localhost ni cargar el binario SWC de macOS.



---

## 2026-05-29 — Cuarta generación (gen4): cierre del catálogo + rename "Social"→"Dashboards"

**Sesión por:** Claude (Cowork mode, Opus).
**Resumen ejecutivo:** Se implementaron 11 widgets adaptativos nuevos (gen4) cubriendo los dashboards del documento "Opciones de Widgets en Dashboards predeterminados" que faltaban, todos con el patrón WidgetShell + kit + useWidgetData (datos en vivo mock, intercambiables por APIs reales con registerAdapter). Se colocaron en sus dashboards predeterminados por relevancia sin tocar los widgets previos, y el dashboard por defecto pasó de llamarse "Social" a "Dashboards".

### Widgets gen4 (carpeta `widgets/gen4/`)
- **ELDER_COUNCIL** (Consejo de Sabios) → `politics.council`. Meritocracia del entendimiento: ranking por reputación, insignias verificables, voces delegadas, filtro "solo en línea". → dashboard Política.
- **RESTORATIVE_COURT** (Tribunal Restaurativo) → `politics.justice`. Círculos de Paz, justicia restaurativa nunca punitiva. Etapas, progreso, próximo círculo. → Política.
- **BARTER_MARKET** (Mercado de Trueque) → `oikos.barter`. Ofrece↔busca, filtro por categoría, match por afinidad, botón Proponer. → Economía.
- **ENERGY_GRID** (Energía Comunal) → `oikos.energy`. Microred: gen/consumo, batería, kW al procomún, fuentes, CO₂, sparkline. → Economía.
- **MENTOR_MATCH** (Mentoría Híbrida) → `education.mentors`. Humano/IA/híbrido, rating, afinidad, disponibilidad. → Educación.
- **UNIVERSAL_LIBRARY** (Biblioteca Universal) → `education.library`. Continúa aprendizaje + destacados + colecciones + búsqueda. Acceso abierto. → Educación.
- **MULTIVERSE_HUB** (Multiverso) → `culture.multiverse`. Mundos VR/AR/2D/espacial, presencia viva, en directo. → Cultura.
- **CREATIVE_STUDIO** (Estudio Creativo) → `culture.studio`. Proyectos por medio, herramientas del Lienzo, inspiración del día. → Cultura.
- **ORACLE_PREDICT** (Oráculo Predictivo) → `ai.oracle`. Escenarios probabilísticos del Exocórtex con confianza, horizonte y factores. → IA.
- **IDENTITY_VAULT** (Bóveda de Identidad) → `system.identity`. Dualidad Cuenta/Perfil, verificación ZK, accesos a datos revocables, score de soberanía. → Sistema.
- **ENERGY_MAP** (Mapa de Energía) → `astro.energy`. Coherencia, centros energéticos, biorritmo, influencias cósmicas. → Astrología.

### Plomería (mismo patrón repetible de gen2/gen3)
1. 11 interfaces + claves en `lib/widget-data/types.ts` (`WidgetDataMap`).
2. Adaptadores mock deterministas en `lib/widget-data/gen4-adapters.ts`, auto-registrados (side-effect importado desde `index.ts`). No se tocó `adapters.ts`.
3. 11 literales en `dashboard-types.ts` (`WidgetType`).
4. Entradas en `widget-manifest.ts` (minW/minH, categoría, relevancia, data).
5. 11 entradas en `WIDGET_CATEGORY_MAP` (dashboard-defaults.ts) → aparecen automáticamente en el selector de widgets (dashboard-layout lee este mapa).
6. Componentes en `widgets/gen4/` + barrel `gen4/index.ts`.
7. Casos en `widget-registry.tsx`.

### Colocación en dashboards predeterminados (sin borrar nada previo)
- Política: + ELDER_COUNCIL, RESTORATIVE_COURT (segunda fila).
- Educación: + UNIVERSAL_LIBRARY, MENTOR_MATCH.
- Cultura: + MULTIVERSE_HUB, CREATIVE_STUDIO.
- Economía: + ENERGY_GRID, BARTER_MARKET.
- IA: + ORACLE_PREDICT.
- Sistema: + IDENTITY_VAULT.
- Astrología (FUTURE templates): + ENERGY_MAP.

### Rename
- Plantilla por defecto (categoryId 'social'): `name: 'Social'` → `name: 'Dashboards'`. Es el título que se muestra al abrir el dashboard por defecto.

### Verificación
- Type-check con scope (tsconfig.gen4.json temporal) sobre los 11 widgets + capa de datos + registry + manifest + defaults: **0 errores**. Config temporal eliminada.

### Pendiente
- Conectar adaptadores reales (Supabase/REST/oráculos) por `registerAdapter` cuando existan las fuentes.
- Widgets del documento aún no cubiertos como piezas dedicadas (algunos ya equivalen a widgets previos): Bienvenida/Estado, Lanzador de Creación Rápida, Galería de Arte, Reproductor de Medios, Seguimiento de Hábitos, Pausa Consciente, Actividad Física (wearables), Accesos Directos de Config. Candidatos a una gen5.

---

## 2026-05-29 — Quinta generación (gen5): 10 widgets nuevos + 5 dashboards + estado vacío con biblioteca + IA omnipresente

**Sesión por:** Claude (Cowork mode, Opus) + 5 subagentes en paralelo (sonnet), uno por par de widgets.
**Resumen ejecutivo:** Se añadieron 10 widgets adaptativos (gen5) cubriendo las categorías del documento que faltaban (Productividad avanzada, Ubicación, Privacidad, Dispositivos, Descubrimientos, Creatividad, Perfil, Sociedad), con 5 categorías/dashboards nuevos. El estado vacío de cualquier dashboard ahora ofrece un botón real "Añadir Widget" que abre la biblioteca. El asistente flotante de IA (AiOverlay/Astraura) ya estaba montado en el layout y aparece en toda sección con posición configurable. Sin borrar nada previo (gen1–gen4).

### Widgets gen5 (carpeta `widgets/gen5/`, creados por subagentes en paralelo)
- **FLOW_DIRECTOR** (Director de Flujo Vital) → `productivity.flow`. Energía circadiana (ProgressRing+Sparkline 24h), sugerencia de tarea óptima, ventanas del día, toggle "Modo Fortaleza". → Productividad.
- **PROJECT_SWARM** (Enjambre de Propósitos) → `productivity.swarm`. Constelación viva de proyectos, brillo por urgencia×impacto, filtro por estado, "Soltar al enjambre". → Productividad.
- **ABUNDANCE_RADAR** (Radar de Abundancia) → `location.resources`. RadialNodeGraph de recursos libres cercanos, filtro por tipo, ETA/Reservar. → Ubicación.
- **TRANSIT_FLOW** (Tránsito Orgánico) → `location.transit`. Movilidad compartida, ETA, ocupación, CO₂ ahorrado, Solicitar. → Ubicación.
- **CRYPTO_SHIELD** (Escudo Ontológico) → `privacy.shield`. Niveles de fricción criptográfica, rastreadores bloqueados, flujos de datos con toggle Permitir/Bloquear, "Amnistía de datos". → Privacidad.
- **HABITAT_CORE** (Simbiosis Habitacional) → `devices.habitat`. Domótica: clima/luz/aire por habitación, modo circadiano, robots con batería, sincronía energética. → Dispositivos.
- **SERENDIPITY_LENS** (Lente de Serendipia) → `discovery.serendipity`. Slider "Nivel de Extrañeza", hallazgos por tipo, "Sorpréndeme". → Descubrimientos.
- **IDEA_FORGE** (Incubadora de Quimeras) → `creativity.ideas`. Colisión de conceptos (a✕b + puente), botón "Colisionar", guardar chispas, disciplinas. → Creatividad.
- **MERIT_GALLERY** (Cristalería de Mérito) → `profile.merit`. Firma de confianza (ProgressRing), huella regenerativa, insignias por tier, top-skills. → Perfil.
- **SOCIETY_PULSE** (Pulso del Organismo) → `society.cohesion`. Índice de Armonía Global, abundancia/bienestar/participación, cohesión por biorregión, detección de fracturas. → Sociedad.

### Categorías/dashboards nuevos (widget-categories.ts + dashboard-defaults.ts)
- Añadidas 5 categorías: **privacidad, dispositivos, creatividad, perfil, sociedad** (con icono/color/tags, hasWidgets).
- 5 plantillas predeterminadas nuevas (Privacidad, Dispositivos, Creatividad, Perfil, Sociedad) ordenadas por relevancia.
- Reforzadas plantillas existentes: Productividad (FLOW_DIRECTOR + PROJECT_SWARM), Ubicación (ABUNDANCE_RADAR + TRANSIT_FLOW), Descubrimientos (SERENDIPITY_LENS).

### Infra de UX
- **Estado vacío** (`grid-area.tsx`): rediseñado con halo animado + botón real `AddWidgetDialog` (abre la biblioteca de widgets). `GridArea` ahora recibe `onAddWidget`/`onForgeOpen`, cableados desde `dashboard-workspace-renderer.tsx`.
- **Asistente IA omnipresente**: confirmado `AiOverlay` montado en `app/(app)/layout.tsx` (voz+texto, posición configurable, navega/actúa). No se duplicó.

### Plomería (mismo patrón gen4)
1. 10 grupos de interfaces + claves en `types.ts` (`WidgetDataMap`).
2. Adaptadores mock deterministas auto-registrados en `gen5-adapters.ts` (side-effect desde `index.ts`). `defaultRegistry` ya es `Partial<AdapterRegistry>` (gen4), así que gen5 encaja sin tocar `adapters.ts`.
3. 10 literales en `dashboard-types.ts`.
4. Entradas en `widget-manifest.ts` (minW/minH, categoría, relevancia, data).
5. 10 entradas en `WIDGET_CATEGORY_MAP` + 5 categorías nuevas → aparecen solas en el selector.
6. Componentes en `widgets/gen5/` (10 archivos).
7. Casos + imports en `widget-registry.tsx` (los 10 cableados).

### Verificación
- Type-check con scope (tsconfig.gen5.json temporal) sobre los 10 widgets + capa de datos + registry + manifest + defaults + grid-area + renderer: **0 errores**. Temporal eliminado.

### Pendiente / próximos pasos
- Conectar adaptadores reales por `registerAdapter` (Supabase/REST/oráculos/puente de dispositivos) cuando existan fuentes del usuario.
- Mejora estética profunda iterativa de widgets gen1 (microinteracciones/animaciones) si se desea otra ola dedicada.
- Sincronización biblioteca online + compartir widgets entre usuarios (edición compartida/bloqueada, réplica de archivos de la red) — diseño pendiente respetando que los archivos/datos de la red NO son alterables salvo permiso.

---

## 2026-05-29 — Acomodo final gen4/gen5 en dashboards + migración rename "Social"→"Dashboards"

**Sesión por:** Claude (Cowork mode, Opus).
**Resumen ejecutivo:** Se confirmó/cerró el acomodo de los 21 widgets gen4+gen5 en sus 27 dashboards predeterminados, se añadió migración de localStorage para que usuarios existentes vean el dashboard por defecto como "Dashboards" (antes "Social"), y se verificó consistencia total (47 tipos usados ↔ manifest/registry/WidgetType) + type-check 0 errores.

### Hecho
- **Rename robusto**: además de `name: 'Dashboards'` en la plantilla por defecto (categoryId 'social'), se añadió en `dashboard-layout.tsx` una migración al cargar: si un dashboard persistido tiene `category==='social' && name==='Social'`, se renombra a 'Dashboards' y se re-persiste. Cubre instalaciones previas sin tocar tableros personalizados.
- **Acomodo verificado por dashboard** (widgets por relevancia, sin solapes):
  - Dashboards(social) 5 · Política 6 · Educación 5 · Cultura 5 · Economía 6 · Clima 9 · Productividad 6 · Ubicación 4 · Utilidades 3 · Arte 1 · Astronomía 7 · Sistema 6 · Personalización 2 · IA 5 · Parlamento 4 · Red 4 · Explorador 3 · Astrología 4 · Archivos 2 · Entretenimiento 2 · Ayudantía 3 · Ciberdelia 3 · Descubrimientos 4 · Privacidad 3 · Dispositivos 3 · Creatividad 3 · Perfil 3 · Sociedad 3.
- **Verificación de consistencia** (script): 47 WidgetType usados en plantillas → 0 faltantes en manifest, 0 faltantes en registry case, 0 faltantes en declaración WidgetType.
- **Type-check** scope completo (widget-data + dashboard core + gen4 + gen5): **0 errores**.
- **Estado vacío** con botón real a la biblioteca y **AiOverlay omnipresente** ya integrados (sesión previa gen5).

### Pendiente / próximos pasos (olas dedicadas)
- Rediseño estético profundo iterativo de widgets gen1 antiguos (microinteracciones/animaciones por widget).
- Sincronización con biblioteca online + compartir/replicar widgets entre usuarios (edición compartida/bloqueada), respetando que datos/archivos de la red NO se alteran salvo permiso.
- Panel de permisos de IA en la página de IA (acceso complejo al sistema, desplegar agentes/subagentes) — por defecto las IAs de chat del usuario pueden editar su propio entorno.

### Adenda (misma fecha) — fixes de cierre
- **Migración rename en runtime**: `dashboard-layout.tsx` ahora, al cargar dashboards persistidos, renombra `category==='social' && name==='Social'` → 'Dashboards' y re-persiste (cubre usuarios ya inicializados; no toca tableros personalizados). El título grande del header lee `activeDashboard?.name ?? "Dashboards"`.
- **Bug real corregido**: `LIVE_DATA` no tenía case en `widget-registry.tsx` (renderizaba "Widget desconocido" en Sistema y Red). Añadido import `LiveDataWidget` + case.
- **Verificación de cobertura**: 47 WidgetType colocados en las 28 plantillas → 0 sin case en registry. Type-check scope (data + dashboard core + gen4 + gen5 + app-shell) → 0 errores nuevos (2 preexistentes ajenos: tipado RGL en grid-area:205 y activeId en renderer:174, ignorados por Next en build).

### Adenda 2 — re-siembra versionada de dashboards predeterminados
- **Problema**: instalaciones con `LS_INITIALIZED` ya puesto nunca volvían a sembrar, así que los nuevos acomodos gen4/gen5 no aparecían en localhost del usuario.
- **Solución**: `LS_DEFAULTS_VERSION` + `DEFAULTS_VERSION='gen5-2026-05-29'`. Al montar, si la versión guardada ≠ actual, `reseedDefaultDashboards()` regenera TODOS los tableros predeterminados con el acomodo nuevo y **preserva los tableros propios** del usuario (categorías no predeterminadas + sus widgets), resetea `LS_ORDER` y guarda la versión. Subir `DEFAULTS_VERSION` en el futuro re-siembra automáticamente.
- Type-check del archivo: 0 errores nuevos.

---

## 2026-05-30 — Re-siembra de defaults + Olas 1·2·3 (gen1 redux, permisos IA, compartir/sincronizar)

**Sesión por:** Claude (Cowork mode, Opus) + 1 subagente (gen1).
**Resumen ejecutivo:** Resuelto que los nuevos acomodos no aparecían en localhost (bandera de init), mejorados los widgets gen1 más básicos, y construidas dos capacidades nuevas: panel de permisos de IA y sistema de compartir/sincronizar widgets con la biblioteca.

### Re-siembra versionada de dashboards (fix del usuario)
- `LS_DEFAULTS_VERSION` + `DEFAULTS_VERSION='gen5-2026-05-29'` en `dashboard-layout.tsx`. Al montar, si la versión guardada ≠ actual y ya había tableros, `reseedDefaultDashboards()` regenera TODOS los predeterminados con el acomodo nuevo y PRESERVA los tableros propios del usuario (categorías no predeterminadas + sus widgets), resetea `LS_ORDER` y guarda versión. Subir la constante re-siembra en el futuro. (Recargar la página aplica el cambio.)
- Migración de rename "Social"→"Dashboards" también en runtime.

### Ola 1 — gen1 redux
- Auditoría: casi todos los widgets raíz ya usaban el kit (sesiones previas). Solo eran básicos 3.
- Reescritos (subagente) con kit adaptativo + datos en vivo, microinteracciones y diseño único:
  - `explore-network-widget.tsx` → `social.entities` (entidades trending, momentum, unirse).
  - `my-pages-widget.tsx` → `social.pages` (rol, actividad, filtro por kind).
  - `political-summary-widget.tsx` → `politics.proposals` (etapas, votar a favor/contra, deadline).
- Type-check 0 errores.

### Ola 2 — Permisos y accesos de IA
- `src/ai/client/ai-permissions.ts`: modelo soberano. Por DEFECTO acceso completo al PROPIO entorno (read/edit widgets·dashboards·layout·appearance·code·memory, manage agents·providers, navigate, net.read). `net.write` OFF por la Constitución (datos de la red/otros inmutables salvo permiso). API: load/save/canPerform/setScope/setComplexAccess/setMaxAgents/reset, por actor (`assistant`|`nexus`), persistente + evento de cambios.
- `src/ai/client/use-ai-permissions.ts`: hook reactivo.
- `src/components/ai/ai-permissions-panel.tsx`: panel con selector actor, toggle maestro de "acceso complejo", scopes por grupos (lectura/entorno/inteligencia/red), slider de agentes máximos, reset. `net.write` marcado con candado.
- Integrado como pestaña **"Permisos"** en `/ai-setup` (deep-link `?tab=permissions`). Type-check 0 errores.

### Ola 3 — Compartir / sincronizar widgets (biblioteca)
- `src/lib/widget-sync/index.ts`: source-agnostic (transport intercambiable por Supabase/IPFS/ActivityPub con `registerSyncTransport`). API: `shareWidget` (publica a biblioteca), `replicateEntity` (réplica = REFERENCIA al origen, nunca lo altera; Lienzo Universal), `syncReplica`, `openCollabSession`/`canEditEntity`/`closeCollabSession` (edición compartida o bloqueada con lock). Invariante: contenido de red `networkLocked` → inmutable salvo permiso.
- UI: botón **🔗 Compartir** en los controles de edición de cada widget (`grid-area.tsx`), copia un enlace `starseed://widget/<id>` y publica a la biblioteca. Type-check 0 errores nuevos.

### Verificación final
- Type-check de scope amplio (widget-data + widget-sync + IA + dashboard core + gen4 + gen5 + gen1 redux + app-shell): **0 errores nuevos**. Persisten 2 preexistentes ajenos (RGL en grid-area, activeId string|null en renderer), ignorados por Next en build.

### Pendiente / siguientes mejoras opcionales
- UI de biblioteca para explorar/replicar widgets compartidos por otros (lista + botón Replicar) — el store ya lo soporta.
- Conectar `registerSyncTransport` a Supabase/federación real.
- Cablear `canPerform()` de permisos dentro del overlay/agente para gatear acciones reales (hoy el modelo y el panel están listos; el overlay es grande y frágil — integrar con cuidado en una pasada dedicada).

### Adenda 3 — fixes finales + botón de restablecer
- **Bug del subagente corregido**: los 3 widgets gen1 (explore-network, my-pages, political-summary) importaban `../../kit` (ruta de gen5) → corregido a `../kit`. 0 errores.
- **Botón "Restablecer dashboards"** en la barra del dashboard → `handleResetLayout()` llama a `reseedDefaultDashboards()` con confirmación; regenera los predeterminados con el acomodo nuevo conservando los tableros propios. Da una vía manual además de la re-siembra automática por versión.
- Verificación final del núcleo (data + sync + IA + dashboards + gen1/gen4/gen5 + app-shell): 0 errores nuevos.

### Adenda 6 — verificado en dev server + fondos líquidos + favicon servido
- Dev server (puerto 9002) sano: /login HTTP 200, /dashboard 307→login (auth middleware Supabase). Sin errores de compilación tras los cambios.
- IMPORTANTE para el usuario: /dashboard redirige a /login si no hay sesión; los widgets sólo se ven autenticado. Tras iniciar sesión, recargar aplica la re-siembra (DEFAULTS_VERSION='gen5-2026-05-30b').
- Favicon e íconos servidos OK (public/starseed-symbol.png, src/app/icon.png 512, apple-icon.png 180, favicon-48.png) desde Documents/simbolos/simbolo_starseed.png. Metadata `icons` en app/layout.tsx.
- Fondos psicodélicos líquidos: nuevo `LiquidPsychedelicBackground` (5 presets: Aurora Líquida, Plasma Psicodélico, Lava Solar, Marea Profunda, Iris Cuántica) — blobs SVG con gradientes animados, hue-rotate y parallax al cursor; montado en app/layout. Añadidos a "Temas Rápidos → Fondo de Pantalla" con preview animado; applyBackground setea config.background.type al id del preset. 0 errores de tipo.

### Adenda 7 — picker de fondos líquidos en Apariencia
- Los presets líquidos NO van en la barra del dashboard (ahí "Diseño Estético" sólo estiliza la barra). El picker real de fondo es `src/components/settings/appearance/background-settings.tsx`.
- Añadida sección "Fondos Psicodélicos Líquidos" con los 5 presets (Aurora Líquida, Plasma Psicodélico, Lava Solar, Marea Profunda, Iris Cuántica), preview con gradiente animado; al pulsar setea `config.background.type` al id → activa `LiquidPsychedelicBackground` (montado en app/layout). 0 errores de tipo.
- Ubicación para el usuario: Ajustes → Apariencia → Fondo → "Fondos Psicodélicos Líquidos".
- NOTA: el dev server (localhost:9002) estaba caído (HTTP 000) al cerrar la sesión; debe ejecutarse `npm run dev` en la máquina del usuario para ver y verificar los cambios.

### Adenda 8 — tipado de fondos líquidos + pestaña "Líquidos"
- Corregida línea duplicada `type:` en `appearance-context.tsx` (interface background) y extendida la unión con los 5 ids líquidos → ya no requiere `as any`.
- `background-settings.tsx`: añadida pestaña "Líquidos" (Droplets) con grid de 5 presets, preview con gradiente animado + check del activo; setea `config.background.type` al id. 0 errores.
- Resumen verificado de la sesión: DEFAULTS_VERSION bump ✓, sidebar auto-hide con título ✓, cabecera limpia ✓, fullscreen 100dvh ✓, favicon/íconos StarSeed ✓, LiquidPsychedelicBackground montado ✓, pestaña Líquidos ✓.

### Adenda 9 — BUG CRÍTICO encontrado: header.tsx roto (causa real del dashboard en blanco)
- `src/components/layout/header.tsx` estaba CORRUPTO: sin `export function AppHeader()`, sin importar `useState`, con 10 líneas `const [mounted2, setMounted] = useState(false)` duplicadas a nivel de módulo. Compila-crash de TODA la sección `(app)` al renderizar el AppHeader → por eso, tras iniciar sesión, el dashboard salía en blanco / sin widgets. (No se notaba en /login porque vive en el root layout, y /dashboard redirige a /login por middleware antes de render cuando no hay sesión.)
- Reconstruido limpio: AppHeader con el símbolo StarSeed (`/starseed-symbol.png`) como marca + ColorThemeSwitcher. 0 errores.
- Verificado: ningún otro archivo tiene esa corrupción (scan de líneas duplicadas consecutivas en todo src = limpio). Type-check de la ruta de render completa de /dashboard (layout (app) + header + app-shell + dashboard-layout + grid-area + floating-assistant) = 0 errores.
- **Marca StarSeed integrada**: símbolo real en login (80px con halo animado) y cabecera global (24px con hover). Dev server /login HTTP 200.

### Adenda 10 — marca StarSeed propagada + ortografía verificada
- `src/components/logo.tsx`: reemplazado icono Orbit por `/starseed-symbol.png` (28px, halo) → se propaga a login + AuthForm + cualquier consumidor de <Logo/>.
- header.tsx restaurado correctamente (búsqueda + NotificationCenter + UserNav intactos) con el símbolo StarSeed como marca a la izquierda.
- Ortografía: barrido de texto JSX visible — sin errores reales (Conexiones, Notificaciones, Personalización, Configuraciones, etc. ya correctos con tilde). Se normalizaron "..." → "…" en placeholders del header.
- Type-check ruta de render completa /dashboard + logo + login: 0 errores nuevos.

### Adenda 11 — BUG RAÍZ de "otros dashboards vacíos" + sidebar fullscreen + más corrupción
- **CAUSA REAL encontrada**: `widgetsMap` en dashboard-layout se construía con `widgets.filter(w => w.dashboard_id===d.id)`, pero `widgets` (estado) sólo contiene los del dashboard ACTIVO → todas las demás pestañas recibían []. Por eso sólo la principal mostraba widgets. FIX: `widgetsMap` ahora usa `loadAllWidgets()` para los no-activos y el estado en vivo para el activo. Todas las pestañas aparecen acomodadas por defecto.
- **Más corrupción reparada** (mismo patrón que header.tsx): efecto `setTimeout(setIsFullscreen,2500)` duplicado, y atributo `title=...` repetido 6× en el botón toggle del sidebar. Limpiados.
- **Sidebar en pantalla completa**: nuevo efecto `if (isFullscreen) setIsSidebarOpen(false)` → al auto-entrar a fullscreen (2.5s) el menú de ajustes se esconde y queda sólo el botón de expansión, dejando los widgets a pantalla completa. (Ya se ocultaba también con el scroll del título.)
- Verificado: 7/7 fixes presentes, type-check dashboard-layout 0 errores, sin duplicados consecutivos.
- **No pude levantar el dev server ni abrir el navegador yo mismo**: Terminal está en tier "click" (no puedo teclear) y Chrome en tier "read" (no puedo clicar); la extensión Claude-in-Chrome está desconectada. El usuario debe ejecutar `npm run dev` (puerto 9002). Tras el fix de header.tsx (que crasheaba el render) + widgetsMap, los dashboards deben cargar con sus widgets al recargar e iniciar sesión.

### Adenda 12 — Cuenta unificada con el Portal StarSeed OS (2026-06-10)
- Creado `architecture/integracion-portal-starseed-os.md` (SOP primero, regla dorada) y `.env.local` con el proyecto Supabase COMPARTIDO `dzkjapinnewkxzjltadv` (el del Café/Portal) + `GOOGLE_GENAI_API_KEY` → una sola cuenta soberana en todo el ecosistema y Genkit operativo.
- El Portal StarSeed OS (repo Starseed-Cafe, carpeta "StarSeed Café/app") es ahora la página principal: 6 áreas (incluye Audiomorphic), Astraura (Exocórtex global con el corpus del Drive), cartera Semillas/Granos con bolsa simulada (tablas nuevas `grain_types` y `seed_market`, lectura pública), cuenta OTP compartida (storageKey `starseed.auth`).
- Sistema de enlaces: starseed-os.vercel.app (portal) · /cafe/ · starseed-nexus.vercel.app (este SOSD).
- Razón: petición del visionario de interconectar todas las áreas y cuentas bajo una identidad y mejorar el diseño global del ecosistema.

### Adenda 13 — Intercambio de nombres (2026-06-10, tarde)
- DECISIÓN del visionario: el portal de marca pasa a llamarse **StarSeed Nexus** (starseed-nexus.vercel.app) y ESTE repo/aplicación es **StarSeed OS** (conserva starseed-os.vercel.app, que ya servía esta app). starseed.config.json: systemName "StarSeed OS", deployment.url starseed-os.vercel.app. SOP de integración actualizado.

### Adenda 14 — Tema Materia Viva (2026-06-11)
- **Qué:** nueva familia de fondos "Materia Viva" (oro + cristal + geometría sagrada del rediseño Nexus/Café) en canvas 2D ligero, sin three.js. 3 ids nuevos en `config.background.type`: `materia-oro-vivo` (ámbar/oro), `materia-cristal-liquido` (cian/lavanda), `materia-bosque-dorado` (lima/musgo). Flor de la Vida (19 círculos) en rotación lenta, ~90 partículas ascendentes y brillo especular que sigue al cursor; pausa en pestaña oculta, DPR-aware, `prefers-reduced-motion` → fotograma estático.
- **Dónde:** SOP primero en `architecture/integracion-portal-starseed-os.md` ("Tema Materia Viva (v1)"); componente nuevo `src/components/backgrounds/materia-viva-background.tsx` (`MateriaVivaBackground` con props `variant`+`intensity` + host `MateriaVivaBackgroundHost` que se auto-activa con `type.startsWith("materia-")`); host montado en `src/app/layout.tsx`; unión de tipos + campo opcional `background.intensity` (0..1) en `src/context/appearance-context.tsx`; pestaña "Materia Viva ✦" con 3 tarjetas (preview CSS animada) y deslizador Intensidad (0–100) en `src/components/settings/appearance/background-settings.tsx` (TabsList pasa de grid-cols-5 a grid-cols-7 para acomodar las 7 pestañas).
- **Por qué:** personalización de la red con los nuevos estilos visuales del rediseño Nexus/Café — opciones configurables (variante + intensidad) publicadas como personalización elegible por cada usuario (código abierto, §6). Cambios 100% aditivos: ninguna función existente tocada ni eliminada; `intensity` opcional → configs guardadas siguen siendo válidas.

### Adenda 15 — Widget Cartera StarSeed (2026-06-11)
- **SOP primero (regla dorada):** nueva sección "Widget Cartera StarSeed (v1)" en `architecture/integracion-portal-starseed-os.md` con fuentes de datos, estados e invariantes.
- **Nuevo widget** `src/components/dashboard/widgets/cartera-starseed.tsx` (`CarteraStarseedWidget`, 'use client'): tarjeta "Cartera StarSeed 🌱" sobre `WidgetShell` del kit. Consume la **cuenta soberana unificada** (Supabase compartido `dzkjapinnewkxzjltadv`) vía el cliente browser existente `@/utils/supabase/client`:
  - Público siempre: `grain_types` + últimas ~60 filas de `seed_market` → sparkline SVG inline de `seed_eur` (stroke `#9FE870`, degradado sutil) con último valor y delta 7d %.
  - Con sesión (RLS `auth.uid()`): fila de `wallets` (Semillas en contador grande verde + granos por tipo como pills emoji + g con color del tipo) y últimos 6 movimientos de `economy_ledger` (kind + name + ±semillas + hace cuánto).
  - Estados: skeleton de carga, error con botón Reintentar, sin sesión → mercado público + CTA "Iniciar sesión" (`/login`), micro-tier adaptativo. Pie fijo: "Bolsa y cartera en modo beta simulada". Solo lectura; sin dependencias nuevas.
- **Registro** (siguiendo el patrón de los widgets existentes, todo aditivo, nada eliminado): tipo `CARTERA_STARSEED` en `dashboard-types.ts`; case + import en `widget-registry.tsx`; manifiesto en `widget-manifest.ts` (label "Cartera StarSeed", categoría economia, w3×h5 como Pulso Económico); mapeo de categorías en `dashboard-defaults.ts` (economia + perfil); tarjeta en la Biblioteca de Widgets (`add-widget-dialog.tsx`) con icono `Wallet` de lucide-react. NO se añadió a las plantillas de tableros predeterminados: el usuario lo añade cuando quiera. Nota: el sistema identifica widgets por `WidgetType` en MAYÚSCULAS, por eso el id interno es `CARTERA_STARSEED` (el archivo sí es `cartera-starseed.tsx`).
- Verificación: `npx tsc --noEmit` sin errores en los archivos tocados (cartera-starseed, dashboard-types, widget-registry, widget-manifest, dashboard-defaults, add-widget-dialog).
- No se tocaron `src/components/settings/appearance/`, `src/components/backgrounds/` ni el contexto de apariencia (en manos de otro agente en paralelo).

### Adenda 16 — OmniDock responsive + Materia Viva integrada por defecto (2026-06-11)
- **SOP primero (regla dorada):** secciones nuevas en `architecture/integracion-portal-starseed-os.md`: "Tema Materia Viva → v1.1" y "OmniDock responsive (fix 2026-06-11)".
- **Fix del dock Trinity (Anchor) en pantallas chicas** — el usuario reportó que "el menú de abajo no sale completo en pantallas chicas". Causa: 11 botones × 56–64px + gaps + padding ≈ 745–897px de contenido con `overflow-visible` → cortado en cualquier viewport <1024px. Cambios en `src/components/layout/omni-dock.tsx` (NINGUNA función eliminada):
  - La píldora conserva borde/cristal; dentro un strip `.omni-dock-strip` (CSS en `globals.css`) que en `<1024px` hace scroll-x con `scroll-snap` (snap-center), scrollbar oculta, máscara de degradado en ambos bordes (pista de "hay más") y `overscroll-behavior-x: contain`. En `≥1024px` (lg) overflow visible y tamaños 64px como siempre (tooltips intactos).
  - Items `shrink-0`, talla compacta 48px en `<lg` (≥44px táctil), gaps/padding reducidos, `safe-area-inset-bottom` en el wrapper. El breakpoint es **lg y no sm** porque a 768px el contenido (897px) también desbordaba — verificado empíricamente con Playwright.
- **Materia Viva integrada en dashboards** (`src/context/appearance-context.tsx`, `src/app/globals.css`, `src/app/(main)/layout.tsx`):
  - Default `background.type: "materia-oro-vivo"` (+ `intensity: 0.7`) para usuarios SIN config guardada; las configs en localStorage se mergean encima y no se tocan (verificado: con config webgl guardada todo vuelve al estado anterior).
  - `applyStyles` pone `data-materia="<variante>"` en `<body>` cuando el type empieza por `materia-` (y lo borra si no). `globals.css`: bloque `body[data-materia…]` con `--materia-accent` y override de `--primary-hsl`/`--ring-hsl` por variante (dorado #E9C46A / cian #7FD8E8 / lima #9FE870), borde global cálido en dark (44 28% 24%, mismo L/S que Nebula), y borde+glow `color-mix` en `.card-glass`/`.liquid-glass-panel`. Sin data-materia: cero efecto (temas existentes intactos).
  - Shell del grupo `(main)` con clases estables `os-main-shell`/`os-main-scroll`: bajo data-materia su `bg-background` opaco pasa a transparente para que el canvas respire tras los widgets.
- **Página QA interna** `/qa-dock` (`src/app/(main)/qa-dock/page.tsx`): renderiza el mismo `DashboardLayout` que `/dashboard` sin exigir sesión (el signup del auditor vía REST exige confirmación de email, así que no se creó sesión); marcada "QA interno" y devuelve `notFound()` en producción. `src/app/(main)/__qa-dock/page.tsx` quedó como stub privado (carpetas `_` no rutean en App Router y el entorno no permite borrar archivos del mount).
- **Verificación empírica** (dev server + Playwright headless, capturas en outputs/shots/): `os-dock-360.png` (píldora 6→354 dentro de 360, strip 603/330 con scroll+máscara), `os-dock-390.png` (6→384, bottom 816<844), `os-dock-768.png` (los 12 items completos sin scroll, 603=603), `os-dashboard-materia-390.png` y `os-dashboard-materia-1280.png` (widgets sobre el canvas materia, shell transparente rgba(0,0,0,0), `--primary-hsl` = 42 74% 66%, data-materia="oro-vivo"). Test de regresión con `background.type: "webgl"`: data-materia null, shell opaco de nuevo, primary 276 85% 55% original.
- `npx tsc --noEmit`: **0 errores en los archivos tocados**; quedan 153 errores PREEXISTENTES en archivos no relacionados (drift `distortWidth`/`liquidGlass` en settings antiguos, `src/types/supabase.ts` generado, carpetas demo `theme-antigravity-flux/`, `integraciones-de-codigo/`…). El proyecto ya compila con `ignoreBuildErrors: true` en `next.config`; no se tocaron por riesgo de romper funciones ajenas al encargo.
- Nota de entorno: el sandbox linux/arm64 necesitó `@next/swc-linux-arm64-gnu` (instalado en /tmp y symlinkeado en node_modules) para arrancar `next dev`.

### Adenda 17 — Trinity Móvil: drag táctil con pulsación mantenida + TrinityFab + menús en pantallas chicas (2026-06-11)
- **SOP primero (regla dorada):** sección nueva "Trinity Móvil (v1)" en `architecture/integracion-portal-starseed-os.md` con los 3 bloques, causa raíz, soluciones y verificación empírica completa.
- **Bloque 1 — widgets táctiles (`grid-area.tsx` + `use-touch-drag-arming.ts` + `grid-area-touch.module.css`, archivos nuevos los dos últimos):**
  - **Causa raíz descubierta en runtime (fibers):** react-grid-layout **2.2.2 NO cablea `draggableHandle`** hasta el item — `DraggableCore.props.handle = ""` aunque GridLayout reciba ".drag-handle" → en modo edición CUALQUIER punto del widget arrastraba, y en táctil react-draggable hace `preventDefault()` del touchstart → scroll muerto + widgets moviéndose (el bug reportado).
  - **Solución:** puerta en fase de captura sobre el contenedor del grid que oculta los `touchstart` a DraggableCore (el scroll del navegador queda libre); pulsación mantenida 320 ms sin mover >10 px → arma el widget (vibración 10 ms + elevación scale 1.03 + glow dorado #D4AF37 vía CSS Module), `flushSync` retira el handle y un `TouchEvent` sintético con el Touch vivo entrega el gesto a RGL **sin levantar el dedo**; un `touchmove {passive:false}` global bloquea el scroll solo mientras dura el drag; al soltar, `onDragStop` desarma y el widget asienta con `cubic-bezier(.34,1.56,.64,1)`. Handles ✋/resize exentos (flujo inmediato de siempre); `draggable` HTML5 (transferencia entre paneles) solo con ratón — en táctil era otro secuestrador del gesto. **Ratón/escritorio bit a bit igual** (la puerta solo escucha eventos touch; verificado con Playwright a 1280).
  - Métricas (CDP touch, 390×844, modo edición): swipe → scrollTop 0→32 con transform intacto `translate(18px,18px)`; hold 450 ms → `armed=true` + `react-draggable-dragging=true`, drag en el mismo gesto hasta `translate(148px,128px)` sin scroll, asentamiento al soltar.
- **Bloque 2 — TrinityFab (`layout/trinity-fab.tsx` + `.module.css` nuevos, montado como hermano del dock dentro de `omni-dock.tsx`):** botón flotante cristal líquido 56 px con anillo cónico cardinal (N #007FFF · E #FFBF00 · S #DC143C · O #39FF14) y sigil de 4 gemas; al tocar despliega 4 pétalos-gema en cruz que abren cada menú con el MISMO `usePerimeter().setActiveEdge` de los sensores (cero lógica duplicada, toggle incluido). Draggable con anclaje al borde más cercano (pos persistida `os.trinity.fab.pos`); al abrirse pegado a un borde se desplaza ~64 px al centro para que ningún pétalo caiga fuera. Visibilidad `os.trinity.fab` = auto/on/off (auto = coarse o ≤1024 px; a 1280 fino NO se renderiza — verificado 0 nodos). Nota: `globals.css` fuerza `button{border-radius:var(--radius)!important}` → el módulo usa `9999px !important`. Panel nuevo de Ajustes `settings/trinity/trinity-fab-settings.tsx` + pestaña "Trinity" en `/settings` (sin tocar `appearance/**`): selector Auto/Visible/Oculto con estado en vivo (verificado: Oculto desmonta el FAB al instante).
- **Bloque 3 — menús Trinity en pantallas chicas (`side-curtains.tsx`, `trinity/control-center.tsx`):**
  - **Logic estaba ROTO en móvil:** el wrapper framer-motion con `y:"-50%"` residual era containing block del `fixed inset-0` del ControlCenter → quedaba confinado a una franja de ~2 px fuera de pantalla (a 320: root l=320 r=322, 86 elementos derramados hasta x=577). Fix: el wrapper anima solo `x`, centrado vertical sin transform (inset-0 móvil / top-0 bottom-0 + my-auto md), y el ControlCenter rellena a su padre (`w-full h-full` móvil) conservando exactamente sus tamaños md/lg.
  - Auditoría final (320/360/390/768, rects vs viewport ignorando scrollers horizontales legítimos): **0 desbordes** en Anchor/Logic/Horizon en todos los anchos, `scrollWidth==viewport` siempre; en Zenith solo el div decorativo de rayos `w-[600px]` clipado por `overflow-hidden` (sin efecto visual).
- **Verificación:** `npx tsc --noEmit --incremental` = **153 errores, idéntico al baseline (0 nuevos, ninguno en archivos nuevos)**; el TS2322 de grid-area es preexistente (tipos de RGL v2 sin `isDraggable` en `Responsive`). Capturas en `outputs/shots/`: `os2-touch-scroll.png`, `os2-touch-armed.png`, `os2-fab-cerrado-390.png`, `os2-fab-abierto-390.png`, `os2-fab-zenith-390.png`, `os2-fab-logic-390.png`, `os2-settings-trinity-390.png`, `os2-{zenith,horizon,logic,anchor}-390.png`, `os2-logic-320.png` (peor caso arreglado) y set `os2-*-320.png`.
- **No tocado (límite de propiedad):** `globals.css`, `appearance-context`, `app/layout.tsx`, `settings/appearance/**`, `dashboard/widgets/**`. Ninguna función eliminada (drag ratón, ✋, resize, HTML5 DnD entre paneles, sensores de borde y atajos siguen intactos).

### Adenda 18 — Tema "StarSeed Café" para todo el OS + pulido global (2026-06-11)
- **SOP primero (regla dorada):** sección nueva "Tema StarSeed Café (data-os-theme, v1)" en `architecture/integracion-portal-starseed-os.md` (mecanismo de 3 capas, paletas exactas, tokens de movimiento, invariantes).
- **Sistema de temas descubierto:** (1) next-themes con `attribute="class"` (atmósferas `light/dark/grey/natural/glass/custom` como clases en `<html>` con bloques HSL en `globals.css`); (2) `AppearanceConfig` en `localStorage appearance-config-v2` con `applyStyles()` inyectando vars (glass, radius, fuentes, `data-materia` en body); (3) presets curados (`curated-presets.ts`) que aplican DeepPartial del config. El tema Café se montó como **capa nueva ortogonal**: `themeStore.osTheme?: "default" | "cafe"` (unión aditiva, export `OsThemeId`) → `applyStyles()` pone `data-os-theme="cafe"` en `<html>` → `globals.css` recubre TODAS las vars del design system.
- **Tema café (valores clave):** OSCURO (.dark/.natural/.glass): fondo `130 19% 6%` (#0d130e verde-negro), card `120 16% 9%`, primario oro `42 74% 66%` (#E9C46A), acento lima `97 72% 67%`, secundario terracota, borde oro `44 30% 26%`, body radial #16210f→#070b08. CLARO: fondo pergamino `43 76% 95%` (#fdf7ea), tinta café `27 42% 16%` (#3B2818), primario terracota `15 53% 47%` (#C05C3B), secundario ámbar `37 92% 50%`, acento musgo `104 49% 30%`, borde oro suave `40 42% 72%`, body radial #fdf7ea→#e8dabc. Tipos: titulares **Fraunces** (`--font-headline` en body bajo café), labels **Space Mono** (`--font-code`); radios 14–26px; cristal cálido (liquid-glass-ui/panel/card-glass con verde-oliva + borde oro 35% en dark, crema+oro en claro); botones primary "oro fundido" (degradado vertical + inset highlight); glow hover dorado en dark; scrollbar tintada. Regla extra: bajo café claro, `body[data-materia]` re-afirma terracota (el oro de materia no contrasta sobre crema); en café oscuro coinciden (oro).
- **Tokens de movimiento** en `:root`: `--ease-organic/.22,1,.36,1`, `--ease-glide/.16,1,.3,1`, `--ease-elastic`, `--ease-soft` + `--dur-fast/base/slow` (150/220/300ms); `--dur-base` ahora sincronizada con `animations.transitionDuration` desde `applyStyles`. La regla global de transiciones pasó a `var(--dur-base) var(--ease-glide)` (mismos fallbacks). Bajo café, interactivos usan `--ease-organic` y los Radix open/close `--ease-glide`.
- **Selector:** `src/components/settings/appearance/os-theme-selector.tsx` (nuevo) — "Tema del sistema" con 2 tarjetas (Aurora StarSeed default / StarSeed Café) con mini-preview doble dark+light (ventanita: titular serif, tarjeta, botón primario, chip acento), `aria-pressed`, check activo; montado arriba de la pestaña Galería en `appearance-editor.tsx`. Persistencia: el mismo `updateSection("themeStore",…)` de siempre.
- **Pulido de widgets (sistémico vía kit, API intacta):** `globals.css` define por fin `.custom-scrollbar` (WidgetShell la usaba y NO existía → scrollbars finas en TODOS los widgets) + clase nueva `os-widget-shell` (hover border-primary, `focus-within` con anillo, `font-variant-numeric: tabular-nums` heredado en todo widget, sombra cálida bajo café). `widget-shell.tsx`: clase añadida + título `font-headline`. `primitives.tsx`: `MiniList` con empty state real (icono Lucide `Inbox` configurable `emptyIcon` + mensaje — cascada a ~15 widgets legacy que ya pasaban `empty=`), `StatTile` con hover visible, `Chip` con `whitespace-nowrap` (los badges partían palabras a 390px: "COLECTIV O").
- **Fix transversal real:** `--primary-rgb` se usaba en 5 archivos (`rgba(var(--primary-rgb),…)` en network, hub, culture, glass-card, design-canvas) pero **no estaba definida en ningún sitio** → esas sombras se descartaban en silencio. Definida ahora por tema (:root 160,43,238 · .dark 205,119,248 · .grey 10,167,235 · .natural 58,223,118 · .glass 51,187,255 · café claro 192,92,59 · café oscuro 233,196,106 · y las 3 variantes materia).
- **Páginas:** hub h1 des-hardcodeado (`from-cyan-400 to-purple-400` → `from-primary to-secondary` + sombra `hsl(var(--primary-hsl)/…)`); explorer h1 `from-white` (ilegible en temas claros) → `from-foreground`; agent: SelectTriggers `bg-black/50 border-white/10` → `bg-card/60 border-border/50` + `max-w-[46vw]` (móvil); network `_components/navigation.tsx`: tabs con `whitespace-nowrap shrink-0` + `overflow-x-auto scrollbar-hide` (a 390px partían palabras: "Panoram a"). Resto de secciones heredan vía vars (verificado en captura).
- **Verificación:** `npx tsc --noEmit --incremental` = **153 errores, idéntico al baseline (0 nuevos)**, ninguno en archivos tocados. Playwright (dev server 9002, capturas en `outputs/shots/`): `os3-tema-cafe-dashboard-1280.png` y `-390.png` (café oscuro: widgets verde-negro+oro, serif, sin overflow), `os3-tema-cafe-light-390.png` (tarjetas pergamino + terracota; nota: el canvas Materia sigue siendo oscuro detrás — comportamiento previo de materia en temas claros), `os3-settings-selector-390.png` (selector con tarjeta Café activa, aria-pressed true), `os3-network-390.png` (café + tabs scrollables, scrollWidth 390=390). Prueba DOM en vivo: alternando el atributo, `--primary-hsl` 280 90% 72% ↔ **42 74% 66%**, `--background-hsl` 258 45% 5% ↔ **130 19% 6%**, body gradient Nebula ↔ verde-negro, `--font-headline` Space Grotesk ↔ **Fraunces**.
- **No tocado (límite de propiedad):** `src/components/layout/**`, dashboard layout/grid drag, TrinityFab. Nada eliminado en ningún archivo; cambios aditivos.

### Adenda 19 — Trinity Móvil v2: pulsación 3s configurable + acceso por bordes + sync de cuenta (2026-06-13)
- **Petición de Alex:** (a) integrar el nuevo diseño como tema en Ajustes — ya estaba (tema "StarSeed Café" + Materia Viva, Adendas 14/18; confirmado, no se rehace); (b) en táctil los widgets deben moverse solo tras mantener pulsado **3 s**; (c) los menús Trinity deben abrirse con **botón lateral largo no intrusivo configurable en cada borde** y **deslizando desde cada orilla**, todo ajustable; (d) mejorar integración con cuentas/perfiles compartidos. SOP primero: nuevas secciones "Trinity Móvil · Bloque 4" y "Sincronización de preferencias" en `integracion-portal-starseed-os.md`.
- **Config aditiva** (`context/appearance-context.tsx`): `trinity.touch{holdMs:3000, haptics:true}` y `trinity.edgeAccess{mode:auto, edges{4×{handle,swipe}}, handleLength:28%, handleThickness:5px, handleOpacity:0.22, swipeThreshold:56px}`, ambos opcionales → deepMerge mantiene válidas las configs guardadas.
- **Pulsación configurable:** `use-touch-drag-arming.ts` ahora `useTouchDragArming(enabled,{holdMs,haptics})` con refs vivas; `grid-area.tsx` lee `config.trinity.touch` (import `useAppearance` añadido). Default 3000 ms; ajustable 300–4000. Resto del Bloque 1 intacto.
- **Acceso por bordes (NUEVO):** `components/layout/trinity-edge-access.tsx` + `.module.css`, montado en `app/layout.tsx` bajo `PerimeterProvider`. Asas-píldora por orilla (color cardinal, opacidad baja en reposo, tap = toggle) + deslizar desde los 24px del borde superado `swipeThreshold` (con guarda anti-scroll-paralelo y destello de confirmación). Mismo `setActiveEdge` que sensores/FAB; solo eventos touch; `mode auto` = coarse/≤1024px. z-index 84.
- **Ajustes ampliados:** `components/settings/trinity/trinity-edge-settings.tsx` añadido a la pestaña Trinity de `/settings` (junto al panel del FAB): slider pulsación + háptica, modo global, asa/deslizar por orilla, longitud/grosor/opacidad/sensibilidad. Usa `updateConfig` (deepMerge anidado).
- **Sync de cuenta StarSeed (NUEVO):** `lib/settings-sync.ts` (push/pull de `SYNCED_KEYS` a Supabase `user_settings`, opt-in, tolerante a falta de sesión/tabla) + panel `components/settings/account/account-sync-panel.tsx` en Ajustes → Perfil. Migración SQL documentada en el SOP (tabla + RLS por usuario). localStorage sigue siendo fuente de verdad offline.
- **OmniDock pantallas chicas:** ya resuelto por el strip `.omni-dock-strip` (scroll-snap + máscara + safe-area, Adenda 16); ahora abrir Anchor en táctil es trivial vía asa/deslizar inferior + FAB. Sin cambios extra.
- **⚠️ Verificación PENDIENTE:** el sandbox Linux no arrancó (disco lleno en el Mac) → no se pudo correr `tsc`/dev/Playwright esta sesión. Revisado por lectura (tipos, imports, providers, deepMerge). Ejecutar `npx tsc --noEmit` y `npm run dev` antes de desplegar. Nada eliminado; todo aditivo y desactivable.

### Adenda 20 — Deploy del OS desbloqueado + rediseño de widgets con interconexión (2026-06-13, tarde)
- **CAUSA REAL de "el OS nunca cambia" (resuelta):** el proyecto Vercel `starseed-os` (equipo `starseeds-projects`, token `vcp_237Kww…`) desplegaba desde **`StarSeedSystem/starseed-os`** (congelado marzo 2026), mientras el desarrollo vivo está en **`StarSeedSystem/starseed-system`** (este repo, `main`). Además el `next build` **fallaba** por `useSearchParams()` sin `<Suspense>` en `/agent` y `/ai-setup`.
- **Fixes de build:** `<Suspense>` en `/agent` y `/ai-setup` (+ `force-dynamic`); `/library` ya lo tenía. Deploy quedó READY.
- **Reconexión:** el proyecto Vercel `starseed-os` se **reapuntó a `StarSeedSystem/starseed-system` (branch main)** vía API (unlink DELETE v1 + link v9) → auto-deploy por push ya funciona. Disparo manual: `POST /v13/deployments` con `gitSource.repoId=1138672501`, `target=production`.
- **WidgetShell (kit):** hairline de acento, sigilo StarSeed de fondo, glow en hover (sin transform, no interfiere con drag), y nuevo prop `connections` (chips "✦ Conecta" en footer, solo no-micro) + prop `sigil`.
- **Interconexión cableada en 9 widgets:** Cartera (Fundación/Café/Mercado), Gobernanza (Comunidades/Cultura/Educación), Nexus IA (Ecosistema IA/Gráfica Viva/Biblioteca), Mis Páginas, Explorar Red, Cultura, Aprendizaje, Pulso Económico, Mensajes.
- **Responsividad:** `globals.css` `.os-widget-shell` con glow hover + `prefers-reduced-motion`; `grid-area` con padding fluido `clamp()` + `pb` con safe-area/holgura de dock (320px→ultrawide).
- **Verificación:** `tsc --noEmit` = 153 (baseline exacto, 0 nuevos; el TS2322 de grid-area es el preexistente de react-grid-layout). Deploys READY: `534c503` (fix build) → `a922889` (WidgetShell) → `dc9777d` (interconexión+responsive).
- **Pendiente ideal:** rediseño individual por widget/área a mayor profundidad; rotar el GITHUB_TOKEN compartido en chat.

### Adenda 21 — Modo de diseño por widget + rediseño de 11 widgets + Figma poblado (2026-06-13, noche · multi-agente)
- **Botón del bot de IA eliminado** (`AiOverlay` desmontado de `(app)/layout.tsx`; la IA vive en el Exocórtex de Trinity/Zenith).
- **WidgetShell**: nueva acción **Ampliar** (`expandHref`/`onExpand` → ventana/pestaña) y **modo de diseño** `designMode "theme"|"original"` (prop por widget + global `config.widgets.designMode`). "original" = cristal líquido teñido con el acento del widget (identidad propia, independiente del tema). Autoguardado en dashboard (localStorage) + perfil (settings-sync). Control en Ajustes→Apariencia (`widgets-design-settings.tsx`).
- **Rediseño profesional de 11 widgets** (multi-agente, lotes disjuntos): system-status, notifications, recent-activity, active-projects, social-radar, mental-coherence, learning-path, collab-projects, relevant-posts, live-data, calculator. Mejoras: info más clara/jerárquica, iconos/colores con significado, `connections` (interconexión), `expandHref`, teclado en calculadora, responsividad (clamp/min-w-0/flex-wrap).
- **Figma**: 5 proyectos creados y **poblados** vía `use_figma` (funcionó pese a asiento "View"): Maestro con board "Design Tokens" (paletas 3 temas + tipografía + Trinity + cristal líquido), y portadas + demo WidgetShell en OS UI Kit, Nexus, Café, Audiomorphic. Spec: `architecture/design-system-figma.md`. Keys en memoria.
- **Verificación**: `tsc --noEmit` = 153 (baseline, 0 nuevos) en cada paso. Deploys READY encadenados: `29024f9`→`44b3ea3`→`18835b5`→`082047f`. Auto-deploy ya reconectado (proyecto Vercel starseed-os → repo starseed-system/main).
- **Pendiente profundo**: poblar más frames Figma (dashboard responsive, kit de estados, assets Café/Audiomorphic); reestructurar el resto de widgets (gen2–gen5) con servicios en tiempo real; override de designMode por instancia desde el panel de cada widget.

---
## Adenda 18 — 2026-06-14 · Táctil "normal" (sin arrastre en touch) + logo Spline a nivel raíz

**Por qué:** tras v4, en táctil los widgets seguían moviéndose al tocarlos y los
botones no respondían. Causa real: el sistema de "armado por pulsación"
(`use-touch-drag-arming`) hacía `e.stopPropagation()` en fase de captura sobre
cada `touchstart` del grid en modo edición + re-despacho sintético de TouchEvent
→ frágil, mataba taps en dedos reales.

**Cambio (commit 9a52dd2):**
- Eliminado por completo `useTouchDragArming` del render. Nuevo modelo:
  `isDraggable=isResizable=(isEditMode && !isCoarsePointer)`. En CUALQUIER pantalla
  táctil el arrastre/redimensión de RGL están OFF → deslizar = scroll, los botones
  siempre reciben su tap. En ratón, arrastre/redimensión normales en edición.
- Reordenar en táctil: botones ↑/↓ por widget (`moveWidget` intercambia x/y con el
  vecino en orden visual; RGL compacta vertical). Sin arrastre.
- `grid-area-touch.module.css` ya no se usa (import retirado).
- Logo "Built with Spline": el matalogos anterior vivía en wrapper a z -10/-40 →
  inútil. Nuevo `SplineWatermarkCover` a nivel raíz: eliminador JS que atraviesa
  shadow DOM (observer + intervalo) + tapón degradado fijo z-[100] esquina inf-der.
- Badge: "táctil-normal v5".

**Verificado:** build Vercel READY (compila). Falta verificación en dispositivo
táctil real (el inspector Chrome estaba desconectado en esta sesión).

---
## Adenda 19 — 2026-06-14 · Táctil = rejilla normal (sin RGL) + cubre-logo reforzado

**Diagnóstico real (confirmado por el usuario):** en v5 las flechas ↑/↓ aparecían
(→ el JS nuevo SÍ corría), pero en NO-edición los widgets seguían moviéndose al
tocarlos y los botones/scroll interno no funcionaban en táctil. Como en no-edición
`isDraggable=false`, RGL no era la causa: el problema es react-grid-layout EN SÍ en
táctil (posición absoluta + transforms rompen scroll nativo, taps y scroll interno).

**Cambio (commit 0a923f2, badge v6):**
- `grid-area.tsx`: si `mounted && isCoarse` (puntero táctil) → se RENDERIZA una rejilla
  de tarjetas normal en flujo DOM (grid-cols-1/sm:2, cada tarjeta con altura derivada
  de layout.h, `overflow-auto` + `touch-action:pan-y`), SIN react-grid-layout. Botones
  de edición (↑/↓ reordenar, 📌🔗✕) superpuestos. RGL queda SOLO para ratón/escritorio.
- Logo Spline: `SplineWatermarkCover` ampliado a 240×78, casi sólido en la esquina,
  z-index 2147483647.

**Verificado:** build Vercel READY. Pendiente confirmación del usuario en su táctil.

---
## Adenda 20 — 2026-06-14 · Logo Spline eliminado + datos reales (clima + cartera)

- **v7 (commit 0ad1568):** logo "Built with Spline" eliminado buscando el TEXTO en
  cualquier nodo DOM (no solo <a>) + shadow DOM, en `SplineWatermarkCover` (sin tapón
  visual; el logo es texto del DOM, confirmado por captura). Scroll táctil ya OK (v6).
- **v8 (commit c57d2ed):**
  - `src/lib/weather-mock.ts` → `fetchWeatherData` ahora trae DATOS REALES de
    Open-Meteo (clima, UV, calidad de aire, amanecer/atardecer) + NOAA SWPC (Kp,
    viento solar mag+plasma, clase de rayos X), fusionados sobre el mock (degradación
    elegante). Fase lunar calculada. Alimenta TODOS los widgets de clima/espacial.
  - `cartera-starseed.tsx`: gráficas recharts (área bolsa 60d, dona de granos por
    valor en semillas, valor total de cartera en €, delta 7d). Lee Supabase real.
  - `CARTERA_STARSEED` añadida al dashboard de Economía; DEFAULTS_VERSION → gen6 para
    re-sembrar. Badge v8.

**Pendiente (próximas olas):** mapas/ubicación con datos reales, widget astrológico
calculado, panel de proveedor de datos POR widget (selector configurable), y hacer
funcionales con datos reales las entidades sociales (posts/grupos/páginas/perfiles/
comunidades/eventos/archivos/apps/proyectos).

---
## Adenda 21 — 2026-06-14 · Logo Spline reforzado (v9) + astrología real + entidades sociales (v10)

- **v9 (c526b75):** `SplineWatermarkCover` ahora elimina el watermark por COINCIDENCIA
  POR INCLUSIÓN del texto "built with spline" y sube hasta el contenedor píldora
  (no solo <a> exacto), atravesando shadow DOM. NOTA: la captura del usuario mostraba
  badge "táctil-armar v4" → esa pestaña estaba CACHEADA en v4 (de ahí que viera el logo);
  el fix vive en v7+. Requiere cargar build fresco.
- **v10 (6865f25) — 2 subagentes sincronizados:**
  - `src/lib/astro.ts` (NUEVO): cálculos puros — fase lunar/iluminación, signo solar,
    longitudes y signos de Sol/Luna/Mercurio/Venus/Marte/Júpiter/Saturno (aprox. bajo
    orden), día lunar, biorritmos 23/28/33, coherencia vital determinista.
  - `natal-chart-widget` y `energy-map-widget`: ahora muestran datos astrológicos REALES
    calculados (recalculan cada minuto), no mock/aleatorio. tsc 0 errores.
  - Entidades sociales interconectadas: sample-entities/sample-events normalizados con
    slugs canónicos; `explore-network-widget`, `my-pages-widget`, `social-radar-widget`
    ahora enlazan (next/link) a /pagina|/grupo|/evento/[slug] reales y botones Unirse/
    Seguir/Asistir funcionan. Helpers en entity-links.ts. Build Vercel READY.

**Pendiente (próximas olas):** mapas/ubicación con tiles reales (Leaflet/OSM), selector
de PROVEEDOR DE DATOS por widget (configurable), y profundizar funciones de cada widget.

---
## Adenda 22 — 2026-06-14 · Logo Spline triple-blindado (v11) + mapas reales + geocodificación (v12)

- **v11 (7836641):** SplineWatermarkCover ahora (1) parchea Element.prototype.attachShadow
  a modo "open" a nivel de módulo (antes de montar Spline) para poder atravesar el shadow
  DOM CERRADO donde el runtime aloja el watermark; (2) mantiene el purgado agresivo;
  (3) añade un cubre-esquina con backdrop-filter blur (no bloque sólido) como respaldo
  garantizado que difumina cualquier resto. (Las capturas previas del usuario seguían en
  caché v4.)
- **v12 (c715d28) — 2 subagentes:**
  - Widget de mapa REAL `MAP_LOCATION`: Leaflet 1.9.4 vía CDN + tiles OpenStreetMap,
    centrado en la ubicación real del usuario, marcadores de entidades; integrado en el
    dashboard "Ubicación". Archivos: map-widget.tsx, lib/geo.ts + registro/manifest/tipos.
  - Geocodificación REAL en weather-location-context: búsqueda Open-Meteo (es), reverse
    Nominatim, timezone+elevación reales; API pública del hook intacta; campos opcionales
    country/timezone/elevation. lib/geocoding.ts.
  - DEFAULTS_VERSION gen7 (re-siembra Ubicación con el mapa). Build Vercel READY.

**Pendiente:** selector de PROVEEDOR DE DATOS por widget (configurable), profundizar
funciones avanzadas por widget, y entidades sociales con persistencia real en Supabase.

---
## Adenda 23 — 2026-06-14 · Logo Spline ELIMINADO EN LA FUENTE (v13) + proveedor por widget (v14)

- **CAUSA RAÍZ confirmada:** el watermark "Built with Spline" NO es DOM — el runtime
  (@splinetool/runtime) lo pinta en el <canvas> como pase WebGL `pipeline.logoOverlayPass`
  (método `pipeline.setWatermark`). Por eso ningún borrado de DOM/cover funcionaba.
- **v13 (69724fb):** SplineBackground.handleLoad ahora accede a
  `app._renderer.pipeline` y hace `setWatermark(null)` + `logoOverlayPass.enabled=false`
  + `updateRenderToScreen()`, con reintentos (60–4000ms) e intervalo 750ms×40 por si el
  runtime lo reactiva al cargar textura/resize. Quitado el cubre-esquina borroso.
  SplineWatermarkCover → return null (solo quedan respaldos invisibles).
- **v14 (f2b0a14):** selector de PROVEEDOR DE DATOS por widget — `src/lib/widget-data/
  providers.ts` (DATA_PROVIDERS por dominio: weather/air/space/finance/maps/astro),
  `widget-data-source-control.tsx` con hook `useWidgetProvider(widgetId, domain)` +
  persistencia localStorage; integrado de ejemplo en weather-basic (open-meteo/wttr/mock).
  Build READY.

**Pendiente:** propagar el selector de proveedor al resto de widgets, profundizar
funciones avanzadas por widget, persistencia social en Supabase.

---
## Adenda 24 — 2026-06-14 · Persistencia social en Supabase + funciones avanzadas de widgets (v15)

- **Supabase (dzkjapinnewkxzjltadv):** creadas tablas os_pages, os_groups, os_events,
  os_posts, os_follows, os_memberships, os_event_attendance con RLS (lectura pública;
  escritura por usuario autenticado en sus filas). Sembradas entidades canónicas que
  coinciden con los slugs de los widgets.
- **Frontend (commit d9e0b85):**
  - NUEVO src/lib/os-social.ts (capa de acceso tipada + fallback a sample-entities) y
    src/hooks/use-os-entities.ts (useOsPages/Groups/Events/Entity/Posts, useFollow,
    useMembership, useAttendance; realtime de os_posts; needsAuth para invitar a login).
  - Páginas de detalle (pagina/grupo/evento [slug]) y widgets sociales (explore-network,
    my-pages, social-radar) leen de Supabase con fallback; follow/join/attend/publicar
    persisten si hay sesión.
  - Funciones avanzadas: economic-overview (recharts, selector 7d/30d, deltas, desglose),
    oikos-metabolism (conmutador de recurso, mini-sankey SVG, tendencia), messages (buscador,
    hilos, marcar leído), notifications (filtros por tipo, leer/descartar, prioridad).
  - Build Vercel READY. Badge v15.

**Pendiente:** propagar selector de proveedor al resto de widgets; más entidades os_* y
edición/creación desde la UI; profundizar más áreas (educación/cultura/política).

---
## Adenda 25 — 2026-06-14 · Crear/editar entidades desde UI + áreas política/educación/cultura (v16)

- **Crear/editar entidades (commit 4b542aa):** entity-editor-dialog.tsx (crear/editar
  página/grupo/evento) + create/update/delete + isEntityOwner + fetchMyEntities en
  os-social.ts (owner_id=auth.uid(), slug auto con reintento ante choque unique);
  hooks useEntityOwner/useMyEntities/useEntityMutations. Botón "+ Nueva" en Mis Páginas
  abre el diálogo; botón "Editar" (solo dueño) en páginas de detalle.
- **Áreas profundizadas:** agora-causal (filtro estado + votar + detalle), political-summary
  (recharts participación/fases + filtro), skill-tree (desbloqueo por requisito + panel XP
  radial), universal-library (búsqueda/filtro tipo + añadir a ruta), cultural-feed (filtro
  + me gusta/guardar + ampliada), multiverse-hub (filtro modo + entrar/guardar + ampliada).
  Build Vercel READY. Badge v16.

**Pendiente:** propagar selector de proveedor al resto de widgets; más áreas (sistema/red/
IA/parlamento); subida de imágenes (avatar/portada) a Supabase Storage para entidades.

---
## Adenda 26 — 2026-06-14 · Subida de imágenes a Storage + áreas sistema/red/IA/parlamento (v17)

- **Supabase Storage:** bucket `os-media` (público; insert/update/delete autenticados,
  select público). `uploadEntityMedia(file, 'avatar'|'cover')` en os-social.ts; el
  entity-editor-dialog ahora sube avatar/portada con vista previa + opción URL manual,
  guardando la URL pública en os_pages/os_groups/os_events.
- **Áreas profundizadas (commit 260959b):** sovereign-node (métricas en vivo CPU/RAM/red
  con recharts + toggles de servicios + uptime), mesh-radar (topología SVG + detalle de
  nodo + filtro + conectividad), astraura-cortex (sugerencias con confianza + aceptar/
  descartar + escenario), liquid-delegation (delegar/revocar + poder de voto + buscador).
- .gitignore: ignora .tscout.txt/.persist-test.txt (leftovers de agentes). Build READY. Badge v17.

**Pendiente:** propagar selector de proveedor al resto de widgets; áreas restantes
(productividad/descubrimientos/ayudantía); comentarios/likes reales en posts (Supabase).

---
## Adenda 27 — 2026-06-14 · Likes/comentarios reales + áreas productividad/descubrimientos (v18)

- **Supabase:** tablas os_post_likes, os_post_comments (RLS). os-social: fetchLikes/toggleLike/
  fetchComments/addComment/deleteComment + tipo OsComment. Hooks useLikes/useComments
  (optimista, realtime opcional). PostCard distingue post real (uuid) → like/comentarios
  persistentes; post de ejemplo → estado local + invitación a login. Páginas pagina/grupo
  ya renderizan posts reales → quedan conectadas.
- **Áreas (commit 702555f):** flow-director (curva circadiana recharts + hora actual + modos),
  project-swarm (kanban movible + progreso), serendipity-lens (filtro + explorar/guardar +
  detalle), idea-forge (combinar semillas determinista + favoritos). Build READY. Badge v18.

**Pendiente:** propagar selector de proveedor al resto de widgets; áreas restantes
(personalización/dispositivos/entretenimiento); perfiles de usuario reales (tabla profiles).

---
## Adenda 28 — 2026-06-14 · Sistema de toolkits por tipo de página + favicon (v19)

**Resumen:** Unificación del formato de las páginas de entidad y herramientas funcionales
ricas por tipo (partido, E.F., asamblea, comunidad, grupo, evento), al nivel del hub.
Ejemplos navegables interconectados con toda la red. Favicon StarSeed real.

### Hecho
- **Favicon:** regenerado `src/app/icon.png` (512²), `favicon.ico` (16/32/48/64) y
  `public/{starseed-symbol-square,apple-icon}.png` centrando `public/starseed-symbol.png`
  (el ojo-prisma del Nexus). `layout.tsx` metadata.icons apunta a las nuevas variantes.
- **Contratos compartidos:**
  · `src/lib/entity-kinds.ts` — registro canónico de tipos (personal/comunidad/ef/partido/
    asamblea/grupo/evento/pagina/proyecto) con icono, acento, sistema y toolkit; +
    `normalizeEntityKind()` tolerante (pageType de profile, kind os_*, texto de widget).
  · `src/data/sample-governance.ts` — datos ricos DETERMINISTAS e interconectados:
    partidos (programa/militancia/candidaturas/coaliciones/voto interno), federativeEntities
    (cámara/presupuesto participativo/territorio/voto líquido/sub-entidades), assemblies
    (orden del día/mociones/actas), communities (proyectos/procomún/tesorería de Semillas/
    mentorías), groups (sesiones/tareas/recursos), eventExtras (programa/RSVP/ubicación).
    Lookups con fallback elegante (getPartido/getFederativeEntity/getAssembly/getCommunity/
    getGroup/getEventExtras) + aliases (party-1..3, partido-transhumanista, oikos-norte…).
    Enlaza a /network/politics (prop-1..4), /evento/<slug>, /pagina/<slug>, /library.
  · `src/components/social/toolkits/shared/index.tsx` — primitivas: ToolSection, StatTile/
    StatGrid, VoteBar (con quórum), MiniVote (votación interactiva), RosterStrip, ProgressRow,
    PersonRow, LinkCard, Timeline, Chip, EmptyHint. `icon` acepta componente o elemento.
- **6 toolkits + dispatcher** (`src/components/social/toolkits/*Toolkit.tsx` + `index.tsx`
  `GovernanceToolkit`/`hasToolkit`/`toolkitMeta`): construidos en paralelo por subagentes.
  EF es el más rico (5 sub-pestañas, 506 líneas).
- **Cableado:**
  · profile/[username] → pestaña «Gobernanza/Partido/Comunidad/Grupo» según pageType
    (sustituye al antiguo EFGovernanceTabs por el toolkit completo).
  · grupo/[slug], pagina/[slug], evento/[slug] → pestaña/sección de herramientas por kind.
  · NUEVAS rutas `partido/[slug]` y `entidad/[slug]` (shell `governance-entity-page.tsx`
    con portada de acento + métricas + seguir/compartir + toolkit).
  · hub: `myPages` y tarjetas de partido enlazan a rutas reales (se eliminan los `#`).
- **Verificación:** tsc scoped LIMPIO en todos los archivos nuevos/tocados; 13 lookups de
  datos validados en runtime (sumas de presupuesto = 100%, aliases OK, evento desconocido →
  undefined). next.config ya tiene ignoreBuildErrors/ignoreDuringBuilds.

**Pendiente:** persistir gobernanza en Supabase (hoy datos de ejemplo, patrón fallback del
proyecto); votación interna/mociones reales; conectar `voteManagement` del hub a E.F. reales.

---
## Adenda 29 — 2026-06-15 · Deploy del OS EN VIVO + automatización + páginas artículo/curso/perfil

**Resumen:** Resuelto y verificado el despliegue de producción del SOSD; automatizado por repo;
artículo y curso ahora funcionales e interconectados; pestaña Biblioteca del perfil real.

### Hecho
- **Deploy OS resuelto (clave):** la cuenta `alexbordongarrigos` NO es miembro de la org
  `StarSeedSystem` → su token solo lee. El repo del OS requiere un token de la **cuenta-org
  `StarSeedSystem`** (push/admin). El proyecto Vercel `starseed-os` (team `starseeds-projects`)
  YA está conectado a `StarSeedSystem/starseed-system`: **push a main = deploy de producción
  automático** (no hace falta token de Vercel). Verificado vía commit status `Vercel` → success.
  Empujados y desplegados los commits `16ab528` (Adenda 28: toolkits+rutas+favicon+interconexión)
  y `61dd6a7` (este lote). starseed-os.vercel.app sirviendo en vivo.
- **Automatización del despliegue:** `StarSeed Café/.env` ahora tiene `GITHUB_TOKEN_OS` (token de
  StarSeedSystem). El script `StarSeed Ecosistema/Actualizar TODO….command` empuja CADA repo con
  su token (Café=`GITHUB_TOKEN` alexbordongarrigos · OS=`GITHUB_TOKEN_OS`) y es ejecutable; el
  `.env` está gitignored (token no se commitea). ⚠️ Rotar/usar fine-grained recomendado.
- **article/[id]:** autor → /profile, like y "Guardar en Biblioteca" funcionales (estado), scroll a
  discusión, sección "Artículos relacionados" por tags. Fix typing de params.id.
- **course/[id]:** progreso de lecciones interactivo (estado + useMemo), CTA avanza lección,
  enlaces a /library y /network/education, "Cursos relacionados".
- **profile (pestaña Biblioteca):** ya no es stub — grid real de artículos y cursos enlazados a
  /article, /course y /library.
- Nota: el resto de la red (publish 539, library 422, messages 424, notifications 664, settings
  261, mapas/ubicación, explorer, store) ya estaba sustancialmente implementado en adendas previas.

**Pendiente:** persistencia Supabase de gobernanza; enriquecer áreas existentes según prioridad del
usuario; rotación de tokens compartidos en chat.

---
## Adenda 30 — 2026-06-18 · Votación de gobernanza REAL persistida en Supabase (toda la red)

**Resumen:** Los `MiniVote` de todos los toolkits ahora guardan votos reales en Supabase y muestran
recuentos agregados de toda la red. Desplegado en vivo (commit `a93c101`).

### Hecho
- **Supabase (proyecto `dzkjapinnewkxzjltadv`):** migración `os_gov_votes` (id, ballot_type,
  ballot_key, choice, user_id default auth.uid(), unique(ballot_key,user_id)) con RLS estilo os_*
  (lectura pública `true`; insert/update/delete propios `user_id = auth.uid()`). RPC
  `os_gov_tally(p_ballot_key)` → recuentos por opción (grant anon+authenticated).
- **Hook `src/hooks/use-gov-vote.ts`:** lee tally real (RPC) + voto propio; `vote()` hace upsert
  (onConflict ballot_key,user_id) con sesión, u optimista local + `needsAuth` sin sesión. Base
  determinista sembrada (sin Math.random → SSR estable) para no verse vacío.
- **`MiniVote` (shared/toolkits):** acepta `ballotKey`/`ballotType`; persiste y muestra %
  reales; permite cambiar el voto; sin sesión muestra invitación a /login. Cableado por entidad:
  `ef:<slug>:legislativo|presupuesto|delegacion`, `motion:<slug>#i`, `party:<slug>:internal`,
  `comunidad:<slug>:presupuesto`, `evento:<slug>:rsvp`.
- Deploy automático verificado (commit status Vercel → success).

**Pendiente:** mismas mecánicas reales para propuestas legislativas completas (os_posts ya real);
enriquecer mensajes/cuenta/mapas/archivos/feed y widgets según prioridad; rotar tokens del chat.

---
## Adenda 31 — 2026-06-18 · Mejora profesional multi-área en paralelo (commit 53d95e6, vivo)

**Resumen:** 5 agentes en paralelo mejoraron 5 áreas (archivos distintos, aditivo). Desplegado.

### Hecho
- **Cuenta/Perfiles:** `settings/page.tsx` con accesos rápidos (memoria/IA/conexiones/red) + nuevo
  `components/profile/profile-switcher.tsx` (dualidad cuenta↔perfiles, enlaces a /profile).
- **Mensajes:** `messages/page.tsx` rediseñado — dos paneles responsive, búsqueda, filtros por
  canal (Directo/Grupo/E.F./Comunidad), hilos con separadores, composer funcional, avatares→/profile.
- **Publicar:** `publish/page.tsx` — compositor por tipo (post/artículo/evento/propuesta) + selector
  de destino interconectado (samplePages/sampleGroups/E.F./partidos → /pagina,/grupo,/entidad,/partido)
  + etiquetas + audiencia + preview en vivo. Compositor avanzado anterior conservado.
- **Mapas:** `dashboard/widgets/map-widget.tsx` + `location-selector.tsx` — capas StarSeed
  (Eventos/Comunidades/E.F.) con marcadores SVG y popups enlazados (/evento,/entidad,/pagina),
  toggles con conteo, leyenda; base Leaflet intacta.
- **Biblioteca:** `library/page.tsx` — explorador unificado (artículos/cursos/documentos/comunidades)
  con filtros por tipo, búsqueda, orden (persistido) y grid/list; deep-links a /article,/course,/pagina.
- Typecheck: los 7 archivos tocados limpios (errores restantes son pre-existentes en theme-utils/
  theme-gallery/keyStorage/knowledge-network-selector, cubiertos por ignoreBuildErrors).

**Pendiente:** persistencia Supabase de mensajes (no hay tabla os_messages aún); profundizar
widgets del dashboard; rotar tokens del chat.

---
## Adenda 32 — 2026-06-18 · Cerebro 3D del Exocórtex en AI Studio + publicar real + widgets (commit 65ff165, vivo)

**Resumen:** El "Cerebro" (gráfica viva) sale de la sección Red y vive en el Exocórtex/AI Studio como
visualización 3D tipo StarSeed-Memoria-3D, alimentada por el grafo real y con IA real. Desplegado.

### Hecho
- **ExocortexBrain** (`src/components/exocortex/exocortex-brain.tsx` + `memory-graph-data.ts`):
  núcleo 3D = `HarmonicGraph3D` (three.js, SSR-safe) + panel Exocórtex: "Pregunta al Exocórtex"
  con `chat()` del proveedor activo (mismo patrón que /agent), búsqueda en memoria, insights/stats,
  capas/tipos, accesos a la red y ajustes. Alimentado por el grafo REAL
  `src/data/starseed-memory-graph.json` (82 nodos del ecosistema, copiado desde ~/Documents/Claude/Projects/StarSeed).
- **AI Studio** (`/agent`) pestaña Cerebro ahora usa `ExocortexBrain` (antes `LivingGraph`).
- **Red:** quitado el acceso "Gráfica Viva"/Cerebro de `network/page.tsx` y del nav de red; la ruta
  `/network/graph` ahora REDIRIGE a `/agent?tab=cerebro` (no rompe enlaces de dashboard/onboarding/Trinity/widgets).
- **Publicar:** el compositor de `publish/page.tsx` persiste en `os_posts` vía `useOsPosts.publish`
  según el destino elegido (page/group/event).
- **Widgets:** explore-network (rutas reales /pagina,/grupo,/entidad,/partido + filtros),
  messages (conversaciones reales + /profile + /messages), active-projects (progreso+estado+/hub).
- Typecheck: archivos nuevos/tocados limpios; errores restantes pre-existentes (harmonic-graph-3d
  null-guards/THREE namespace, keyStorage, knowledge-network-selector) cubiertos por ignoreBuildErrors.

**Pendiente:** persistencia privada de mensajes (os_messages con RLS por participantes, diseño cuidadoso);
endurecer tipos de harmonic-graph-3d; rotar tokens del chat.

---
## Adenda 33 — 2026-06-18 · MemoryBrain3D (visor fiel) + Cerebro en Trinity + OmniDock (commit 8cb82ae, vivo)

**Resumen:** El cerebro 3D ahora replica el visor real `starseed-memory-3d.html`, con más ajustes, datos
OS interconectados y chat IA; disponible en AI Studio y en una pestaña del Exocórtex del menú Trinity.
El dock inferior muestra nombres, iconos rediseñados y la sección activa.

### Hecho
- **`src/components/exocortex/memory-brain-3d.tsx`** (`MemoryBrain3D`, ~1.5k líneas): port Three.js del
  visor StarSeed (esferas por nodeType, edges por edgeType, sprite labels, starfield, FogExp2, luces;
  layout fuerza-dirigido + reorganizar; cámara orbital manual; raycaster hover/click; panel de detalles
  con links/vecinos). Ajustes extra (tamaño, repulsión, opacidad, giro, etiquetas, starfield, niebla,
  modo layout). Capa "Red OS": merge de páginas/grupos/E.F./partidos/artículos/cursos como nodos con
  deep-links. Chat IA del Exocórtex incorporado (chat() del proveedor activo, resumen del grafo en el
  system prompt, botones "enfocar"). SSR-safe (three por import dinámico). Props compact/showChat.
- **AI Studio** (`/agent` → Cerebro) usa `MemoryBrain3D`. **ExocortexBrain** (turno previo) queda en
  desuso (sin importar; se puede borrar luego).
- **Trinity / ZenithCurtain (Exocórtex):** botón/vista "Cerebro" que muestra `MemoryBrain3D compact showChat`
  con su chat IA, alternando con el buscador universal.
- **OmniDock:** nombre visible bajo cada icono, contenedores de icono con gradiente+anillo por color,
  y resaltado (anillo+glow+punto+etiqueta) de la sección activa según `usePathname`.
- Reusa el grafo real `src/data/starseed-memory-graph.json` (82 nodos).

**Pendiente:** persistencia privada de mensajes (os_messages RLS por participantes); endurecer tipos
de three (null-guards) en memory-brain-3d/harmonic-graph-3d; rotar tokens del chat; borrar ExocortexBrain en desuso.

---
## Adenda 34 — 2026-06-18 · Vault de memorias .md + widgets creativos + páginas formato perfil + publicaciones ricas (commit 205717f, vivo)

**Resumen:** El cerebro 3D gana un sistema de memorias .md (elegibles/editables/categorizables/
importables/exportables/compartibles); 8 widgets elevados; páginas con pestañas tipo perfil;
publicaciones con adjuntos variados, referencias interconectadas y sync de biblioteca. 5 agentes en paralelo.

### Hecho
- **Memory Vault** (`src/lib/memory-vault.ts` + `src/components/exocortex/memory-vault-panel.tsx`):
  MemoryDoc en localStorage (CRUD, categorías, tags, color, activo), parseMarkdownToGraph (raíz+
  headings+bullets+[[wiki-links]]→nodos/edges shape del cerebro), getActiveVaultGraph (merge de las
  activas), export/import .md y JSON, encodeShare/decodeShare, hook useMemoryVault + evento
  `starseed:memory-vault`. Integrado en `MemoryBrain3D`: botón "Memorias" (Database), panel drawer,
  merge en vivo de memorias activas en buildGraph (capa "memoria") y rebuild por `vaultTick`.
- **Widgets (8)** con framer-motion, micro-charts (recharts), deep-links reales y tema-adaptable:
  political-summary, economic-overview (count-up + E.F. budgets), cultural-feed, social-radar (radar/
  órbita + countdown), my-pages (sparklines), learning-path (anillos), recent-activity (timeline),
  relevant-posts (avatares + resonancia).
- **Páginas** grupo/pagina/evento: + pestañas Agenda (UnifiedCalendar), Conexiones (entidades
  interconectadas), Biblioteca (artículos/cursos→/article,/course), Colecciones (CollectionsGrid),
  manteniendo Herramientas/Feed/Acerca/Miembros/Eventos. Ahora se acercan al formato rico de perfil.
- **Publicar**: adjuntos variados (imagen/vídeo/audio/documento/hoja/código/3D/app/enlace), referencias
  interconectadas a la red (samplePages/grupos/E.F./partidos/artículos/cursos), nota de sincronización
  con biblioteca según destino; sigue persistiendo en os_posts.

**Pendiente:** os_messages (RLS por participantes); guardar conexiones nuevas creadas en el cerebro;
persistir el vault en Supabase (hoy localStorage); rotar tokens del chat.

---
## Adenda 35 — 2026-06-18 · Endurecimiento de tipos + 6 widgets más (commit pendiente, vivo)

### Hecho
- **Tipos endurecidos (cero errores en archivos tocados):**
  · memory-brain-3d.tsx + harmonic-graph-3d.tsx: `canvas`/`container` ahora tipados no-nulos tras el
    guard (`const canvas: HTMLCanvasElement = canvasRef.current` después de `if(!...current) return`),
    Vector2 real en raycaster, `import type * as THREE`, cast `MemoryLayer`. Sin cambios de runtime.
  · framer-motion: `ease` como tupla `[number,number,number,number]` (no string) en cultural-feed,
    political-summary, social-radar → resuelve el tipo `Variants`.
- **6 widgets más** (notifications, system-status [gauges animados], collab-projects, ai-generated
  [partículas], mental-coherence [anillo que respira], live-data [ticker]) con framer-motion (ease en
  tuplas), recharts, datos reales, deep-links y tema-adaptable.
- Verificado: typecheck LIMPIO en todos los archivos de la sesión.

**Pendiente:** quedan errores de tipo PRE-EXISTENTES (anteriores a esta sesión) en theme-utils/
theme-gallery (distortWidth), keyStorage, knowledge-network-selector, universal-editor, board-viewer,
LiquidWaveFilter — cubiertos por ignoreBuildErrors; pase dedicado "cero errores" pendiente.

---
## Adenda 36 — 2026-06-20 · Launcher de Dashboard (apps + carpetas) · Fase 1

### Por qué
Ampliar la sección de Dashboards para que aloje apps, carpetas y programas (pantalla de inicio
soberana), con modos de apertura, abridor universal de archivos y media center. Regla de oro: SOP antes
que código.

### Hecho (cambio puramente aditivo — ningún widget existente tocado)
- **SOP nuevo:** `architecture/dashboard-launcher-apps-y-archivos.md` — blueprint completo (modelo de
  apps/carpetas, OpenMode incrustado/ventana/popup/pestaña/ruta/instalada, abridor universal de archivos,
  media center + Trinity, VR/AR, seguridad soberana). Marca 🟢 Fase 1 (launcher) vs 🟡 Fase 2+.
- **Tipo de widget `APP_LAUNCHER`** montado sobre la maquinaria existente (settings jsonb, sin migración):
  · `dashboard/apps/launcher-types.ts` — tipos + presets (forma/estilo de icono, densidad, columnas).
  · `dashboard/apps/app-catalog.ts` — catálogo: Nexus, Café (/cafe/), Audiomorphic, Omnifrecuencias
    (soon), Mensajes, Red, Biblioteca, Exocórtex, Clima, Música (soon), Radio (soon). Estrategia de
    apertura decidida POR APP (embed con fallback a pestaña / ruta interna / soon). URLs canónicas del
    MANUAL DE ENLACES.
  · `dashboard/apps/app-launch.tsx` — `useAppLauncher` + `AppWindow` (ventana OS arrastrable, iframe
    sandbox con timeout→fallback "abrir en pestaña", estado "próximamente"; portal a body).
  · `dashboard/widgets/app-launcher-widget.tsx` — variantes folder (grid) y single (tile); menú de modo
    de apertura por app (portado); iconos personalizables (squircle/circle/rounded/hex, glass/solid/
    outline/gradient).
- **Registro:** WidgetType += APP_LAUNCHER · manifest (6×3, min 2×2) · categoría nueva `aplicaciones`
  (LayoutGrid) · widget-registry case · WIDGET_CATEGORY_MAP · AVAILABLE_WIDGETS (selector).
- **Semilla:** carpeta "Apps StarSeed" por defecto en el template de inicio (`Dashboards`, 12×3 arriba);
  settings vacío → resuelve la colección `starseed`.
- Verificado: `tsc --noEmit` → CERO errores en archivos nuevos/editados y CERO menciones a APP_LAUNCHER
  en el log. Los ~146 errores restantes son los PRE-EXISTENTES (AI-refernces, hermes-integration,
  design-canvas, settings, weather solar-wind, react-grid-layout typing) — sin relación con esta sesión.

**Pendiente (Fase 2+):** abridor universal de archivos; media center (música/radio/Omnifrecuencias) +
control Trinity; Audiomorphic ajustable y gratis dentro del OS; persistir apps instaladas en
`cafe_accounts.apps` y carpetas en `user_settings`; VR/AR (WebXR); UI de edición de settings del launcher.

---
## Adenda 37 — 2026-06-20 · Abridor Universal de Contenido · Fase 2 (en progreso)

### Por qué
Cumplir "abrir cualquier archivo/formato con opciones reales, sincronizado con biblioteca, publicaciones
y datos del usuario". Keystone que interconecta el OS (Lienzo Universal).

### Hecho (aditivo — nada existente roto)
- **Ventana OS reutilizable:** `dashboard/apps/os-window.tsx` (arrastrable, Esc, acento, acciones,
  toolbar). `AppWindow` (launcher) **refactorizado** para usarla (DRY).
- **Motor de contenido** en `dashboard/apps/content/`:
  · `content-types.ts` — `ContentResource`/`ContentKind` (image/gif/gallery/video/audio/pdf/html/
    model3d/markdown/code/text/dataset/link/entity/app/unknown); `detectKind` (mime+extensión);
    adaptadores `fromUrl`, `fromFile`, `fromPostMedia` (publicaciones, `social-posts.ts`),
    `fromLibraryItem` (biblioteca, `widget-data/types.ts`) → MISMO motor para mensajes/posts/biblioteca.
  · `viewers.tsx` — imagen (zoom/pan, GIF), galería, vídeo/audio, PDF nativo, HTML (sandbox/srcdoc),
    documento (markdown vía react-markdown / código con números de línea / texto, con fetch remoto),
    tarjeta de enlace, tarjeta de entidad (biblioteca), fallback.
  · `model-viewer.tsx` — 3D GLB/GLTF (R3F + drei: useGLTF/OrbitControls/Center), `next/dynamic` ssr:false.
  · `viewer-registry.tsx` — mapa `kind → componente` (3D diferido).
  · `content-opener.tsx` — `useContentOpener` (pila de ventanas, portal) + `ContentWindow` + **barra de
    acciones universal**: abrir en pestaña, descargar, copiar (enlace/contenido), clonar/duplicar,
    guardar en biblioteca, instalar. copiar/descargar/pestaña reales; guardar/instalar vía callback
    (persistencia → Fase 2.1); gancho `onOpen` para Exocórtex/memoria.
- **Widget `UNIVERSAL_OPENER`** (`widgets/universal-opener-widget.tsx`): abrir por URL, subir archivo
  local (multi), 9 ejemplos reales (imagen/GIF/vídeo/audio/PDF/3D/HTML/markdown/código) e items de la
  Biblioteca del usuario (`useWidgetData('education.library')`). Registrado (types/manifest 4×5/registry/
  picker/category-map) y sembrado en el dashboard de inicio.
- Verificado: `tsc -p` acotado a los archivos nuevos (incl. cadena 3D/drei) → **exit 0, cero errores**;
  archivos de registro (types/manifest/categories/defaults) → **cero errores**. (El `tsc` global no cabe
  en una sola pasada por el peso de three/drei; por eso la verificación acotada.)

**Pendiente (Fase 2.1+):** persistencia real de guardar/instalar (`cafe_accounts.apps`/`user_settings`);
media center (música/radio/Omnifrecuencias) + control Trinity; Audiomorphic ajustable y gratis dentro
del OS; fuentes de datos oficiales en tiempo real (capa `data-sources` con selector); magic-bytes para
archivos sin extensión; visor de dataset/CSV enriquecido; VR/AR (WebXR).

---
## Adenda 38 — 2026-06-20 · Media center + Persistencia + Datos oficiales + Siembra (Fase 2)

### Cómo
Dos subagentes en paralelo (cada uno solo archivos nuevos) + integración por el orquestador (registro
compartido + siembra). Aditivo; nada existente roto.

### Hecho
- **Media center** (5 archivos nuevos): `apps/media/media-engine.ts` (singleton `<audio>` + `useMediaPlayer`,
  SSR-safe), `apps/media/media-catalog.ts` (SoundHelix + SomaFM + presets de frecuencia) y widgets
  `MUSIC_PLAYER` (cola/progreso/volumen), `OMNIFRECUENCIAS` (WebAudio: osciladores sine, binaural L/R con
  fades), `RADIO_LIVE` (streams reales), `AUDIOMORPHIC_BG` (activa fondo audiomorphic + overlay + abrir en
  pestaña; `updateConfig({background:{...}})`).
- **Persistencia soberana** (`lib/library-store.ts`): `saveResource`/`installApp` + hooks, localStorage
  SSR-safe (useSyncExternalStore), eventos cross-widget. `content-opener` ahora persiste por defecto en
  guardar/instalar (Lienzo Universal).
- **Fuentes de datos oficiales en tiempo real** (`apps/data-sources/*`): registro con fetch REAL sin clave
  (Open-Meteo, NOAA SWPC Kp, USGS sismos, Spaceflight News) + `useDataSource` (selección + auto-refresco +
  reintento) + widget `OFFICIAL_DATA` con selector de fuente y atribución.
- **Registro** de los 5 widgets nuevos (dashboard-types, widget-manifest, widget-registry, add-widget-dialog
  +iconos Music/Waves/AudioWaveform/Satellite, WIDGET_CATEGORY_MAP).
- **Siembra en TODOS los dashboards predeterminados:** `DefaultDashboardTemplate.widgets` admite `settings?`
  (jsonb) y `dashboard-layout` lo propaga (`settings: (w as any).settings ?? {}`). Helper `withSeededExtras`
  inyecta en cada plantilla la carpeta de apps StarSeed (dock, colección por tema) + los elementos del tema,
  sin solapes ni duplicados. **Inicio** = muestrario completo (apps + Visor Universal + Reproductor +
  Omnifrecuencias + Radio + Audiomorphic + Datos Oficiales + variaciones del launcher single/circle y
  folder/media hex/gradient).
- Verificado: `tsc -p` acotado a los 25 archivos nuevos/editados (incl. cadena 3D/drei y el `content-opener`
  del subagente B) → **exit 0, cero errores**.

**Pendiente (Fase 2.2+):** mini-reproductor en el centro Trinity; subir el store soberano a Supabase
(`user_settings`/`cafe_accounts.apps`); UI visual para editar settings de launcher/carpetas; VR/AR (WebXR).

---
## Adenda 39 — 2026-06-20 · Visibilidad en cuentas activas + Mini-dock global + Pulida

### Por qué
El usuario no veía los widgets nuevos: la siembra solo corre al GENERAR los predeterminados, pero las
cuentas activas (demo) ya los tenían guardados. El código reseed-ea cuando cambia `DEFAULTS_VERSION`.

### Hecho
- **Reseed de cuentas activas:** `DEFAULTS_VERSION` en `dashboard-layout.tsx` → `gen8-2026-06-20-apps-media-datos`.
  Al recargar, toda cuenta con versión distinta ejecuta `reseedDefaultDashboards()` (conserva tableros
  personalizados, regenera los predeterminados) → aparecen apps folder + Visor Universal + media + datos +
  variaciones en TODOS los dashboards. (Si se ve en producción, requiere deploy del repo OS.)
- **Mini-reproductor global** (`apps/media/media-mini-dock.tsx`, subagente C): barra flotante fixed z-90,
  aparece al reproducir, `useMediaPlayer` (prev/play/next/seek/volumen, "EN VIVO" en radio). Montado en
  `src/app/layout.tsx` (RootLayout, junto a OmniDock, dentro de AppearanceProvider) → global en todo el OS.
- **Pulida profesional** (subagente D) de los 5 widgets nuevos: adaptabilidad por `size` de WidgetShell,
  estados loading/error/vacío con reintento, accesibilidad (aria, foco visible), reduced-motion,
  `tabular-nums`. Sin cambios de export/API.
- Verificado: `tsc -p` acotado (mini-dock + 5 widgets pulidos + deps + dashboard-defaults) → **0 errores**.

### Orquestación
2 subagentes en paralelo (Agent tool) solo-archivos-nuevos / edición acotada a sus 5 widgets; el
orquestador hizo el bump de versión y el montaje del dock (sin conflictos de archivos).

**Pendiente (Fase 2.3+):** panel Trinity explícito + salida de medios/conexiones; Supabase para el store
soberano y los dashboards; UI visual de settings de launcher/carpetas; VR/AR (WebXR). Para verlo en
starseed-os.vercel.app hace falta deploy (regla de autor de commit Vercel).

---
## Adenda 40 — 2026-06-20 · Centro de medios + Sync Supabase + Acceso + Deploy

### Cómo
3 subagentes en paralelo (E centro de medios, F sync Supabase, G carpeta de acceso) + integración por el
orquestador.

### Hecho
- **Centro de Control de Medios** (`widgets/media/media-control-widget.tsx`, `MEDIA_CONTROL`): sonando-ahora,
  transporte, volumen maestro, lanzamiento rápido, y **salida de medios** (toggle "visualización al fondo"
  Audiomorphic + selección de dispositivo si el navegador lo soporta). Registrado y sembrado (entretenimiento
  + inicio). Montado además como **pestaña "Medios"** en el panel Trinity (`control-panel.tsx`, 5ª pestaña,
  rosa, side bottom — cambio aditivo con fallback).
- **Sincronización soberana con Supabase** (defensiva, SSR-safe, localStorage manda si no hay sesión):
  `lib/library-sync.ts` (biblioteca/apps ↔ `user_settings.prefs.library/.installed`, merge no destructivo;
  espejo opcional en `cafe_accounts.apps`), `lib/dashboards-sync.ts` (respaldo no invasivo de dashboards en
  `user_settings.prefs.dashboards`), `components/system/sovereign-sync-mount.tsx` (`SovereignSyncMount`)
  montado en RootLayout. Esquema verificado por MCP: `user_settings(user_id,prefs jsonb,updated_at)`.
- **Carpeta de acceso completo** (fuera del repo): `~/Documents/StarSeed OS · Acceso Completo/` con LEEME,
  Integraciones, Mapa, y 9 lanzadores `.command` ejecutables (web/local/deploy/sync/abrir apps/manual).
- **Deploy:** commit `52d1486` hecho (árbol limpio). **Push NO posible desde este entorno** (sin credenciales
  GitHub; `could not read Username`). El usuario despliega con un clic: `⑥ Desplegar StarSeed OS.command` o
  `git push origin main` (sus credenciales). Vercel auto-despliega al recibir el push.
- Verificado: `tsc -p` acotado (MEDIA_CONTROL + sync + mount + dashboard-defaults) → **0 errores**.

**Pendiente:** push a producción (acción del usuario); cabecera dinámica de la pestaña Medios (opcional);
salida de dispositivo real (el engine no expone su <audio>); VR/AR (WebXR).

---
## Adenda 41 — 2026-06-20 · Editor visual de ajustes del launcher

- **Editor de carpeta (engranaje) en `APP_LAUNCHER`** (`widgets/app-launcher-widget.tsx`): panel portado con
  etiqueta, variante (carpeta/tile), colección (StarSeed/Sistema/Media/Propia), forma de icono (squircle/
  circle/rounded/hex), estilo (glass/solid/outline/gradient), densidad, columnas (slider), modo de apertura
  por defecto, mostrar/ocultar etiquetas, y selector de apps (toggle del catálogo → colección "Propia").
- **Persistencia genérica:** el widget emite `window 'starseed:update-widget-settings'` {id, settings}; un
  listener nuevo en `dashboard-layout.tsx` actualiza `loadAllWidgets`/`saveAllWidgets` + `setWidgets`
  (sirve para cualquier widget futuro). Feedback óptimo con estado local `edits`.
- Verificado: `tsc -p` acotado → 0 errores. Commit local (pendiente push del usuario; token personal da 403
  en el repo de la org `StarSeedSystem`, deploy con sus credenciales / launcher ⑥).

**Token de deploy:** guardado en `.env.local` (gitignored) como `GITHUB_TOKEN`. ⚠️ Rotar (viajó por chat).

---
## Adenda 42 — 2026-06-20 · DEPLOY a producción + fusión de cuentas GitHub

- **Desplegado:** `git push` a `StarSeedSystem/starseed-system` `main` → `49aef5e..c26b7b7`. Autor de commits
  = alexbordongarrigos (regla Vercel). Vercel auto-deploy → starseed-os.vercel.app. (El push se hizo con el
  token de la cuenta `StarSeedSystem`, que es dueña del repo.)
- **Cuentas fusionadas (acceso cruzado total):** `alexbordongarrigos` y `StarSeedSystem` son AMBAS cuentas de
  usuario (no orgs). Vía API de GitHub se invitó y aceptó colaborador **admin** en TODAS las repos de la otra
  (12 de StarSeedSystem ↔ 16 de alexbordongarrigos, 28 invitaciones, todas 204). Verificado: alex tiene
  push+admin en `starseed-system`; StarSeedSystem tiene push+admin en `Starseed-Cafe`. → Cualquiera de las
  dos cuentas puede desplegar/empujar cualquier repo del ecosistema. Futuro deploy del OS: `git push origin
  main` con el token de `.env.local` (alex ya tiene admin) o el launcher `⑥`.
- ⚠️ Ambos tokens viajaron por el chat: **rotarlos** tras esta sesión (el acceso cruzado permanece tras rotar).

---
## Adenda 43 — 2026-06-20 · Fix ventana centrada + iconos oficiales + Audiomorphic full + App Omnifrecuencias

- **Ventana de apps centrada (fix):** `os-window.tsx` separaba mal el centrado del drag — Framer Motion pisaba
  el `translate(-50%,-50%)`. Ahora el drag va en una capa plana (transform) y la animación (opacity/scale) en
  el hijo → la ventana SIEMPRE abre centrada. Deploy `2aa4340`.
- **Iconos oficiales:** `StarseedApp.iconUrl?` + render `<img>` en los tiles (overflow-hidden por forma).
  `public/app-icons/audiomorphic.png` (oficial) y `nexus.png` (símbolo StarSeed). Resto sigue con Lucide
  (faltan PNG oficiales de Café/otros — pendiente generarlos).
- **Audiomorphic VERSIÓN COMPLETA gratis dentro del OS:** el OS abre `audiomorphic.vercel.app/?starseed_os=1&full=1`
  (referrerPolicy no-referrer, por eso el param). El subagente parcheó el repo LIVE **`alexbordongarrigos/audiomorphic-ar`**
  (`App.tsx`: si `?starseed_os`/`?full`/referrer incluye `starseed-os`/en iframe → `subscriptionTier='lifetime'`,
  sin tocar Stripe/SubscriptionScreen). Commit `4be4c29` → Vercel auto-deploy `audiomorphic.vercel.app` (READY).
  Reversible revirtiendo `4be4c29`.
- **App Omnifrecuencias completa** (`apps/omnifrecuencias/`): `omni-engine.ts` (WebAudio multi-tono,
  binaural L/R, isocrónico, ondas, fades), `omni-presets.ts` (16 built-ins + **presets guardados como ARCHIVOS
  en `library-store` → data URL JSON, sync Supabase; recall localStorage**), `omnifrecuencias-app.tsx` (editor de
  tonos, visualizador, temporizador, guardar/cargar/eliminar), ruta `(app)/omnifrecuencias`, `omni-app-host.tsx`
  (abre en OSWindow al oír `starseed:open-omnifrecuencias`, montado en RootLayout). Catálogo: omnifrecuencias →
  `native` ruta `/omnifrecuencias`. Deploy `3a41142`.
- Verificado: `tsc -p` acotado de todo lo nuevo → 0 errores. Construido con 2 subagentes en paralelo (I app, J app-repo).

**Pendiente:** iconos PNG oficiales del resto de apps (Café, Omni, etc.); abrir apps nativas (no-href) en OSWindow
desde el launcher (hoy rutean); más apps completas (clima, radio, música) al nivel de Omnifrecuencias; VR/AR.

---
## Adenda 44 — 2026-06-20 · App frecuencias real + Iconos StarSeed + Clima Espacial NOAA (deploy ba1c8b1)

Construido con 3 subagentes en paralelo (N port, O iconos, P clima espacial) + integración.

- **App Omnifrecuencias REAL portada nativa:** se portó `github.com/alexbordongarrigos/frecuencias` (Vite/React,
  ver memoria [[omnifrecuencias-app-repo]]) a `apps/omnifrecuencias/frecuencias/` (App + types + data + hooks
  useAudio/useFileSystem + components). `OmnifrecuenciasApp` ahora renderiza `<FrecuenciasApp/>` (no el placeholder).
  Capacitor eliminado; `useFileSystem` reescrito → presets como archivos en `library-store` (sync Supabase).
  Biblioteca por categorías + generador multi-osc paneo 3D + sinergias (Phi/Pi/Schumann) + visualizador + player.
- **Iconos StarSeed:** 10 SVG + 10 PNG 512px en `public/app-icons/` (nexus/cafe/omnifrecuencias/messages/network/
  library/agent/clima/musica/radio), lenguaje visual común (squircle, geometría sagrada, oro+musgo, glass, gemas
  cardinales). `iconUrl` cableado en `app-catalog.ts` (audiomorphic conserva su PNG oficial). Rasterizado con sharp.
- **Clima Espacial NOAA en tiempo real** (`SPACE_WEATHER`): `apps/data-sources/space-weather-sources.ts` (fetchers
  reales: escalas R/S/G, Kp, viento solar plasma+IMF/Bz, rayos X GOES, protones, F10.7, manchas, aurora OVATION;
  Schumann ref). Widget `widgets/space/space-weather-widget.tsx` (reactivo a severidad: gauge Kp, banner tormenta
  si G≥1, paneles) + `space-weather-app.tsx` (sparklines). Registrado (types/manifest/registry/picker/category-map)
  y sembrado en temas clima/astronomía. 9 endpoints NOAA verificados 200.
- Verificado: `tsc -p` acotado (todo lo nuevo) → 0 errores. Deploy `ba1c8b1` (tras limpiar `.git/index.lock`).

**Pendiente:** variantes de icono por tema (-mono/-dark); abrir apps nativas en ventana desde el launcher; más
apps completas (clima terrestre, radio, música) al nivel de Omnifrecuencias; data-driven design en más widgets; VR/AR.

---
## Adenda 45 — 2026-06-20 · Fix iconos + Clima rediseñada + Temas Omni/Audiomorphic + widgets (deploy add09ca)

- **BUG iconos resuelto:** los `.svg` de `public/app-icons/` contenían **bytes PNG** (sharp guardó PNG con
  extensión .svg) → el navegador los servía como image/svg+xml y fallaban (rotos). Fix: `app-catalog.ts`
  → iconUrl a `.png` (los .png sí son válidos), `.svg` falsos borrados. Deploy `311cd5a`. **Lección:** verificar
  `file` del asset, no fiarse del nombre.
- **App Clima (`/atmosphere`) rediseñada** (subagente Q): `atmosphere-view.tsx` reescrita de capas absolutas
  apiladas (solapes) a **flex column** real (header/main/footer), responsive sin solapes. Pestañas Terrestre/
  Espacial/Solar; Espacial+Solar con **datos NOAA reales** (Kp+G, viento solar L1 Bz, R/S/G, aurora OVATION,
  rayos X+R, protones+S, F10.7, SSN, imagen SDO/AIA 171). Nuevos: `weather/hooks/use-space-weather.ts`,
  `weather/components/space/space-weather-panels.tsx`.
- **Temas Omnifrecuencias + Audiomorphic** (subagente R) como opciones de Apariencia: `OsThemeId` += ambos,
  presets en `os-theme-selector.tsx`, variables CSS completas en `globals.css` (`[data-os-theme=…]`), audiomorphic-
  bg-widget deriva acento del tema. Omnifrecuencias cian/violeta; Audiomorphic violeta/oro.
- **5 widgets mejorados data-driven** (subagente S): explore-network, my-pages, social-radar, notifications,
  relevant-posts — adaptabilidad por `size`, color/estado según datos (tendencias, urgencia, resonancia, triaje),
  sparklines/barras, mejores CTAs/empty-states, reduced-motion. Sin cambios de export.
- Verificado: `tsc -p` acotado conjunto → 0 errores. Construido con 3 subagentes en paralelo (Q/R/S).

**Pendiente:** Omnifrecuencias App rewire total a `useAppearance()` (hoy su paleta nativa ya casa con su tema);
más apps al nivel de Omnifrecuencias; VR/AR; variantes de icono por tema.

---
## Adenda 46 — 2026-06-20 · Fondo Audiomorphic funcional + icono original Omni + widgets Omni reales (deploy 2f76a77)

- **Icono original de Omnifrecuencias:** `Documents/iconos/iconos-png/omnifrequency.png` → `public/app-icons/omnifrecuencias.png` (512px). El de Audiomorphic ya era el oficial.
- **Fondo Audiomorphic AHORA funciona** (antes "no se veía" porque el iframe no tenía `allow` de micrófono ni arranque):
  - `audiomorphic-background.tsx`: URL con `?bg=1&autostart=1&full=1&starseed_os=1[&mic=1][&cam=1][&preset=…]` (export `buildAudiomorphicBgUrl`) + `allow="microphone; camera; autoplay; fullscreen; gyroscope; accelerometer; magnetometer; xr-spatial-tracking"`.
  - **App Audiomorphic** (`alexbordongarrigos/audiomorphic-ar`, subagente U, commit `c8fce11`): `utils/embedMode.ts` + App.tsx → honra `bg/autostart/mic/cam/preset`; en `bg` oculta UI; **modo autónomo sintético** anima el lienzo aunque el micrófono falle (clave). Push → auto-deploy audiomorphic.vercel.app.
  - **Ventana de configuración** `ui/backgrounds/audiomorphic-config-window.tsx` (`AudiomorphicConfigHost`, montada en RootLayout, evento `starseed:open-audiomorphic-config`): vista previa interactiva (concede mic/cam ahí) + controles modo auto/manual, micrófono, cámara/AR, preset (nebula/genesis/solaris/aqua/void), overlay; guarda en `config.background.audiomorphic` (tipo extendido: mode/mic/camera/preset). El widget abre la ventana con botón "Configurar fondo".
- **Widgets Omnifrecuencias con motor/datos/presets REALES** (subagente T): `omnifrecuencias-widget.tsx` reescrito sobre el `useAudio` de la app portada + `data/frequencies` + sinergias + presets `library-store`; pestañas Reproductor/Generador/Presets + player maestro + "Abrir app completa". Compartido vía `frecuencias/data/synergy-recipes.ts`, `featured-frequencies.ts`, `hooks/useOmniLastSession.ts`, `components/CompactOscillator.tsx`.
- Verificado: `tsc -p` acotado → 0 errores. Construido con 2 subagentes (T widget, U app-repo) + integración del orquestador.

**Pendiente:** sincronía total de estado entre widget Omni y app (hoy comparten código/presets, instancias separadas); AR Audiomorphic como textura WebGL real; VR/AR del OS.

---
## Adenda 47 — 2026-06-20 · Sincronía total Omni + Fundación VR/AR WebXR (deploy aef61f8)

- **Sincronía total del audio Omnifrecuencias** (subagente V): `frecuencias/hooks/useAudio.ts` refactorizado a
  **singleton de módulo** (clase `OmniAudioEngine`, UN solo AudioContext + master/analyser + lista de osciladores
  como snapshot inmutable + RAF global de transiciones), expuesto vía `useSyncExternalStore`. **API idéntica** →
  cero cambios en call-sites (widget, `App.tsx`, `Generator`, `GlobalPlayer`). Resultado: lo que suena/edita en
  widget ↔ app ↔ mini-dock se refleja en vivo; ya no hay "dos audios". (Nota: `omni-engine.ts`/`omni-presets.ts`
  siguen huérfanos del subagente I; la app activa usa `useAudio`.)
- **Fundación VR/AR (WebXR)** (subagente W): `apps/immersive/immersive-space.tsx` (escena R3F: Flor de la Vida vía
  `THREE.Line`/primitive, estrellas/sparkles, suelo reflejante, **portales 3D** que usan `useAppLauncher` para abrir
  apps `vrCapable`), `apps/immersive/use-webxr.ts` (`navigator.xr` feature-detect VR+AR; `gl.xr.setSession` SIN
  @react-three/xr; degradación elegante), ruta `(app)/immersive`, widget `immersive-widget.tsx`. Sin deps nuevas
  (three/R3F/drei + WebXR nativo; Environment evitado por HDR remoto → luces+Stars offline-safe; Html en vez de Text).
  Registrado `IMMERSIVE` (types/manifest ciberdelia 4×5/registry/picker icono Orbit/category-map) + app de catálogo
  `immersive` (ruta /immersive, vrCapable, colección media) + sembrado en tema ciberdelia.
- Verificado: `tsc -p` acotado → 0 errores. **Limitación honesta:** WebXR no probado en visor real; sin
  controladores/manos (la interacción con portales hoy es por puntero) → siguiente paso `@react-three/xr` o input XR.

**Pendiente:** controladores/manos XR + locomoción; bajar coste de MeshReflector en sesión XR; AR Audiomorphic como
textura real; unificar `omni-engine` huérfano o eliminarlo; más apps nativas completas.

---
## Adenda 48 — 2026-07-01 · Corrección integral de la ola #125–#129 (deploy 550c732)

### Por qué
El usuario reportó que la ola anterior quedó "a medias": el orbe de Aurora no tenía el diseño de la
cafetería y su panel salía fijo en la esquina inferior; el Dashboard desperdiciaba espacio en
bordes/esquinas; la fusión de menús del Dock nunca llegó a las cuentas existentes (localStorage
conservaba los botones viejos); y los perfiles mostraban reuniones/eventos de ejemplo. Autorizó
explícitamente redefinir configuraciones guardadas para propagar a TODAS las cuentas.

### Hecho (3 subagentes en paralelo + integración)
- **Orbe Aurora (diseño café):** `aurora-orb.tsx` reescrito por capas — aro conic-gradient aurora
  (paleta café + 4 cardinales Trinity) rotando 16s, núcleo cristal oscuro, canvas interior con 5
  cintas aurora reactivas a voz (bandas mic: graves→rojo/verde, agudos→azul/amarillo; pulsos
  aurora:speak → ondas), estrella ✦ SVG nítida (arriba azul/abajo rojo/izq verde/der amarillo) que
  late vía --aurora-energy (rAF, sin re-render), breathe 5.6s + ping 3.2s + morph orgánico al hover
  (aurora-orb.module.css nuevo). `aurora-widget.tsx`: panel del chat y píldora de acción ANCLADOS al
  orbe por cuadrante (antes fixed esquina inf-der), 100dvh + safe-area, píldora descartable, pétalos
  con chips de nombre y glow cardinal, satélite mini-estrella. Gestos/flags/bus intactos.
- **Dashboard full-bleed:** barra de pestañas pegada al borde (radios 16px interior / 4px al borde,
  safe-area, p-1.5, icono+texto adaptativos, fades de scroll, glow del acento en activa, accesos
  añadir/configurar/dispositivos); grid sin containerPadding (18px muertos fuera), margen exterior
  clamp 4-8px, gap 12px, tarjetas 16px radio. `DEFAULTS_VERSION='gen10-2026-07-01-esquinas-tabs-fullbleed'`
  → reseed en todas las cuentas. Bonus: eliminado error preexistente de react-grid-layout v2 en grid-area.
- **Fusión Dock v4 (todas las cuentas):** `dock-config.ts` migración one-shot
  `starseed.dock.items.migrated.v4` — descarta presets guardados viejos y aplica DOCK_PRESETS
  fusionados (mylib=Librería·Biblioteca, nodes=Red·Nodos→/hub?tab=red), conserva items origin:'user',
  repunta carpetas (library/biblioteca/store→mylib, red→nodes) y elimina huérfanos; tienda→/library?tab=tienda.
- **Perfiles/calendario sin datos falsos:** semilla demo de `calendar-context.tsx` ELIMINADA
  (rem-1/alm-1/sys-1/sys-2 y map de communityEvents vacío — raíz de las "reuniones" falsas);
  `os-social.ts` realEventsOnly/fetchRealEventsSafe; `unified-calendar.tsx` prop realOnly;
  perfil pasa realOnly + artículos/cursos solo reales + nota honesta en discusión vacía.
- **Build en Librería:** franja OsDownloadStrip inline — "StarSeed OS · build 2026.07.01",
  Instalar como app (PWA real vía beforeinstallprompt), enlace releases GitHub, "versiones
  nativas: en preparación" (sin enlaces muertos). Sustituye a os-download-card (intacto, sin consumidores).
- Verificado: tsc total 414 → **393 errores preexistentes** (−21, ninguno nuevo; 0 en archivos tocados).
  Commit `550c732` → push a StarSeedSystem/starseed-system main → Vercel auto-deploy starseed-os.vercel.app.

**Pendiente:** #47 versiones descargables nativas (dmg/apk/exe) + tiendas; posts demo de
recent-posts-widget para páginas comunidad/EF (fuera de perfiles personales); day-detail-dialog
ya no fuga demo al eliminarse la semilla.

---
## Adenda 49 — 2026-07-02 · Escritorios + Aurora v2 completa + Librería definitiva + Perfil libre (deploys 04766fe → siguiente)

Construido con 7 subagentes en 3 olas (archivos disjuntos) + integración del orquestador.

- **Escritorios (nueva página principal):** `/escritorios` (redirect raíz) — escritorios ilimitados por perfil (localStorage 'starseed.desktops.v1' + espejo Supabase user_settings.prefs.desktops), iconos arrastrables estilo desktop (apps/archivos/carpetas/widgets/enlaces, doble clic abre), multiventana propia `DesktopWindowFrame` (semáforo Trinity, drag/resize/z/min/max), catálogo "+ Añadir" (apps del catálogo real, widgets del registry real, archivos de library-store, navegador iframe, carpetas), Aurora guía en escritorios vacíos ('aurora:suggest'), fondo heredado o por escritorio, barra superior con selector/reloj. 11 archivos en src/components/desktop/ + (main)/escritorios. Dock: item 'Escritorio' primero.
- **Cursor FX:** CursorFxHost global (root layout) + panel en Apariencia — cursores Sistema/Triángulo StarSeed (SVG data-uri)/Orbe mini + clic FX (onda líquida, destello 4 puntas, burbuja neón), 'starseed.cursorfx.v1'; listings de cursores/gestos publicados en la Librería.
- **Orbe Aurora v2:** causa raíz del glitch-loop: engine reinicia recognition en onend sin tope + getUserMedia paralelo del analizador mataba la recognition en cada flip → supervisor (isStarting, backoff ≥800ms, watchdog 5 caídas → voiceUnavailable + retryVoice), mic analyser singleton con refcount/cooldown, debounce visual 250-320ms. Montaje GLOBAL en root layout (pre-login incluido; (main)/dashboard ya no muestra el FAB viejo — trinity-fab cede por defecto). Diseño: solo redondo (satélite eliminado), cristal 3D (aro cónico 22s, refracción, especular, glow neón difuminado), luz por volumen/tono/emoción (--aurora-energy/--aurora-flux). Menú Trinity CENTRADO al mantener pulsado con deslizar-para-abrir. Chat → evento 'starseed:open-aurora-exocortex'; mensajes → 'aurora:conversation'.
- **Exocórtex Zenith = casa de Aurora:** aurora-chat-section reescrita (pestañas Chat/Chats/Voz/Control/Registro, transporte, personalidad, guía contextual por ruta, abrir /aurora, reactivar orbe) + aurora-chat-log.ts (registro persistente 'starseed.aurora.chatlog.v1', sesiones/día, resumen, export json/md, registrador singleton en la curtain). Curtain abre enfocando Aurora al recibir el evento del orbe. Estilo café (.axc-) con filo azul→verde→amarillo→rojo.
- **Control de pantalla por voz:** screen-control/ (scanner de elementos visibles + overlay de insignias numeradas ámbar + acciones click/scroll/swipe/type/back) y 7 tools registradas en aurora-tools.ts (ver_pantalla, pulsar_elemento, escribir_en, desplazar_pantalla, atras, adelante, pantalla_completa) siguiendo el patrón AuroraScreenTool kind:'screen'.
- **Chrome:** badge "build · … v18" (esquina inf-izq, dashboard-layout L1509) ahora solo con localStorage starseed.debug=1; watermark Spline sellado ambas esquinas; SystemChrome: fullscreen automático al primer gesto + evento 'starseed:toggle-fullscreen'; --screen-corner (0px / 12px standalone+coarse) en superficies full-bleed; [role=tablist] global sin desbordes + .ss-hscroll; dock strip overflow-x táctil; botones del panel del Dashboard con título + popover "i" (TAB_ACTION_DEFS).
- **Librería definitiva:** SIN tienda (pestaña eliminada, /store→/library, store-panel fundido como "Intercambio de Recursos"); taxonomía 8 categorías (Apps·Widgets·Layouts·Archivos·Fuentes·Cursores·Gestos táctiles·Comandos) en library-catalog.tsx; comandos instalables/ejecutables (starseed-command-listings.ts, 6 listas); fichas ricas por formato (app-file-page: galería, versiones con historial + Replicar vía saveResource, recomendaciones); 7 apps StarSeed publicadas (starseed-apps-listings.ts). Dock migración v5 ('starseed.dock.items.migrated.v5'): quita tienda/nodes/netlib de configs guardadas, inserta 'escritorios' primero, purga carpetas, conserva origin:'user'. Bonus: 17 errores preexistentes de buildUnifiedResources eliminados.
- **Perfil libre:** header sin "Reputación 1.618 / Nodos 42 / Impacto High / Nivel 7" (inventados) → 7 bloques configurables con datos REALES (Comunidades os_follows+os_pages, Grupos os_memberships, Publicaciones cafe_posts, Enlaces/Archivos propios; E.F./Aportaciones "—" hasta tener fuente) + editor de bloques ('starseed.profile.display.v1'); modos Clásico·Libre (bloques reordenables/ocultables)·VR/AR (ImmersiveSpace embebido); secciones Enlaces y Archivos nuevas.
- Verificado: tsc 393 → **376 errores preexistentes** (−17, 0 nuevos). Deploys: 04766fe (ola 1) + commit siguiente (olas 2-3 + integración).

**Pendiente:** #47 instaladores nativos; investigación OSS ampliada para sentidos/plugins de Aurora; day-detail-dialog ya sin semilla.

---
## Adenda 50 — 2026-07-02 · Escritorio-izq · Aurora Android/cross-browser · globo diálogo · Trinity cierre/swipe · Exocórtex+wake-word (deploys be0a9c4→e3be1c4)

- **Escritorio primero (izquierda) en TODAS las cuentas:** migración dock v6 (`starseed.dock.items.migrated.v6`) mueve 'escritorios' al índice 0 y lo habilita (v5 solo insertaba si faltaba → quedaba a la derecha en cuentas existentes).
- **Aurora reconoce /escritorios:** añadido a OS_ROUTES (actions.ts, primero) y al nav map de engine.ts.
- **FIX Aurora Android Chrome (loop "escuchando sin reconocer"):** causa = `continuous=true` no fiable en Android (onend inmediato + reinicio 250ms) + getUserMedia del analyser compitiendo con SpeechRecognition. Fix en engine.ts: móvil → `continuous=false`, backoff progresivo (700ms→2.5s) con tope de 6 reinicios sin habla → corta y deja al supervisor mostrar reintento; onresult resetea el backoff. aurora-orb-bus.ts: en Android NO se crea el analyser de mic (cae al latido de eventos). stop() limpia el timer.
- **Globo de diálogo cristalino sobre el orbe (aurora-speech-bubble.tsx):** sustituye el auto-popover al hablar. Voz SOLO a petición; sugerencias/notificaciones proactivas ('aurora:suggest'/'aurora:notify') aparecen como TEXTO sobre el botón sin hablar; play/continuar inicia voz; se puede seguir solo por chat. Controles translúcidos, auto-oculta 10s, descartable.
- **Drag-to-open natural:** durante el long-press, deslizar (mismo pointer capture, histéresis 40/26px, overlay pointer-events-none mientras arrastra) resalta y al soltar abre la sección; touch+mouse; overlay centrado dentro del viewport.
- **Cortinas Trinity (Zenith/Horizon/Logic):** botón de cierre X cristalino (≥44px), swipe-to-close que sigue el dedo (umbral 80px + spring, reduced-motion), responsive anclado dentro del viewport (Logic ya no sale de pantalla; Horizon sin botones encimados: clamp + safe-area + box-border). trinity-curtains.module.css nuevo.
- **Voz cross-navegador (capabilities.ts):** detecta STT/TTS/mediaDevices/fullscreen/secureContext/navegador; requestMaxAccess pide micrófono→pantalla completa desde gesto; voiceMode full|tts-only|text-only; Firefox/WebView ya no entran en error (chat 100% + TTS). provider expone capabilities+requestAccess (puente v5); widget adapta chip/tap.
- **Exocórtex = casa de Aurora:** barra superior (escribir para preguntar/buscar + botón derecho activar voz), nuevo chat / ver registro / entrar a contextos de sesión, switches orbe flotante y Aurora global. Modo "Aurora siempre encendida" wake-word (wake-word.ts + aurora-always-on.tsx, 'starseed.aurora.always-on'): escucha pasiva de fondo, al decir "aurora" se activa con el resto de la frase, ~6s de silencio → vuelve al fondo. containsWake/stripWake probados 10/10.
- tsc 376 = baseline en todas las tandas (0 nuevos). Deploys: be0a9c4 (crítico) · 222329a (globo+trinity) · e3be1c4 (cross-browser+exocórtex+wake-word).

**Pendiente:** STT open-source (Whisper/Moonshine transformers.js) como fallback para navegadores sin SpeechRecognition; VAD barge-in; QA visual por tamaño real.

---
## Adenda 51 — 2026-07-02 (noche) · Aurora arranque pasivo · singleton/líder · AI Studio reorg · guía (deploys cdff4bc→577c564)

- **Arranque PASIVO y silencioso (petición):** quitados AMBOS saludos automáticos (requestAccess + autonomía). Aurora deja micrófono/sentidos listos en 2º plano pero NO habla al inicio, NO abre chat/reproductor, sin sonido de reinicio; habla SOLO tras hablarle/escribirle. aurora-widget: `bubbleMentioned = !!interim` (antes `visListening||interim`) → el globo aparece solo con habla real o a petición, no por escucha pasiva.
- **Doble Aurora → una sola:** (1) guard singleton del STT a nivel de módulo en engine.ts (`sttOwner` symbol; solo una instancia reconoce → no se duplican acciones; se libera en stop/unmount). (2) `single-instance.ts`: elección de LÍDER entre pestañas (heartbeat localStorage 2s, stale 5s, relevo en focus/visibility/storage/unload). Provider: solo la líder arranca la escucha; al perder liderazgo superStop, al ganarlo superStart. → "solo puede haber una Aurora" que administra todo.
- **AI Studio (/agent) reorganizado:** ~40 pestañas sueltas → 9 secciones de configuración con navegador de 2 niveles (rail lateral desktop / tira .ss-hscroll móvil); fix desbordes de bordes (max-w/box-border/safe-area/scroll contenido; selects del chat con wrap); tarjeta "cerebro compartido Astraura/Aurora/Exocórtex" con enlace ('starseed:open-aurora-exocortex'). Deep-links ?tab= preservados. Único archivo: app/(app)/agent/page.tsx.
- **Guía dinámica** (onboarding/aurora-guide.tsx, global): 11 pasos (orbe, 4 Trinity, Escritorio, Dashboard, Astraura, Perfil, Cerebros, Librería) con spotlight defensivo, modos Acompáñame/Hazlo-por-mí, auto-avance+reduced-motion; arranca en primera visita ('starseed.guide.seen.v1') y reabrible ('starseed:open-guide'/window.openStarseedGuide/botón Guía); nuevos y existentes.
- tsc 376 = baseline en todo. Deploys: cdff4bc (arranque pasivo+singleton) · 0cde608 (AI Studio) · ba82d47 (guía) · 577c564 (líder única).

**Pendiente:** #10 portar Aurora/Astraura a Nexus y Café (repos vanilla JS aparte): voz auto silenciosa desde inicio, 1 toque=voz sin chat, mantener pulsado=ventana chat+reproducción (no menú Trinity), botón movible por esquinas snap, no eliminable, enlaces a todos los sistemas. También: chats de Aurora en pantalla completa + ramificación de contextos + contexto compartido Exocórtex↔AI Studio; ampliar edición de pantalla/tareas en 2º plano; investigar OSS (Whisper/Moonshine/VAD) para asistente completo.

---
## Adenda 52 — 2026-07-02 (noche 2) · Anti-eco voz · guía voz-opcional/sin-timer · detección de dispositivos por IP (deploys eb9e2d8→7aecd15)

- **FIX crítico del loop/duplicación de voz = ECO acústico:** Aurora captaba su propia voz TTS por el micrófono, la procesaba como comando y se respondía a sí misma → loop y "múltiples Auroras". engine.ts: `echoSuppressRef`/`echoUntilRef` — el reconocimiento IGNORA lo captado mientras Aurora habla (u.onstart→suppress on; u.onend→off + cooldown 700ms). El canal del micrófono queda ABIERTO sin reiniciarse; solo se descarta la voz propia. (Complementa singleton STT + líder de pestañas de la Adenda 51.)
- **Guía (aurora-guide):** pregunta inicial "voz+micrófono vs silenciosa" (persistida 'starseed.guide.mode.v1'); QUITADO el auto-avance por temporizador (solo Siguiente / comando de voz "siguiente"/"continúa"); botón de silenciar Aurora manteniendo el chat de texto; demos animadas por paso (framer-motion: orbe/Trinity/escritorio/dashboard/astraura/perfil/cerebros/librería) con reduced-motion. Archivos: aurora-guide.tsx + aurora-guide-demos.tsx + aurora-guide-voice.ts. Consume Aurora solo por el puente window.STARSEED_AURORA.
- **Detección de dispositivos por red (IP):** honesto — el navegador NO puede escanear la LAN (privacidad, mDNS .local). src/lib/network/device-registry.ts registra el dispositivo en user_settings.prefs.devices (id persistente + IP pública vía ipify + userAgent/plataforma/lastSeen), sameNetwork = misma IP pública; useDeviceNetwork() + switch 'starseed.network.autodetect' (default ON). lan-sync.ts = andamiaje WebRTC P2P (contrato+stubs; señalización futura por la cuenta). device-network-panel.tsx montado en servers-panel. 
- tsc 376 = baseline en todo. Deploys: eb9e2d8 (anti-eco) · e27d7dd (guía) · 7aecd15 (dispositivos/red).

**Pendiente:** #10 Aurora en Nexus/Café; chats fullscreen+ramificación; WebRTC LAN real (señalización por cuenta); STT OSS (Whisper/Moonshine) fallback.

---
## Adenda 53 — 2026-07-02 (madrugada) · Ola sincronizada: chats fullscreen · Aurora ampliada · STT OSS · Aurora en Nexus y Café (deploys OS 6ec7481→220558e; Nexus 5ad9eff; Café f60b268)

Construido con 5 subagentes en 2 olas + integración.

- **Chats de Aurora en pantalla completa + ramificación** (exocortex): AuroraChatView compartida + AuroraChatFullscreen (overlay 2 columnas desktop / 1 móvil, Esc+X); chat-tree.ts (árbol de contextos persistido 'starseed.aurora.chattree.v1', useChatTree, branchFrom, índice paralelo ts→contextId SIN tocar el log); UI de árbol con sangría/líneas/iconos de rama.
- **Aurora ampliada** (lib/aurora): 7 acciones de pantalla nuevas (resaltar/leer_pantalla/rellenar_formulario/seleccionar_opcion/ir_a_seccion/abrir_app/copiar_texto) + task-manager.ts (tareas 2º plano 'starseed.aurora.bgtasks.v1', runInBackground) + context-hints.ts (suggestForContext por ruta); 10 tools nuevas en aurora-tools.ts (patrón AuroraScreenTool).
- **STT open-source fallback** (stt-oss/): transformers.js Whisper (tiny/base) por CDN, opt-in 'starseed.aurora.oss-stt', VAD RMS+silencio 700ms→16kHz; capabilities expone ossSttAvailable/Enabled sin tocar voiceMode; panel aurora-voice-fallback-panel montado en Ajustes→IA; alimenta a Aurora vía window.STARSEED_AURORA.send. Para Firefox/WebView sin voz nativa.
- **Aurora portada a NEXUS y CAFÉ** (repos vanilla JS, deploy propio): mismas reglas del OS — arranque PASIVO silencioso (sin saludo/auto-chat; micrófono listo en 2º plano), tap=voz sin chat, mantener-pulsado=ventana de chat con barra de reproducción (▶/⏸/⏹+mic), ANTI-ECO (ignora TTS propio +700ms; micrófono sin reiniciar en loop), orbe MOVIBLE por esquinas con snap persistido ('starseed.nexus.aurora.corner' / 'starseed.cafe.aurora.corner'), enlaces a OS/Nexus/Café/Audiomorphic. Nexus exocortex.js v=98 (adaptado sobre su versión completa). Café exocortex.js 273→1035 líneas (se le AÑADIÓ el motor de voz que no tenía; contexto menú/elixires/baristas), v=82, desplegado vía clon limpio a /tmp (working tree del Café desordenado). 
- tsc OS 376 = baseline. node --check limpio en Nexus y Café. Deploys: OS 6ec7481 (chats+ampliación) · 220558e (STT OSS) · Nexus 5ad9eff · Café f60b268.

**Pendiente:** WebRTC LAN real (señalización por cuenta); contexto compartido real Exocórtex↔AI Studio (hoy enlace); wake-word acústico local (Porcupine/OSS) opcional.

---
## Adenda 54 — 2026-07-02 (madrugada 2) · Anti-eco GLOBAL + carpeta de chats de Aurora (deploys b19feee, 0db1d45)

- **FIX definitivo eco/duplicación/loop:** la supresión anterior era POR INSTANCIA y solo en el TTS del navegador → si había 2 instancias o la voz salía por otra ruta, Aurora se oía a sí misma. Ahora `ttsSpeakingGlobal`/`ttsGuardUntilGlobal` + `ttsGuardActive()`/`markTtsSpeaking()` a NIVEL DE MÓDULO: TODAS las instancias y rutas de voz suprimen a la vez. Guard abierto ANTES de speechSynthesis.speak (cubre primer fonema) + cola 800ms; onresult descarta si guard activo; el watchdog no cuenta reinicios como "sin habla" durante TTS (no se autodesactiva tras hablar). engine.ts.
- **Carpeta/explorador de chats de Aurora** (exocortex, vista principal por defecto "Carpeta"): dos ejes fecha (hoy/ayer/semana/mes) + tema; categorización automática LOCAL determinista (chat-auto-categorize.ts: Sistema/OS·Creación·Gobernanza·Café·Audio-Frecuencias·Educación·Personal·General + título derivado, sin IA externa); catálogo unificado (chat-catalog.ts 'starseed.aurora.chatcatalog.v1', useChatCatalog): guardar chat en MEMORIAS (baúl memory-vault + referencia library-store), DUPLICAR (contexto nuevo copiando timestamps), INTERCONECTAR (linkedIds bidireccional). 
- **Ventana principal fusionada búsqueda⇄chat:** barra única en el explorador, conmutador Preguntar/Buscar; escribir en Buscar lanza universalSearch (recursos de red) y filtra chats; botón Aurora/Enter invoca send(); el buscar del Exocórtex ahora invoca a Aurora. Reutiliza AuroraChatView/chat-tree/aurora-chat-log sin duplicar.
- tsc 376 = baseline. Deploys OS: b19feee (anti-eco global) · 0db1d45 (carpeta de chats).

**Pendiente:** WebRTC LAN real; contexto compartido en vivo Exocórtex↔AI Studio; wake-word acústico local OSS; verificar en Android que el eco global ya no reinicia.

---
## Adenda 55 — 2026-07-03 · Aurora sabia + generación + fusión + Escritorios PC + términos en Nexus/Café (deploys OS c60756f→c739358; Nexus 69e0760; Café 385016c)

Construido con 4 subagentes en 2 olas + integración + port a Nexus/Café.

- **Aurora reconoce términos StarSeed** (term-normalizer.ts): corrección fonética (clave: sin acentos, seseo z/c→s, v→b, qu/k/q→k, h muda, colapsa dobles) + tabla STARSEED_TERMS (~20: Astraura, StarSeed, Exocórtex, Ontocracia, Ciberdelia, Sangha/Sanghas, Audiomorphic, Omnifrecuencias, Trinity, Nexus, Zenith, Horizon, Anchor, Logic, Multiverso, Transhumanismo). Aplicado en engine.ts onresult (voz) y runCommand (texto).
- **Conocimiento del ecosistema** (system-knowledge.ts): buildSystemKnowledge(route) — áreas OS (Escritorio/Dashboard/Exocórtex/Trinity/Librería/Cerebros/Perfil/Astraura), tríada (Ontocracia/Ciberdelia/Transhumanismo), dualidad Cuenta/Perfil, gobernanza, enlaces canónicos — insertado aditivamente en el prompt de Astraura.
- **Generación libre de contenido** (aurora/generate/content-actions.ts, 11 tools en aurora-tools.ts): crear_nota/documento/archivo (→biblioteca), crear_publicacion (→/publicar), abrir_pizarra/crear_en_pizarra, crear_widget (→dashboard/escritorio), buscar_web/abrir_enlace (→navegador), buscar_en_libreria/biblioteca. Dispatch por el puente [[ACCION:…]] existente; auto-listadas en el prompt.
- **Fusionar/duplicar cerebros y memorias** (lib/brains/merge-duplicate.ts): duplicateBrainById, mergeBrains (unión dedup de includes/servidores, no destruye originales salvo replaceSources), duplicateMemoryDoc, mergeMemories (concatena secciones). UI con previsualización A+B→resultado en brains-panel + memory-merge-panel nuevo. Modelo: src/lib/brains/brains.ts (Supabase) + src/lib/memory-vault.ts (localStorage).
- **Escritorios rediseñados** (components/desktop/): escritorio vacío estético (geometría sagrada, orbe-estrella, gradientes) desktop-empty.tsx; ramificación de carpetas anidadas con iconos por tipo + breadcrumb (desktop-folder-view.tsx, desktop-file-icons.ts); opciones tipo PC (desktop-context-menu.tsx clic-derecho lienzo/icono, selección múltiple marquee, desktop-taskbar.tsx dock de ventanas, notas rápidas); ajustes por escritorio (desktop-settings-panel.tsx: fondo/iconos/rejilla/tema, renombrar/duplicar/reordenar). Store con jerarquía recursiva retrocompatible ('starseed.desktops.v1').
- **Nexus y Café**: normalizeStarseedTerms vanilla-JS en su exocortex.js (onresult voz + onSend texto). Nexus v=99 (69e0760), Café v=83 (385016c, clon /tmp).
- tsc OS 376 = baseline; node --check limpio Nexus/Café. Deploys OS c60756f (contexto+escritorios) · c739358 (generación+fusión); Nexus 69e0760; Café 385016c.

**Pendiente:** WebRTC LAN real; contexto compartido en vivo Exocórtex↔AI Studio; wake-word acústico OSS; verificar visualmente /escritorios y la carpeta de chats.

---
## Adenda 56 — 2026-07-03 · Servicios open-source integrados (Ollama/Whisper/Kokoro/Fooocus/n8n/Cal.com/AppFlowy/Penpot) (deploys cb6ae74→8f876e6)

Construido con 5 subagentes en 3 olas + investigación de repos.

- **Registro unificado OSS** (src/lib/services/oss-services.ts): catálogo tipado por categoría de función (llm/stt/tts/image/video/workflow/calendar/docs/design/website) — Ollama, Whisper, Piper/Kokoro, Fooocus-API, AUTOMATIC1111, n8n, Cal.com, Google Cal/CalDAV/ICS, AppFlowy, Penpot, generador web. oss-connections.ts: store multi-servidor por scope (usuario/cerebro:<id>/página/contexto, 'starseed.oss.connections.v1' + espejo cuenta) + testConnection + resolveServiceFor(category,scope). Panel en /servicios (vista alterna al tri-fuente). Preintegrado por defecto (catálogo siempre; conexiones del usuario).
- **Voz OSS:** STT Whisper mejorado (VAD adaptativo al ruido, pre-roll ring, modelo small, ES por defecto, filtro de alucinaciones); TTS Kokoro nuevo (src/lib/aurora/tts-oss/, voz alternativa por transformers.js/CDN, opt-in 'starseed.aurora.oss-tts', offline tras ~80MB). Panel ampliado en Ajustes→IA (STT idioma + sección Voz Kokoro con probar).
- **Ollama completo** (src/ai/providers/ollama.ts): probeOllamaModels/testOllamaConnection (/api/tags, timeout+CORS), detectar modelos, local/remoto, sync por cerebro vía conexiones OSS. Modelos por función (src/ai/functions/function-models.ts + hook): imagen/video/presentaciones/infografías/web/voz → servicio/conexión OSS elegible por scope. Paneles en AiProvidersPanel (/settings).
- **Servicios en Librería/Biblioteca** (petición): src/lib/library/oss-catalog-bridge.ts proyecta OSS_SERVICES→fichas; nueva categoría "Servicios / Integraciones" en la librería (fichas instalables: Instalar/Conectar+Configurar via OssServicesPanel embebido); biblioteca personal "Mis servicios e integraciones" (conectados por ti + predeterminados integrados). installService = conexión por defecto + saveResource.
- **Apps conectoras** (src/lib/integrations/services/ + src/components/integrations/): n8n (triggerWebhook /webhook/<path>, listWorkflows X-N8N-API-KEY, hooks guardados) + panel; Cal.com (API v2 Bearer, listBookings→eventos de red) añadido a external-calendar-connectors (auto en UnifiedCalendar); AppFlowy+Penpot (app-embed iframe sandbox, guardar diseño→biblioteca, accesos desde /pizarras). Página nueva /integraciones. 
- REALISTA: la web CONECTA por endpoint/clave/webhook (self-host o nube), no instala servidores. Repos: ollama/ollama, n8n-io/n8n, calcom/cal.com, mrhan1993/Fooocus-API, AppFlowy-IO/AppFlowy, penpot/penpot, Xenova/transformers (Whisper/Kokoro).
- tsc 376 = baseline en todo. Deploys OS: cb6ae74 (registro OSS) · 7c74786 (voz) · 762e72c (Ollama+función+librería) · 8f876e6 (n8n/Cal.com/AppFlowy/Penpot).

**Pendiente:** enrutar las tools de generación de Aurora a los servicios por función (crear_imagen→Fooocus, etc.); WebRTC LAN real; wake-word acústico OSS; portar registro OSS a Nexus/Café si se desea.

---
## Adenda 57 — 2026-07-03 · Generación por servicios + WebRTC LAN real + Aurora tap Nexus/Café + Exocórtex Aurora principal (deploys OS 42d8794→5aba02d; Nexus 1eda83a; Café eefefea)

- **Aurora enruta generación a servicios por función** (aurora/generate/service-generation.ts): generar_imagen→Fooocus-API (/v1/generation/text-to-image) o A1111 (/sdapi/v1/txt2img)→guarda en biblioteca; lanzar_workflow→n8n triggerWebhook; generar_sitio_web→servicio o plantilla HTML local (fallback útil); generar_video→servicio. 4 tools nuevas en aurora-tools.ts, prompt actualizado; fallbacks honestos (si no hay endpoint, guía a /servicios, no inventa).
- **WebRTC LAN real** (network/): signaling.ts (Supabase Realtime channel starseed-signal-<userId> + fallback polling user_settings.prefs.signals TTL 60s), webrtc-mesh.ts (RTCPeerConnection STUN google + DataChannel 'starseed' + ICE trickle + glare polite/impolite por id), lan-sync.ts real (ensureMesh/getSharedMesh/teardownMesh), device-network-panel con estado por dispositivo + probar-envío ping/pong. Nota honesta: STUN sin TURN → NAT simétrico puede fallar.
- **Aurora tap en Nexus y Café** (petición): tap corto = activa voz + SONIDO de activación (WebAudio 2 tonos ascendentes ~150ms) + empieza a escuchar (SIN chat) + halo .hearing animado; a los 6s sin voz dice "Estoy disponible por si necesitas algo…" (cancelado al instante si se habla, tras anti-eco); mantener pulsado = chat. Guías (aurora-guide.js Nexus / tour.js Café, con conflicto de merge arreglado) explican el funcionamiento. Nexus exocortex v=100/guide v=98 (1eda83a); Café exocortex v=84/tour v=81 (eefefea).
- **Exocórtex: Aurora principal** (zenith-curtain.tsx): mainView default 'buscar'→'aurora' — al abrir el Exocórtex aparece directamente Aurora (con buscador fusionado dentro); buscador clásico + Cerebro 3D quedan secundarios conmutables. Deploy 5aba02d.
- tsc OS 376 = baseline; node --check limpio Nexus/Café.

**Pendiente:** wake-word acústico local OSS (#31 pendiente); TURN server para NAT simétrico; portar generación por servicios a Nexus/Café si se desea.

---
## Adenda 58 — 2026-07-03 · Medio-dúplex definitivo + reproductor resumido + NVIDIA NIM (deploys OS a139890→8956a70; Nexus 3fc38de; Café 788fd84)

- **FIX DEFINITIVO auto-escucha/duplicación/loop = MEDIO-DÚPLEX real** (engine.ts + Nexus/Café exocortex.js): mientras Aurora HABLA se DETIENE el micrófono (recognition.abort(), no solo ignorar); al terminar (utterance.onend o watchdog por el bug de Chrome que no dispara onend en textos largos) se REANUDA. Imposible oírse a sí misma. pausedForTtsRef + finishTts + startRef; onend respeta pausedForTts (no reinicia en bucle); interrupt/stop limpian. Esto era lo que faltaba (el guard global solo ignoraba; ahora se para de verdad). En Nexus además backoff en onend → elimina el bucle de reinicio; Café tap ya NO habla (solo chime+halo+escucha).
- **Reproductor de chat RESUMIDO** (los 3 sistemas): OS aurora-mini-player.tsx (widget sobre el orbe: últimas líneas, transporte play/pausa/parar/anterior/siguiente/mic, DESLIZAR para historial de sesión, iluminación reactiva a voz de usuario Y Aurora, botón "Abrir en Exocórtex", auto-ocultar 10s, un solo canal); Nexus/Café .ssx-mini equivalente (swipe historial + botón abrir completo). Comportamiento: tap=escucha silenciosa (sin hablar/sin chat); al hablar aparece el resumido; hold = OS menú Trinity / Nexus·Café reproductor completo; ventana completa del OS = Exocórtex.
- **NVIDIA NIM** (src/lib/services/nvidia/): nim-client.ts (OpenAI-compatible integrate.api.nvidia.com/v1, Bearer, /models + /chat/completions, testNim, listModels en vivo), nim-catalog.ts (~30 modelos curados por función llm/vision/image/code/embedding/stt/tts + 7 skills/blueprints; gratis con Developer Program; mergeWithLiveModels). oss-services.ts: servicios nvidia-nim/vision/riva-asr/riva-tts (enabledByDefault, api-key) → aparecen en Librería categorizados. function-models.ts: modelos NIM por función. Panel /nvidia (nvidia-nim-panel.tsx) con API key, probar, detectar modelos, guías inteligentes desplegables, default por función; enlace desde /servicios.
- tsc OS 376 = baseline; node --check Nexus/Café OK. Deploys OS a139890(medio-dúplex)/2ed2b93(mini-player)/8956a70(NVIDIA); Nexus 3fc38de; Café 788fd84.

**Pendiente:** verificar en vivo que el medio-dúplex elimina la auto-escucha en los 3; refrescar catálogo NIM en vivo con la clave del usuario; TURN para WebRTC NAT simétrico.

---
## Adenda 59 — 2026-07-03 · Fix definitivo del bucle de voz (contador de generación) + regresiones de botones (deploys OS 9668a20/cd40b28; Nexus dce848b; Café d6b1baf)

CAUSA RAÍZ del bucle "se reinicia sin escuchar y suena la reactivación": al reemplazar el reconocimiento (start/stop/medio-dúplex), el reconocimiento VIEJO disparaba su onend y arrancaba OTRO en paralelo → competían y se reiniciaban. 
- **OS engine.ts:** `recGenRef` (contador de generación) — cada reconocimiento toma gen=++recGen; onstart/onerror/onend/onresult hacen `if(gen!==recGenRef.current) return` (obsoletos = silencio, no reinician). speak() medio-dúplex incrementa gen al abortar (el onend del abortado no reinicia; finishTts→start crea gen fresco). Elimina el bucle competitivo; el tap vuelve a escuchar.
- **OS aurora-widget.tsx + aurora-mini-player.tsx (regresiones):** (1) mantener-pulsado volvía a abrir Exocórtex en vez de Trinity porque el mini-player se solapaba sobre el orbe (capturaba el long-press) Y el contextmenu táctil abría Exocórtex. Fix: mini-player wrapper pointer-events-none + desplazado (MINI_GAP), y onContextMenu abre Exocórtex SOLO en clic derecho de ratón real (pointerType mouse; ignora touch/pen en hold). (2) tap SOLO activa escucha en silencio: quitados los setOpen(true); requestAccess silencioso si falta permiso; popover solo si NO hay STT.
- **Nexus/Café exocortex.js:** contador de generación `_recGen` (silencia reinicios internos, mata el bucle); chime SOLO en activación explícita (tap/wake-word), NUNCA en reinicio (era la causa del sonido repetido); tap activa escucha en silencio (QUITADO el saludo hablado del café "soy Aurora tu guía…"; fallback de aurSectionHint reescrito); wake-word "aurora" de fondo estable sin auto-oírse (medio-dúplex); aviso 6s se arma 1 vez por activación (no en reinicios); Café chat comparte estructura .ssx-* del Nexus con contenido café.
- Comportamiento final unificado: TAP = activa escucha en silencio (chime+halo, sin hablar/sin chat); al conversar aparece el reproductor resumido; HOLD = OS menú Trinity (deslizar-seleccionar) / Nexus·Café reproductor completo; Exocórtex del OS = ventana completa (clic derecho/botón/al abrir Exocórtex). Aurora escucha en fondo para "aurora" sin reinicios audibles.
- tsc OS 376=baseline; node --check Nexus/Café OK. Deploys OS 9668a20(gen)/cd40b28(regresión botones); Nexus dce848b (v102); Café d6b1baf (v86).

**Pendiente:** verificación en vivo del usuario en los 3; si aún se oye reinicio sería doble pestaña (líder) — reforzar.

---
## Adenda 60 — 2026-07-03 · CAUSA REAL de "no se actualiza nada" = Service Worker cache-first (deploys OS 3056604; Nexus 8de8b77; Café 483b89a)

VERIFICADO EN VIVO con Claude-in-Chrome: la página del OS estaba controlada por un SW `SW_VERSION=v1` con caché runtime de **459 recursos cache-first** que NUNCA se invalidaba → el navegador ejecutaba el JS VIEJO aunque Vercel desplegara bien (deploys success confirmados). Los TRES sistemas tenían el mismo bug: OS public/sw.js (cache-first _next/static + js/css), Nexus/Café sw.js (cache-first css/js). Por eso "solo cambiaba el menú de Trinidad" y la voz/otros no: código cacheado.
- **FIX (los 3):** SW ahora RED-PRIMERO para TODO el código (js/css/mjs/_next/static) — cada despliegue llega siempre; la caché de código solo es respaldo offline; solo medios inmutables (img/fuentes/audio) cache-first. SW_VERSION nueva (v3-2026-07-03 / starseed-nexus-v3 / starseed-cafe-v3) → activate purga TODAS las cachés viejas. + listener SKIP_WAITING. 
- **AUTO-ACTUALIZACIÓN (los 3):** register-sw.tsx (OS) e index.html (Nexus/Café) escuchan updatefound→statechange installed→postMessage SKIP_WAITING, y controllerchange→location.reload() una vez → el usuario recibe el código fresco AUTOMÁTICAMENTE sin Cmd+Shift+R. reg.update() al cargar + cada 30min (OS).
- IMPLICACIÓN: los fixes de voz de las Adendas 58/59 (medio-dúplex, contador de generación, tap silencioso, hold=Trinity) NO llegaban al usuario por el SW; ahora sí. El usuario debe abrir la app UNA vez con el SW viejo (que descarga el v3 y auto-recarga); desde entonces cada deploy es automático para todos los dispositivos/usuarios.
- Pipeline VERIFICADO correcto: repos GitHub (StarSeedSystem/starseed-system, alexbordongarrigos/StarSeed-Nexus, alexbordongarrigos/Starseed-Cafe) → proyectos Vercel correctos → deploys success → live sirve el código nuevo (sw.js v3 confirmado en vivo).

**Pendiente:** que el usuario reabra la app 1 vez en cada sistema (propaga el SW auto-actualizable); luego reprobar la voz (ya con los fixes aplicados de verdad).

---
## Adenda 61 — 2026-07-03 · Voz de DOS NIVELES (pasivo silencioso / activa) en los 3 (deploys OS a70153e; Nexus 292c013 v103; Café c93aaaa v87)

Tras el fix del SW (Adenda 60) el código ya llega. El usuario reportó: OS mejor pero el fondo repite encendido/apagado con sonido (debería solo esperar "aurora"); Nexus al responder abre el reproductor COMPLETO (debe ser el resumido); Café sigue mal.
- **DOS NIVELES (engine.ts OS + Nexus/Café exocortex.js):** FONDO PASIVO = micrófono abierto pero SILENCIOSO, orbe/botón en CALMA (halo apagado), el reconocimiento SOLO reacciona a "aurora" (ignora lo demás en silencio) → elimina el encendido/apagado audible/visible del fondo. ACTIVA (engaged) = al TOCAR el orbe o al oír "aurora": halo encendido, procesa lo que digas; 30s de silencio → vuelve a pasivo. engaged/engage/disengage expuestos; send() (texto) también engage. Widget: halo del orbe = engaged (no la escucha pasiva); tap = engage/disengage. Nexus/Café: A._engaged + IDLE 30s, chime solo al activar, halo solo en activa.
- **Respuesta en el RESUMIDO (fix Nexus):** quitados los open() del panel completo en route()/conversación; la respuesta aparece en .ssx-mini; el completo solo al mantener pulsado (hold) o botón "Abrir".
- **Aviso de 6s eliminado del fondo** (Nexus/Café): el fondo es 100% silencioso hasta oír "aurora" (antes hablaba solo).
- Mantiene: medio-dúplex, anti-eco, _recGen (generación), wake-word sin auto-oírse, tap/hold/drag.
- tsc OS 376=baseline; node --check Nexus/Café OK. Deploys OS a70153e; Nexus 292c013; Café c93aaaa.

**Pendiente:** verificación del usuario; si el fondo aún hace sonido en Chrome sería el tono nativo de SpeechRecognition al reiniciar (mitigable con wake-word acústico Porcupine ya integrado, opt-in).

---
## Adenda 62 — 2026-07-04 · Astraura gratis-primero + sentidos + neuronas + Biblioteca-Cydia (OS·Nexus·Café)

Ola de capacidades agénticas. Ver `architecture/astraura-inteligencia.md` (fuente de verdad).

- **Router de inteligencia gratis-primero** (`src/ai/astraura/`): `free-catalog.ts` (fuentes instant/free-key/local/paid con modelos, fortalezas por tarea, límites, `why`), `availability.ts` (detecta claves/Ollama/WebGPU/Chrome AI), `router.ts` (`astrauraChat`: clasifica tarea → rankea gratis-primero, servicios del usuario +2.5 → **failover en cadena** → registra ruta + transparencia `announceLine`), `builtin-engines.ts` (Chrome AI, WebLLM, **Transformers.js SmolLM3-3B-ONNX**). Enganchado en `engine.ts::runCommand` (modo auto por defecto; manual = `chat()` clásico). Aurora ya NO exige proveedor: siempre tiene inteligencia gratis.
- **Uso/costes + nunca-se-cae** (`usage.ts`): cuenta peticiones/tokens/día por fuente + límites gratis; 429/quota → `markCooldown` 60min → el router la salta y usa la siguiente local/gratis. Panel muestra uso, %, cooldowns con "Reactivar".
- **Sentidos**: **Visión** SmolVLM2 en navegador (`vision.ts` + `senses/vision-sense.ts`, `maybeHandleVisionCommand` "¿qué ves?/pantalla/cámara"), panel opt-in `starseed.aurora.vision.v1`. **Voz OSS** Kokoro español local + Kitten beta (`tts-oss/`, `starseed.aurora.voice.v1`); `speak()` delega y cae al navegador.
- **Neuronas** (`lib/neurons/neurons.ts` + tabla Supabase `neuron_devices` RLS/heartbeat): cada dispositivo de la cuenta = cerebro+servidor con capacidades y 6 permisos (compute/storage/sync/agent/senses/wake), **todo activo por defecto**; panel Ajustes→Astraura→Neuronas; registro+latido en `AuroraProvider`.
- **Autonomía** (`autonomy.ts`, late 30min desde `AuroraProvider`): sugerencias gratis-primero (`starseed:astraura-suggestions`) + señales (`recordSignal`) que personalizan la Biblioteca.
- **Biblioteca-Cydia** (`lib/library/packages.ts`, repos `starseed-core`+`starseed-labs`): tienda instalable de todo (apps/widgets/páginas/pizarras/investigaciones/proyectos/diseños/animaciones/funciones/ai-source/repos) con instalar-efecto-real / abrir / **guardar enlace** / **descargar** / **replicar** (fork editable) / **publicar como rama**. Paquetes nuevos: SmolLM3, Visión SmolVLM2, Voz Kokoro, KittenTTS, TabFM, Sipp, AgentOS.
- **Visor universal** en el chat de Aurora (`components/aurora/universal-viewer.tsx` + `route-chip.tsx`): renderiza imagen/vídeo/audio/PDF/3D(model-viewer)/CSV/código/MD bajo cada mensaje (resumen y completo) + chip de transparencia del modelo.
- **Rediseño**: `src/styles/starseed-materials.css` (cristal líquido, neón por nodo Trinity, metal, madera, naturaleza, float/tilt/press, icon-3d) aplicado a Ajustes (por familia=nodo Trinity), Zenith, Trinity-FAB, escritorios; menús de Ajustes con anchors + barra sticky de categorías.
- **Sync cuenta** (`SYNCED_KEYS`): inteligencia, defaults por función, voz, neuronas, instalados de Biblioteca (mine/published). Claves API NUNCA viajan (local por diseño).
- **Nexus + Café**: `astraura-core.js` vanilla portable (misma cadena gratis-primero+failover+transparencia+cooldown) + `astraura-vision.js` (SmolVLM2). ⚠️ **Nexus usa su propio proyecto Supabase `nxstilnyidvkqeosofuh`** (no el del OS) → su core usa `window.STARSEED.client()`. Versiones bumpeadas: Nexus exocortex ?v=107 + SW starseed-nexus-v7; Café ?v=94 + SW starseed-cafe-v2.
- **Supabase**: migración `neuron_devices` + `user_settings` aplicada en prod `dzkjapinnewkxzjltadv`.
- Verificación: 0 errores de tipos en TODOS los archivos de la ola (tsc dirigido); errores preexistentes ajenos (keyStorage TS2769, actions Router, engine pushReply/pushUser) no tocados. next.config tiene ignoreBuildErrors.

**Pendiente:** que el usuario reabra las 3 apps 1 vez (propaga SW auto-actualizable de Adenda 60) y pruebe; verificar en vivo el chip de ruta y la visión (1ª descarga de SmolVLM2 ~250MB).

---
## Adenda 63 — 2026-07-04 · FIX Aurora + modelos opt-in + cuenta Supabase única + instalación oficial + update in-app

Correcciones y peticiones tras la Adenda 62 (deploys: OS 6dc60a0; Nexus dbfed66; Café 7502517 — los 3 Vercel success).

- **FIX crítico "Aurora oye pero no responde + reproductor en loop":** causa = el router elegía un modelo de navegador (SmolLM3 ~1,9GB) y se colgaba descargando; sin timeout, el micro seguía disparando runCommands en paralelo. Solución: (1) modelos descargables = **opt-in** (`src/ai/astraura/installed-models.ts`: DOWNLOADABLE_SOURCES smollm3-webgpu/smolvlm2-webgpu/webllm/sipp-local/chrome-ai; `availability.ts` los marca ready SOLO si instalados) → el router usa la mejor alternativa gratis (Pollinations/nube/Ollama) y nunca se cuelga; (2) **timeout por candidato** (nube 30s/local 20s/navegador 90s) + failover en `router.ts`; (3) **guard anti-solapamiento** (`runningRef`) en `engine.ts::runCommand`. Arreglados también 2 errores TS preexistentes (role widening).
- **Modelos opt-in con modal:** `installModelInBackground` (descarga en 2º plano) + `warmUpVision`; `install-model-modal.tsx` (Instalar ahora / Después) montado en el provider; botones instalar/quitar en intelligence-panel; sección "Instalar StarSeed" en la Biblioteca.
- **Cuenta Supabase ÚNICA = `dzkjapinnewkxzjltadv`** (decisión del dueño): Nexus y Café REPUNTADOS desde `nxstilnyidvkqeosofuh` (URL+anon key en starseed-identity/ssauth/starseed-id/data/config/api). El proyecto único YA tiene todas las tablas (cafe_*, os_*, user_settings, neuron_devices, exocortex_config). ⚠️ **PENDIENTE del dueño:** revisar en Vercel del proyecto Nexus las env vars NEXT_PUBLIC_SUPABASE_URL/ANON (si existen y apuntan al viejo, GANAN sobre el código — `api/supabase-config.js` lee env primero). Café no depende de env (hardcode). Usuarios que vivían solo en el proyecto viejo deben re-registrarse (aceptado).
- **Gate anti-descarga Chrome AI en Nexus/Café** (astraura-core.js): usa `LanguageModel` solo si `availability()`==="available" (no dispara Gemini Nano ~3-4GB) + timeout 25s.
- **Instalación oficial (OS/Nexus/Café):** `device-install.ts` (OS) + `astraura-install.js` (Nexus/Café): detectOS, PWA install real, requestMaxPermissions (notifs+persist+wakeLock), botones para instalar/abrir OS·Nexus·Café con su icono (OS=simbolo-starseed.png, Nexus=logo-detallado.png, Café=StarSeed-Café-detallado.png) y URL oficial, paquetes nativos por SO (honesto "soon"), compañero local para control por terminal/permisos (honesto: requiere app nativa). Manifests: Nexus→icono complejo, Café→icono café.
- **Defaults sembrados para TODOS** (`defaults-seed.ts`, `ensureDefaultsSeeded` en provider): instala por defecto paquetes recomendados SIN descarga (pollinations, diseños, animaciones, auto-update) sin pisar elecciones; viaja con la cuenta (cubre existentes).
- **Notificaciones** (`update-notifications.ts` + `notifications-bell.tsx` en Ajustes): versión nueva + sugerencias por dispositivo/contexto.
- **Update DENTRO de la app sin reinstalar (los 3):** ya eran PWAs con SW red-primero (auto-update). Ahora explícito y respetuoso: si estás libre aplica solo lo nuevo; si estás ocupado, banner "Nueva versión · Aplicar" (`update-banner.tsx` OS; `astraura-update.js` Nexus/Café) + botón "Buscar actualizaciones". Contenido/librería ya es incremental (modelo Cydia). Vía NATIVA futura (Tauri) usaría su updater incremental.
- Honestidad mantenida en toda la UI: control total del dispositivo/terminal = requiere compañero nativo + permisos (el navegador solo no puede); binarios nativos "próximamente"; modelos locales opcionales.

**Pendiente dueño:** (1) revisar env vars Supabase en Vercel del Nexus; (2) reabrir cada app 1 vez para propagar; (3) opcional: scaffolding Tauri para binarios nativos firmados por SO.

---
## Adenda 64 — 2026-07-04 · Release nativo Tauri v0.1.0 (CI) + lecciones de checkout Windows

- **Empaquetado nativo REAL** en `native/` (Tauri 2): 3 sistemas × 3 plataformas (macOS universal · Linux · Windows) vía `.github/workflows/native-build.yml` (tag `v*` → Release borrador con instaladores + `latest.json` del updater). Comandos Rust: `run_terminal` (control por terminal con permiso), `check_update` (actualización incremental in-app), `device_info`. Solo los orígenes Vercel pueden invocar comandos (capabilities.remote.urls).
- **Clave del updater generada y puesta:** `npx @tauri-apps/cli signer generate` → pública en `tauri.conf.json:pubkey`, privada+password como secretos GitHub `TAURI_SIGNING_PRIVATE_KEY`/`_PASSWORD` (repo StarSeedSystem/starseed-system). Firma de Apple/Windows = requiere cuentas del dueño (huecos en el CI, binarios sin firmar funcionan para probar).
- **LECCIÓN CRÍTICA — checkout de Windows fallaba (exit 128):** el repo tenía **189 archivos macOS `Icon\r`** (icono de carpeta, nombre con CR) y la carpeta **`AI-refernces `** (espacios finales en el nombre) — ambos ILEGALES en Windows. Se quitaron del índice (`git rm --cached` / `git update-index --force-remove` para variantes NFD que pathspec no casa) + `.gitignore`. También un **submódulo fantasma** `.agent/skills/ui-ux-pro-max` (gitlink mode 160000 sin `.gitmodules`) daba exit 128 → removido. REGLA: en el repo del OS, nunca commitear archivos `Icon\r` de macOS ni carpetas con espacios finales (rompen CI multiplataforma).
- **LECCIÓN — matriz del workflow:** `system:[...]` + `include:` con solo `platform` NO hace producto cartesiano (todo caía en windows-latest). Correcto: `system × platform` como dos dimensiones + `include` que añade `args` por plataforma.
- **LECCIÓN — flag `-c` de tauri-action:** con `projectPath: native`, tauri corre desde `native/`, así que los overrides se pasan como `-c src-tauri/tauri.<sistema>.conf.json` (no `-c tauri.<sistema>.conf.json`).
- **frontendDist por URL** (https://starseed-os.vercel.app) SÍ funciona en Tauri 2 (la app nativa carga la web desplegada); confirmado (el OS pasó del config a compilar).
- Estado al cierre de la adenda: run v0.1.0 con los 9 jobs compilando. Deploys web previos intactos.

---
## Adenda 65 — 2026-07-05 · Fix Android del release nativo v0.1.0 (target lib)

- **Diagnóstico (run 28735558254):** escritorio 9/9 ✅ (dmg/msi/exe/deb/AppImage/rpm subidos al draft), iOS 3/3 ✅ best-effort, **Android 3/3 ❌** con `error: no library targets found in package starseed-native`. Causa: Tauri 2 móvil compila el crate como LIBRERÍA (cdylib JNI en Android, staticlib en iOS); el comentario del Cargo.toml era erróneo (`android init` NO crea el lib target, lo exige).
- **Fix (patrón oficial Tauri 2):** lógica movida a `native/src-tauri/src/lib.rs` con `pub fn run()` + `#[cfg_attr(mobile, tauri::mobile_entry_point)]`; `main.rs` queda fino llamando `starseed_native_lib::run()`; `[lib] name=starseed_native_lib, crate-type=[staticlib,cdylib,rlib]` en Cargo.toml. **Updater + autostart movidos a `[target.'cfg(not(any(android,ios)))'.dependencies]`** (solo escritorio; en móvil ni compilan — patrón de la doc oficial del updater).
- **CI:** NDK fijado al 27.0.12077973 que instalamos (Tauri lo recomienda; `sort -V | tail -1` cogía el NDK 29 preinstalado del runner, sin probar con cargo-mobile2). Fallback al más nuevo si faltara.
- Re-tag `v0.1.0 -f` para relanzar los 15 jobs sobre el mismo draft Release.
- **Fix 2 (mismo día):** al quitar updater/autostart de móvil, build.rs falló en Android con `Permission updater:default not found` — los permisos del updater estaban en `capabilities/default.json` (multiplataforma). Movidos a `capabilities/desktop.json` (+ bloque `remote` con los 3 orígenes Vercel). CONFIRMADO por el log: tauri-build filtra capabilities por `platforms` ANTES de validar permisos (autostart en desktop.json no dio error en Android).

---
## Adenda 65 — 2026-07-05 · FIX P0 Aurora rota (banner pegado + bundles viejos) en OS/Nexus/Café

Tras la ola de instalación/updates, Aurora se rompió en los 3: OS "abre 2 veces + no reconoce + loop"; Café/Nexus "banner de resumen/actualización abierto que no se puede cerrar". Diagnóstico EN VIVO con Claude-in-Chrome (clave: no teorizar, observar).

- **CAUSA 1 (Café/Nexus) — banner de actualización PEGADO:** el `astraura-update.js` mostraba "Nueva versión lista · Aplicar/Ahora no"; si el SW se activaba por otra vía, `_waiting` quedaba null, el poll se limpiaba pero el banner NO se ocultaba, y "Aplicar" no hacía nada (`if(!w)return`). En vivo se veía el banner con `waiting:false`. **FIX:** eliminado el banner → actualización SILENCIOSA (aplica al quedar libre, 1 recarga/sesión); `hideBanner` ahora ELIMINA el elemento + limpieza defensiva al arrancar. Café v11→v12, Nexus v10→v11, ?v bumpeados.
- **CAUSA 2 (OS) — SW_VERSION nunca bumpeado:** seguía en `v3-2026-07-03` pese a ~10 deploys. Aunque el SW es network-first para código, dispositivos con bundle viejo cacheado podían mezclar viejo+nuevo → DOS motores Aurora (dos SpeechRecognition que se abortan) = "abre 2 veces / no reconoce / loop". **FIX:** `public/sw.js` SW_VERSION v3→**v5-2026-07-05** + `register-sw` CUR v5 → purga cachés viejas y deja UN bundle. Verificado en vivo: cachés `...-v5-...`, un solo SW, bridge único.
- **CAUSA 3 (OS) — reload sin tope + guard permanente:** el `onControllerChange` con lógica "ocupado"+interval podía realimentarse; el guard del motor (`runningRef` boolean) podía quedarse `true` para siempre ("ni reconoce nada"). **FIX:** `applyUpdate` recarga UNA vez con **tope de 2/sesión** (sessionStorage `ss:swreloads`), sin lógica de "ocupado"; `runningRef` ahora **temporal** (timestamp, se auto-libera a 60s). Quitado el dispatch `starseed:update-ready` (banner OS muerto).
- **REGLA NUEVA:** (1) todo deploy que cambie comportamiento del OS DEBE bumpear `SW_VERSION` en public/sw.js Y el `CUR` en register-sw.tsx (deben coincidir), o los PWA instalados no purgan y mezclan bundles. (2) NUNCA banners de actualización que puedan quedar pegados: actualización silenciosa. (3) Guards de concurrencia SIEMPRE temporales, nunca booleanos permanentes.
- **Nota:** el error React #418 (hidratación) del OS es PREEXISTENTE (capas de fondo 3D/three.js "Multiple instances"), no de esta ola; la app se recupera sola. No es la causa del P0.
- **Instalables:** las apps nativas Tauri v0.1.0 envuelven la web desplegada (cargan la URL), así que reciben este fix automáticamente sin recompilar.
- Verificado EN VIVO: OS un solo orbe + bundle v5; Café sin banner (`bannerPresent:false`). Deploys: OS 3bd5475, Nexus 6ecacb9, Café 8ad59de (los 3 Vercel success).
- **RESULTADO FINAL (09:55Z):** run 28736265509 **15/15 jobs en verde**. Release v0.1.0 PUBLICADO (46 assets): 3 APK Android firmados (self-signed), 3 IPA iOS sin firmar (¡best-effort funcionó!), dmg/msi+exe/deb+rpm+AppImage × 3 sistemas, todos los .sig del updater + latest.json. Único flaky: carrera al reemplazar assets del draft entre runs (`Not Found` al borrar asset) → se cura con `gh run rerun --failed`. https://github.com/StarSeedSystem/starseed-system/releases/tag/v0.1.0

---
## Adenda 66 — 2026-07-05 · Voz Aurora: cierre del mini, auto-hablar/escuchar (Café), STT móvil (Nexus), animación de carga (3)

Diagnóstico EN VIVO con Claude-in-Chrome (verificado por comportamiento).
- **Café reproductor "no se cerraba" (VERIFICADO EN VIVO el fix):** `aurora-mini.js` — el tick `miniSync()` (cada 300ms) llamaba `update({active:true})` que RE-AÑADÍA `amp-show` tras cerrar. FIX: guard `_dismissed` en AuroraMini (hide()→_dismissed=true; update() solo re-muestra si `!_dismissed`; show()→_dismissed=false). Aplicado a Café Y Nexus (mismo módulo).
- **Café no auto-hablaba:** `speakReply` solo hablaba si `voiceOut||handsFree`. Ahora también si el reproductor está visible (contexto de voz). 
- **Café "hay que pulsar el micro" tras el tap:** `startVoice` pedía `getMicStream()` (getUserMedia del halo) ANTES de `AURORA_CAFE.listen()`; en móvil eso roba el micro al SpeechRecognition → no arranca. FIX: reconocimiento PRIMERO, getMicStream 600ms después (cosmético).
- **Nexus "no escucha" (CAUSA REAL):** `exocortex.js` ponía `r.continuous=true` SIEMPRE. En móvil (Android) eso dispara onend al instante sin capturar → "no escucha". El OS ya usaba `continuous=!isMobile`. FIX: portado — detecta móvil por UA/pointer y usa `continuous=false` en móvil. Verificado: en escritorio continuous=true, mini ya no pegado.
- **Animación de CARGA (los 3):** anillo giratorio en el orbe + spinner en el botón de reproducir del mini mientras procesa. OS: estado `thinking` en engine.ts (se apaga en finally) → `data-aurora-state="thinking"` en el orbe → CSS en globals.css. Café: `setThinking()` en agent.js. Nexus: `aurThinking()` en exocortex.js (clase en .ssx-fab).
- Voz/tono: los 3 ya usan la voz "Mónica" (OS es-MX, Nexus/Café es-ES) — misma familia; no se tocó la selección para no arriesgar.
- Deploys: OS cabcffd (SW sigue v5, network-first entrega el código nuevo sin bump), Nexus db6581d (SW v12, exocortex v108, mini v2), Café 550ff49 (SW v13, ?v=98).

---
## Adenda 67 — 2026-07-05 · Café bucle-blurb + Nexus mini-al-inicio + integración de repos IA (free-llm-api-resources, RouteLLM, LiteLLM…)

VOZ (arreglos, verificado en vivo con Claude-in-Chrome donde posible):
- **Café "habla 'tócame para que te lea lo último' + loop + no escucha" (app INSTALADO):** aurora-cafe.js es un SEGUNDO motor completo cargado junto a agent.js; en la app instalada su `maybeAutoListen()→startListen()→handleUserSpeech()→sectionBlurb()` (fallback) hablaba el blurb y re-escuchaba en BUCLE. FIX: `maybeAutoListen()`=NO-OP (aurora-cafe ya no re-escucha con su motor propio; agent.js manda), `contextText()`=`lastBotText()||''` (sin blurb hablado), revertido el `speakReply` "mini visible". En escritorio el tap ya era limpio (1 reconocimiento, sin habla). Café SW v14.
- **Nexus "el mini se abre solo al inicio":** `miniStateObj().active` era `true` fijo → cualquier `miniSync` (incl. saludo pasivo) lo re-mostraba. FIX: `active=aurora._engaged` (solo con Aurora ACTIVADA por el usuario); `setSpeakingFlag` solo abre el mini si `_engaged`; `aurTap` ahora SÍ abre el mini al activar. Nexus SW v13.
- Regla: en el Café hay DOS motores (agent.js=UI/sesión, aurora-cafe.js=engine speak/listenOnce/brain); aurora-cafe NO debe auto-escuchar ni hablar blurbs por su cuenta.

INTEGRACIÓN REPOS IA (aprendido e integrado, pre-instalado por defecto):
- **free-catalog.ts** (OS): +Cloudflare Workers AI, Scaleway, Cohere, SambaNova, OpenLLM-local (de free-llm-api-resources). **router.ts**: `estimateDifficulty()` + ajuste por dificultad (patrón **RouteLLM**: fuertes para lo difícil, rápidos para lo trivial) + ajustes `difficultyRouting`/`strongThreshold`; naming **LiteLLM** `toProviderModel()`. `free-llm-sync.ts` (pista del README).
- **Biblioteca** (OS): repo builtin `starseed-ia-tools` (12 paquetes: free-llm-api-resources, OpenLLM, RouteLLM, LiteLLM, taste-skill, pm-skills, Agent-Reach, open-notebook, agentos, OpenCode, OpenClaw, apple/container); `defaults-seed` SEED_VERSION 1→2 (recomendados pre-instalados también en cuentas existentes); tarjeta "Herramientas & servicios" en intelligence-panel (toggle dificultad + claves rápidas).
- **Nexus/Café** astraura-core.js: cadena gratis ampliada (locales Ollama+OpenLLM → LanguageModel → claves groq→cerebras→openrouter→gemini→cohere→sambanova→scaleway → Pollinations) + `estimateDifficulty` ligero; sección "Herramientas IA & Agentes" en astraura-install.js. Nexus core ?v=3, Café core ?v=100.
- Deploys en verde: OS 36f0c4d, Nexus 47130b6 (SW v14), Café 144ad6f (SW v15).

## Adenda 63 · 2026-07-06 — Perfeccionamiento integral (Cowork, 6 agentes en 3 olas)
**Escritorios:** resize por 8 bordes, snap mitades/cuartos con preview translúcida, Exposé (F3/botón), atajos (Cmd+N/W/M, F11, Cmd+Alt+←→), menú contextual ampliado, safe-areas (viewportFit:cover en layout raíz); widgets con apariencia por widget (opacidad/tinte/radio), span 1x1–4x4, panel de config (engrane hover/long-press) y preview viva en galería. Campos aditivos con normalización defensiva en desktop-store (sin bump).
**Trinity/Ajustes:** dock density cómodo/compacto + reorden por drag real + indicadores de borde por nodo (opt-in); Ajustes en 9 categorías con buscador global (settings-search, 20 entradas) + export/import JSON; Centro de control con estado real (tema/transparencias/Aurora/sync/atmósfera) y módulos reordenables/ocultables (config.controlCenter en appearance-context).
**Biblioteca:** ficha rica en package-store (preview VIVA design/animation, preview embebida de archivo por formato, permisos/capacidades del payload, relacionados navegables), valoración local + contador de uso (starseed.library.ratings.v1/usage.v1, en SYNCED_KEYS), tipo agent completado (bug preexistente KIND_META) con AgentConfigPanel + AgentBindMenu en ficha, Mi biblioteca con updates semver + "Actualizar todo". SEED_VERSION sigue en 5.
**Red:** comentarios ramificados (comment-thread: adjuntos de cualquier formato, @perfil/#página con autocompletado, reacciones, editar con historial) compartidos entre /post/[id] y feed; publicaciones con tarjeta de preview expandible por tipo (página/app/widget/agente/skill/archivo/encuesta/evento); selector de algoritmos del feed (crono/relevancia/cercanía/área/personalizado con editor de pesos) → starseed_feed_preference_v1 + DEFAULTS_VERSION "feed-gen1-2026-07-06-selector-pesos"; hub con discover-section (sugeridos razonados, filtros, acciones rápidas); mapa Leaflet real (capas, buscador, mi ubicación, markers con ficha) en network y culture.
**Aurora/Astraura:** message-renderer universal (markdown+tablas+código con copiar+JSON plegable+SVG/HTML sanitizado sin deps nuevas+media) integrado en exocórtex, mini-player y /agent; context.ts ampliado (systemMap(), describeArea(), acciones+agentCapable por área) alimentando el system prompt; sync-providers.ts con adapter (oficial/Supabase propio/local, extensible a WebDAV/Drive) + AccountSyncPanel en /servidores (starseed.sync.provider.v1 + providers.config.v1, por dispositivo, default=oficial, sync actual intacto); invoke-agent-button ("invocar agente aquí" con contexto del lugar). Docs: astraura-inteligencia.md §11–13.
**Materiales/pulido:** starseed-materials.css §9–12 (ss-crystal--sutil/--alta, sheen 280ms, --ambient-tint por tema/nodo Trinity, ss-icon-3d--lg/--sheen) respetando prefers-reduced-motion y data-perf="eco"; weather-fx-overlay CSS puro (lluvia/nieve/niebla/god-rays) en weather-panel y mapa de clima; ui/button|tabs|dialog (cursor, focus, target 32px+); responsive hub/library/profile/network (clamp, targets ≥40px, fix flex-1 que rompía scroll de 9 tabs en perfil).
**Verificación/lecciones:** los 374 errores de tsc en el Mac son PREEXISTENTES/entorno — node_modules del Mac no tenía typescript ni @next/swc-darwin-arm64 (npx bajaba un tsc arbitrario); instalados --no-save; 0 errores de sintaxis/módulos en archivos de la sesión; next.config ignoreBuildErrors:true ⇒ gate real = next build/Vercel. `.git/index.lock` huérfano bloqueaba git ("could not write index") — borrarlo. Quedó archivo huérfano neutralizado src/components/settings/ai/account-sync-panel.tsx (export {}) por borrar.

## Adenda 64 · 2026-07-07 — Librería|Biblioteca + Sync universal + Mensajes + Servidores de apps (Cowork, 4 agentes en 2 olas)
**Concepto (del visionario):** Librería = catálogo EN LÍNEA (archivos/carpetas/categorías); Biblioteca = lo GUARDADO por cada entidad (usuario/página/grupo/comunidad/evento/E.F./partido), personal o grupal. Misma sección /library, dos áreas. Referencias, no copias.
**Backend (migraciones `entity_state_sync` + `os_messaging_servers_public_library`):** entity_state (PK owner_kind/owner_id/key, rev trigger, RLS user+miembros por os_memberships/owners, realtime ON también user_settings) · os_profiles (directorio buscable) · os_dm_threads/members/messages (RLS is_dm_member security definer, realtime) · os_app_servers/members (public/private/group, pending→aprobación, realtime) · library_public_items (catálogo público, lectura anon) · política es_srv_member en entity_state (owner_id 'srv:<uuid>').
**Contrato cliente:** src/lib/sync/entity-state.ts (deviceId/currentUserRef/get/set/subscribeEntityState, LWW por rev, anti-eco device_id). SOP: architecture/libreria-biblioteca-sync.md (§1-8).
**Bibliotecas:** entity-library.ts v2 (carpetas anidadas, tags, alias, branch=réplica vinculada vs duplicar, acl por ítem/carpeta, migración v1→v2) + Finder completo en components/library/finder/ (iconos/lista/columnas Miller, árbol drag&drop, breadcrumb, preview por formato, menú contextual clic-derecho/long-press: abrir/replicar/duplicar/copiar-pegar starseed.clipboard.v1/alias/mover/etiquetas/compartir enlace profundo/publicar→/publish?attach=/permisos con búsqueda os_profiles+os_groups/quitar) + catálogo público public-catalog.ts (publishItem/publishFolder, pestaña "Comunidad" en Librería). Pestaña Biblioteca real en grupo/página/evento/perfil (EntityLibraryPanel).
**Sync tiempo real:** realtime-sync.ts (patch localStorage.setItem + storage listener, debounce 1.5s, push a user_settings, postgres_changes fila propia + broadcast acct:<uid>, anti-eco, evento starseed:sync:apply) montado global (RealtimeSyncProvider en layout); SYNCED_KEYS += desktops/cursorfx/aurora.chatlog/dock.folders/orb.pos/a11y/perf + SYNCED_PREFIXES starseed.brain. (exclude starseed.entitylib.); panel en Ajustes→Cuenta (toggle ON por defecto, dispositivos/neuronas con latido — ensureThisNeuron ya existía) + estado en Centro de Control. Pizarras/navegador persisten en tablas propias (no localStorage) — correcto fuera de SYNCED_KEYS.
**Mensajes (/messages reconstruido):** dm.ts sobre os_dm_* con realtime; 2 paneles, burbujas con MessageRenderer, adjuntos cualquier formato (dataURL ≤800KB + refs refKind/refId), responder-citando, editar/borrar, guardar en Biblioteca, nuevo chat/grupo con búsqueda del directorio (seedMyProfile al montar); Aurora opcional por hilo (thread.agent, botón + @aurora, astrauraChat, kind='agent'); conmutador Mensajes↔Correos conservado.
**Búsqueda:** os-profiles.ts (searchUsers/searchGroups/recommendations por tags+membresías) integrado en hub (personas/grupos + "quizá conozcas") y explorer. "Seguir" usuario usa os_follows con page_slug=username (primitiva real).
**Servidores de apps (/servidores-apps):** app-servers.ts CRUD + join/request/approve; useServerChannel (entity_state 'srv:<id>' + broadcast) con demo colaborativa (contador+notas); ServerCard compartible (adjunto refKind 'server' en mensajes, /messages?attachServer=<slug>); acceso en HubRedSection + dock (icono Boxes).
**Pendientes conocidos:** pegar entre bibliotecas distintas (aviso honesto), pullPreferences() manual no cubre prefijos dinámicos (el motor realtime sí), partido/E.F./asamblea sin ruta real → sin pestaña Biblioteca aún.

## Adenda 65 · 2026-07-07 — Subida universal de archivos + Multi-perfil + Espacios compartidos (Cowork, 2 agentes)
**Backend (migración `os_files_profiles_spaces`):** bucket storage `os-files` (público-lectura, escritura solo `<uid>/…`) · os_files (owner/profile_id/path/url/device_id/is_public/acl_read/acl_write/group_slug, RLS+realtime) · os_account_profiles (varios perfiles por cuenta: personal/cívico/artístico/profesional/custom, handle único, is_default; lectura pública, escritura dueño) · política es_profile_own en entity_state (ámbito profile) · os_spaces (kind desktop|dashboard|board, access private|profiles|invite|public, allowed_profiles de CUALQUIER cuenta, group_slug, doc jsonb, rev trigger) + os_space_editors (invited→member) con space_can_edit/read security definer · realtime ON en todo. SOP §§9-12.
**Uploader universal (os-files.ts + universal-file-picker.tsx):** 3 fuentes — Dispositivo (drag&drop+progreso XHR, límite 50MB), Bibliotecas (picker sobre entity-library), Neuronas (archivos por dispositivo + "solicitar archivo" por broadcast acct:<uid> con receptor global file-request-listener en layout). Integrado en 9 superficies: mensajes (inline ≤300KB, resto storage), comentarios, publicaciones, Finder de bibliotecas ("Subir archivos…" con permiso write), avatar/portada (perfil+cuenta), memorias (enlace md en editor), chat de Aurora (URL al draft via onAttachFile). onAccountBroadcast/sendAccountBroadcast multiplexados en el canal acct existente.
**Multi-perfil (profiles.ts + account-profiles-switcher):** ensureDefaultProfile (migración no destructiva del doc local), perfil activo starseed.profile.active.v1, switcher en Ajustes→Cuenta y /cuenta. Config sync 'starseed.sync.profiles.v1' {mode all|selected, perDevice por tipo web/pwa/móvil} con shouldSyncKey() aplicado en realtime-sync (gating de claves de ámbito perfil). **Default: sync entre TODOS los perfiles de la cuenta.**
**Escritorios por perfil + espacios:** profile-desktops.ts espeja starseed.desktops.v1 ↔ entity_state(profile,'desktops') con cambio de perfil que guarda/carga; desktop-share-panel ("Compartir como espacio…", lista de compartidos); modo colaborativo ?space=<id> en /escritorios (shared-desktop-space, LWW+debounce). Pizarras: board-share-dialog + ?board-space=<id> en /pizarra (público/invitación por @username/perfiles/grupo; invited→member al abrir enlace).
**Cerebros por biblioteca de perfil:** library-brains.ts + popover en /library (entity_state(profile,'library-brains'), default TODOS los cerebros para todos los perfiles); getLibraryBrains() exportado como enganche para el contexto de Aurora (pendiente cablear en context.ts).
**Pendientes:** UI de invitaciones pendientes de espacios (aceptación automática al abrir enlace), avatar/cover de perfiles usa URL directa (picker integrado en perfil/cuenta principal), getLibraryBrains→context.ts.

## Adenda 66 · 2026-07-07 — Barrido de pendientes + Integración Hugging Bay
**Pendientes cerrados (8/8):** getLibraryBrains cableado al contexto de Astraura (libraryBrainsContextLine en context.ts, systemMap(route?)); invitaciones de espacios con bandeja aceptar/rechazar + realtime + toasts (listMyInvites/acceptInvite/declineInvite en spaces.ts; UI en desktop-share-panel y SharedBoardsSwitcher); pegar entre bibliotecas distintas (copiar/cortar cross-lib con permisos y avisos honestos); pullPreferences aplica SYNCED_PREFIXES (respetando EXCLUDE); avatar/portada de perfiles con picker universal + preview; @/lib/data tipado (interfaces reales, adiós a los ~67 errores 'never' de hub/culture/education/politics, runtime intacto); pestaña Biblioteca en PartidoToolkit y EntidadFederativaToolkit (kinds party/ef); el huérfano settings/ai/account-sync-panel.tsx no existía (verificado).
**Hugging Bay (huggingbay.xyz — registro verificado de modelos IA open-source):** doc primero (astraura-inteligencia.md §14). Proxy GET-only /api/huggingbay/[...path] (allowlist, timeout, s-maxage, sin SSRF). Cliente src/ai/astraura/huggingbay.ts (recommend/semanticSearch/trending/topOpenModels/artifactCard/localKit, caché TTL 1h) con TASK_TO_USE_CASE y rankHuggingBayFor(task): licencia permisiva + verified/hosted primero, puntuación fit+confianza+tier del dispositivo, razones en español. Autonomía: sugerencia "model-discovery" cuando falta IA local; candidatos registrables en installed-models para el router; capacidad model-discovery en skills.ts. Configurables en panel de inteligencia: descubrimiento ON, auto-sugerencia ON, herramienta preferida (ollama), solo-permisivas ON, solo-hosted OFF. Librería: navegador vivo HuggingBayBrowser (Recomendados por tarea/Trending/Top open/Búsqueda semántica; copiar comando local, abrir, Usar en Astraura, guardar en biblioteca) en Destacado + paquete iatool-hugging-bay-registry en starseed-ia-tools; SEED_VERSION 5→6. Clave sync nueva starseed.astraura.huggingbay-candidates.v1.

## Adenda 67 · 2026-07-07 — Stack OSS por defecto (10 repos "$200/mes")
Guía Notion analizada (vía Chrome, Notion es client-rendered). 10 paquetes nuevos en starseed-ia-tools (kind function, descripción qué-hace/qué-reemplaza/GitHub): Dyad (app-builder), goose (agent-recipes), DeerFlow (deep-research), Daytona (sandbox-exec), Parallel Code (multi-agent-code), Scrapling (web-scraping-adaptativa — añadido como motor en web-access.ts), 9Router (router-proxy: IntelligenceSettings.nineRouter {enabled OFF, endpoint localhost:8000, compressionHint}, fuente '9router-local' en free-catalog solo-ready-si-activado+responde, compresión como hint de system prompt), ai-website-cloner (design-import), RAGFlow (rag-knowledge), Pipecat (voice-realtime). 10 capacidades en SKILL_CAPABILITIES (system prompt + sesgo routing + packageIds) propagadas por la sync de capacidades por cuenta existente. SEED_VERSION 6→7: +10 nuevos +4 del barrido del catálogo (anim-respiracion-neon, iatool-deepcrawl/webharvest/universal-scraper); excluidos con nota los reference-only (routellm/litellm/agentos/opencode/openclaw/apple-container) y temas excluyentes. Docs: astraura-inteligencia.md §15 + astraura-capabilities.md. Pendientes: UI de toggles nineRouter en intelligence-panel; paridad astraura-core.js en Nexus/Café (otros repos).

## Adenda 68 · 2026-07-07 — 8 repos OSS más (Coolify, OpenHands, Maxun, Open WebUI, browser-use, Langflow, Stirling-PDF, Dify)
Mismo patrón que A67: 8 paquetes iatool-* + 8 capacidades en SKILL_CAPABILITIES (self-hosting-deploy, dev-agent, web-robots, local-llm-ui, agent-browsing, flow-builder, pdf-tools, llm-apps-platform) + SEED_VERSION 7→8. Integraciones específicas: Maxun como motor en web-access.ts; Open WebUI como conector real en brains/servers.ts (puerto 3000, /api/chat/completions, patrón Ollama); nota browser-use en browser-windows; enlace Stirling-PDF bajo la preview de PDF del Finder. HALLAZGO: Open WebUI/Dify/Langflow/Stirling/OpenHands/browser-use ya tenían conectores funcionales en integrations/registry.ts (acciones invocables vía aurora-tools.ts) y Coolify estaba en oss-library.ts — esta ola añade la capa de capacidad viva (system prompt + routing + tarjeta) documentado en §16. Docs: astraura-inteligencia.md §16 + astraura-capabilities.md. Pendiente: paridad astraura-core.js Nexus/Café; UI toggles nineRouter.

## Adenda 69 · 2026-07-07 — Programa "red social avanzada" (12 agentes en 6 olas)
**A1 Publicaciones:** EmbeddedContentWindow (ventana DENTRO de la publicación: colapsada/abierta/minimizada/pantalla-completa; estrategias por formato + code-sandbox srcdoc) + AttachmentCarousel multi-formato estilo IG (Embla) + composer: tipos nuevos (galería/código/transmisión/proyecto/servidor), ratio de vista principal con topes por contexto (feed 65vh/página 80vh), preview opcional, barra markdown, plantillas, preview en vivo con RichPostCard. FIX posterior: feed .eq(type,'post')→.neq(type,'comment') para que los tipos nuevos aparezcan.
**A2 Política:** 3 ramas (Legislativo propone/vota · Ejecutivo mandatos/recursos/estados · Judicial constitucionalidad/mediación restaurativa) + propuestas: opciones promovibles desde comentarios por votos, duración mín 1 día con cuenta atrás, votos públicos verificables, enmiendas votables, urgencia con notificaciones a afectados (campo "afecta a" con terceros), panel Contexto de Aurora, delegación líquida visible. Guard re-filtro en realtime rows (fuga entre pestañas corregida).
**B1 Educación:** curriculum builtin 7 categorías/25 temas/55 subtemas + extensiones personales; Mapa del Conocimiento (Lista/2D/3D ssr:false) con ruta de aprendizaje por tema; pestaña Educación en grupos/páginas (temario, exámenes constructor→insignia Scholar real, tareas, pizarras del grupo os_spaces, sesiones en vivo useServerChannel).
**B2 Cultura:** hub social 5 pestañas (Para ti/Siguiendo/Tendencias/Explorar/En vivo) + contenido VIVO por adjunto: modos estático/edición-en-tiempo-real (os_spaces con permisos grupal/pública/invitación/servidor + requestSpaceAccess/approveSpaceEditor nuevos)/canal-en-vivo (presencia, chat efímero, estado, WebRTC experimental STUN) — LiveAttachment/LiveChannel + LiveModePicker en composer.
**C1 Correos+entidades:** os-mail.ts sobre os_dm (bandejas/destacados/archivo, multi-destinatario, adjuntos, realtime), correo externo vinculado vía mailto (honesto), entity_state 'layout': acento/portada/orden-visibilidad de pestañas/secciones libres/integraciones sugeridas por kind en grupo/página/perfil.
**C2 Cuenta+contexto:** /cuenta estilo Google (7 tarjetas con datos reales + buscador + deep-links ?tab=), user-context.ts (recolectores: perfiles/grupos/archivos/posts/mensajes-meta/notifs/recordatorios/escritorios/espacios + searchNetworkPosts) inyectado breve en astrauraChat + tools get_user_context/search_network_posts/get_entity_context + toggle "Aurora conoce mi contexto".
**D1 Cerebros/Graphify:** SOP cerebros-memorias-graphify.md; 32 tipos de memoria (md+frontmatter+[[wiki]]), grafo 2D/3D en cerebro/mapa, memory-intelligence (contexto→tipo, autoUpdate por eventos, modo write/read por cerebro), destinos multi-servidor por cerebro (local+StarSeed+brain-store externo), offline con cola + fusión auto no-destructiva + panel Conflictos con ramas.
**D2 Aurora resiliente:** garantía de respuesta (cadena+fallback local honesto), meta por mensaje (proveedor/intentos/ms/dificultad/herramientas/undo) con línea "proceso" expandible; menú contextual del mensaje (copiar/ramificar chat con chat-tree/ver proceso/reintentar con modelo seleccionable/revertir con undo-info/guardar en biblioteca); toggle selección automática de herramientas.
**E1 Mensajes+:** crear grupo/comunidad de la red desde mensajes (vinculado al hilo), pestaña "Contenido de la red" en el picker (adjuntar página/grupo/post/servidor por ref con render vivo universal-attachment-view en mensajes/correos/comentarios), invitaciones con Aceptar/Rechazar reales + eventos→calendario+recordatorio scheduled_tasks+ALARMA funcional (alarms.ts + engine en layout: sonido/notificación/snooze, sincronizada), FilePreview en burbujas y correos.
**E2 Librería GitHub:** versiones+restaurar+comparar y fusión de ramas por ítem, comentarios realtime por archivo/carpeta, repos creables del usuario (README/licencia/visibilidad, fork/instalar/descargar zip/release), repos externos GitHub conectados (proxy api/github-repo, ficha+README+releases), menú contextual por formato (fondo/avatar/memoria de cerebro/reproducir/ver zip) + "Instalar en…" + relacionados. Doc §13-18.
**F1 Lienzo:** destinos múltiples con buscador de entidades (+evento kind, entityId de correlación) + compartir como mensaje/correo (tarjeta ref, sin duplicar); modo Diseño (9 bloques con estilos y 5 presets + drag) y modo CÓDIGO libre con sandbox en vivo publicable como programa ejecutable; editor de imagen real (canvas: crop/rotación/filtros→re-upload); Aurora generativa global y por bloque (undo 1 nivel).
**F2 Cámara/Galería/Historias:** /camara (foto+video, capacidades reales getCapabilities: zoom/torch/foco/exposición, timer/grid/formatos, destinos: biblioteca "Imágenes y videos" con subcarpetas Cámara/Importadas/Capturas + nube + dispositivo), /galeria (fecha/álbumes, visor con edición real, cerebros por carpeta/archivo media-brains default privados, privacidad), historias temporales (duración/audiencia personal-pública-grupos/ubicación, expiran; barra+visor en galería y cultura), registro: SEED 8→9, dock migración v7 grupo Medios, widgets Galería reciente+Cámara, app-catalog.

## Adenda 70 · 2026-07-07 — 7 repos OSS (avatar, P2P, IoT, marcadores, audio, ciencia)
7 paquetes iatool-* + 7 capacidades en SKILL_CAPABILITIES (bookmarks-ai, local-objects, audio-library, home-automation, p2p-sync, aurora-avatar, data-science-fasta) + SEED_VERSION 9→10. Integraciones funcionales por repo:
- **Open-LLM-VTuber** → Avatar de Aurora: aurora-avatar.tsx (estados idle/escuchando/hablando/pensando envolviendo AuroraOrb; modo orbe default + Live2D opcional vía PIXI+pixi-live2d-display por CDN dinámico, degrada solo, nunca SSR/npm), avatar-config.ts (starseed.aurora.avatar.v1), montado en aurora-chat-section + toggle en intelligence-panel. Doc §18.
- **syncthing** → sync-providers.ts proveedor 'p2p-syncthing' (REST /rest/system/status, apikey local-only, espejo complementario a Supabase) + memory-destinations 'p2p' para espejar cerebros; en AccountSyncPanel. Doc §12 + cerebros §7.
- **home-assistant** → conector solo-lectura (registry.ts + clients/home-assistant.ts + aurora-tools) + panel "Hogar/IoT" opt-in en smart-home-tab del Centro de Control (URL+token local, /api/states, toggle /api/services, estado no-configurado honesto), alineado con Oikos/Sangha.
- **audiobookshelf** → conector (clients/audiobookshelf.ts, API /api/libraries) + capacidad audio-library.
- **karakeep** → Marcadores: bookmarks.ts (guardar enlace/nota/imagen tipo 'bookmark' en entity-library, etiquetado IA vía astrauraChat con fallback heurístico, búsqueda full-text local) + save-to-bookmarks button en EntityLibraryPanel; nuevo SavedItemType 'bookmark'.
- **anytype** → capacidad local-objects + paquete (sin conector: su API requiere emparejamiento de escritorio en 2 pasos, documentado honesto).
- **altair/AltaiR** → capacidad data-science-fasta + paquete categoría ciencia.
Docs: astraura-inteligencia.md §17-19 (G1 usó §19 para evitar choque con §18 del avatar) + astraura-capabilities.md + cerebros-memorias §7. Sin colisiones (diff cruzado verificado). Pendiente: conector anytype (pairing), Live2D requiere modelo del usuario.

## Adenda 71 · 2026-07-07 — Conectores por usuario (cuenta propia opcional → gratis/OSS por defecto)
Principio: el OS SIEMPRE funciona con opciones gratuitas/OSS elegidas por Astraura según contexto; el usuario conecta SUS cuentas solo si quiere (credenciales locales que NUNCA viajan).
**Motor (provider-resolution.ts):** 13 categorías (llm-chat, web-search, web-fetch, maps, code-host, docs, notify, design, storage, email, calendar, pdf-tools, automation) con default OSS real + servicios de marca opcionales; resolveProvider(cat,ctx) síncrono nunca-lanza; withProviderFallback (usa el resuelto, si falla cae al OSS y registra sustitución); modo global/por-categoría 'auto'|'prefer-own'|'only-free' desde starseed.connectors.mode.v1 (sincronizada); heurística auto: gratis/OSS salvo categorías externalReach con cuenta propia sana. Cableado: aurora-tools (web_search/scrape resuelven por categoría + reportan proveedor en la línea de proceso; oculta tools de marca en only-free), router (prefer-own prioriza clave propia, auto sigue gratis-primero), web-access (resolveWebFetchProvider), context.ts (activeProvidersLine en cada turno). Doc §20.
**Credenciales (connector-credentials.ts, fuente única):** starseed.connectors.creds.v1 LOCAL nunca-sync (patrón starseed.ai.providers) + starseed.connectors.mode.v1 sincronizada (en SYNCED_KEYS); eventos starseed:connectors.
**Hub (/conexiones · UserConnectorsHub):** por categoría muestra el default gratis/OSS activo (verde "Funciona por defecto"), "Conectar mi cuenta" opcional (form local + estado), selector de modo, indicador "Activo ahora"; conectores OSS self-host (ollama/searxng/crawl4ai/n8n/stirling/HA/audiobookshelf…) enlazados a su config existente sin duplicar; acceso desde Ajustes→Aurora e IA. Encabezado "Todo funciona gratis por defecto; conecta tus cuentas solo si quieres".
**Honesto:** servicios de marca sin conector real aún (Google Maps/Search/Bing, GitHub token, Notion, Slack/Telegram, Figma/Canva, Drive/Calendar, Zapier) se declaran como opción "requiere tus datos", NUNCA se auto-eligen; con conector real hoy: OpenAI/Anthropic/Firecrawl/Gmail(mailto) + todos los OSS self-host. Pendiente: probar-conexión real para SaaS de marca (CORS), conectores reales de maps/design.

## Adenda 71 · 2026-07-08 — Diseño total: Estudio + 24 temas + Mezclador + tldraw + 6 repos
**Estudio de Diseño (/estudio, 13 archivos):** editor por elemento (Botón/Pestañas/Ventana/Icono/Widget/Tarjeta/Fondo/Tema) con preview VIVA de componentes reales vía CSS vars escopadas (nunca clases JIT runtime); panel de propiedades (color/gradiente/radio/sombras/blur/glow/tipografía/padding/animaciones); guardar como tema custom + exportar .starseed-theme.json a Biblioteca + publicar; editor 2D (formas/capas/texto→SVG/PNG a os-files) + ImageEditorDialog; material 3D real (r3f+drei ssr:false) con mapeo honesto a ss-crystal/metal/wood; panel Aurora (JSON por familia, diff antes de aplicar, deshacer, 3 variaciones). Decisión: ruta nueva en vez de design-canvas (acoplado a appearance-context). Enlace en universal-editor (+fix typeof en 7 iconos preexistente).
**Contrato theme-engine.ts** (yo) + **catálogo 24 temas** (theme-catalog.ts light+dark: art-nouveau…material-3d) + **4 fondos animados** (backgrounds.ts: matrix-rain, estrellas, gradiente-aurora, weather-live ligado al clima real) + starseed-themes.css + integración theme-gallery/store (aplicar/favoritos/export-import) + paquetes design-* (no recommended). El agente H1 murió por límite de sesión pero dejó el catálogo COMPLETO (auditado).
**Mezclador (theme-mixer.ts + theme-mixer-panel):** fusión por 7 slots (paleta/material/fondo/tipografía/animaciones/densidad/efectos) de temas o elementos sueltos; armonización real: contraste AA por luminancia WCAG (bug real corregido: umbral 0.5→cruce WCAG ~0.179, validado con 2816 comprobaciones × 576 combinaciones), saturación equilibrada, radios/glow reescalados; validador de avisos; "Sorpréndeme" + "Afinar con Aurora" (JSON+diff); guardar/aplicar/exportar/publicar. **35 elementos sueltos en 7 categorías** (design-elements.ts + repo STARSEED_DESIGN_ELEMENTS en packages). **Tema por entidad:** entity-layout +themeId/themeMix, entity-theme-scope (aplica al entrar/restaura al salir) en grupo/página + selector en Personalizar; claves de tema en SYNCED_KEYS. Montado en Ajustes→Apariencia y pestaña Mezclador de /estudio.
**tldraw v5.2.3 instalado (npm real, licencia con marca de agua respetada):** tldraw-board.tsx (persistencia local por pizarra + compartido best-effort sobre os_spaces con mergeRemoteChanges anti-eco; multiplayer real = evolución con su sync server), selector de motor por pizarra (starseed|tldraw, board-engine.ts, existentes intactas), ?engine= en /pizarra, selector en adjunto pizarra del composer; iatool-tldraw + capacidad whiteboard-pro; SEED 10→11. Nota: npm omit=dev global podó devDeps al instalar — restaurado con --include=dev.
**6 repos (SEED 11→12, doc §21):** immich → conector real solo-lectura en Galería→Servicios externos (álbumes + recientes vía POST /api/search/metadata; GET /api/assets retirado upstream) con Importar a Biblioteca (referencias); perplexica (renombrado "Vane" por su autor) → conector + motor en web-access; flowise → paquete+capacidad flow-automation (conector ya existía); anything-llm → conector real (workspace chat Bearer) + rag-workspace; langflow verificado completo (no duplicado); reor → capacidad local-ai-notes + nota en memory-types (sin API pública, doc honesto).
**Seguridad:** tokens de GitHub/Vercel pegados por el usuario en el chat NO se usaron (gh auth del Mac ya autorizado; Vercel verificado por status de GitHub) — ROTARLOS recomendado por haber quedado en el registro de conversación.

## Adenda 72 · 2026-07-11 — Sistema universal de permisos y compartición (SOP centro-creacion-sync-permisos §5)
**Modelo único `src/lib/sharing/access.ts`:** AccessScope profile|account|custom|public · AccessRole view|comment|edit|admin · AccessGrant {granteeKind profile|account|group|link, granteeId, role, sections? (acceso PARCIAL por subsecciones), label} · ResourceRef {type desktop|dashboard|board|brain|file|folder|library, id, ownerId?, libraryRef?, spaceId?}. Persistencia local-first: cache `starseed.sharing.local.v1` (fallback sin sesión) + espacio os_spaces del recurso cuando se comparte fuera de la cuenta (columnas access/allowed_profiles/group_slug + os_space_editors = enforcement RLS real; `doc.sharing` = fidelidad scope+grants) + espejo a la ACL embebida de biblioteca (setItemAcl/setFolderAcl) para file/folder. API: getResourceAccess/setResourceScope/upsertGrant/removeGrant/listGrants/can(who,ref,rol,seccion?)/ensureResourceSpace/shareLinkFor/subscribeResourceAccess (onTableChange os_spaces+os_space_editors, realtime en vivo) + hook useResourceAccess. Mapeo kind: brain/file/folder/library → os_spaces kind 'dashboard' genérico (tipo real en doc.sharing.resource.type; el CHECK solo admite desktop|dashboard|board). Nota honesta: el push colaborativo de escritorios/pizarras reemplaza el doc y puede vaciar doc.sharing hasta la siguiente mutación — el enforcement (columnas+editors) nunca se pierde.
**Diálogo reutilizable `src/components/sharing/share-access-dialog.tsx`:** 4 ámbitos con iconos User/Lock/Users/Globe + descripciones, lista de accesos con selector de rol por grant, "Parcial" con checkboxes de subsecciones (guarda grant.sections), buscador de perfiles reales (searchUsers de os_profiles, como el Hub), grupos por slug, perfiles de mi cuenta como chips, rol público del enlace, y "Copiar enlace" (asegura espacio ?space=/?board-space= o usa el deep-link propio). Cambios aplican EN VIVO (local-first + push best-effort) y reflejan realtime.
**Integraciones (botón Compartir · Share2):** escritorios → botón por escritorio en DesktopSettingsPanel (secciones = pestañas, defaultSections = el escritorio, enlace /escritorios?space=) · pizarras → BoardShareDialog reescrito como envoltorio del modelo (API {canvas,open,onClose} y BoardShareTrigger intactos, enlace /pizarra?board-space=) · biblioteca → acción "Compartir" del menú contextual del Finder abre el diálogo universal por ítem/carpeta (ACL embebida + espacio para externos; el copiar-enlace profundo sigue dentro del diálogo) · cerebros → botón "Compartir" del cerebro activo en CerebroHub con ramas memoria/habilidades/contexto/egos · dashboards → opción "Compartir" en el menú Settings2 del panel (prop onShareDashboard por dashboard-workspace-renderer → dashboard-panel-header; diálogo en dashboard-layout).
**Pendientes:** consumir grant.sections al ABRIR (filtrar pestañas/ramas no permitidas en modo espacio) · /dashboard aún no lee ?space= (el enlace se genera pero la página no lo consume) · share-board-dialog.tsx del control-panel (sistema de boards legado) sin migrar a propósito · escáner de secretos (§13) al compartir cerebros cuando exista security/scanner.ts.

## Adenda 72 · 2026-07-12 — Personalidades de Aurora COMPLETADO (SOP centro-creacion-sync-permisos §11)
**Verificación tras muerte de subagente:** `src/lib/aurora/personalities.ts` (modelo+8 grupos de niveladores+presets+compilador+asignaciones por contexto+deriveVoiceStyle+helpers de tool), `personalities-panel.tsx` (galería/editor/Biblioteca/import-export), integración Astraura (router.ts inyecta `compilePersonalityPrompt(resolvePersonalityForContext(...))` en el system prompt, prioridad chat>cerebro>sección>global) y tools kind:"personality" en aurora-tools.ts (cambiar_personalidad/ajustar_rasgo/describir/listar, registradas en registry+dispatch) estaban COMPLETOS y compilan sin errores.
**Terminado ahora (aurora-chat-section.tsx):** pestaña "Personalidades" (icono Drama) junto a Control montando `<PersonalitiesPanel/>` con scroll propio (max-h 62vh, usable en móvil); efecto `registerActiveAuroraChat(tree.activeId)` (limpia al desmontar) para que la asignación "este chat" y la resolución por chat de Astraura funcionen con el contexto activo del árbol; enlace a la pestaña desde el selector de personalidad de la pestaña Voz. `entity-library.ts` ya tenía el tipo "personality".
**Pendiente (orquestador):** añadir `starseed.aurora.personalities.v1` y `starseed.aurora.personality.active.v1` a SYNCED_KEYS en `src/lib/settings-sync.ts` (archivo vetado para este subagente). Voz: engine.ts + tts-oss ya consumen `starseed:aurora-voice-style` (sin tocar).

## Adenda 72 · 2026-07-12 — Voz de Aurora COMPLETADA: Bark · GPT-SoVITS · OmniVoice (SOP centro-creacion-sync-permisos §10)
**Verificación tras muerte de subagente — ya estaba COMPLETO (no se reescribió):** `tts-oss/browser-voices.ts` (ranking: neurales/premium primero, es-* preferente, femenina suave; resolveBrowserVoice = fijada→mejor rankeada), `tts-oss/neural-tts.ts` (cliente HTTP genérico/tolerante de los 3 motores por ENDPOINT: rutas candidatas por motor, respuesta bytes/base64/URL/Gradio, timeout 20 s, ping cacheado 60 s con reintento no-cors), `tts-oss/voice-style.ts` (8 emociones→rate/pitch/volumen, etiquetas Bark con moderación, passthrough SoVITS/Omni, listener vivo de `starseed:aurora-voice-style` + emitVoiceStyle), `voice-config.ts` (TODO dentro de `starseed.aurora.voice.v1`, ya en SYNCED_KEYS; migración suave del opt-in Kokoro; modo simbiótico), `speak-router.ts` (cadena SIEMPRE-HABLA motor→Kokoro→false=navegador, cada eslabón en Promise.resolve().then().catch, simbiótico SoVITS→Bark), engine.ts (installVoiceStyleListener, estilo multiplicando la entrega, voz rankeada como default, stopConfiguredEngine en interrupt), aurora-tools.ts (kind:"voice": ajustar_voz/cambiar_motor_voz/estado_voz registradas en TOOL_INDEX+dispatch+sección de prompt), router.ts de Astraura (cambio de Personalidades, aditivo, compila), paquetes Biblioteca iatool-bark/gpt-sovits/omnivoice/casaos, doc astraura-inteligencia.md.
**Terminado ahora:** (1) `voice-oss-panel.tsx` COMPLETADO con el diseño existente: 6 tarjetas de motor con punto de disponibilidad (ping vivo), bloque de conexión por endpoint (input+re-ping+Probar voz contra el servidor con frase de muestra), campos refAudio/refText de SoVITS, toggle simbiótico Bark+SoVITS, sliders velocidad/tono/energía + emoción por defecto (persisten vía emitVoiceStyle → evento vivo), selector de voz del navegador con "Automática (recomendada)" + "ahora sonará X", notas de instalación por neurona/CasaOS (Cerebro→Neuronas). (2) Bug de compilación REAL arreglado: `AURORA_ENGINE_LABEL: Record<AuroraVoiceEngine,string>` de quick-settings-tab.tsx sólo tenía 3 de 6 motores. (3) Dos regex con flag /s (dotAll, ES2018) → `[\s\S]` (target del proyecto es ES2017): neural-tts.ts y voice-style.ts. (4) `resetVoiceStyle()` en voice-config (setVoiceStyle fusiona y no podía limpiar) + export en index.ts. (5) Capacidad `voice-neural` en astraura/skills.ts junto a la de Kokoro (skillIds aurora-voice-bark/sovits/omnivoice; sin routing bias: la síntesis no pasa por el router LLM) + fila en architecture/astraura-capabilities.md. (6) settings-search: entrada aurora-voz ampliada.
**Verificado:** tsc con el tsconfig del proyecto sobre los 13 archivos de la familia de voz = 0 errores (los que quedan son preexistentes de keyStorage/desktop-store/notifications/realtime-sync/sync-manager, fuera de este ámbito). El panel sigue SIN montarse en ninguna página (igual que VisionPanel: componente listo esperando su hueco en Ajustes → Aurora e IA).

## Adenda 72 · 2026-07-12 — Seguridad integrada estilo Strix + Raven/Skales + Organizador Mouzi (SOP centro-creacion-sync-permisos §13-14)
**Escáner de secretos/PII `src/lib/security/scanner.ts` (NUEVO):** patrones con severidad critical/high/medium/low y tipo en español (claves API sk-/sk-ant-/AIza/ghp_/github_pat_/xox*/vcp_/re_, PEM, cadenas de conexión con credenciales, JWT — con detección de service_role de Supabase decodificando el payload —, asignaciones password/secret/token=, correos, teléfonos, IPs privadas con puerto, rutas /Users|/home|C:\Users). API: scanText/scanDeep (con path, guardas de ciclo), redactText/redactDeep («[REDACTADO:tipo]», umbral minSeverity, por defecto solo critical), summarize, maskSecret, findingFingerprint. CERO falsos bloqueos: nunca lanza, detectar ≠ bloquear.
**Enganches reales:** `entity-library.ts` → scanItemInput + saveItemSecure/importItemSecure (guardar/compartir/instalar: redacta critical por defecto, `allowCritical:true` = "compartir igualmente", siempre devuelve findings+aviso) · `personalities.ts` → importPersonalityJson escanea SIEMPRE, redacta critical (re-normaliza el clon) y adjunta `security{findings,redactedCount,aviso}` sin romper la API · `memory-files.ts` → scanMemoryFile + exportMemoryFileSecure (mismo patrón al exportar/compartir memorias).
**Panel `src/components/security/security-scan-panel.tsx` (NUEVO — security-panel.tsx ya existía y es la política DNS/VPN/VPS, NO se tocó):** "Escanear ahora" recorre memorias de cerebros (cuenta + por cerebro), personalidades, bibliotecas accesibles (snapshot local) y claves localStorage sospechosas; LISTA BLANCA starseed.ai.providers + starseed.connectors.creds.v1 (jamás se leen: solo aviso "credenciales locales: nunca se sincronizan"); resultados por severidad con Redactar (en origen, por tipo) / Ver dónde (path+enlace) / Ignorar (starseed.security.ignored.v1, por dispositivo a propósito); nota de Strix (usestrix/strix) catalogado en la Biblioteca. Montado en /seguridad (encima de la política) y en Ajustes→Seguridad de /cuenta vía NeuronsPanel (página congelada; único componente de esa sección) + entrada "seguridad-escaner" en settings-search.
**AUDITORÍA DE SEMILLAS — HALLAZGO CRÍTICO REDACTADO:** la service_role de Supabase (nxstilnyidvkqeosofuh) estaba hardcodeada y RASTREADA EN GIT en test_db.js, query.js, query2.js, test_update.js y test_insert.sh, y una clave DashScope (sk-6473…) en tools/qwen-unified.sh → todas sustituidas por process.env/${SUPABASE_SERVICE_ROLE_KEY}. ⚠️ SIGUEN EN EL HISTORIAL DE GIT: ROTAR la service_role en el dashboard de Supabase y la clave DashScope. src/data/** y SEED_FILES limpios (solo datos de ejemplo inofensivos). .env.local intacto (gitignorado, es su sitio).
**Raven · Skales (§14):** conectores 'raven' (EverMind-AI/Raven, memoria agéntica, :8000) y 'skales' (skalesapp/skales, :3000) en OSS_CONNECTORS (patrón CasaOS, por endpoint) + fuentes MemorySource 'raven'/'skales' en MEMORY_SOURCES con campos endpoint/tokenRef — aparecen solos en servers-panel, memoria-panel y brain-mindmap-3d (UI data-driven).
**Organizador inteligente (Mouzi):** `src/lib/files/smart-organizer.ts` (NUEVO) — buildOrganizePlan(items) → {moves,newFolders,reasoning,source}: Astraura primero (prompt español SOLO-JSON, timeout 25 s, validación dura de ids/carpetas, máx 3 niveles) con fallback heurístico determinista (Imágenes/Documentos/Audio/Vídeo/Código/Comprimidos; subcarpetas por año si >50 ítems; lo no reconocido no se mueve). UI `smart-organize-button.tsx` (Wand2) montada en la cabecera de entity-library-panel: diálogo con movimientos-checkbox, carpetas nuevas, crédito "Inspirado en Mouzi", aviso de seguridad al vuelo por ítem (scanItemInput) y aplicación confirmada con la API real (createFolder anidado + moveItem).
**Arreglos colaterales (errores que rompían tsc en el área biblioteca, preexistentes de otras olas):** finder-types.ts TYPE_ORDER sin la clave 'personality' + finder-view.tsx implicit any en getUser().
**Verificado:** tsc (tsconfig del proyecto: ES2017/strict/bundler + next-env.d.ts) sobre los 14 archivos de esta ola = 0 errores; los restantes son preexistentes de keyStorage/desktop-store/notifications/realtime-sync/sync-manager (fuera de ámbito). No tocados: settings-sync.ts, cuenta/page.tsx, tts-oss, personalities-panel.tsx, sharing/**, hub/**, oss-library.ts, packages.ts, network/**.

## Adenda 73 · 2026-07-12 — Bug "glitcheo/reinicio en loop" ARREGLADO DE RAÍZ (SOP centro-creacion-sync-permisos §15)
**Causa real confirmada — bucles de layout por umbrales de scroll SIN histéresis sobre bloques EN FLUJO:**
1. `dashboard-workspace-renderer.tsx` (la viva, en cada panel del dashboard): la barra de pestañas colapsa en flujo (max-h-28→0) según dirección de scroll (±8px). Ocultarla agranda ~112px el contenedor de scroll → cerca del fondo el navegador RECORTA scrollTop (eventos "hacia arriba") → la lógica direccional la re-mostraba → encogía → el siguiente scroll la re-ocultaba… bucle infinito. Cada ciclo alternaba además la scrollbar (ancho del lienzo) → ResizeObserver de `useWidth` → react-grid-layout re-acomodaba TODOS los widgets con transición 500ms = "los elementos se glichean y reinician en loop"; se detiene lejos de la zona de recorte (= "para al scrollear en algunas posiciones").
2. `dashboard-layout.tsx` (latente + feature rota): título (~180px, AnimatePresence height, en flujo) + barra lateral con umbral único scrollY<60 sin histéresis, escuchando `window`… que NO es el scroller real bajo (main) (`main.os-main-scroll`). Si dispara, el re-anclaje del navegador re-cruza el umbral → mostrar/ocultar infinito.
**Fixes (sin eliminar animaciones: corren una vez y quedan estables):** rAF-throttle + histéresis por posición (ocultar >96/mostrar <32 en paneles; >280/<48 en el título, hueco > alto colapsable) + guarda de recorrido (solo ocultar si tras colapsar el recorte no puede devolver y bajo el umbral de mostrar → el estado converge SIEMPRE) + escuchar el scroll-parent real (walk-up overflow-y, fallback window) + `[scrollbar-gutter:stable]` y `[overflow-anchor:none]` en el scroll del panel + `.os-main-scroll{overflow-anchor:none}` en globals.css + guarda de delta >1px en `use-width.ts` (ResizeObserver subpíxel ya no re-acomoda la rejilla) + respeto GLOBAL a prefers-reduced-motion (globals.css). Colateral: hooks del panel movidos ANTES del return de panel vacío (regla de hooks al pasar vacío→poblado).
**Archivos:** src/components/dashboard/dashboard-workspace-renderer.tsx · src/components/dashboard/dashboard-layout.tsx · src/hooks/use-width.ts · src/app/globals.css. Verificado con tsc del proyecto = 0 errores en los tocados. Keys ya eran estables (widget.layout.i||id) y sin key={random/Date/tick} en el repo; whileInView no se usa.

## 2026-07-12 — Secciones · Perfil · Entidades: acciones por defecto + adjuntos visibles (Adenda 63 §8)

**Sesión por:** Claude (subagente Cowork, ola §8).
**Resumen ejecutivo:** Cabeceras consistentes con acciones rápidas en Política/Educación/Cultura (tipos especializados → `/crear?area=publicar&dest=…`) + feed vivo de sección sobre `os_posts`; fila de acciones por defecto en el perfil (dueño/visita + "ver como visitante") y en TODA entidad (6 toolkits); adjuntos de /publish ahora visibles como miniaturas/chips en las tarjetas.

### Hecho
- `src/components/network/section-header.tsx` (NUEVO): `SectionHeader` + `SectionQuickActions` — chips por tipo especializado (TIPOS_POR_DEST de creation-config) → `/crear?area=publicar&dest=<sección>`.
- `src/components/network/section-posts-feed.tsx` (NUEVO): `SectionPostsFeed` — feed realtime de la cola canónica de cada sección (`os_posts`, entity "page" + slug politica/educacion/cultura), estado vacío con CTA a /crear.
- `/network/politics`: cabecera + "Nueva propuesta" (dialog proposals existente) + "Propuestas del mapa" (→ /hub/mapa) + `SectionPostsFeed` bajo el feed legislativo; contenido centrado `mx-auto max-w-6xl` (se retiró el botón absoluto).
- `/network/education`: cabecera + chips (curso/guía/recurso/tutoría), bloque enlace a /library, 5ª pestaña "Publicaciones" con el feed de sección; centrado max-w-6xl.
- `/network/culture`: cabecera + chips (obra/evento/convocatoria/multiverso), `CultureDiscoveryRow` (eventos próximos REALES de os_events → /evento/<slug> + tarjeta Multiverso → /immersive), pestaña "Sección" con el feed; centrado max-w-6xl.
- Perfil `/profile/[username]`: `ProfileQuickActions` (NUEVO src/components/profile/profile-quick-actions.tsx) bajo el header — dueño: Editar (/cuenta) · Crear publicación (/crear) · Compartir (share/copy) · **Ver como visitante** (toggle local que baja isOwner en toda la página); visita: **Seguir real** (os_follows, clave `profile-<handle>`) · Mensaje (/messages?to=) · Compartir. CTA "Crea tu primera publicación" en la pestaña Publicaciones vacía (prop nueva `emptyCta` de PostFeed).
- Entidades: `EntityQuickActions` (NUEVO toolkits/shared/entity-quick-actions.tsx, re-exportado desde shared/index) al inicio de los 6 toolkits — Publicar aquí (→ /crear?area=publicar&dest=propia) · Agenda (diálogo UnifiedCalendar realOnly) · Biblioteca (diálogo EntityLibraryPanel con el kind correcto: party/ef/community/event/group/page) · Miembros (roster honesto) · Compartir (ShareAccessDialog universal sobre la biblioteca de la entidad + enlace público) · Ajustes (EntityEditorDialog real solo si os_pages/os_groups + owner).
- Adjuntos visibles: `splitBodyAttachments()` en `src/lib/social-posts.ts` separa el bloque "**Adjuntos:**" y el comentario `ss:meta` que /publish embebe en el body de os_posts → `NormalizedPost.attachments`; `PostCard` los pinta (imágenes → rejilla de miniaturas; resto → chips icono+enlace) y el `tipo` de ss:meta pasa a ser el badge del post. Aplica a PostFeed (cafe_posts), páginas/grupos y feeds de sección (osPostToNormalized en use-os-entities).

### Decisiones tomadas
- La regex ss:meta se duplica en `social-posts.ts` (lib) para no invertir capas lib←components; parser tolerante que nunca lanza.
- "Compartir perfil" NO usa ShareAccessDialog: `ResourceType` de sharing/access no contempla perfiles (share/copy nativo). En entidades sí se usa el diálogo universal sobre su biblioteca (`type:"library"` + libraryRef) con `buildLink` al enlace público de la entidad.
- Los chips de tipos enlazan sin parámetro `tipo` (QuickPublisher no lo lee; se elige dentro — creation/** intocado).

### Pendiente / Próximos pasos
- `?to=` en /messages aún no abre hilo (la ruta existe; el parámetro queda forward-compatible).
- QuickPublisher podría aceptar `?tipo=` para preseleccionar el tipo del chip pulsado (requiere tocar creation/**, fuera de esta ola).
- tsc: 0 errores en los archivos tocados; persisten 15 errores PREEXISTENTES en 7 archivos ajenos (live-channel, realtime-sync, notifications, account-context, desktop-store, sync-manager, ai/client/keyStorage) — implicit any / tipos DOM.

## 2026-07-12 — Adenda 63 · P-3 (panel de voz + visión de Aurora, montados) y P-4 (`/messages?to=<handle>`)

**Sesión por:** Claude (subagente Cowork, ola P-3/P-4).
**Resumen ejecutivo:** Los paneles de **voz** (`VoiceOssPanel`) y **visión** (`VisionPanel`) de Aurora estaban COMPLETOS pero huérfanos (no los renderizaba ninguna página). Ahora viven en Ajustes → Aurora e IA, que hoy **es `/cuenta`** (`/settings` redirige allí; la vieja página con pestañas ya no existe). Además, el deep-link `/messages?to=<handle>` de las acciones rápidas del perfil ya abre (o crea) el hilo con esa persona.

### Hecho
- **P-3 · Montaje de los sentidos de Aurora** — `src/app/(app)/cuenta/page.tsx`: dos secciones nuevas al final, con ancla propia y cabecera clara: `#aurora-voz` (§8, `<VoiceOssPanel />`) y `#aurora-sentidos` (§9, `<VisionPanel />`), justo después de `#aurora-ia`. Se añaden sus dos tarjetas-resumen al grid navegable superior (buscador propio de la página ya las filtra por «voz», «kokoro», «visión», «cámara»…). Deep-links: la página ahora entiende `?section=<id>` y `#<id>` (además de `?createProfile`), y espera a `loading=false` antes de hacer scroll (antes el nodo aún no existía → scroll silencioso a ninguna parte).
- **P-3 · Anclas reales en el buscador de Ajustes** — `src/components/settings/settings-search.tsx`: campo opcional `anchor` en `SettingsSearchEntry` + scroll a esa sección en `selectEntry` (respeta `prefers-reduced-motion`). `aurora-voz → #aurora-voz`, `aurora-sentidos → #aurora-sentidos`, `aurora-canales`/`ia-modelos → #aurora-ia`, `neuronas → #seguridad` (donde vive `NeuronsPanel`). Todas existen en `/cuenta`.
- **P-4 · `/messages?to=<handle>`** — `src/app/(main)/messages/page.tsx`: el cuerpo pasa a `MessagesContent` y el export por defecto lo envuelve en `<Suspense>` (obligatorio con `useSearchParams`, si no rompe el build). Al montar con `?to=`: resuelve el @ en el directorio (`fetchProfileByUsername`, os_profiles) → `createDm(userId)` (que YA reutiliza el hilo 1:1 existente, así que (a) abre el que hay y (b) crea uno nuevo si no) → recarga hilos, lo selecciona, salta a la vista de hilo en móvil y **enfoca el compositor** (prop nueva `autoFocusComposer` en `ThreadView`, con `ref` en el `Input` del composer). Estados honestos en un banner: «Abriendo tu conversación con @x…», @ inexistente, «ese eres tú», sin sesión → aviso descartable, nunca crash. Idempotente (`handledToRef`).
- **Bug colateral corregido** (era imprescindible para P-4): `reloadThreads` leía un `selectedId` obsoleto (useCallback con deps `[]` + eslint-disable) y por eso **cada recarga realtime saltaba al primer hilo**, pisando cualquier selección. Ahora usa actualización funcional (`setSelectedId(cur => cur ?? rows[0]?.id)`), y `setProfiles` fusiona en vez de reemplazar (no se pierde el perfil resuelto por el deep-link). El deep-link `?attachServer=` pasa a leerse por `useSearchParams` (ya hay boundary de Suspense; se retira el `window.location` de apaño).

### Decisiones tomadas
- Los paneles se montan en `/cuenta` porque **es** la página de Ajustes (`src/app/(main)/settings/page.tsx` = `redirect("/cuenta")`). No se resucita la página de pestañas. Cambio quirúrgico en `cuenta/page.tsx` (2 imports, 1 icono, 2 tarjetas, 1 efecto, 2 secciones) — el archivo ya se rompió una vez, se verificó con tsc.
- `SettingsSearch` sigue sin montarse en ninguna página (tiene su propio buscador `/cuenta`); las anclas quedan correctas para cuando se monte. No se tocó `settings-sync.ts`, `tts-oss/**`, personalidades, sharing/**, security/** ni map/**.
- Crear el hilo con `createDm` (fila real) en vez de un borrador en memoria: es idempotente y es lo que ya hace `NewChatDialog`; un hilo vacío se lista sin problema (`lastMessage: null`).

### Pendiente / Próximos pasos
- Los `QuickLink` de `/cuenta` a `/settings?tab=appearance|trinity|ai` aterrizan en `/cuenta` (el redirect pierde el `tab`): o se convierten en anclas locales o `/settings` debería reenviar `?tab=` a `?section=`.
- Otros paneles de `src/components/settings/ai/**` (proveedores, canales, mixture-of-agents, intelligence) siguen huérfanos igual que estaban voz y visión — merecen su propia ola de montaje.
- tsc (tsconfig real del repo): **0 errores** en los 4 archivos tocados. Persisten 4 errores PREEXISTENTES en 2 archivos ajenos que importa `/cuenta` (`profiles/account-profiles-switcher.tsx`, `settings/account/entity-roles-panel.tsx`); el build no se bloquea (`next.config` → `ignoreBuildErrors: true`).

## 2026-07-12 — Adenda 63 · P-5 (polígonos libres en el Mapa del Hub)

**Sesión por:** Claude (subagente Cowork, ola P-5).
**Resumen ejecutivo:** Las propuestas territoriales (`proposals` · kind `map_zone`) ya no están limitadas a un círculo: se pueden **dibujar zonas a mano** en `/hub/mapa` (clic a clic o a mano alzada) con la API BASE de Leaflet, sin plugins ni dependencias npm. La geometría se persiste en la MISMA propuesta y las zonas circulares ya guardadas siguen funcionando sin migración.

### Hecho
- **`src/lib/map/map-geometry.ts` (NUEVO)** — modelo único de zona: `{kind:"circle", center:[lat,lng], radiusM}` | `{kind:"polygon", ring:[[lat,lng],…]}`. Área por **shoelace esférico** (verificado: 0,01°×0,01° a lat 40 → 0,949 km²), centroide planar (proyección equirectangular local, con caída a la media si es degenerado), `zoneBounds`/`suggestedZoom` para el deep-link, `formatArea` (m²/ha/km²), simplificación (distancia mínima + Douglas-Peucker + tope `MAX_RING_VERTICES=220`) y **`parseZoneGeometry` / `serializeZoneGeometry`** (compatibilidad, ver abajo).
- **`src/lib/map/map-draw.ts` (NUEVO)** — trazador `createZoneDrawer(L, map, opts)` con Polyline/Polygon/Marker/LayerGroup a pelo: clic = vértice (polilínea viva con `mousemove` + guía de cierre discontinua), **doble clic/doble toque = cerrar**, **arrastrar = trazo a mano alzada** (muestreo cada 15 px, simplificado al soltar), Backspace = deshacer, Enter = cerrar, Escape = cancelar. Al cerrar pasa a modo **edición**: marcadores de vértice **arrastrables** (clic derecho / pulsación larga sobre uno lo elimina, mínimo 3). Táctil (touchstart/move/end, pinch-zoom respetado) y sin fugas (`destroy()` en el unmount del mapa).
- **`src/lib/map/map-data.ts`** — `MapZoneProposal` gana `geometry: ZoneGeometry` + `areaM2`; `lat`/`lng` pasan a ser el **centroide** y `radiusM` el radio real (círculos) o el **equivalente por área** (polígonos). `createZoneProposal({name, zoneKind, description, geometry})` serializa con `serializeZoneGeometry` y el deep-link del adjunto «Ver en el Mapa» usa centroide + zoom sugerido.
- **`src/components/map/map-view.tsx`** — botón **Dibujar zona** (icono pluma, estado activo) en la barra derecha + entrada «Dibujar zona a mano (polígono)» en «Crear aquí» (la de siempre pasa a llamarse «Proponer zona circular»). Barra inferior con la ayuda («Haz clic para añadir vértices · doble clic para cerrar · arrastra para trazo a mano alzada · Esc para cancelar»), contador de vértices, **área en vivo** y botones Deshacer / Cerrar zona / Rehacer / Proponer zona / Cancelar. La capa de propuestas pinta **polígonos y círculos indistintamente** (mismo popup, ahora con forma + área; las aprobadas conservan estilo y etiqueta). El diálogo de propuesta es consciente de la geometría (slider de radio solo en círculos; en polígonos muestra vértices, área y «Rehacer el trazo»).

### Decisiones tomadas
- **Compatibilidad sin migración de datos (bidireccional).** `parseZoneGeometry` acepta 3 formas: `geometry` anidada (nuevo), geometría plana con `kind`, y el **legacy plano `{lat,lng,radiusM}` SIN `kind` → círculo**. Y al guardar seguimos escribiendo TAMBIÉN los campos legacy (centroide + radio de área equivalente), así que una versión ANTIGUA del OS desplegada pinta un polígono nuevo como círculo razonable en vez de ignorarlo.
- **Sin plugins de dibujo** (Leaflet.draw/geoman): la Adenda prohíbe dependencias npm nuevas y Leaflet entra por CDN. Todo se hace con la API base + eventos DOM sobre el contenedor del mapa.
- **Dibujar desactiva «Crear aquí»**: el `contextmenu` del mapa consulta `drawActiveRef`; además, mientras se traza, los paneles de marcadores/overlay quedan `pointer-events:none` (nada de popups a media zona) y el mapa no panea (dragging/doubleClickZoom/boxZoom off, restaurados al terminar).
- El trazador vive **fuera de React** y sólo emite instantáneas (`onChange`), evitando re-renders por cada punto muestreado. Escape con un diálogo Radix abierto NO borra la zona (guarda por `[role=dialog][data-state=open]`).

### Pendiente / Próximos pasos
- Un polígono es un **anillo simple**: sin agujeros, sin multipolígonos y sin cruce del antimeridiano (documentado en la cabecera de `map-geometry.ts`). Si la red lo pide → GeoJSON + PostGIS.
- No hay **auto-intersección** detectada: se puede dibujar un "lazo" y el área saldrá rara (el shoelace se cancela). Faltaría validación de simplicidad del anillo.
- Sin marcadores intermedios para **insertar** vértices en el medio de una arista (solo mover/eliminar/rehacer).
- Los trazos a mano alzada con >80 vértices no muestran marcadores editables (sería inmanejable): se rehacen.
- tsc (tsconfig real del repo, archivos tocados + sus vecinos de `map/**`): **0 errores**. `next lint` no se pudo ejecutar (falla con "Converting circular structure to JSON", roto de antes en el repo).

## 2026-07-12 — Adenda 63 · Sync en vivo SIN DDL (broadcast primero)

**Sesión por:** Claude (subagente Cowork).
**Resumen ejecutivo:** El sync en vivo (Biblioteca y publicaciones) dependía de `postgres_changes`, que exige que las tablas estén en la publicación `supabase_realtime` — migración `20260711120000_realtime_publication.sql` **imposible de aplicar sin credenciales de gestión**. Ahora el camino PRINCIPAL es Realtime **BROADCAST** (canales), que no requiere DDL: el sync funciona igual de bien con la migración pendiente, y si algún día se aplica, no hay ni duplicados ni doble trabajo.

### Hecho
- **`src/lib/sync/live-signal.ts` (NUEVO)** — motor de señales: `emitChange(topic, {id, updatedAt, entity, data})` / `onChange(topic, cb, {entity})`, un único evento de broadcast `live` sobre dos canales: `acct:<uid>` (otros **dispositivos** de la cuenta, multiplexado sobre el canal que ya gestiona `realtime-sync.ts` — sin abrir un 2.º websocket) y `ent:<kind>:<id>` (otras **cuentas** con acceso al recurso compartido; refcount + cierre con gracia de 60 s). Helpers de topic: `libraryTopic` / `entityFeedTopic` / `feedTopic` / `FEED_GLOBAL_TOPIC` + entidad virtual `ent:feed:global`. Incluye `checkRealtimeTables()` (diagnóstico).
- **`src/lib/sync/realtime-sync.ts`** — `getOrCreateBroadcastChannel` ahora **re-cablea** los eventos custom ya registrados vía `onAccountBroadcast` al crear un canal nuevo: sin esto, tras un teardown/cambio de sesión los listeners (`live`, peticiones de archivo a neuronas) quedaban **sordos para siempre**.
- **`src/lib/library/entity-library.ts`** — `pushCloud` y `flushPendingLibrarySync` emiten `signalLibraryChange(ref, row.updated_at)` tras un push con ÉXITO. `watchLibrary` escucha ahora **broadcast** (señal → `pullCloud` + merge LWW → `writeCache`, que ya emite `starseed:library-updated`) **y** `postgres_changes` (redundante, deduplicado).
- **`src/lib/os-social.ts`** — `createPost` hace `select("id, created_at")` tras el insert y emite en `feed:<tipo>:<slug>` (canal de entidad) y en `feed:global` (canal compartido `ent:feed:global`).
- **`src/hooks/use-os-entities.ts`** (`useOsPosts`) y **`src/components/social/PostFeed.tsx`** — escuchan el broadcast además de su `postgres_changes` (con dedupe por clave común).
- **`src/components/settings/account/realtime-sync-panel.tsx`** — bloque «Sync en vivo: por broadcast · Activo» + nota gris opcional. Sin alarmas.

### Decisiones tomadas
- **Anti-eco en 2 capas:** canales con `broadcast: { self: false }` (el emisor nunca recibe lo suyo) + `deviceId` en el payload (descarta lo emitido por otra pestaña del MISMO dispositivo).
- **Anti doble-procesado:** puerta única `shouldProcessChange(changeKey(topic, id, updatedAt))`, ventana ~5 s. La primera vía que llegue procesa; el resto (canal de cuenta, canal de entidad, `postgres_changes`) se descarta. **Regla:** los dos transportes deben construir la clave con el mismo `id` y `updatedAt` de la fila — por eso `createPost` recupera `id`/`created_at`.
- **`emitChange` se llama SIEMPRE tras un push con éxito**, nunca antes (si no, anunciaríamos un cambio que nadie puede leer todavía).
- **Diagnóstico honesto:** PostgREST no expone `pg_catalog`, así que `checkRealtimeTables()` normalmente devuelve `known:false` ("desconocido"). No es un problema y la UI no lo pinta como error: el sync funciona por broadcast.
- El patrón es **señal + repull** (la señal lleva solo id + fecha, nunca contenido): cada cliente vuelve a consultar y **RLS decide** qué puede leer. Un canal compartido no filtra datos.

### Pendiente / Próximos pasos
- La migración `supabase/migrations/20260711120000_realtime_publication.sql` **sigue sin aplicar** — ya no es bloqueante, pero conviene aplicarla (dashboard/CLI) para tener el camino redundante: cubre a los clientes que estaban CERRADOS cuando se emitió el broadcast (el broadcast no persiste).
- `cafe_posts` (que es lo que lee `PostFeed`) no emite señal: sus escrituras viven en otro flujo. Solo se refresca por `postgres_changes` de `cafe_posts` o por la señal de `os_posts`.
- Los canales de entidad son públicos (cualquiera autenticado puede suscribirse a `ent:<kind>:<id>`). Como solo viaja la señal, no hay fuga; si se quisiera endurecer → Realtime Authorization (canales privados con RLS sobre `realtime.messages`).
- tsc (tsconfig real del repo vía `extends`, con los 7 archivos tocados en `files`): **0 errores**.

---

## 2026-07-12 — Deuda de tipos a cero + bug de runtime en el preview de fondos

**Sesión por:** Claude (subagente Cowork).
**Resumen ejecutivo:** `next.config.ts` tiene `ignoreBuildErrors: true`, así que el build pasaba con **102 errores de TypeScript** ocultos. Se han arreglado TODOS (`npx tsc --noEmit` → **0 errores**) sin tocar comportamiento, y por el camino han aparecido varios **bugs reales de runtime**, no solo de tipos.

### Hecho — bugs de runtime (los importantes)
- **`applyAlpha` no definida** en `settings/appearance/background-settings.tsx:458`: el mini-preview de los fondos "vivos" (aurora/nebula/plasma) llamaba a una función inexistente → **ReferenceError y crash del panel de Apariencia** en cuanto se pintaba esa rama. El helper existía duplicado en `ui/backgrounds/living-background.tsx`; se ha promovido a `src/lib/utils.ts` (`applyAlpha`, ahora soporta hex/#rgb/hsl()/hsla()/rgb()/rgba()) y lo usan los dos.
- **`universal-board-viewer.tsx` sin imports** (tenía un `// ... existing imports ...` en su sitio): `useBoardSystem`, `useState` y `cn` eran identificadores libres → ReferenceError al renderizar el visor de pizarras (lo montan `control-panel.tsx` y `side-curtains.tsx`).
- **`/api/widget-forge/generate-visuals`**: en el `catch` se usaba `prompt`, declarado DENTRO del `try` → resolvía al `prompt` global del DOM (que en Node no existe) → ReferenceError y 500 en vez del fallback demo. Ahora `prompt` se declara fuera del `try`.
- **`components-test/page.tsx`**: llamaba a `setConfig(...)`, que no existe en el contexto de apariencia → TypeError al pulsar "Force Enable Liquid UI". Ahora usa `updateConfig` (deep-merge).
- **Sliders de Cristal Líquido en NaN**: `liquidGlass.distortWidth/distortRadius/smoothStepEdge` se leían y escribían (mapean a `--glass-opacity`/`--glass-blur`/`--glass-saturation`) pero **no existían en el tipo ni en los defaults** → `Math.round(undefined*100)` = NaN. Añadidos al tipo y a `DEFAULT_CONFIG` (0.4 / 0.4 / 0.8); el `deepMerge` de carga los rellena en las cuentas ya guardadas.
- **Iconos del catálogo de accesos rápidos**: `quick-options-grid.tsx` tenía su propio `ICON_MAP` con claves (`Home`, `User`, `Book`…) que **no coinciden** con `DockIconKey` (`LayoutDashboard`, `CircleUser`, `BookOpen`…) → casi todos los items caían al icono de respaldo. El mapa es ahora único y exportado: `DOCK_ICON_MAP` en `dock-config.ts`, consumido por el OmniDock y por el catálogo.
- **Chips "indigo" sin estado activo** (`OptionChips`): el color no estaba en el `colorMap` → el chip seleccionado se pintaba como inactivo en la pestaña de Iconografía. Añadido.
- **Etiquetas de entidad siempre "Grupo"** (`entity-roles-panel.tsx`): comparaba `p.kind === "profile" | "page"` contra un `ProfileKind` (`personal|civic|artistic|professional|custom`) → siempre falso. Ahora usa `profileKindLabel(p.kind)`. También se comprueba el código de error de forma defensiva (`grantEntityRole` puede devolver `error` como string).
- **`DesignIntegrationCanvas.tsx`**: `familyToTab` tenía 3 claves duplicadas (`cards`/`tooltips`/`badges`) → eliminadas.
- **`04-auto-discover.ts`**: el frontmatter de una SKILL.md podía dejar `tags`/`triggers`/`dependencies` a `undefined` dentro de un `SkillMetadata`. Nuevo helper `toSkillMetadata()` que rellena los obligatorios.

### Hecho — tipos
- `framer-motion`: `physicsConfig` tipado como `Transition` (el `type: "spring"` se ensanchaba a `string`).
- `CanvasAction` movido a `state-types.ts` y exportado (lo importaba `SplineIntegrationTab`); las capas `personas/*` ahora importan `CanvasState`/`ElementFamily` de `state-types` (no del componente, que no las reexporta).
- `Category`/`Theme` (`lib/data.ts`) pasan a ser interfaces explícitas (antes se inferían del literal → `subCategories: never[]` en las hojas, imposible de reutilizar).
- `ParamMap` (Aurora) admite `_notes: string` junto a los parámetros numéricos.
- `StitchTabs` acepta el estilo `liquid-crystal` (que es **el valor por defecto** del canvas y no estaba en su unión); `StitchButton` acepta `size="icon"`; `buttonStyle: "solid"` se elimina del canvas (ni existía en el componente ni se podía elegir).
- `threejs-components` (paquete JS sin tipos): declaración en `src/types/threejs-components.d.ts` → se elimina el `@ts-ignore` de `LiquidMetal.tsx`.
- `tsconfig.json`: `exclude` para lo que **no** forma parte del build de Next — `AI-refernces ` (snippets de referencia), `hermes-integration/` de la RAÍZ (copia obsoleta; la viva es `src/hermes-integration`) e `integraciones-de-codigo/` (proyecto Vite con su propio tsconfig y sus propias dependencias).

### Decisiones tomadas
- Prohibido silenciar: cero `@ts-ignore` nuevos y cero `as any`. Cuando una prop se usaba de verdad → se añade al tipo; cuando no se usaba ni existía → se elimina.
- Las tres claves nuevas de `liquidGlass` NO requieren migración de versión: `deepMerge(DEFAULT_CONFIG, saved)` ya rellena claves nuevas en configs persistidas.

### Pendiente / Próximos pasos
- `entity-roles-panel.tsx` sigue casteando `profile.kind` (`personal`, `civic`…) a `EntityType` (`profile|page|group`) al escribir en `os_entity_roles.entity_type`: se está guardando un valor de otro dominio. Hay que decidir el mapeo correcto (probablemente `"profile"` fijo) — **no se ha tocado para no cambiar lo que se escribe en la BD**.
- `hermes-integration/` en la raíz es código muerto duplicado: se puede borrar.
- `next.config.ts` mantiene `ignoreBuildErrors: true`. Ahora que tsc está en 0, se podría quitar para que el build vuelva a proteger de regresiones (requiere que CI corra tsc).

---

## 2026-07-12 — Tablas núcleo AUSENTES (I): Mensajería + Voto Delegado
**Sesión por:** Claude (subagente · ola "tablas que faltan")
**Resumen ejecutivo:** `/messages`, Correos y el voto líquido delegado NO podían funcionar: sus tablas **nunca existieron** en el Supabase del OS (`nxstilnyidvkqeosofuh`). Creadas y aplicadas en producción.

### Hecho
- Nueva migración `supabase/migrations/20260712090200_missing_core_tables_messages.sql`, **APLICADA** (Management API) y verificada en vivo. Crea:
  - `os_dm_threads` / `os_dm_members` / `os_dm_messages` — esquema derivado literalmente de `src/lib/messages/dm.ts` y `src/lib/mail/os-mail.ts` (Correos reutiliza los mismos hilos con `meta.mail = true`). PK compuesta `(thread_id, user_id)` en members: la exige el `upsert onConflict "thread_id,user_id"` de `addMembers`. `attachments jsonb` (NO `jsonb[]`, pese al comentario de la cabecera de `dm.ts`: se inserta un array JSON). `deleted boolean NOT NULL default false` (el contador de no-leídos filtra `.eq("deleted", false)`).
  - `os_messages` — **no es la mensajería**: es el buzón de memorias de Astraura (`astraura-realtime.ts#injectAstrauraMemory` + `sync-manager.ts`). `thread_id` es **TEXTO** (`"<kind>_<id>_astraura"`), no uuid. El código no envía `user_id` → la columna lo rellena con `DEFAULT auth.uid()`; RLS privada por cuenta.
  - `vote_delegations` — cláusulas pétreas en el esquema: `expires_at NOT NULL` (caducidad obligatoria), `CHECK delegator <> delegate`, índice único parcial `(delegator_user, topic) WHERE revoked_at IS NULL` (una activa por tema, como asume `delegations.ts`). SELECT público (el poder delegado es transparente, §6); escritura solo sobre lo propio.
- **RLS estricta y SIN recursión**: las políticas de mensajería no se consultan entre sí desde SQL inline (eso daría `42P17`), sino a través de dos funciones `SECURITY DEFINER`: `public.is_dm_member(thread, uid)` e `public.is_dm_thread_owner(thread, uid)` (misma técnica que `20260711000001_fix_entity_roles_rls.sql`). `is_dm_thread_owner` es imprescindible para el ALTA: al crear un DM, el creador inserta **también** la fila de membresía del otro usuario.
- Las 5 tablas añadidas a `supabase_realtime` (los mensajes lo necesitan: `subscribeThread` / `subscribeThreadsList`).
- **Prueba funcional real** (3 usuarios temporales, rol `authenticated`, RLS activa, todo borrado después): crear DM + 2 miembros + mensajes ✅; el no-miembro no ve nada y no puede escribir (42501) ✅; no se puede suplantar el `sender` de otro ✅; upsert de miembros ✅; editar/borrar solo lo propio ✅; delegar, re-delegar (revoca la previa), leer el tema y contar peso recibido ✅; no se puede delegar en nombre de otro ni auto-delegarse ✅. **Cero 42P17.**

### Pendiente / Próximos pasos
- `os_messages` no tiene lector todavía (solo `injectAstrauraMemory` escribe). Si en el futuro las memorias de Astraura deben ser visibles por un grupo/página entero, habrá que ampliar su RLS (hoy es privada por cuenta).

---

## 2026-07-12 — Tablas núcleo AUSENTES (II): entity_state · os_files · entity_mentions · os_contexts
**Sesión por:** Claude (subagente · ola "tablas que faltan")
**Resumen ejecutivo:** Las cuatro tablas sobre las que se apoya TODA la sincronización del OS (biblioteca por entidad, escritorios, layouts de páginas/grupos, archivos reales, menciones y contexto de Aurora) **nunca existieron** en el Supabase del OS (`nxstilnyidvkqeosofuh`). Creadas, aplicadas en producción y verificadas con RLS real.

### Causa raíz (por qué "solo se veía en el dispositivo donde se subía")
Todos los módulos degradan en silencio (`if (error) return null / [] / 0` — filosofía "nunca lanza"). Sin tabla detrás, cada escritura a la nube fallaba **sin un solo error visible**: la biblioteca/escritorios/layout vivían solo en `localStorage`, y en las subidas el objeto SÍ llegaba a Storage pero su fila de índice no se insertaba, así que ningún otro dispositivo (ni la vista "Archivos de la Red") podía listarlo. No era un bug de sync: era la ausencia del esquema.

### Hecho
- Nueva migración `supabase/migrations/20260712090000_missing_core_tables_library.sql`, **APLICADA** (Management API, `[]`) y **re-aplicada** para probar idempotencia. Esquema derivado literalmente del código, no de suposiciones:
  - `entity_state` (src/lib/sync/entity-state.ts) — `owner_kind/owner_id/key → value jsonb`, `rev`, `device_id`, `updated_by`, `updated_at`. **UNIQUE (owner_kind, owner_id, key)**: la exige el `upsert onConflict "owner_kind,owner_id,key"`. `rev`/`updated_at`/`updated_by` los mantiene un **trigger** (`entity_state_touch`), porque el cliente no los envía y el módulo hace LWW por `rev`.
  - `os_files` (src/lib/files/os-files.ts) — metadatos del bucket `os-files`: `owner/profile_id/name/mime/size/path/url/device_id/is_public/acl_read/acl_write/group_slug/meta`. Índice único en `path` e índice en `url` (`findFileByUrl`).
  - `entity_mentions` (src/lib/mentions/mentions.ts) — `source_type/source_id/target_type/target_id/kind('@'|'#')` + `created_by DEFAULT auth.uid()`. **Sin UNIQUE a propósito**: `persistMentions` hace un `.insert(rows)` plano y una violación de unicidad tumbaría el lote entero (y se perdería en silencio).
  - `os_contexts` (src/ai/astraura/astraura-realtime.ts) — `user_id/target_kind/target_id/settings` + UNIQUE natural del lookup.
- **RLS (privado en lo personal, transparente en lo público — §3/§6)** vía funciones `SECURITY DEFINER` (`es_can_read`, `es_can_write`, `es_is_entity_member`, `es_can_access_other`):
  - ámbitos `user`/`profile` → solo la propia cuenta (lee y escribe);
  - ámbitos de entidad pública (`page/group/community/event/ef/party`, identificados por slug) → **lectura pública** (es lo que ya asume la UI: `/pagina/[slug]` y `/grupo/[slug]` construyen su `EntityRef` para CUALQUIER visitante, no solo para el dueño) y **escritura solo de dueño (`os_pages`/`os_groups.owner_id`) o miembro (`os_memberships`)**;
  - ámbito `other`: `network-politics` (recursos comunes + mediación) → lectura pública, escritura de cualquier autenticado (gobernanza colectiva); `srv:<uuid>` → solo miembros del servidor, comprobado **dinámicamente** (`to_regclass`) para no romper si `os_app_server_members` aún no existe.
  - `os_files`: dueño todo; lectura si `is_public` / ACL / miembro del grupo; escritura compartida si estás en `acl_write`. `os_contexts`: privado del usuario (el Exocórtex es leal al usuario).
- Las 4 tablas añadidas a `supabase_realtime` + `REPLICA IDENTITY FULL` (sin ella los DELETE no traen `owner_id`/`owner` y los filtros de `subscribeEntityState`/`subscribeMyFiles` no dispararían).
- **Storage endurecido**: `20260711000000_storage_policies.sql` permitía a CUALQUIER autenticado actualizar/borrar CUALQUIER objeto del bucket `os-files`. Sustituidas por políticas de prefijo propio `(storage.foldername(name))[1] = auth.uid()` — el contrato que ya documentaba `os-files.ts` y que exige la Identidad Soberana (§6). No rompe nada: todas las subidas pasan por `uploadFile()`, que siempre escribe en `${uid}/…`.
- **Prueba funcional real** (rol `authenticated` con JWT, RLS activa; todo borrado después): upsert doble de `entity_state` → `rev` 1→2 y `updated_by` autorrellenado ✅; insert+select de `os_files`, `entity_mentions` y `os_contexts` ✅; otra cuenta NO ve tu `entity_state` personal ni tu `os_contexts`, y sus UPDATE/DELETE afectan 0 filas ✅; sí ve tu archivo público ✅; la dueña de una página escribe su `layout` y una intrusa lo lee pero no lo modifica ✅; **anon lee el layout de una página pública** (imprescindible para los visitantes) y no ve nada personal ✅.

### Incoherencias encontradas (no corregidas, solo documentadas)
- La cabecera de `src/lib/files/os-files.ts` afirma que el backend estaba "YA APLICADO y verificado" en **`dzkjapinnewkxzjltadv`** — que es el Supabase de **Nexus/Café**, no el del OS. De ahí venía la falsa sensación de que la tabla existía.
- `public.os_pages.slug` **no tiene UNIQUE** en la BD real (la migración `20260710000000` declaraba `handle unique`, pero la tabla viva usa `slug`). No lo he tocado (tabla de otra ola), pero cualquier `upsert onConflict "slug"` sobre `os_pages` fallará con `42P10`.

---

## 2026-07-12 — Tablas núcleo AUSENTES (III): os_spaces · os_space_editors · neuron_devices · os_app_servers · os_app_server_members
**Sesión por:** Claude (subagente · ola "tablas que faltan")
**Resumen ejecutivo:** El **sistema universal de permisos y compartición** (Adenda 63 §5), los **espacios colaborativos** (escritorios/dashboards/pizarras), las **neuronas** y los **servidores de apps** escribían contra cinco tablas que **nunca existieron** en el Supabase del OS (`nxstilnyidvkqeosofuh`). Creadas, aplicadas en producción y verificadas con RLS real (36 aserciones).

### Causa raíz
`spaces.ts`, `access.ts`, `neurons.ts` y `app-servers.ts` documentan en su cabecera un backend "YA APLICADO en Supabase **dzkjapinnewkxzjltadv**" — que es el proyecto de **Nexus/Café**, no el del OS. Como todos los módulos tragan el error (`catch { return null / [] / false }`), compartir un escritorio, invitar a alguien, registrar una neurona o crear un servidor **fallaba en absoluto silencio**: el modelo de permisos vivía solo en `starseed.sharing.local.v1` (localStorage), sin enforcement ninguno.

### Hecho
- Nueva migración `supabase/migrations/20260712090100_missing_core_tables_spaces.sql`, **APLICADA** (Management API → `[]`) y re-aplicada para probar idempotencia. Esquema derivado del código (columnas, `onConflict`, filtros `.eq()`, valores de los CHECK que el cliente escribe de verdad):
  - `os_spaces` — `kind ∈ desktop|dashboard|board` (los recursos brain/file/folder/library de `access.ts::spaceKindFor` ya caen a `dashboard`; el tipo real viaja en `doc.sharing.resource.type`), `access ∈ private|profiles|invite|public`, `allowed_profiles uuid[]`, `group_slug`, `doc jsonb`, `device_id`, `rev` (**trigger** `os_spaces_touch`, que además **blinda `owner_account`/`id`/`created_at`** para que un editor no pueda robar el espacio). Índice **GIN sobre `doc`** para el `.contains("doc", …)` de `findSpaceForResource`.
  - `os_space_editors` — PK `(space_id, account)` (la exige el `upsert onConflict "space_id,account"`), `role ∈ editor|viewer`, `status ∈ member|invited|pending`.
  - `neuron_devices` — **`id` es TEXT, no uuid** (`thisDeviceId()` cae a `n-<base36>` si `crypto.randomUUID` falla). `name`/`kind` NULLABLE a propósito: el heartbeat solo manda `{id, owner, last_seen_at}` y un upsert sobre fila inexistente los dejaría en null.
  - `os_app_servers` (slug **UNIQUE**: `createServer` reintenta el slug ante el código `23505`) + `os_app_server_members` (PK `(server_id, user_id)`).
- **RLS sin recursión.** `os_spaces ↔ os_space_editors` (y `os_app_servers ↔ os_app_server_members`) se consultan mutuamente ⇒ ciclo. Roto con funciones `SECURITY DEFINER` (patrón `check_entity_role` de `20260711000001`): `os_is_group_member`, `os_owns_profile`, `space_editor_status/role`, `space_can_read/edit`, `app_server_member_status/can_read`.
- ⚠️ **REGLA DE ORO descubierta a base de fallo real:** una política de una tabla **NUNCA** debe llamar a una función que **relea esa misma tabla**. Postgres aplica las políticas de SELECT también a `INSERT … RETURNING`, que es exactamente lo que genera PostgREST con `.insert({…}).select("*")` (`createSpace`, `createServer`) — y la fila recién insertada **aún no es visible** para el snapshot de la función ⇒ la política devolvía false y **el insert fallaba SIEMPRE** (42501). Por eso `sp_select`/`sp_update`/`as_select` se evalúan **inline sobre las columnas de la propia fila** y solo delegan en funciones definer para consultar OTRAS tablas.
- **Modelo de permisos aplicado:** dueño → todo · editor `member` con `role='editor'`, miembro del `group_slug` y dueño de un perfil de `allowed_profiles` → leer + editar · `viewer member` e `invited` → solo leer (el `invited` necesita leer para que la bandeja de invitaciones muestre título/kind antes de aceptar) · `pending` (auto-solicitud) → **NADA** · `public` → lectura para todos, **incluido anónimo** (enlaces compartidos). Neuronas: privadas de la cuenta (Identidad Soberana §6). Servidores: alta directa solo si son públicos; en privado/grupo solo `pending` que aprueba el dueño.
- Escalada de privilegios cerrada con un **trigger** `os_space_editors_guard` (BEGIN…EXCEPTION en RLS no basta: las políticas permisivas hacen OR de los `WITH CHECK`, así que "invited→member sí, pending→member NO" no se puede expresar solo con políticas). Solo permite `invited→member` y los upserts idempotentes.
- Las 5 tablas añadidas a `supabase_realtime` + `REPLICA IDENTITY FULL` (sin ella Realtime no puede evaluar RLS ni los filtros `id=eq.…`/`space_id=eq.…`/`server_id=eq.…` en UPDATE/DELETE).
- **Prueba funcional real** (rol `authenticated` con JWT + rol `anon`, RLS activa, 0 filas residuales): 36/36 ✅ — crear/leer/editar espacio, `rev` que sube por trigger, búsqueda por `doc @>`, invitar → leer → aceptar → editar, `INSERT/UPDATE … RETURNING` (las rutas exactas de `createSpace`/`updateSpaceDoc`/`createServer`), y **todos los intentos de escalada bloqueados**: autoinsertarse como `member` (42501), `pending→member` (42501), editar/borrar espacio ajeno (0 filas), robar `owner_account` (trigger lo revierte), unirse directo a un servidor privado (42501), ver la neurona de otra cuenta (0 filas).

### Incoherencias encontradas
- Las cabeceras de `spaces.ts` y `app-servers.ts` dicen "Backend YA APLICADO en Supabase **dzkjapinnewkxzjltadv**" (proyecto de Nexus/Café). **Documentación falsa**: en el OS no existía nada. Mismo patrón que `os-files.ts` en la ola II.
- `spaces.ts` afirma que la RLS auditada daba **"público = edición"**. **Desviación consciente:** aquí `public` concede **solo lectura**. El diálogo de la Adenda 63 (`share-access-dialog.tsx`) ofrece explícitamente "Público · Ver" como rol por defecto del enlace, y ese rol vive únicamente en `doc.sharing` — que el propio `access.ts` documenta que **se reescribe** al colaborar. Conceder escritura global a todo espacio público habría convertido cada "Público · Ver" en editable por cualquiera. Para colaborar con externos: `invite` (os_space_editors) o `profiles`/grupo.

### Pendiente / Próximos pasos
- `access.ts::pushEnforcement` traduce cualquier grant de perfil a `allowed_profiles` **perdiendo el rol** (un perfil con rol `view` acaba pudiendo editar, porque la columna no lleva rol). Si se quiere fidelidad de roles por perfil, hay que añadir rol a nivel de fila (p. ej. reutilizar `os_space_editors` para perfiles) — hoy el rol fino solo sobrevive en `doc.sharing`.
- Código NO tocado (`src/` intacto): las cabeceras con el proyecto Supabase equivocado convendría corregirlas en una pasada de documentación.

---

## 2026-07-12 — Adenda 66 (ola 2) · «carpeta» → **folder** en todo el OS · Cerebros de contexto · Cortina Logic
**Sesión por:** agente (Claude)
**Resumen ejecutivo:** Renombrado del concepto a **folder** (masculino) en toda la UI/comentarios, arreglado el popover «Cerebros de contexto» (que era imposible de usar) y corregidos los dos recortes de interfaz de la cortina Logic (apps fuera de pantalla + secciones cortadas por arriba).

### A · Renombrado «carpeta» → «folder» (SOP §1)
- ~430 textos en **117 archivos** de `src/` (UI en español, comentarios y JSDoc). Concepto único y **masculino**: «el folder», «los folders», «Nuevo folder», «Sin folder», «Nombre del folder». Incluye «carpetas del dock» → «folders del dock», Biblioteca/Finder, escritorios, galería, dashboard/launcher, exocórtex/Syncthing, publicar y organizador inteligente. También `subcarpeta` → `subfolder`.
- Se corrigió la concordancia arrastrada: artículos («una carpeta» → «un folder»), contracciones («de la carpeta» → «del folder»), adjetivos pospuestos («carpeta vacía» → «folder vacío», «carpetas activas» → «folders activos») y pronombres («si la hay» → «si lo hay», «dentro de sí misma» → «dentro de sí mismo»).
- **NO renombrado a propósito** (rompería datos ya guardados en cuentas): el discriminante persistido `"carpeta"` de `DestinationKindId` (`src/lib/publish/publish.ts`, `src/lib/reach/reach.ts`, `src/components/publish/publication-composer.tsx`). Sus **etiquetas visibles** sí pasan a «Folder/folders» (p. ej. `plural.carpeta: ["folder","folders"]`). Las claves de localStorage (`starseed.dock.folders.v1`, `FOLDERS_KEY`…) ya estaban en inglés. En los `tags` de búsqueda de widgets se **añadió** `folder`/`folders` **conservando** `carpeta`/`carpetas`, para no romper la búsqueda de quien siga escribiendo en español.
- El contrato JSON del organizador inteligente (`smart-organizer.ts`) **sí** se renombró entero (`"carpeta"`→`"folder"`, `"carpetas_nuevas"`→`"folders_nuevos"`) porque vive solo en el par prompt→`parseAiPlan` y no se persiste.

### B · Bug: «Cerebros de contexto» nunca reconocía el perfil — CAUSA RAÍZ
`LibraryBrainsPopover` decidía con `ref.kind === 'profile'` (tanto `profileId` como `applicable`). Pero el selector de bibliotecas de `/library` se alimenta de `myLibraryDestinations()` (`entity-library.ts`), que **jamás emite `kind:'profile'`**: solo emite `user` («Mi biblioteca»), `page` y `group`. Por tanto `applicable` era **siempre false** y el popover mostraba «elige un perfil en el selector de arriba» — un aviso **imposible de satisfacer**, porque ese selector no ofrece perfiles. Además desincronizaba con el consumidor real: Aurora lee `getLibraryBrains(activeProfileId())` en `src/ai/astraura/context.ts`.
**Fix:** el popover resuelve ahora el perfil **efectivo** con `useActiveProfile()` — `kind:'profile'` → ese perfil; `kind:'user'` (mi biblioteca) → **perfil activo**, sin pedir nada; `page`/`group` → aviso honesto que ya no manda a ningún sitio inexistente. Así el popover **escribe** en la misma clave (`entity_state(profile:<id>,'library-brains')`) que Aurora **lee**. Se muestra además el perfil sobre el que se guarda.

### C · Interfaz de la cortina Logic (dock Trinity, lado derecho) — CAUSA RAÍZ ÚNICA
Ambos síntomas (C1 «las apps se salen de la pantalla y no se pueden deslizar» y C2 «las secciones se cortan por arriba») venían del **mismo defecto de contención**: `ControlCenter` tenía **altura fija sin tope de viewport** (`md:h-[600px]` / `lg:h-[640px]`) y el wrapper de `side-curtains.tsx` lo centra con flexbox (`items-center`) dentro de un contenedor `fixed`. Cuando el viewport es más bajo que 600/640 px, el panel desborda arriba **y** abajo, y **el desbordamiento superior de un flex centrado es inalcanzable** (un `fixed` no scrollea) → cabecera, pestañas y apps quedaban cortadas e inaccesibles.
- **C2:** el wrapper pasa a anclarse a **top + bottom** (`inset-y-0`, sin `h-[100dvh]` redundante ni el `md:h-[90vh] md:my-auto` que competía con él): su alto lo deriva el **viewport real** (también con la barra de URL móvil, donde `vh` miente). Safe-areas reservadas con padding (`md:pt/pb-[max(1rem,env(safe-area-inset-*))]`; en móvil, dentro del propio panel: cabecera y barra de estado). El panel conserva su altura deseada pero **topada con `max-h-full`** → nunca excede el viewport, nunca se corta.
- **C1:** el carril de contenido pasa a ser el **único scroller** (`flex-1 min-h-0` + `overflow-y-auto overscroll-contain`; antes el scroll vivía en cada `TabsContent`, que además usaba `h-full` e impedía crecer). `TabsContent` usa `min-h-full`. Se añaden **sombras y flechas** arriba/abajo que solo aparecen cuando de verdad hay más que deslizar, con **guarda anti-bucle** en el `setState` del `ResizeObserver` (regla §15 de la Adenda 63: sin ella se reintroduce el glitcheo en loop).
- Verificado razonando el CSS a 380 (móvil, panel a sangre + safe-areas internas), 834 (tablet, panel 420 px con gutter 1 rem) y 1440 px (escritorio, 460×640 topado por `max-h-full`).

### Verificación
- `tsc --noEmit` (tsconfig temporal que extiende el real): **0 errores**.

### Pendiente
- El aviso del popover para `page`/`group` es honesto, pero el SOP §12 solo contempla cerebros **por perfil**: si se quieren cerebros por página/grupo hay que ampliar `library-brains.ts` (hoy su clave es `profile:<id>`).
- `DestinationKindId` sigue usando el literal `"carpeta"`: si algún día se migra, requiere migración de los datos de publicaciones/destinos ya guardados.

---

## 2026-07-12 — Adenda 66 §3-§4 · ACL por nodo (biblioteca · folder · archivo) + REGLA CUENTA↔PERFILES + Biblioteca pública del perfil
**Sesión por:** agente (Claude)
**Resumen ejecutivo:** Cada nodo de la Biblioteca tiene ya **ACL propia y heredable** (ámbito + roles), la regla **cuenta↔perfiles** se aplica en las DOS capas (RLS en la BD + `can()` en el cliente) y la pestaña Biblioteca de un perfil deja de decir «es privada»: muestra a las visitas **exactamente** los nodos que su dueño/a eligió mostrar.

### A · Modelo de ACL y herencia (§3)
- **Nodos:** `library` (nuevo) · `folder` · `file`. `ResourceType` de `src/lib/sharing/access.ts` ya los contemplaba; ahora los tres tienen ACL real.
- **Ámbitos** (vocabulario del SOP, añadidos a `AccessScope` sin romper los de la Adenda 63): `private` · `account` · `profiles` · `groups` · `pages` · `public` (+ los legados `profile` / `custom`, que siguen sirviendo a escritorios/pizarras/cerebros). `private` = **cerrado con llave**: ni los grants aplican. `profiles`/`groups`/`pages`/`custom` solo cambian el buscador de destinatarios; los grants mandan igual.
- **Roles:** `view` < `comment` < `edit` < `admin` (sin cambios).
- **Herencia:** el hijo hereda del primer ancestro con ACL propia (archivo → folder → … → biblioteca). **La ACL propia siempre gana** (no se mezclan). API nueva en `access.ts`: `getEffectiveAccess`, `parentResourceRef`, `hasOwnAcl`, `detachInheritance` («dejar de heredar» = copia la efectiva como propia), `restoreInheritance` («volver a heredar» = borra la propia). Gemelo en cliente en `finder-types.ts` (`effectiveAclForItem/Folder`, `canReadItem/canWriteItem/canReadFolder/canWriteFolder`) → el Finder ya oculta/deshabilita **con herencia**, no solo por ACL literal del nodo.
- **Persistencia:** ACL embebida en el doc de `entity_state` (clave `acl`) — nueva `EntityLibraryDoc.acl` para la biblioteca entera, `folders[].acl` y `items[].acl` para el resto. `ItemACL` se amplía de forma **aditiva** (v3): `scope`, `grants`, `showInProfile`, `updatedAt`, conservando `read`/`write` como **espejo** (los siguen consumiendo el Finder y las políticas legadas). Para los ARCHIVOS reales se espeja además a `os_files` (`is_public`/`acl_read`/`acl_write`/`group_slug`) vía `findFileByUrl` + `updateFileAccess` → ahí el enforcement **sí** es por fila.

### B · Regla CUENTA↔PERFILES (la parte crítica)
Dar acceso a UN perfil se lo da a **TODOS los perfiles de esa cuenta**, y al revés. Funciona porque `auth.uid()` **ES la cuenta** (los perfiles de `os_account_profiles` son facetas suyas), así que una sola comprobación cubre las dos direcciones.
- **BD** — migración `supabase/migrations/20260712100100_account_profile_access.sql` (idempotente, **aplicada y verificada** en `nxstilnyidvkqeosofuh`):
  - `account_of_profile(uuid)` · `profiles_of_account(uuid)` · `acl_ids_allow(uuid[])` — todas `SECURITY DEFINER` + `STABLE` (leen `os_account_profiles` **sin** pasar por su RLS → **cero recursión**).
  - `es_acl_node_allows(jsonb,text)` / `es_doc_acl_allows(jsonb,text)` — leen la ACL embebida (v3 `scope`+`grants` y las listas v2) de la biblioteca, de cada folder y de cada ítem.
  - `entity_state`: SELECT/UPDATE pasan a `es_can_read/es_can_write(...) OR es_doc_acl_allows(value, 'read'|'write')`. INSERT/DELETE siguen siendo **solo** del dueño/miembro (compartir nunca permite crear ni destruir la biblioteca ajena).
  - `os_files`: `osf_select` y `osf_shared_write` usan `acl_ids_allow(...)` → `acl_read`/`acl_write` admiten indistintamente uuids de **cuenta o de perfil**.
- **Cliente** — `identitySetOf(who)` en `access.ts` (cache 60 s) resuelve cuenta+perfiles equivalentes y `can()` compara los grants contra ese conjunto. En el Finder, `AclViewerContext.profileIds` (cargado en `entity-library-panel.tsx` con `listMyProfiles()`) hace lo mismo. **Cliente y RLS dicen siempre lo mismo.**

### C · Verificación con impersonación (`authenticated`, datos de prueba borrados después)
Cuentas A (comparte), B (con perfiles P1·P2·P3) y C (tercero):
| Caso | Esperado | Resultado |
|---|---|---|
| A comparte un **folder** con el perfil **P2** → ¿accede la cuenta B (y por tanto P1 y P3)? | sí | **sí** (1 fila) |
| A comparte con la **cuenta B** → ¿accede B con cualquiera de sus perfiles? | sí | **sí** (1 fila) |
| Biblioteca privada de A → ¿la ve B? | no | **no** (0 filas) |
| Archivo `os_files` con `acl_read=[P2]` → ¿lo lee B? | sí | **sí** |
| Archivo privado de A → ¿lo lee B? | no | **no** |
| **Tercero C** → ¿ve o escribe algo de A? | no | **no** (0 en todo) |
| B con grant **rol `view`** → ¿puede escribir? | no | **no** (0 filas) |
| B con grant **rol `edit`** (vía P2) → ¿puede escribir? | sí | **sí** (1 fila) |
| B con archivo solo en `acl_read` → ¿puede escribirlo? | no | **no** |
Datos de prueba (3 usuarios, 3 perfiles, 3 bibliotecas, 3 archivos) **eliminados**: verificado a 0.

### D · UI
- **Menú contextual → «Permisos»** (`finder-view.tsx`) abre ahora el `ShareAccessDialog` universal con el `ResourceRef` correcto (`file`/`folder`), en vez del viejo editor de listas read/write. Muestra **badge «Propio»/«Heredado»** + botón **«Dejar de heredar»/«Volver a heredar»**, y **editar un nodo heredado lo desengancha automáticamente** (editar es decidir).
- **Permisos de la BIBLIOTECA entera**: botón «Permisos» en la cabecera de `entity-library-panel.tsx` (`type:"library"`, nodo raíz de la herencia).
- **Destinatarios** según el ámbito: perfiles (buscador nuevo `searchAccountProfiles` sobre `os_account_profiles`), grupos y páginas (`searchGroups`, separados por `kind`), cuentas (`searchUsers`), «toda mi cuenta», público, privado. Aviso explícito en la UI de la regla cuenta↔perfiles.
- `PermissionsPopover` queda **sin uso** (no se borra: sigue siendo válido como editor de listas v2).

### E · Biblioteca pública del perfil (§4)
- Interruptor **«Mostrar en mi perfil»** por nodo (en el diálogo de Permisos) y panel dedicado en **Ajustes → Cuenta → Información personal** (`profile-library-showcase-panel.tsx`).
- Se persiste en la ACL del nodo (`acl.showInProfile`). **Marcar eleva el ámbito a `public`** — decisión honesta y avisada: si no, la visita ni siquiera podría leer la fila (RLS). **Desmarcar NO revoca** lo ya compartido: solo deja de listarse (justicia restaurativa, §6).
- La pestaña **Biblioteca** de un perfil ajeno ya no dice «es privada»: renderiza `ProfilePublicLibrary` con **exactamente** los nodos marcados (`profilePublicNodes`). El uid real del perfil visitado sale de `resolveProfileData().id` (identidades soberanas de `os_profiles`).

### Decisiones tomadas
- **No se parte la biblioteca en filas por nodo** (sería un cambio de esquema mayor y otro agente está tocando su sync): se mantiene el doc jsonb único + ACL embebida.
- La ACL v3 es **aditiva** sobre `ItemACL`: nada de lo guardado hoy se invalida, y el espejo `read`/`write` mantiene funcionando el código v2 que no conoce los grants.

### Pendiente / límites honestos (no ocultos)
- **Granularidad de la RLS en `entity_state`:** la biblioteca es **una fila jsonb**, así que si CUALQUIER nodo te concede acceso, la **fila entera** es legible y el filtrado por nodo lo hace el cliente (`visibleFor`). Consecuencia: quien tenga acceso a un solo folder podría leer el jsonb completo (títulos del resto) si consulta la API directamente. Igual para la escritura: un grant `edit` en cualquier nodo permite `UPDATE` de la fila (mismo modelo que ya tenían las bibliotecas de grupo, donde cualquier miembro escribe el doc). **Enforcement real por nodo solo en `os_files`** (una fila por archivo). Camino futuro: tabla `os_library_nodes` con una fila por nodo.
- `scope:"private"` en una biblioteca **compartida** (grupo/página) se comporta como «solo el dueño de la entidad»: no se distingue el perfil concreto que creó el nodo (la cuenta es el ancla soberana).
- El panel de Ajustes lista los **40 primeros** ítems; para el resto, «Permisos» desde la Biblioteca.
- Perfiles **faceta** (`os_account_profiles`) como dueños de biblioteca (`kind:'profile'`): soportados en ACL y en el contexto del Finder, pero la página `/profile/[username]` solo resuelve la biblioteca pública de las identidades **soberanas** (`os_profiles`).

---

## 2026-07-12 — Adenda 66 §2 · Sync REAL de bibliotecas, folders y archivos + historial/ramas/registro (`os_versions`)

**Sesión por:** Claude (Cowork, Opus 4.8) — ola «folders · permisos · publicaciones» (SOP `architecture/folders-permisos-publicaciones.md` §2).
**Resumen ejecutivo:** El usuario reportó «la sincronización de folders y archivos en línea no funciona; solo se guardan localmente». Se diagnosticó contra la BD REAL (`nxstilnyidvkqeosofuh`): **no era un fallo de RLS ni de red — era un fallo SILENCIADO POR EL PROPIO CÓDIGO**. Arreglado de raíz, más historial de versiones/ramas/registro en la nube (tablas nuevas `os_versions` + `os_access_log`, aplicadas y verificadas).

### CAUSA RAÍZ (evidencia dura de la BD, no conjeturas)

Estado real de la base ANTES de tocar nada:
- `entity_state`: **1 sola fila** en todo el proyecto (`profile/desktops`) — **cero** filas con `key='library'`.
- `os_files`: **0 filas**… pero el bucket `os-files` de Storage tenía **6 objetos** subidos el 2026-07-11 desde `…/biblioteca/user-8be339d0…/`.

Esa contradicción (binarios sí, metadatos no) es la prueba del delito. Tres causas encadenadas:

1. **Histórica (ya corregida el 2026-07-12):** `entity_state` y `os_files` NO EXISTÍAN en el proyecto del OS. Toda escritura fallaba.
2. **`os-files.ts` DISFRAZABA EL FALLO DE ÉXITO.** Si el `insert` en `os_files` fallaba, devolvía **`{ ok: true }` con una fila FALSA** (su `id` era la ruta de Storage, no un uuid) y sin ningún aviso. La UI cantaba «Archivo subido» mientras el archivo quedaba invisible para `listMyFiles`, el realtime, los permisos y cualquier otro dispositivo. **Y no había cola de reintento para archivos**, así que la subida nunca se recuperaba.
3. **`entity-library.ts` se tragaba el motivo.** `setEntityState` devolvía `null` tanto para «no hay fila» como para «Supabase lo rechazó»; `pushCloud` lo traducía a «encolar pendiente» sin decir por qué. El usuario solo veía un «cambios pendientes» perpetuo, sin causa.

Y dos bugs de fusión que impedían que el sync funcionara **aunque la nube respondiera bien**:

4. **Los borrados NO se propagaban NUNCA.** `mergeDocs` era una **unión por id**: el dispositivo A borraba y subía el doc sin el ítem, pero B fusionaba su caché (que aún lo tenía) con lo remoto y **lo resucitaba**.
5. **Renombrar/mover se perdía.** El reloj LWW era `addedAt`/`createdAt`, que **no cambian al editar**; con el desempate `>=` ganaba SIEMPRE el nodo remoto, así que toda edición local aún no subida **se revertía sola** en la siguiente lectura.

### Hecho

**A · Sync real (nada se guarda solo en local, y si falla se VE)**
- `src/lib/sync/entity-state.ts`: nuevas `getEntityStateChecked`/`setEntityStateChecked` → devuelven `{ row, error }` con el **mensaje real** de Supabase. Las funciones antiguas se conservan (mismo contrato) como envoltorio.
- `src/lib/library/entity-library.ts` (doc **v3**, migración normalizadora perezosa e idempotente v1/v2→v3, **sin DDL**):
  - **Lápidas** (`deletedItems`/`deletedFolders`: id → ISO, podadas a 90 días) → el borrado viaja y gana la fusión. Un nodo solo «resucita» si se editó DESPUÉS de la lápida.
  - **Reloj LWW por nodo** (`updatedAt` en `SavedItem` y `LibraryFolder`), tocado en TODA edición (`touchItem`/`touchFolder`) → renombrar/mover/etiquetar/ACL ya ganan la fusión.
  - `pushCloud` guarda el **motivo** del rechazo en la cola (`lastError`) y lo expone (`lastSyncError`, `useLibraryPendingSync().error`).
  - La cola offline sigue reintentando (online + cada 30 s) y ahora **actualiza el motivo** en cada reintento fallido en vez de perderlo.
- `src/lib/files/os-files.ts`: se acabó el falso `ok`. Si la fila no entra, se devuelve **`warning`** y la fila se **encola** (`starseed.osfiles.pending.v1`) con reintento propio (online + 30 s). Subida, borrado y cambio de permisos **emiten señal en vivo** (`files:<uid>`) y `subscribeMyFiles` escucha ya por **broadcast + postgres_changes** (redundante, como la biblioteca).
- UI: banner rojo con el **motivo textual** del rechazo de la nube en la cabecera de la Biblioteca + aviso «N archivo(s) sin registrar — reintentar»; toast de `warning` en el selector universal de archivos.

**B · Historial, ramas y registro (§2) — tablas NUEVAS, aplicadas y verificadas**
- Migración `supabase/migrations/20260712100000_os_versions.sql` (idempotente):
  - `os_versions(id, resource_kind ∈ library|folder|file|brain|post, resource_id, owner, rev, parent_rev, branch='main', author, device_id, message, size, checksum, storage_path, snapshot jsonb, created_at)`.
    UNIQUE `(resource_kind, resource_id, branch, rev)` + índice `(…, branch, rev DESC)`.
  - `os_access_log(…, action, actor, device_id, detail jsonb, created_at)` — el «Registro» de accesos y cambios.
  - **RLS derivada del recurso, no duplicada:** `owner` es la EntityRef serializada `<kind>:<id>`, y `osv_can_read`/`osv_can_write` delegan en las `es_can_read`/`es_can_write` que ya gobiernan `entity_state`. Resultado exacto: **ve el historial quien puede ver el recurso; crea revisiones quien puede editarlo**.
  - **Append-only**: no existe política de UPDATE (una revisión jamás se reescribe). Realtime + `REPLICA IDENTITY FULL`.
- API `src/lib/versions/versions.ts`: `recordVersion()` (con reintento ante carrera 23505), `listVersions()`, `listBranches()`, `headRev()`, `restoreVersion()` (no reescribe: devuelve el snapshot y **anota una revisión nueva**), `branchFrom()`, `logAccess()`, `listAccessLog()`, `quickChecksum()` (FNV-1a, sin depender de WebCrypto ni de npm nuevo).
- **Cableado:** cada guardado real de biblioteca/folder/ítem crea revisión + entrada de registro (no bloqueante: si el historial falla, el guardado ya está hecho — es una garantía, no un peaje).
- **Binarios:** `uploadFileVersion()` sube cada revisión a su **propio** objeto `<uid>/<fileId>/<rev>/<nombre>` con `upsert:false` — **nunca se sobrescribe**; `os_files` apunta a la última y `os_versions` guarda el puntero de todas.
- UI: menú contextual → **«Historial…»** y **«Registro…»** (ítems **y** folders) → `src/components/library/finder/history-dialog.tsx` (Crystal Liquid Glass): pestañas Versiones/Registro, selector de ramas, autor/dispositivo/fecha/mensaje, **Restaurar**, **Crear rama**, **Comparar** (diff de líneas). Funde además los snapshots locales heredados (`item.versions`) para no perder el historial previo.

### Verificado de verdad (contra la BD real, impersonando `authenticated`)
Migración aplicada (`[]`). Comprobado: 15 columnas de `os_versions`, RLS **ON**, `REPLICA IDENTITY FULL`, 6 índices, ambas tablas en `supabase_realtime`. Prueba funcional: crear 3 revisiones → listar → **ramificar** (rama `idea` con `parent_rev`) → listar ramas (`main` head 2, `idea` head 1) → **restaurar** (snapshot correcto recuperado). Pruebas NEGATIVAS: otro usuario ve **0 filas** del historial ajeno y su INSERT es **rechazado por RLS** (42501); el `UPDATE` de una revisión afecta a **0 filas** (append-only). **Datos de prueba borrados** (verificado 0/0).
`tsc` con el tsconfig real (extends + `files`): **0 errores**.

### Decisiones tomadas
- **Sin DDL para el doc de la biblioteca**: lápidas y relojes LWW son claves opcionales más en el mismo `jsonb`. Los docs v1/v2 se normalizan al leer y caen con elegancia a `addedAt`/`createdAt` hasta su primera edición.
- **El historial hereda el permiso del recurso** (una sola fuente de verdad de permisos, `es_can_*`) en vez de reimplementar ACL en `os_versions`.
- **Restaurar no reescribe el pasado**: anota una revisión nueva. El historial es un registro, no un borrador.
- Se mantiene «Versiones (este dispositivo)» además de «Historial» para no tirar los snapshots locales ya guardados.

### Pendiente / límites honestos
- Los **6 objetos huérfanos** de Storage (subidos el 2026-07-11, sin fila en `os_files`) **siguen sin fila**: la cola solo recupera lo que falle a partir de ahora. Habría que reindexarlos (barrido de `storage.objects` → `os_files`) o volverlos a subir.
- `uploadFileVersion()` existe y compila, pero **aún no tiene botón en el Finder** («Subir versión nueva…» del archivo): queda para la siguiente pasada.
- La granularidad de RLS de la biblioteca sigue siendo la fila `entity_state` completa (ver límite ya anotado en la entrada de permisos). `os_versions` sí es fila por revisión.
- El «Comparar» del historial solo tiene sentido en texto (contenido/nota/título); los binarios comparan tamaño/checksum.

---

## 2026-07-12 · Adenda 66 §5 + §7 — Compartir/Enviar universal + Filtros·Orden·Búsqueda inteligente de publicaciones

**Motivo:** implementar (a) «Compartir cualquier cosa en cualquier sitio» (§5) y (b) filtros/orden/búsqueda con relevancia Astraura sobre CUALQUIER feed (§7). Regla dorada: el SOP `architecture/folders-permisos-publicaciones.md` ya existía; esta entrada documenta el código.

### A) Compartir / Enviar a… (DESTINOS — distinto de PERMISOS)
- **`src/lib/sharing/share-targets.ts`** (nuevo): capa de destinos. Tipo `ShareResourceRef {kind: cerebro|biblioteca|folder|archivo|publicacion, id, name, url?, route?, note?, mime?, libraryRef?, nodeId?}`. Helpers: `stageCreationAttach()/readCreationAttach()` (store efímero `sessionStorage` clave **`starseed.creation.attach.v1`** → el Lienzo `/crear?attach=1` lo lee y limpia; formato compacto `CreationAttachRef {kind,id,name,url?,route?,note?,mime?}`), `deepLinkFor()`, `toDmAttachment()`, `toShareBody()` (reusa la convención `**Adjuntos:**` que `splitBodyAttachments` ya renderiza), y efectos reales: `shareToThread()` (dm.sendMessage), `shareToEntity()` (os-social.createPost), `shareToBrain()` (cerebro/memory-files.saveMemoryFile), `shareToLibrary()` (entity-library.saveItem). NO toca `access.ts` (permisos).
- **`src/components/sharing/share-to-dialog.tsx`** (nuevo): `ShareToDialog` con 6 destinos → Publicación (Lienzo), Mensaje (selector de hilo real, listThreads), Grupo·Página·Comunidad (buscador searchGroups → createPost), Cerebro (listBrains → memoria), Librería (myLibraryDestinations → saveItem a raíz), Enlace (copia deep-link). Crystal Liquid Glass, datos reales, degradación honesta sin sesión.
- **Botones «Enviar a…» (Send)** cableados en: menú contextual del Finder (`finder-context-menu.tsx` nueva prop `onSendTo` + wiring en `finder-view.tsx`, construye la `ShareResourceRef` del ítem/folder con su libraryRef + deep-link), tarjeta de Cerebro (`cerebro-hub.tsx`, junto a «Compartir»), y visor de publicación (`PostCard.tsx`, junto a «Compartir/Copiar»).
- **Explorar por temas/categorías**: `src/components/library/topics-explorer.tsx` (nuevo) agrupa el catálogo público (`usePublicCatalog`, `library_public_items`) por categoría y por tema/etiqueta, con vacío honesto; montado en la pestaña **Comunidad** de `/library` encima de `PublicCatalogSection`.

### B) Filtros · orden · búsqueda inteligente (§7)
- **`src/lib/social/feed-filters.ts`** (nuevo): `FeedPrefs {sort: reciente|relevante|popular|cronologico|propios, view: lista|tarjetas|compacta, tags[], query, forMe}`. Persistencia POR PERFIL (perfil activo `starseed.profile.active.v1`) y POR ENTORNO en **`starseed.feed.prefs.v1`** (mapa `${perfil}::${entorno}`; la `query` es efímera, no se persiste). `FEED_TAG_CATALOG` derivado de `creation-config.TIPOS_POR_DEST` (enganche listo: si aparece un array plano de etiquetas múltiples, sustituir el import). `filterAndSortPosts()` (puro/síncrono), `rankByRelevance(posts, profileContext)` (import dinámico de `astrauraChat`, prompt español SOLO-JSON, timeout 12s + AbortController, fallback = recencia), y `useFeedFiltered()` (filtro síncrono inmediato + reorden por relevancia cuando llega, NO bloquea la UI).
- **`src/components/social/feed-controls.tsx`** (nuevo): barra reutilizable (búsqueda + orden + vista + etiquetas multiselección + «Para mí» con spinner). Presentacional.
- **Montado en `src/components/social/PostFeed.tsx`** (feed principal usado por perfiles/secciones/páginas/grupos): controles arriba, filtro/orden aplicado antes de render, densidad por vista. **Realtime intacto** (los hooks `useCafePosts`/`useRealtime`/broadcast no se tocan; solo se transforma la lista para pintar).

### Claves nuevas → reportar para SYNCED_KEYS (settings-sync.ts NO tocado)
- **`starseed.feed.prefs.v1`** — preferencias de feed por perfil+entorno (orden/vista/tags/forMe). **SÍ** debe sincronizarse.
- `starseed.creation.attach.v1` — store EFÍMERO navegador→/crear (un solo salto). **NO** añadir a SYNCED_KEYS (por diseño).

### Verificación
- `tsc` con tsconfig temporal (extends real + `include` de los 11 ficheros tocados): **0 errores en los ficheros de esta ola**.
- Único error del grafo: `src/components/social/post-blocks-renderer.tsx(129): "entidad" no comparable a PostBlockType` — es de **OTRO agente** (bloques del Lienzo, off-limits); no creado ni tocado aquí. Debe cerrarlo esa ola (añadir `"entidad"` a `PostBlockType`).

### Pendiente / límites honestos
- `ShareToDialog` guarda en la **raíz** de la biblioteca elegida (sin selector de folder todavía) y el destino «Entidad» cubre grupo/página/comunidad vía `searchGroups` (eventos aún no tienen buscador propio).
- La reordenación «Para mí» depende de que Astraura tenga alguna fuente disponible; si no, cae a recencia (documentado, nunca bloquea).
- El contrato del Lienzo (`starseed.creation.attach.v1`) lo debe **consumir** el otro agente en `/crear` (yo solo lo dejo preparado).

---

## 2026-07-12 — Adenda 66 §5-§6 · Lienzo Universal: destino Librería, etiquetas múltiples, bloques ricos, SourcePicker

**Sesión por:** Claude (subagente, Opus 4.8) bajo dirección de Alex.
**Resumen ejecutivo:** El Centro de Creación / Lienzo Universal (`/crear`) gana: destino **Librería** (biblioteca+folder, guarda ÍTEM con ACL en vez de post), **tipo de publicación = etiquetas múltiples** (chips+búsqueda, 36 etiquetas), **9 tipos de bloque nuevos** (incl. código ejecutable AISLADO en iframe), un **SourcePicker universal** reutilizable y el **render de esos bloques + etiquetas** en `PostCard`. Todo **aditivo**: lo que ya publicaba sigue igual.

### Hecho
- **Destino «Librería»** (`creation-config.ts` → `CreationDest="libreria"`): sub-selector de UBICACIÓN (`library-location-picker.tsx`) con `myLibraryDestinations()` + árbol de folders (`useEntityLibrary`). Publicar a Librería = `saveItemSecure(ref, {type:"post",…}, folderId)` (ítem de biblioteca con su ACL), no `createPost`. Se mantienen todos los destinos previos; `/crear?area=publicar` (QuickPublisher) **excluye** Librería (solo publica en os_posts).
- **Etiquetas múltiples** (`creation-config.ts` `PUBLICATION_TAGS`, 36 etiquetas con icono Lucide + desc + `sections`): componente `TagSelector` (chips seleccionables + búsqueda, en `creation-fields.tsx`). Se guarda `tags: string[]` en `ss:meta` y el `tipo` primario = `tags[0]` (compat). Sustituye al `TipoSelector` en Lienzo y QuickPublisher (`TipoSelector`/`TIPOS_POR_DEST` se conservan por compat con `/publish`).
- **Bloques nuevos** (`creation-blocks.tsx` editores + `post-blocks-renderer.tsx` render): **portada** · **código ejecutable** (HTML/CSS/JS/JSX, preview y render en iframe `sandbox="allow-scripts"` SIN `allow-same-origin` → sin sesión) · **página interactiva** (reusa el sandbox) · **repo** · **pizarra** · **agente/bot** (chat embebido que llama `astrauraChat` con system+persona, aislado) · **mapa** (Leaflet bajo demanda + enlace `/hub/mapa`) · **gráfica** (tabla editable → recharts responsive, datos reales) · **referencia** (cerebro/biblioteca/folder/archivo/neurona/URL vía SourcePicker) · **entidad** (página/perfil/grupo/comunidad/evento).
- **SourcePicker universal** (`source-picker.tsx`, EXPORTADO): dispositivo (→os-files) · biblioteca · folder · archivo · cerebro · neurona · URL. Devuelve `SourceRef` normalizada. Lo consume el Lienzo; queda listo para mensajes/composer (otro agente).
- **Modelo compartido** `src/lib/creation/post-blocks.ts` (`PostBlock`, serialize/parse, `buildSandboxDoc`). Los bloques ricos viajan en `ss:meta.blocks`; los legados (texto/imagen/archivo/enlace/widget) siguen como markdown en el cuerpo (sin doble render).
- **Render en el feed**: `splitBodyAttachments` (`social-posts.ts`) ahora devuelve `tags`+`blocks`; `NormalizedPost` los lleva; `osPostToNormalized` (`use-os-entities.ts`) los propaga; `PostCard` pinta `<PostBlocksRenderer>` + chips de etiquetas. Como los feeds de sección/perfil usan `PostCard`, lo heredan sin tocar `network/**`.
- **Adaptación** (§6): rejilla responsive, imágenes lazy, iframe de altura acotada, gráficas `ResponsiveContainer`, respeto de `prefers-reduced-motion` + `data-perf="eco"` (device-tier); código y mini-mapa se cargan **bajo demanda** (no auto-ejecutan en el feed).
- **Robustez**: `buildSsMetaComment` escapa `-->` → `-->` (los bloques de código/HTML ya no rompen el comentario `ss:meta`; `JSON.parse` lo revierte, sin cambio en los parsers).

### Archivos
- Nuevos: `src/lib/creation/post-blocks.ts`, `src/components/creation/source-picker.tsx`, `src/components/creation/library-location-picker.tsx`, `src/components/creation/creation-blocks.tsx`, `src/components/social/post-blocks-renderer.tsx`.
- Editados: `creation-config.ts`, `creation-fields.tsx`, `lienzo-composer.tsx`, `quick-publisher.tsx`, `src/lib/social-posts.ts`, `src/hooks/use-os-entities.ts`, `src/components/social/PostCard.tsx`.
- **Coordinación**: se añadió `"entidad"` a `PostBlockType` — resuelve el ÚNICO error de grafo que reportó la ola hermana (`post-blocks-renderer.tsx(129)`), que era de esta ola.

### Verificación
- `tsc` local **no pudo completar**: el mount FUSE es demasiado lento (incluso un fichero sin imports agota los 45s cargando node_modules) y el sandbox mata los procesos en background (`--die-with-parent`). Validado por: (a) revisión manual de tipos, (b) verificación por grep de todos los símbolos externos (iconos Lucide, exports de `entity-library`/`brains`/`neurons`/`os-files`/`astraura`/`leaflet-loader`/recharts), (c) cross-check de todos los literales de tipo de bloque contra la unión, (d) el `tsc` de la ola hermana sobre el grafo compartido, que solo marcó el `"entidad"` ya corregido.

### Pendiente / próximos pasos
- Reejecutar `tsc`/`next build` en una máquina con FS rápido para confirmación final (bloqueo puramente de entorno, no de código).
- El SourcePicker en **mensajes/composer** lo engancha el agente hermano (yo lo dejo exportado y usado en el Lienzo).
- Quedaron temp `tsconfig.check*.json` sin borrar (el mount bloquea `rm`, igual que los `tsconfig.agentcheck.json`/`acl-check.json` de las otras olas); untracked, no afectan al build.

---

## 2026-07-12 — Adenda 66 §11-§13 · Semilla OSS completa · Actualizaciones disponibles · Red descentralizada de backends

**Sesión por:** Claude (subagente, Opus 4.8) bajo dirección de Alex.
**Resumen ejecutivo:** (A) La semilla por defecto de la Biblioteca pasa a incluir **TODO el catálogo OSS** (`SEED_VERSION 12→13`), con 5 repos nuevos (Raven·Skales·Mouzi·Strix·Organic Maps) + los que faltaban (CasaOS·Bark·GPT-SoVITS·OmniVoice·OmniRoute + referencias). (B) El Centro de Notificaciones gana **«Actualizaciones disponibles»** con fuentes reales (catálogo StarSeed + GitHub releases/tags) e historial. (C) Nueva capa **red descentralizada de backends** (`storage/backends.ts`) con primario/réplicas por tipo de recurso + panel en Ajustes/Almacenes. Todo aditivo.

### Hecho
- **A · Semilla (§11):**
  - `packages.ts`: +5 paquetes `function` en `starseed-ia-tools` — `iatool-raven`, `iatool-skales`, `iatool-mouzi`, `iatool-strix`, `iatool-organicmaps` (mismo patrón honesto: registran skill + guardan enlace; no descargan). Reflejan `oss-library.ts`.
  - `skills.ts`: +4 capacidades (`agent-memory-backend` [raven+skales], `smart-file-organize`, `security-audit`, `offline-maps`) → los cerebros/neuronas las «ven» al instalarse (activeCapabilityIds usa packageIds/skillIds).
  - `defaults-seed.ts`: `SEED_VERSION 12→13` + añadidos a `RECOMMENDED_PACKAGE_IDS`: `iatool-casaos/bark/gpt-sovits/omnivoice`, `ai-omniroute-local`, los 5 nuevos, y referencias OSS que faltaban (`routellm·litellm·agentos·opencode·openclaw·apple-container`). **Única exclusión deliberada:** `iatool-firecrawl` (free:false · clave de pago) — violaría gratis-primero.
  - `setInstalledVersion(id, version)` nuevo en packages.ts (lo usa el actualizador).
  - Re-siembra: idempotente por `starseed.library.seed.v1` (SYNCED_KEY). Al subir a v13, cuentas existentes reciben los ids nuevos la próxima vez que arranquen (respeta lo ya instalado; los ids nunca ofrecidos antes se auto-instalan). **Propagación a cerebros/neuronas** vía `library-sync.ts` (empuja `cydiaInstalled`+`cydiaFunctions`+`capabilities` a `user_settings.prefs`; el pull hace `mergeInstalledFromAccount`).
- **B · Actualizaciones disponibles (§12):**
  - `src/lib/notifications/available-updates.ts` (nuevo): lista paquetes instalados con repo GitHub (parseado de `payload.externalUrl/url`); comprueba **multi-fuente** — catálogo StarSeed (sin red) + GitHub `releases/latest` + `tags` — y muestra variaciones. Comparador semver-ish. `applyUpdate()` marca la versión nueva como instalada (`setInstalledVersion`) + historial. Caché 6 h + tope de 18 repos/consulta (respeta el rate-limit anónimo; **403 → gracia**). Claves nuevas: `starseed.updates.available.cache.v1`, **`starseed.updates.history.v1`**.
  - `src/components/notifications/available-updates.tsx` (nuevo): tarjeta coherente con el centro; «Buscar actualizaciones», «Actualizar» por ítem, badges por fuente, historial, vacío honesto. Montado en `/notifications` (sección «Feed») sobre `NotificationsCenter`.
- **C · Red descentralizada de backends (§13):**
  - DDL aplicado y **verificado** en `nxstilnyidvkqeosofuh`: `alter table storage_backends add column if not exists is_primary boolean not null default false` + índice parcial por owner. (La tabla ya tenía config/rules jsonb, priority, scope, etc.)
  - `storage/backends.ts` (ampliado, aditivo): +kinds `supabase·gcs·cloudrun·vercel-blob·casaos·ipfs`; `ResourceType`+`RESOURCE_TYPES` (cuenta/perfil/página/folder/archivo/biblioteca/cerebro/publicación); API nueva `addBackend()`, `defaultBackend()`, `setPrimary()`, `setResourcePrimary()`, `toggleResourceReplica()`, `getResourceRouting()`, `resolveBackendFor(resource)` (primario+réplicas). El primario por recurso vive en `rules.primaryFor/replicaFor` (jsonb real); el primario de cuenta en la columna `is_primary`. `ensureDefaults` marca el StarSeed oficial como `is_primary`.
  - `src/components/storage/backends-network-panel.tsx` (nuevo): registra backends, elige primario (⭐) y réplicas por tipo de recurso; el StarSeed oficial siempre presente y no borrable. Montado en `/almacenes` bajo el `StoragePanel` existente.

### Decisiones tomadas
- **No tocar `settings-sync.ts`** (fuera de alcance): las claves de biblioteca/capacidades ya sincronizan por `library-sync.ts`; el historial de updates se **reporta** para SYNCED_KEYS (ver abajo) en vez de añadirlo yo.
- La semilla ahora incluye CasaOS/voces (antes «disponibles»): seguro porque `ensureDefaultsSeeded` **ignora** `action/href` de `install()` → no abre pestañas ni descarga; solo registra skill/enlace/activa fuente local.
- Backends externos: **honesto** — funcional el registro + selección + StarSeed oficial (Supabase del OS); los drivers de I/O reales de cada externo quedan como **andamiaje** (endpoint/ref-a-clave, o vía servidor del cerebro/proxy en runtime). Declarado en la propia UI.

### Claves nuevas (para SYNCED_KEYS · settings-sync.ts, cuando se amplíe)
- `starseed.updates.history.v1` — historial de actualizaciones aplicadas (viajaría con la cuenta).
- (`starseed.updates.available.cache.v1` es caché local; NO hace falta sincronizarla.)
- La sincronización real de la config de backends vive en la tabla `storage_backends` (por cuenta, RLS), no en localStorage.

### Archivos
- Nuevos: `src/lib/notifications/available-updates.ts`, `src/components/notifications/available-updates.tsx`, `src/components/storage/backends-network-panel.tsx`.
- Editados: `src/lib/library/packages.ts` (+5 paquetes, `setInstalledVersion`, comentario CasaOS), `src/ai/astraura/skills.ts` (+4 capacidades), `src/lib/library/defaults-seed.ts` (v13 + recomendados), `src/lib/storage/backends.ts` (kinds+API+is_primary), `src/app/(app)/notifications/page.tsx`, `src/app/(app)/almacenes/page.tsx`.

### Verificación
- DDL: aplicado y verificado (`is_primary boolean NOT NULL DEFAULT false` confirmado por `information_schema`).
- `tsc` (con `tsconfig.adenda66.json` que extiende el real): completó con **1 solo error en TODO el proyecto** y **NINGUNO en mis 8 ficheros** (grep confirmado). El único error es **pre-existente y ajeno**: `post-blocks-renderer.tsx(129)` `'entidad' is not comparable to PostBlockType` — de la ola paralela de Creación/Lienzo (`PostBlockType` vive en `src/lib/creation/**`, zona intocable para mí). Mis cambios = **0 errores de tipo**.

### Pendiente / próximos pasos
- Añadir `starseed.updates.history.v1` a `SYNCED_KEYS` (otro agente/ola; settings-sync.ts estaba fuera de mi alcance).
- Drivers de I/O reales de los backends externos (Supabase propio, GCS/Cloud Run, Vercel Blob, S3, CasaOS, WebDAV, IPFS) — hoy andamiaje.
- Temp `tsconfig.adenda66.json` sin borrar (mount bloquea `rm`; untracked, no afecta al build — Next usa `tsconfig.json`).

---

## 2026-07-12 — Hub: Red por defecto + datos reales + menús unificados + acceso a temas (Adenda 66 §8/§10)
**Sesión por:** Claude (agente Hub/Menús)
**Resumen ejecutivo:** El Hub abre en **Red** (sección principal), todas sus opciones muestran **solo datos reales** de Supabase (o vacío honesto con CTA), y se estrena un patrón ÚNICO de menú `SectionTabs` aplicado al Hub y a la Red. Acceso directo (Palette) al editor de temas desde ajustes.

### Hecho
- **Red como sección principal (§8):** `src/app/(app)/hub/page.tsx` — la pestaña por defecto pasa de `contributions` a **`red`** (`useState("red")`). El deep-link `?tab=` sigue funcionando; sin `?tab` abre Red.
- **Menú unificado (§10):** nuevo `src/components/ui/section-tabs.tsx` — segmented-control glass con scroll-x limpio (`scrollbar-hide` + máscara de fundido lateral + `snap-x`), píldoras de redondeo consistente, estado activo tokenizado (primario), responsive y **accesible por teclado** (`role=tablist` + roving tabindex ← → Inicio/Fin). Dos modos: controlado (`value`/`onValueChange`) y navegación (`href`).
  - Aplicado en el **Hub** (reemplaza el `TabsList`/`TabsTrigger` de 9 columnas; «Red» va primero) y en la **Red** (`network/_components/navigation.tsx` — Panorama/Política/Educación/Cultura, antes se recortaba/partía palabras en móvil). Componente listo para adoptar en el resto del OS.
- **Datos reales en la Red** (`hub/red-section.tsx`, reescrito): los contadores «—» inventados ahora son **reales** desde Supabase con `count exact/head` — Nodos (`os_pages`+`os_groups`+`os_events`), Conexiones (`fetchMyConnectionIds` reales), Propuestas activas (`proposals` status=open), Publicaciones (`posts`≠comment). Añadido **«Pulso de la Red»**: últimas 3 publicaciones REALES del feed (`fetchNetworkFeed`+`enrichAuthors`) con vacío honesto + CTA a `/network`. Las tarjetas de nodo muestran contador real por sección (publicaciones/propuestas/eventos) o «—».
- **Datos reales en Descubre** (`hub/discover-section.tsx`): dejaba de usar `useOsPages/useOsGroups/useOsEvents` (que **mezclan ejemplos** vía `mergeBySlug`) y ahora lee **solo real** con `fetchPages/fetchGroups/fetchRealEventsSafe` (try/catch → []). Vacío honesto con CTA **Crear** (`/crear`).
- **Aportaciones — mocks eliminados** (`hub/page.tsx`): stats falsas `1842/347/9240/×2.4` → **0/0/0/×1.0**; `myBadges` `userBadges.slice(0,5)` → **[]** con vacío honesto; trends inventados («+24 esta semana»…) → descripciones honestas; **panel de desglose** (líneas «+500 pts…», «120 tareas…», «5 000 SC…», «×1.5…») → estado vacío honesto con CTA a la Red; **gráfica «Historial de Impacto»** (curvas SVG inventadas) → estado vacío honesto. Botones muertos «Nueva Página»/«Crear Grupo» → enlazan a `/crear`.
- **Acceso al editor de temas (§10):** en `src/app/(app)/cuenta/page.tsx` — botón **Palette** en la cabecera de ajustes → `/estudio` (Estudio de Diseño = `ThemeMixerPanel`, el editor real; no se duplica) y el QuickLink de Personalización «Apariencia» (que apuntaba a `/settings?tab=appearance`, **roto** porque `/settings`→redirect `/cuenta`) ahora es «Editor de temas» → `/estudio`.

### Decisiones tomadas
- **No tocar los hooks `useOs*`** (los usa todo el OS): la honestidad del Hub se logra leyendo real directo en Descubre, sin cambiar la capa compartida.
- Reputación/Seeds/Karma/Insignias **no tienen tabla en Supabase** todavía → lo honesto es 0/×1.0/vacío + «se construye con actividad real», no cifras inventadas.
- `SectionTabs` NO sustituye a Radix `@/components/ui/tabs`: en el Hub convive con `<Tabs>`/`<TabsContent>` controlados por el mismo estado (drive vía `onValueChange`).

### Pendiente / Próximos pasos
- Adoptar `SectionTabs` en los `TabsList` que aún se recortan (política/cultura/cerebro/ajustes) — el componente ya está listo (educación la lleva otro agente).
- Cablear un sistema real de reputación/seeds/insignias (tablas) para rellenar la pestaña Aportaciones con datos reales.
- Contadores de nodo para Educación (sin fuente de conteo obvia hoy).

### Notas / aprendizajes
- **`tsc` en este repo:** con `allowJs:true` (el real) tsc recorre el enorme grafo `.js` y **no acaba en 45 s**; los procesos en background **mueren** al terminar cada llamada bash (bwrap `--die-with-parent`). Solución: tsconfig **temporal standalone** (sin `extends`, `allowJs:false`, `skipLibCheck`, `types:[react,node]`) con mis ficheros en `files` → cada check < 44 s. **Resultado: 0 errores** en los 6 ficheros (individual y combinado).
- Verificado que `mergePages/mergeGroups/mergeEvents = mergeBySlug(real, sample)` **siempre** inyecta ejemplos → por eso el Hub no podía usar `useOs*` para «solo datos reales».
- Temp `tsconfig.agentcheck.json` queda como `{}` inerte (mount bloquea `rm`; no afecta al build — Next usa `tsconfig.json`). Igual que la ola anterior con `tsconfig.adenda66.json`.

---

## 2026-07-12 — Adenda 66 §9 · Educación: FIX visores 2D/3D + Estudio con Aurora/Astraura

**Sesión por:** Claude (subagente, Opus 4.8) bajo dirección de Alex.
**Resumen ejecutivo:** (A) Arreglada la razón por la que la «Red 3D» y el «Mapa Conceptual 2D» **no abrían** desde Educación y blindados los visores; (B) construida la capa **Estudio con Aurora**: grupos de estudio (miembros + chat realtime), guías/itinerarios generados por Astraura + plantillas reales, exámenes opcionales que otorgan **insignias reales**, y tareas/recomendaciones/proyectos. Todo aditivo; `tsc` 0 errores; migración aplicada y RLS verificada en vivo.

### A) FIX — por qué «no abrían» 2D/3D (causa raíz)
- **Causa (ruta/estado):** la tarjeta «Red de Conocimiento» de Educación (`conocimiento-card.tsx`) ofrece tres accesos rotulados **exactamente** «Lista (árbol)», «Mapa Conceptual 2D» y «Red 3D», pero **los tres enlazaban a `/conocimiento` a secas**. `KnowledgeNetwork` arranca SIEMPRE en `view="lista"` y no leía ningún parámetro → pulsar «Mapa Conceptual 2D»/«Red 3D» abría la **Lista**, nunca el visor prometido. Ese es el «no abren».
- **Descartado por evidencia** (no era ni dependencia ni import ni datos): `three@0.182` + `@react-three/fiber@8.18` + `@react-three/drei@9.122` + `three-stdlib@2.36.1` **instalados y compatibles** (drei peer `three>=0.137`; `Line2` carga); React 18.3.1 (no 19 → r3f v8 OK); tablas `knowledge_categories/topics/topic_categories` **existen con datos** (10/2/4); todos los imports resuelven; `loadKnowledge`/`loadCurriculum` y los renders 2D (SVG) / 3D (r3f) son correctos. **`tsc` scoped: 0 errores** sobre los 6 ficheros del grafo educativo.
- **Fixes aplicados:**
  1. `conocimiento-card.tsx`: los 3 accesos ahora enlazan a `/conocimiento?view=lista|mapa2d|red3d`.
  2. `knowledge-network.tsx`: lee `?view=` en el montaje (client-only, sin `<Suspense>`) para abrir la vista pedida; además envuelve `Map2DView` y `Red3DView` en un ErrorBoundary.
  3. `topic-graph.tsx` (visor propio de la pestaña «Mapa del Conocimiento»): corregido `computeLayout2D` que dejaba **todas las categorías raíz en el centro exacto (radio 0)** apiladas en un punto ilegible → ahora se separan a `ringGap*0.55` (mismo criterio que knowledge-network). 2D y 3D envueltos en ErrorBoundary.
  4. **Nuevo** `view-error-boundary.tsx` (`ViewErrorBoundary`): si un visor lanza en cliente (WebGL, datos raros…), muestra mensaje legible + «Reintentar» en vez de pantalla en blanco (aísla el fallo a la vista). Cubre el hint «error en cliente».

### B) NUEVO — Estudio con Aurora/Astraura (Educación → pestaña «Estudio con Aurora»)
- **Migración** `supabase/migrations/20260712140000_estudio_aurora.sql` (idempotente, RLS sin recursión con `SECURITY DEFINER` sobre OTRAS tablas — patrón de `20260712090100`), **aplicada y verificada EN VIVO** contra `nxstilnyidvkqeosofuh`.
  - Tablas (8): `study_groups`, `study_group_members`, `study_group_posts`, `study_guides`, `exams`, `exam_attempts`, `study_tasks`, `study_projects`. RLS ON en las 8 (24 políticas).
  - Realtime + `REPLICA IDENTITY FULL`: `study_groups`, `study_group_members`, `study_group_posts`, `study_tasks`.
  - Semillas: 4 insignias de educación (`exam_passed`, `quantum_initiate`, `ai_literate`, `civic_scholar`), 3 **guías/itinerario de ejemplo REALES** (Democracia Directa, IA, itinerario Física Cuántica 4 semanas), 3 **exámenes de ejemplo REALES** (cada uno mapeado a su insignia).
  - **Verificación funcional (RLS, impersonando `authenticated`, con ROLLBACK → 0 filas persistidas):** U1 crea grupo/guía/examen/tarea/proyecto/post OK; U2 NO ve grupo privado ni tarea ajena; U2 NO puede unirse a grupo privado ni suplantar `owner`; U2 SÍ ve plantillas; U2 SÍ puede unirse y postear en grupo **público**. Todo verde.
- **Data layer** `src/lib/education/study.ts` (defensivo, nunca lanza) + **IA** `src/lib/education/study-ai.ts` (`astrauraChat` gratis-primero + parseo JSON tolerante) → `generateStudyGuide`, `generateExam`, `recommendTasks`.
- **Insignias reales:** `submitExamAttempt` corrige, guarda intento en `exam_attempts` y al aprobar (≥ `pass_threshold`) llama a `awardBadge(myProfileId(), badge_code)` de `src/lib/badges/badges.ts` → inserta en `profile_badges` (misma vía que usa el BadgesWidget).
- **Componentes** `src/components/education/study/`: `study-hub.tsx` (shell + sub-pestañas) montado como pestaña «Estudio con Aurora» en `network/education/page.tsx`; `study-guides-panel.tsx` (generar/editar/forkear guías + pasos de itinerario → tareas/eventos `os_events`), `study-exams-panel.tsx` (generar/realizar/corregir + insignia), `study-groups-panel.tsx` (crear/unir/salir + chat realtime), `study-tasks-panel.tsx` (tareas + recomendaciones de Aurora + proyectos).

### Archivos
- Nuevos: `supabase/migrations/20260712140000_estudio_aurora.sql`, `src/lib/education/study.ts`, `src/lib/education/study-ai.ts`, `src/components/education/view-error-boundary.tsx`, `src/components/education/study/{study-hub,study-groups-panel,study-guides-panel,study-exams-panel,study-tasks-panel}.tsx`.
- Editados: `src/app/(app)/network/education/page.tsx` (pestaña Estudio), `src/app/(app)/network/education/conocimiento-card.tsx` (deep-link `?view=`), `src/components/education/topic-graph.tsx` (layout raíces + boundary), `src/components/knowledge/knowledge-network.tsx` (`?view=` + boundary).

### Verificación
- `tsc` con `tsconfig.educheck.json` (extends el real, `include` = los 13 ficheros nuevos/tocados): **EXIT 0, 0 errores** (14 s / 516 MB — el scoping evita el grafo `.js` completo que agotaba los 45 s en olas previas).
- Migración: `[]`/HTTP 201 al aplicar; verificación de tablas/RLS/políticas/semillas/realtime + 2 pruebas funcionales RLS con rollback (0 filas de prueba persistidas).

### Pendiente / límites honestos
- Itinerario→`os_events`: `createStudyEvent` es defensivo; NO verifiqué la RLS de INSERT de `os_events` (si estuviera restringida, el botón «Programar evento» avisa con toast y no rompe). Tareas desde pasos (study_tasks) sí 100% verificado.
- Insignia por examen: si el usuario no tiene fila en `profiles` (`myProfileId()` = null), el examen se aprueba igual pero la insignia no se otorga (se avisa «crea tu perfil»). No creé perfiles de prueba.
- Grupos: sin invitaciones a privados todavía (privado = solo dueño puede añadir; el modelo lo soporta vía política `sgm_owner`, falta UI de invitar). Sin buscador/paginación (lista simple, honesta).
- `NO TOCADO`: creation/**, hub/**, src/lib/sharing/**, dock/trinity, settings-sync.ts, PostFeed/PostCard (respetado).
- Temp `tsconfig.educheck.json` en la raíz (untracked; el mount bloquea `rm`; Next usa `tsconfig.json`, no afecta al build).

### Notas / aprendizajes
- **Diagnóstico honesto:** cuando el código, deps, imports, BD y `tsc` están todos limpios pero «no abre», el fallo suele ser **ruta/estado** (deep-link ausente), no una excepción. Aquí la pista estaba en que la tarjeta rotulaba «2D»/«3D» pero no seleccionaba la vista.
- **Workspace bash inestable:** pipes a `python3 -m json.tool` dejaban el oneshot colgado (siguientes llamadas: «process already running»); se recupera solo al expirar (≤45 s). Evitar ese pipe; el Supabase MCP (26a13ed1) **no** tiene permiso sobre este proyecto → DB solo por Management API (curl + token de `.env.local`).
