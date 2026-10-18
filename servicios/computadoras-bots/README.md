# Servicio de computadoras de bots en el A1

## QUÉ es
Este servicio proporciona una computadora aislada para cada bot de Astraura, basado en el `agent-computer` y `supervisor` de openbot (CopilotKit/openbot, commit a4dce8c). Cada bot tiene su propio contenedor con navegador, perfil persistente y shell acotada para navegar, descargar y probar lo que no debe tocar el aparato de nadie.

## POR QUÉ hace falta
Los bots de Astraura necesitan un entorno aislado para ejecutar acciones que podrían ser inseguras o invasivas si se ejecutaran directamente en el dispositivo del usuario. Este servicio permite:
- Ejecutar código sintenticado por bots en un entorno seguro
- Mantener el aislamiento entre bots mediante contenedores separados
- Proporcionar a cada bot su propio navegador y espacio de trabajo
- Mantener los límites de CPU y memoria definidos para el A1

## CÓMO se instala
```bash
# Clonar el repositorio de openbot en el commit específico
git clone https://github.com/CopilotKit/openbot.git
cd openbot
git checkout a4dce8c

# Construir las imágenes Docker
docker compose -f servicios/computadoras-bots/compose.yml build

# Iniciar el servicio
docker compose -f servicios/computadoras-bots/compose.yml up -d
```

## CÓMO se apaga
```bash
docker compose -f servicios/computadoras-bots/compose.yml down
```

## CONSUMO
El A1 tiene asignados 2 OCPU y 12 GB de RAM para todo el sistema de bots.
Límites por computadora de bot:
- CPU: 0.5 OCPU
- Memoria: 1.5 GB
- Máximo 4 bots simultáneos

## NOTAS IMPORTANTES
- Nada de este servicio entra en el paquete del OS
- CopilotKit Intelligence NO se instala (telemetría apagada)
- Las claves se manejan únicamente por nombre de variable de entorno
- El supervisor escucha en 127.0.0.1 y usa una red de control interna
- El socket de Docker solo está accesible desde el supervisor