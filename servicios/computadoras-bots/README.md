# Computadoras de Bots (A1)

Servicio de computación aislada para bots de Astraura basado en `openbot` (MIT). Proporciona a cada bot un entorno seguro con navegador, archivos y terminal.

## Qué es y por qué hace falta

Cada bot de Astraura requiere un entorno de ejecución aislado para interactuar con la web y realizar tareas sin comprometer el sistema anfitrión. Este servicio utiliza `supervisor` para gestionar contenedores `agent-computer` individuales por bot.

- **Aislamiento**: Un contenedor por bot (opcionalmente con gVisor/runsc).
- **Seguridad**: Política de red `allowlist_only` y telemetría de CopilotKit desactivada.
- **Eficiencia**: Límites estrictos de CPU (0.5) y Memoria (1.5GB) para optimizar el uso del A1 (2 OCPU / 12 GB total). Max 4 bots simultáneos recomendados.

## Instalación y Uso

### 1. Preparar el entorno
Crea un archivo `.env` (no versionado) en esta carpeta:
```bash
SUPERVISOR_TOKEN=tu_token_seguro_aqui
COMPUTER_TOKEN=tu_token_seguro_aqui
```

### 2. Desplegar
```bash
docker compose up -d
```

### 3. Detener
```bash
docker compose down
```

## Configuración y Límites
- **Telemetría**: Desactivada (`COPILOTKIT_TELEMETRY_DISABLED=true`, `DO_NOT_TRACK=1`).
- **Red**: Controlada por `politica.json` (solo dominios del OS y Biblioteca permitidos por defecto).
- **Consumo**: ~1.5 GB RAM por bot activo. El supervisor apaga contenedores inactivos automáticamente.

> **Nota**: CopilotKit Intelligence NO se instala. El OS utiliza sus propios cerebros y modelos locales.
