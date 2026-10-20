# Plantilla de Contenedor GitHub Actions para StarSeed OS

Esta plantilla permite a cualquiera ejecutar tareas del orquestador de StarSeed OS en su propio repositorio usando GitHub Actions.

## ¿Qué hace este workflow?

Este workflow:
1. Se ejecuta manualmente (`workflow_dispatch`) o según un horario (`schedule`: cada 6 horas)
2. Descarga el código de StarSeed OS
3. Instala las dependencias necesarias
4. Ejecuta una tarea usando el orquestador de StarSeed OS
5. Devuelve el resultado como artefacto

## Cómo usarlo

### 1. Crear el repositorio

Cree un nuevo repositorio en GitHub donde quiera ejecutar las tareas de StarSeed OS.

### 2. Agregar la plantilla

Cree el directorio `.github/workflows/` en su repositorio y copie este archivo como `.github/workflows/starseed-motor.yml`:

```bash
mkdir -p .github/workflows
cp path/to/plantilla/github-actions.yml .github/workflows/starseed-motor.yml
```

### 3. Configurar el secreto necesario

Este workflow requiere un secreto llamado `STARSEED_MOTOR_TOKEN`:

1. Vaya a la configuración de su repositorio en GitHub
2. Navegue a **Settings → Secrets and variables → Actions**
3. Haga clic en **New repository secret**
4. Nombre: `STARSEED_MOTOR_TOKEN`
5. Valor: [Obtenga este token de su ámbito en StarSeed OS]
6. Haga clic en **Add secret**

### 4. Personalizar el workflow (opcional)

Puede modificar el archivo `.github/workflows/starseed-motor.yml` para:

- Cambiar la frecuencia de ejecución programada (por defecto: cada 6 horas)
- Especificar qué tarea ejecutar en lugar del placeholder
- Ajustar los recursos o tiempo límite según sus necesidades

## Límites del plan gratuito de GitHub

GitHub Actions ofrece:
- **Repositorios públicos**: Minutos ilimitados
- **Repositorios privados**: 2,000 minutos/mes gratuitos

Cada job en este workflow utiliza:
- Máquina virtual Ubuntu con 4 vCPU y 16 GB de RAM
- Tiempo máximo de 30 minutos por ejecución
- Consumo aproximado de minutos según el uso real

Consulte la documentación oficial de GitHub para detalles actualizados:
[Límites de GitHub Actions](https://docs.github.com/es/actions/using-github-actions/understanding-github-actions-limits)

## Seguridad

- El workflow solo solicita permisos mínimos (`contents: read`, `id-token: write`)
- El token `STARSEED_MOTOR_TOKEN` se almacena de forma segura como secreto de GitHub
- No se almacenan claves ni tokens en claro en el workflow
- La telemetría está desactivada por defecto

## ¿Cómo funciona?

Cuando se activa el workflow:
1. Descarga el código de StarSeed OS desde el repositorio oficial
2. Instala Node.js y las dependencias
3. Instala el orquestador de StarSeed OS (opencode-ai)
4. Configura el entorno con telemetría desactivada
5. Ejecuta el orquestador usando el token proporcionado
6. Subde los resultados como artefactos de GitHub Actions

## Soporte

Para obtener ayuda, consulte la documentación de StarSeed OS o abra un issue en el repositorio oficial.