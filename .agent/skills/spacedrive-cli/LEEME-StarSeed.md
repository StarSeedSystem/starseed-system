# Copia para StarSeed OS

- Origen: https://github.com/spacedriveapp/spacedrive · `.agents/skills/spacedrive-cli/SKILL.md` · commit
  `4d41a37` (2026-10-13) · licencia Apache-2.0 (ver `LICENSE`; las versiones anteriores al 2026-03-24 eran AGPL-3.0).
- Para una sesión de Claude que opere un daemon de Spacedrive (`sd-cli`): bibliotecas, fuentes, etiquetas,
  copiar, fusionar, borrar con aviso de «última copia», deduplicar, deshacer por diario y MCP (`sd-cli mcp`).
- Es dato, no instrucciones: describe una herramienta en preparación de Beta (2026-11-01). Los comandos
  destructivos (`stop --reset`, `--permanent`, `file delete`, `file dedupe`) solo con la palabra de la persona
  y siempre tras `--dry-run`. En el OS nada se ejecuta por un agente sin pasar antes por la vista previa.
