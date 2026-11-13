# Higgsfield en MetaGenesis, solo con aprobación · contrato y cola HGF1113

**Fecha:** 2026-11-13
**Destino en el repo:** `architecture/higgsfield-aprobado-1113.md`

## 1. Pedido de Maggasukha

Vincular la cuenta de Higgsfield de la Fundación (fundacionstarseed) a todas las herramientas de producción de
StarSeed:
- MetaGenesis, independiente de Claude;
- Claude y cualquier IDE o chat vinculado;
- el sistema de diseño y las memorias;
- la síntesis diaria.

**Usarla SOLO con su aprobación,** porque los créditos son limitados, y solo para proyectos elegidos de producción
oficial de contenido profesional.

## 2. Vías

- **Claude:** el conector `https://mcp.higgsfield.ai/mcp`. Lo reconecta Maggasukha con la cuenta de la Fundación.
- **MetaGenesis sin Claude:** el CLI oficial `@higgsfield/cli` (`higgsfield auth login`), que usa los créditos de la
  misma cuenta.
  - **La INSTALACIÓN y el INICIO DE SESIÓN del CLI en el A1 y en la Mac los hace Maggasukha o Claude con su visto
    bueno.** Ninguna tarea de esta ola instala nada ni inicia sesión.
- **La API de pago por uso** (console.higgsfield.ai) factura aparte y **no se usa**.

## 3. Reglas

1. **Nada se ejecuta en Higgsfield sin aprobación.**
   - Cada propuesta lleva proyecto oficial, pieza, modelo, el comando exacto del CLI, el número de tomas y los
     créditos estimados.
   - La aprobación guarda el hash del comando: si cambia, se aprueba de nuevo.
2. **Presupuesto por proyecto,** aprobado por Maggasukha.
   - Al llegar al 80 % se avisa; al 100 % se para.
3. **Nunca se repite una generación** para reintentar. Un fallo se informa y se vuelve a proponer.
4. **El CLI solo se llama a través de `higgsfield_aprobado.py`.** Ningún otro módulo, agente ni director lo invoca
   directamente.
5. **Marca:** el símbolo nunca se genera con IA; los colores, de los tokens; nada se publica sin su palabra; su
   nombre no aparece en el material oficial.
6. **Registro de gasto** en `starseed_memory_root/produccion/higgsfield/gasto.jsonl` (privado). Nunca en el repo
   público ni en Supabase.

## 3 bis. Estado al cerrar el 2026-11-13

- El bot del A1 (herramienta `peticiones_telegram`) ya **propone** piezas de Higgsfield con los créditos estimados en
  la síntesis (sección 5 quinquies) y nunca las ejecuta.
- El conector de Claude todavía apunta a una cuenta gratuita.
- El CLI aún no está instalado: la instalación quedó pendiente del visto bueno de Maggasukha.

## 5. Proyectos de StarSeed en Higgsfield (creados el 2026-11-13, workspace `cfecc5a9…`)

Cada proyecto tiene 4 carpetas: 01 Referencias, 02 Pruebas, 03 Aprobados y 04 Finales. El de marca tiene una quinta,
«05 Looks por fase de la Matriz». Cada descripción lleva su contexto y las reglas de marca.

| Clave | Proyecto | project_id |
|---|---|---|
| sistema-diseno | StarSeed · Sistema de diseño y marca | b229e2b5-9ec1-4a73-9ba2-917a0968d11b (Cinema; CLI b9c64503… archivado) |
| recorrido-os | StarSeed OS · Recorrido real | bdabaeff-723a-473a-932d-1582b0a15130 (Cinema; CLI 0a164695… archivado) |
| paz | Una solución para la paz | c7cc3bfb-9e4a-4c2e-acdf-d96e5603bdec |
| manifiesto | Manifiesto · La Revolución del Diseño | c2cd4e9f-92a5-477a-a873-6a57d4e703ed |
| fase-semilla | Fase Semilla · Centro social piloto | 51a10c6a-1a19-405f-a930-41e7e3b20a25 |
| videos-4-5 | Vídeos 4 y 5 · Valor, IA y sobreproducción | ddb86707-1f80-49d2-9a0b-d3f42d17eceb |
| personajes | Personajes icono de StarSeed | 7405688e-8491-4c88-be9c-cc3422cea04c |
| redes | Redes · shorts, reels y carruseles | ac48b50d-5877-4430-9ceb-45571dd08c8a |

Mapa con las carpetas: `~/.starseed/produccion/higgsfield/proyectos.json` en el A1.

**Visibilidad en la web (2026-11-13, 23:30 UTC):**
- La web de Higgsfield solo lista los proyectos de Cinema Studio (`surface: cinematic_studio`). Los demás aparecen
  en `higgsfield.ai/es/generate` › Proyectos.
- Los creados con el CLI (`surface: cli`) existen, pero no se ven.
- La pestaña Proyectos del perfil público solo enseña lo publicado, que requiere aprobación.
- El CLI 1.2.2 no puede elegir la superficie. Por eso los proyectos nuevos los crea **el conector de Claude** como
  Cinema Studio, y `cine.py` (A1) les pone metadatos y carpetas y archiva el CLI anterior.
- Los 6 que aún están en CLI se pasan cuando baje el límite de creación de Higgsfield (429).
- **HGF1113E no crea proyectos con el CLI.** Si una producción nueva necesita proyecto:
  - deja una petición «crear proyecto Cinema» en el buzón para Claude;
  - o usa la API con la sesión del CLI, si demuestra con una prueba que acepta `surface: cinematic_studio`.
  - Archivar es reversible; borrar nunca.

**Guardia en el A1 y en la Mac:**
- la gestión de proyectos pasa (list, get, create, update; carpetas y archivos salvo borrar);
- delete, archive y publication quedan bloqueados;
- generar exige `HIGGSFIELD_APROBACION`.

**Lo que se actualiza y aprende solo:**
- HGF1113E sincroniza los proyectos con las producciones de StarSeed;
- HGF1113F mantiene el catálogo de capacidades y costes;
- HGF1113G arma los briefs desde el sistema de diseño y aprende de cada aprobación.

## 4. Cola HGF1113

```json
{
"ola": "HGF1113",
"tareas": [
{
"id": "HGF1113A",
"ola": "HGF1113",
"titulo": "Higgsfield · registro de propuestas, aprobaciones y gasto",
"archivos": [
"scripts/puente/higgsfield_aprobado.py",
"scripts/puente/test_higgsfield_aprobado.py"
],
"depende": [],
"prompt": "Lee architecture/higgsfield-aprobado-1113.md. Crea higgsfield_aprobado.py, con núcleo PURO y E/S inyectable. Propuestas en starseed_memory_root/produccion/higgsfield/propuestas.json: id, proyecto, pieza, modelo, comando exacto del CLI `higgsfield`, tomas, créditos estimados y motivo. Aprobar guarda el sha256 del comando, quién y cuándo; rechazar; presupuestos por proyecto, con aviso al 80 % y parada al 100 %. ejecutar(id) SOLO corre si la aprobación existe y el hash coincide; invoca el CLI con subprocess (inyectable), registra el gasto real en gasto.jsonl y nunca reintenta. Si el CLI no está instalado o no hay sesión, devuelve un motivo claro sin fallar. Pruebas sin red: un comando cambiado no hereda la aprobación; sin aprobación no hay ejecución; al 100 % del presupuesto se para. Máximo 120 líneas por archivo."
},
{
"id": "HGF1113B",
"ola": "HGF1113",
"titulo": "Higgsfield · aprobar desde Telegram y Genesis",
"archivos": [
"scripts/puente/peticiones_telegram.py",
"scripts/puente/test_peticiones_telegram.py",
"scripts/puente/acciones-de-alex.py"
],
"depende": [
"HGF1113A"
],
"prompt": "Lee architecture/higgsfield-aprobado-1113.md. En el bot del repo (peticiones_telegram.py, PET1112A) añade: /higgsfield (lista las propuestas pendientes con créditos estimados, el presupuesto del proyecto y el gasto acumulado), /higgsfield aprobar <id>, /higgsfield rechazar <id> y /higgsfield presupuesto <proyecto> <créditos>. Al aprobar, ejecuta con higgsfield_aprobado.ejecutar y envía el resultado al chat y a Drive (carpeta del proyecto, cuenta alex-docs). Cuando un mensaje pida algo de Higgsfield, el bot NO genera: crea una propuesta con su estimación y pide aprobación. Las mismas propuestas aparecen en acciones-de-alex para Genesis. Pruebas sin red."
},
{
"id": "HGF1113C",
"ola": "HGF1113",
"titulo": "Higgsfield · propuestas desde la síntesis y los encargos",
"archivos": [
"scripts/puente/agente_sintesis.py",
"scripts/puente/test_agente_sintesis.py"
],
"depende": [
"HGF1113A"
],
"prompt": "Lee architecture/higgsfield-aprobado-1113.md. En la síntesis diaria añade la sección «Producción con Higgsfield»: como mucho 2 propuestas al día para proyectos oficiales (pieza, modelo, tomas y créditos estimados), registradas con higgsfield_aprobado como pendientes, marcadas REQUIERE APROBACIÓN y con el comando para aprobarlas (/higgsfield aprobar <id>). Nunca se ejecuta nada desde aquí. Respeta las reglas de marca (§3.5). Pruebas sin red."
},
{
"id": "HGF1113D",
"ola": "HGF1113",
"titulo": "Documentar Higgsfield con aprobación en memorias y guías",
"archivos": [
"memory/orquestacion-economica.md",
"memory/workflow-actual.md",
"CLAUDE.md",
"AGENTS.md"
],
"depende": [
"HGF1113B"
],
"prompt": "Lee architecture/higgsfield-aprobado-1113.md. En memory/orquestacion-economica.md añade Higgsfield como proveedor de PAGO con créditos limitados: solo con aprobación de Maggasukha, por presupuesto de proyecto, a través de higgsfield_aprobado.py; nunca para tareas rutinarias ni como respaldo automático de otros modelos. En CLAUDE.md y AGENTS.md añade «Higgsfield (solo con aprobación)» en 3 a 5 líneas: vías (el conector de Claude y el CLI en los nodos), regla de aprobación, presupuesto y marca. Añade también una entrada corta en memory/workflow-actual.md."
},
{
"id": "HGF1113E",
"ola": "HGF1113",
"titulo": "Higgsfield · sincronizar solo los proyectos de StarSeed",
"archivos": [
"scripts/puente/higgsfield_sync.py",
"scripts/puente/test_higgsfield_sync.py"
],
"depende": [],
"prompt": "Lee architecture/higgsfield-aprobado-1113.md (§3 bis y §5). Crea higgsfield_sync.py, que corre una vez al día en el líder con el CLI ya conectado. Usa SOLO órdenes que no gastan créditos: project list, get, create y update; project folders y assets, nunca delete. Mapa en ~/.starseed/produccion/higgsfield/proyectos.json (ya hay 8 proyectos con sus carpetas 01 Referencias, 02 Pruebas, 03 Aprobados y 04 Finales). (1) Lee las producciones de StarSeed en curso: el índice de vídeos en Drive (1J6UokADVb5FbQ5rSLKJrAwQPLbeUGD1ZpKPGS_XAuVQ, cuenta alex), los encargos del bot del A1 (~/.starseed/peticiones/encargos.json) y las propuestas de Higgsfield aprobadas. (2) Si una producción nueva pasa a «producción oficial» (aprobada por Maggasukha), crea su proyecto con las 4 carpetas, color y emoji válidos (cyan, slate, lime, violet, purple, pink o yellow) y una descripción con su fase de la Matriz, su carpeta de Drive y las reglas de marca. (3) Actualiza la descripción de los existentes con su estado actual. (4) Sube al proyecto «StarSeed · Sistema de diseño y marca», carpeta 01 Referencias, las referencias de marca aprobadas (carteles, redes, iconos de identidad/sistema-de-diseno-claude/sistema-de-diseno/assets), NUNCA el archivo del símbolo. Avisa de los cambios en el canal del Mando. Pruebas con un CLI falso, sin red."
},
{
"id": "HGF1113F",
"ola": "HGF1113",
"titulo": "Higgsfield · catálogo vivo de capacidades y costes",
"archivos": [
"scripts/puente/higgsfield_catalogo.py",
"scripts/puente/test_higgsfield_catalogo.py"
],
"depende": [],
"prompt": "Lee architecture/higgsfield-aprobado-1113.md. Crea higgsfield_catalogo.py, que corre una vez por semana en el líder. Con órdenes que no gastan créditos (model list --json por tipo, model get, preset, workflow list y generate cost) arma ~/.starseed/produccion/higgsfield/catalogo.json: modelos de imagen, vídeo y audio, workflows y presets, y el coste estimado de las piezas típicas de StarSeed (imagen de referencia, plano de vídeo de 5 y 10 s, voz, reencuadre). Marca las novedades frente a la semana anterior. Expón mejor_opcion(tipo_de_pieza, presupuesto), que da el modelo con mejor relación calidad/coste según el catálogo y el historial de aprobaciones (HGF1113G). Añade a la síntesis diaria, si hay novedades, una línea «Novedades de Higgsfield». Pruebas con un CLI falso, sin red."
},
{
"id": "HGF1113G",
"ola": "HGF1113",
"titulo": "Higgsfield · briefs desde el sistema de diseño que aprenden de cada aprobación",
"archivos": [
"scripts/puente/higgsfield_brief.py",
"scripts/puente/test_higgsfield_brief.py"
],
"depende": [
"HGF1113A"
],
"prompt": "Lee architecture/higgsfield-aprobado-1113.md y el sistema de diseño (starseed_memory_root/identidad/sistema-de-diseno-claude/sistema-de-diseno: tokens.json, design-system.json, 01-fundamentos.md, 04-movimiento.md, 08-capa-de-video.md). Crea higgsfield_brief.py: dado un proyecto del mapa, una pieza y una fase de la Matriz (Semilla, Fruto y Cosecha, Mente Digital), construye el prompt y el brief con la paleta de los tokens, la luz, la cámara y el movimiento de esa fase, los referentes de la Matriz y las restricciones (sin el símbolo ni logotipos; el símbolo se compone en posproducción). El resultado es la propuesta para higgsfield_aprobado, con coste estimado por higgsfield_catalogo. Aprendizaje: guarda en ~/.starseed/produccion/higgsfield/biblioteca.json cada prompt con su resultado (aprobado o rechazado por Maggasukha, nota y créditos) y prioriza los patrones aprobados por proyecto y fase. Pruebas sin red."
}
]
}
```
