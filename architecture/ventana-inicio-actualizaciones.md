# Ventana unificada de inicio / actualizaciones — Astraura + OmniVoice (Adenda 111)

Ventana emergente que aparece en la **primera entrada** de una neurona y **reaparece** cuando
cambian los catálogos usados (nuevos modelos de LLM/voz o nuevas fuentes/integraciones). Unifica en
una sola ventana: las capacidades detectadas, la **selección automática** de LLM y voz recomendada
para esa neurona (Adenda 109), las **fuentes nuevas** (Adenda 110) y las **preferencias de cuenta**
(auto-actualización por defecto ON, estrategia local/servidor). Es el roadmap item #1 del mega-encargo.

## Piezas
- `src/lib/astraura/startup-updates.ts` (NUEVO, puro): estado por neurona en `starseed.astraura.startup.v1`
  (viaja con la cuenta vía settings-sync). Funciones:
  - `catalogSignature()` — firma estable del catálogo (ids de modelos 109 + integraciones 110 +
    `REGISTRY_REVIEWED`, con hash djb2). Cambia si aparecen/desaparecen modelos o fuentes.
  - `shouldShowUpdates(now)` — true en primera ejecución (`firstRunDone` falso) o si la firma vista
    difiere de la actual, salvo `snoozeUntil` vigente.
  - `updateReason()` — `primera-vez` | `novedades` | `al-dia` (encabezado del modal).
  - `markUpdatesSeen(prefs)` — guarda `autoUpdate`/`strategy`, fija `lastSig`/`lastCatalog` al actual,
    `firstRunDone=true`, limpia snooze.
  - `snoozeUpdates(ms=24h)` — "recordar luego".
  - `newIntegrationsSince()` / `newModelIdsSince()` — novedades respecto al `lastCatalog` visto (vacío
    en la primera ejecución: no infla falsas novedades).
  - `openStartupUpdates()` / `subscribeStartupOpen()` — apertura manual por evento.
- `src/components/astraura/startup-updates-modal.tsx` (NUEVO): modal centrado (`max-w-[560px]`,
  `max-h-[88dvh]`, cuerpo scrollable — no desborda). Muestra capacidades + gama (109), **Probar
  entorno** (conexión + adaptador WebGPU real), selección automática de LLM y voz (con racional),
  novedades (fuentes/enlaces + nº de modelos nuevos), preferencias (switch auto-actualización +
  estrategia auto/local/servidor) y enlaces a `/agent?tab=neuronas` y `/agent?tab=integraciones`.
  Acciones: **Aplicar y continuar** (`markUpdatesSeen` con prefs) · **Recordar luego** (`snooze`).
- **Montaje global**: `src/app/(app)/app-providers.tsx` (junto a `AuroraIntro`, post-auth) monta
  `<StartupUpdatesModal />`. Auto-abre ~1,2 s tras cargar si `shouldShowUpdates()`. Expuesto
  `window.openAstrauraStartup()` (paridad con `openAuroraSetup`) para abrirlo desde ajustes o una
  notificación.

## Comportamiento
- **Primera entrada** de una neurona → aparece con selección automática por hardware; el usuario
  aplica o pospone. Tras aplicar/posponer no vuelve a molestar hasta que cambie el catálogo.
- **Novedades** (nuevos modelos/fuentes → cambia `catalogSignature`) → reaparece con motivo
  "novedades" y lista lo nuevo desde la última visita.
- **Anti-nag**: `snooze` (24 h) y `markUpdatesSeen` fijan el estado; SSR-safe (no renderiza en
  servidor; decide tras montar → sin desajuste de hidratación).

## Verificación
`scripts/test-startup-updates.ts` (21/21): firma determinista, catálogo prefijado (>90 ids), estado
por defecto (auto-update ON, estrategia auto), primera vez muestra, snooze suprime y expira, marcar
visto persiste prefs y silencia, catálogo cambiado reaparece con motivo novedades, `newIntegrations/
newModelIds` detectan omisiones sin inflar en la primera ejecución.

## Pendiente / próximos pasos
- Aplicar la estrategia/selección directamente a la config real de voz (`voice-config`) y LLM
  (`router`) además de guardar la preferencia (hoy `handleApply` en el modal llama a `saveModelPreferences`
  ✅, que persiste las prefs y `startup-updates.ts` reconoce el catálogo; el motor lee las prefs
  existentes). (hecho: persiste prefs + reconoce catálogo + enlaza a Neuronas/Integraciones,
  `src/components/astraura/astraura-omnivoice-config.tsx` + `src/lib/astraura/model-preferences.ts`,
  9b3bed477)
- Instalación de modelos locales desde el propio modal (roadmap item #3: descarga en segundo plano +
  notificaciones + gating por instalación del OS). (a medias: hay `install-model-modal.tsx` y el gestor
  de descargas `model-downloads.ts` con test asociado, pero el modal no está integrado dentro de
  `startup-updates-modal.tsx`, 9b3bed477)
- Auto-actualización efectiva (cuando `autoUpdate` está ON) aplicando el nuevo top sin intervención.
  (hecho: `auto-actualizar-modelos.ts` + `AutoUpdateWatcher` montado en el layout raíz, 9b3bed477)

*Relacionado: 109 (capacidades + recomendador de modelos), 110 (registro de integraciones),
`astraura-inteligencia.md`.*
