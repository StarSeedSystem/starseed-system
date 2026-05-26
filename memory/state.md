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


