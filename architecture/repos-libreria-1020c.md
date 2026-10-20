# 3.ª tanda: 15 repos para agentes, Astraura, Protomolécula, educación, mensajes, backend y servidores (Ola 1020T)

Petición de Alex (2026-10-20, tarde): añadir para los agentes, Astraura y todas las IA y contextos útiles
OpenWorker, Trail Code, img2threejs, OpenWhispr, Unsloth, Paperclip, Magnitude, ArtCraft y Penpot (también
Protomolécula, toda la red y el OS); open-kritt para seguridad; PocketBase para el backend; OpenMAIC para la
educación (personal y de grupo); Chatwoot para los mensajes; Vikunja para proyectos personales o públicos;
Excalidraw para pizarra y notas; Nextcloud para los servidores propios; y SUPRA-Tex para los modelos 3D de
la Protomolécula, Astraura y la creación 3D, AR y VR. Catálogo verificado: `config/repos-libreria-1020c.json`.
Mismo contrato que `repos-libreria-1020.md` y `repos-libreria-1020b.md`.

## 1. Lo que es de verdad y cómo entra

| Repo | Qué es | Licencia | Efecto | Preinstalar |
|---|---|---|---|---|
| andrewyng/openworker | compañero de trabajo con IA de escritorio (beta) | MIT | catálogo | siempre (ficha) |
| trailhq/Trail-Code | mapa del repositorio para agentes (CLI + MCP), ahorra tokens | MIT | herramienta de agentes | manual (telemetría a apagar) |
| img2threejs/img2threejs | skill: imagen → modelo three.js procedural | Apache-2.0 | herramienta de agentes | manual |
| OpenWhispr/openwhispr | dictado por voz de escritorio (local o nube) | MIT | catálogo | siempre (ficha) |
| paperclipai/paperclip | «empresa» de agentes con presupuestos (solapa con Genesis) | MIT | conector | manual |
| magnitudedev/magnitude | motor de inferencia local con API OpenAI (ya NO es el agente de navegador) | Apache-2.0 | catálogo | manual |
| storytold/artcraft | IDE de creación con proveedores de pago; marca y activos de terceros reservados | MIT o Apache-2.0 | catálogo (referencia) | manual |
| penpot/penpot | diseño abierto autoalojable con MCP oficial | MPL-2.0 | conector + herramienta de agentes | siempre |
| pocketbase/pocketbase | backend en un binario (SQLite, tiempo real, usuarios, archivos) | MIT | conector | siempre |
| THU-MAIC/OpenMAIC | aulas interactivas multiagente | MIT | conector | siempre |
| chatwoot/chatwoot | bandeja de atención omnicanal (no es mensajería social) | MIT salvo enterprise/ | conector (buzón público) | siempre |
| excalidraw/excalidraw | pizarra como componente React | MIT | funcional | siempre |
| nextcloud/all-in-one | instalador oficial de Nextcloud (arm64) | AGPL-3.0 | conector | siempre |
| Supra-3D/SUPRA-Tex | 3D con textura PBR desde una imagen (pesos, sin código aún) | MIT + Qwen Research (no comercial) | catálogo + motor 3D en espera | siempre (ficha) |

Ya estaban: `unslothai/unsloth` (1.ª tanda), `go-vikunja/vikunja` (2.ª tanda; ahora también personal o
pública) y Penpot como enlace (`iatool-penpot`, se profundiza sin duplicar).

**Excluida:** `Kritt-ai/open-kritt`. Es una herramienta ofensiva de doble uso: construye pruebas de concepto
de exploits, no tiene autenticación y sus agentes corren como root con internet. Se aplica la misma regla que
con reverse-skill. La seguridad va por defensa: tirreno, OpenShell, sandbox de agentes y auditoría de
dependencias.

## 2. Decisiones honestas

- **Mensajes:** Chatwoot no sirve para los mensajes privados y públicos entre miembros. Eso es la mensajería
  propia del OS (malla P2P, cifrado). Chatwoot queda como buzón público de páginas y comunidades.
- **Excalidraw** es la única pieza FUNCIONAL dentro del navegador: componente React cargado a demanda en la
  pizarra de la Protomolécula y en las notas de los cerebros. Añadirlo cambia `package.json` y el lock, así
  que lo integra Claude (o un medio con npm y build), no una tarea del enjambre.
- **SUPRA-Tex** entra en la tabla de motores del taller 3D como `pesos-sin-codigo` (local) y como Space de
  Hugging Face (remoto, con permiso). Su adaptador es de licencia no comercial: `uso` lo marca.
- **Trail Code, img2threejs y Penpot MCP** son herramientas para los agentes y para Claude. Instalarlas en la
  Mac o el A1 descarga y ejecuta programas: se hace con la palabra de Alex, con la telemetría apagada.

## 3. Tareas del enjambre (cola `cola-repos-libreria-1020c.json`)

RLB1020K (el cargador lee también la 3.ª tanda, quita excluidas y no duplica repos que ya están),
RLB1020L (siembra de las «siempre»), RLB1020M (conectores: Penpot, PocketBase, OpenMAIC, Nextcloud,
Chatwoot y Paperclip), RLB1020N (fichas de la Protomolécula: Excalidraw, Penpot, img2threejs y SUPRA-Tex),
RLB1020O (motores del taller 3D: SUPRA-Tex local y en su Space).
