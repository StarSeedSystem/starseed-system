#!/bin/bash
#
# Instalador de VibeASR.cpp para StarSeed OS
# Reconocimiento de voz ternario 1.58-bit (Microsoft VibeVoice-ASR-BitNet)
# Instala, compila y descarga modelos para el motor de voz local

set -euo pipefail

# Directorio base para motores de voz
DIR="${STARSEED_VOZ_DIR:-$HOME/.starseed/astraura-voice}/vibeasr.cpp"

# Modelos a descargar
VAE_MODEL_NAME="vibeasr-vae-encoder-i8_s.gguf"
LM_MODEL_NAME="vibeasr-lm-i2_s-embed-q6_k.gguf"
VAE_MODEL_URL="https://huggingface.co/microsoft/VibeVoice-ASR-BitNet/resolve/main/${VAE_MODEL_NAME}"
LM_MODEL_URL="https://huggingface.co/microsoft/VibeVoice-ASR-BitNet/resolve/main/${LM_MODEL_NAME}"

# Tamaños esperados en bytes
VAE_SIZE=703080064
LM_SIZE=992877600
TOTAL_SIZE=$((VAE_SIZE + LM_SIZE))

# Archivo de configuración de modelos
MODEL_CONFIG_FILE="$DIR/models/config.json"

# Variables de control
UPDATE=true
CONFIRM=true
SIMULATE=false
STATUS_ONLY=false
TEST_AUDIO=""

usage() {
    echo "Uso: $0 [opciones]"
    echo ""
    echo "Instala VibeASR.cpp (reconocimiento de voz 1.58-bit) en la neurona."
    echo ""
    echo "Opciones:"
    echo "  --sin-actualizar    No actualizar el repositorio si ya existe"
    echo "  --si                No pedir confirmación antes de descargar"
    echo "  --simular           Solo mostrar los pasos, sin ejecutar nada"
    echo "  --estado            Mostrar estado actual y salir"
    echo "  --prueba <archivo>  Probar el modelo con un archivo WAV"
    echo "  -h, --help          Mostrar esta ayuda"
    echo ""
    echo "Variables de entorno:"
    echo "  STARSEED_VOZ_DIR    Directorio base para motores de voz (por defecto: \$HOME/.starseed/astraura-voice)"
}

# Parsear argumentos
while [[ $# -gt 0 ]]; do
    case $1 in
        --sin-actualizar)
            UPDATE=false
            shift
            ;;
        --si)
            CONFIRM=false
            shift
            ;;
        --simular)
            SIMULATE=true
            shift
            ;;
        --estado)
            STATUS_ONLY=true
            shift
            ;;
        --prueba)
            TEST_AUDIO="$2"
            shift 2
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "Argumento desconocido: $1"
            usage
            exit 1
            ;;
    esac
done

# Función para imprimir mensajes
print_status() {
    if [ "$SIMULATE" = false ]; then
        echo "$1"
    else
        echo "[SIMULACIÓN] $1"
    fi
}

# Detectar número de CPUs para la compilación (-j)
# sysctl solo aplica en macOS; en Linux se usa nproc (sysctl -n hw.ncpu falla)
detect_num_cpus() {
    local num_cpus=4  # Valor por defecto
    if [[ "$OSTYPE" == "darwin"* ]] && command -v sysctl &> /dev/null; then
        num_cpus=$(sysctl -n hw.ncpu 2>/dev/null || echo 4)
    elif command -v nproc &> /dev/null; then
        num_cpus=$(nproc 2>/dev/null || echo 4)
    fi
    echo "$num_cpus"
}

# Verificar prerequisitos
check_prerequisites() {
    print_status "Verificando prerequisitos..."
    
    local missing_deps=()
    
    # Verificar git
    if ! command -v git &> /dev/null; then
        missing_deps+=("git")
    fi
    
    # Verificar cmake
    if ! command -v cmake &> /dev/null; then
        missing_deps+=("cmake")
    fi
    
    # Verificar compilador
    if ! command -v clang &> /dev/null && ! command -v gcc &> /dev/null; then
        missing_deps+=("compilador (clang o gcc)")
    fi
    
    # Verificar curl
    if ! command -v curl &> /dev/null; then
        missing_deps+=("curl")
    fi
    
    # Verificar número de CPUs
    if ! command -v sysctl &> /dev/null && ! command -v nproc &> /dev/null; then
        missing_deps+=("sysctl o nproc (para detectar CPUs)")
    fi
    
    if [ ${#missing_deps[@]} -ne 0 ]; then
        echo "Faltan dependencias: ${missing_deps[*]}"
        if [[ "$OSTYPE" == "darwin"* ]]; then
            echo "Sugerencia: Instale Xcode Command Line Tools con 'xcode-select --install'"
        fi
        exit 1
    fi
    
    print_status "✓ Todos los prerequisitos están disponibles"
}

# Verificar estado actual
check_status() {
    local cloned=false
    local submodule=false
    local compiled=false
    local models_downloaded=false
    local vae_exists=false
    local lm_exists=false
    local vae_size=0
    local lm_size=0
    
    if [ -d "$DIR" ] && [ -d "$DIR/.git" ]; then
        cloned=true
    fi
    
    # El submódulo 3rdparty/llama.cpp es necesario para compilar; su CMakeLists.txt
    # confirma que el submódulo se inicializó correctamente
    if [ -f "$DIR/3rdparty/llama.cpp/CMakeLists.txt" ]; then
        submodule=true
    fi
    
    if [ -f "$DIR/build/bin/asr_infer" ]; then
        compiled=true
    fi
    
    if [ -f "$DIR/models/$VAE_MODEL_NAME" ]; then
        vae_exists=true
        if command -v stat &> /dev/null; then
            if [[ "$OSTYPE" == "darwin"* ]]; then
                vae_size=$(stat -f%z "$DIR/models/$VAE_MODEL_NAME" 2>/dev/null || echo 0)
            else
                vae_size=$(stat -c%s "$DIR/models/$VAE_MODEL_NAME" 2>/dev/null || echo 0)
            fi
        fi
    fi
    
    if [ -f "$DIR/models/$LM_MODEL_NAME" ]; then
        lm_exists=true
        if command -v stat &> /dev/null; then
            if [[ "$OSTYPE" == "darwin"* ]]; then
                lm_size=$(stat -f%z "$DIR/models/$LM_MODEL_NAME" 2>/dev/null || echo 0)
            else
                lm_size=$(stat -c%s "$DIR/models/$LM_MODEL_NAME" 2>/dev/null || echo 0)
            fi
        fi
    fi
    
    if [ "$vae_exists" = true ] && [ "$lm_exists" = true ] && [ "$vae_size" -eq "$VAE_SIZE" ] && [ "$lm_size" -eq "$LM_SIZE" ]; then
        models_downloaded=true
    fi
    
    echo "Estado de VibeASR.cpp:"
    echo "  Directorio: $DIR"
    echo "  Clonado: $([ "$cloned" = true ] && echo "sí" || echo "no")"
    echo "  Submódulo llama.cpp: $([ "$submodule" = true ] && echo "sí" || echo "no")"
    echo "  Compilado: $([ "$compiled" = true ] && echo "sí" || echo "no")"
    echo "  Modelos descargados: $([ "$models_downloaded" = true ] && echo "sí" || echo "no")"
    if [ "$vae_exists" = true ]; then
        echo "    $VAE_MODEL_NAME: $vae_size bytes ($([ "$vae_size" -eq "$VAE_SIZE" ] && echo "correcto" || echo "incorrecto"))"
    fi
    if [ "$lm_exists" = true ]; then
        echo "    $LM_MODEL_NAME: $lm_size bytes ($([ "$lm_size" -eq "$LM_SIZE" ] && echo "correcto" || echo "incorrecto"))"
    fi
    
    if [ "$STATUS_ONLY" = true ]; then
        exit 0
    fi
}

# Clonar o actualizar repositorio
clone_or_update_repo() {
    if [ -d "$DIR" ]; then
        if [ "$UPDATE" = true ]; then
            print_status "Actualizando repositorio existente..."
            if [ "$SIMULATE" = false ]; then
                git -C "$DIR" pull --ff-only
                # Tras el pull se actualizan los submódulos (pueden apuntar a commits nuevos)
                git -C "$DIR" submodule update --init --recursive --depth 1
            else
                echo "[SIMULACIÓN] git -C \"$DIR\" pull --ff-only"
                echo "[SIMULACIÓN] git -C \"$DIR\" submodule update --init --recursive --depth 1"
            fi
        else
            print_status "Usando repositorio existente sin actualizar..."
        fi
    else
        print_status "Clonando repositorio VibeASR.cpp..."
        if [ "$SIMULATE" = false ]; then
            mkdir -p "$(dirname "$DIR")"
            # VibeASR.cpp trae 3rdparty/llama.cpp como submódulo; sin él cmake falla.
            # --recurse-submodules clona los submódulos y --shallow-submodules evita
            # descargar el historial completo de llama.cpp
            git clone --depth 1 --recurse-submodules --shallow-submodules \
                https://github.com/microsoft/VibeASR.cpp "$DIR"
            # Por si el recurse-submodules no llegara a inicializar todo el árbol
            git -C "$DIR" submodule update --init --recursive --depth 1
        else
            echo "[SIMULACIÓN] git clone --depth 1 --recurse-submodules --shallow-submodules https://github.com/microsoft/VibeASR.cpp \"$DIR\""
            echo "[SIMULACIÓN] git -C \"$DIR\" submodule update --init --recursive --depth 1"
        fi
    fi
}

# Compilar el proyecto
compile_project() {
    print_status "Compilando VibeASR.cpp..."
    
    if [ "$SIMULATE" = false ]; then
        cd "$DIR"
        
        # Antes de compilar se comprueba el submódulo 3rdparty/llama.cpp; si no está
        # inicializado cmake falla sin explicar bien la causa, así que fallamos antes
        if [ ! -f "$DIR/3rdparty/llama.cpp/CMakeLists.txt" ]; then
            echo "Error: El submódulo 3rdparty/llama.cpp no está presente en $DIR/3rdparty/llama.cpp"
            echo "Reinicie el script con --sin-actualizar o ejecute manualmente:"
            echo "  git -C \"$DIR\" submodule update --init --recursive --depth 1"
            exit 1
        fi
        
        # Detectar número de CPUs
        local num_cpus
        num_cpus=$(detect_num_cpus)
        
        # Construir proyecto
        cmake -B build -DCMAKE_BUILD_TYPE=Release
        cmake --build build -j"$num_cpus"
        
        # Verificar que el binario existe y es ejecutable
        if [ ! -f "build/bin/asr_infer" ]; then
            echo "Error: No se encontró el binario asr_infer después de la compilación"
            exit 1
        fi
        if [ ! -x "build/bin/asr_infer" ]; then
            echo "Error: El binario build/bin/asr_infer no es ejecutable"
            exit 1
        fi
    else
        echo "[SIMULACIÓN] cd \"$DIR\""
        echo "[SIMULACIÓN] Verificar existencia de $DIR/3rdparty/llama.cpp/CMakeLists.txt"
        echo "[SIMULACIÓN] cmake -B build -DCMAKE_BUILD_TYPE=Release"
        local num_cpus
        num_cpus=$(detect_num_cpus)
        echo "[SIMULACIÓN] cmake --build build -j$num_cpus"
        echo "[SIMULACIÓN] Verificar que build/bin/asr_infer existe y es ejecutable"
    fi
}

# Crear directorio de modelos y archivo de configuración
setup_models_dir() {
    print_status "Configurando directorio de modelos..."
    
    if [ "$SIMULATE" = false ]; then
        mkdir -p "$DIR/models"
        
        # Crear archivo de configuración de modelos
        cat > "$MODEL_CONFIG_FILE" << EOF
{
  "vibeasr_vae_model": "$VAE_MODEL_NAME",
  "vibeasr_lm_model": "$LM_MODEL_NAME",
  "vibeasr_vae_size": $VAE_SIZE,
  "vibeasr_lm_size": $LM_SIZE,
  "download_date": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
    else
        echo "[SIMULACIÓN] mkdir -p \"$DIR/models\""
        echo "[SIMULACIÓN] Crear archivo de configuración en \"$MODEL_CONFIG_FILE\""
    fi
}

# Descargar modelos
download_models() {
    print_status "Preparando para descargar modelos (tamaño total: $((TOTAL_SIZE / 1024 / 1024)) MB)..."
    
    # Confirmar descarga si no se especificó --si (en simulación no se descarga nada)
    if [ "$CONFIRM" = true ] && [ "$SIMULATE" = false ]; then
        read -p "¿Desea continuar con la descarga de los modelos? (s/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Ss]$ ]]; then
            echo "Descarga cancelada por el usuario."
            exit 0
        fi
    fi
    
    setup_models_dir
    
    # Descargar modelo VAE
    if [ "$SIMULATE" = false ]; then
        if [ ! -f "$DIR/models/$VAE_MODEL_NAME" ] || [ ! -s "$DIR/models/$VAE_MODEL_NAME" ]; then
            print_status "Descargando $VAE_MODEL_NAME..."
            curl -L --fail --retry 3 -C - "$VAE_MODEL_URL" -o "$DIR/models/$VAE_MODEL_NAME"
        else
            print_status "Saltando descarga de $VAE_MODEL_NAME (archivo ya existe)"
        fi
        
        # Verificar tamaño del modelo VAE
        local vae_actual_size
        if [[ "$OSTYPE" == "darwin"* ]]; then
            vae_actual_size=$(stat -f%z "$DIR/models/$VAE_MODEL_NAME")
        else
            vae_actual_size=$(stat -c%s "$DIR/models/$VAE_MODEL_NAME")
        fi
        
        if [ "$vae_actual_size" -ne "$VAE_SIZE" ]; then
            echo "Error: El tamaño del archivo $VAE_MODEL_NAME es incorrecto. Esperado: $VAE_SIZE, Actual: $vae_actual_size"
            exit 1
        fi
        print_status "✓ $VAE_MODEL_NAME descargado correctamente (${vae_actual_size} bytes)"
    else
        echo "[SIMULACIÓN] curl -L --fail --retry 3 -C - \"$VAE_MODEL_URL\" -o \"$DIR/models/$VAE_MODEL_NAME\""
        echo "[SIMULACIÓN] Verificar tamaño de \"$DIR/models/$VAE_MODEL_NAME\" ($VAE_SIZE bytes)"
    fi
    
    # Descargar modelo LM
    if [ "$SIMULATE" = false ]; then
        if [ ! -f "$DIR/models/$LM_MODEL_NAME" ] || [ ! -s "$DIR/models/$LM_MODEL_NAME" ]; then
            print_status "Descargando $LM_MODEL_NAME..."
            curl -L --fail --retry 3 -C - "$LM_MODEL_URL" -o "$DIR/models/$LM_MODEL_NAME"
        else
            print_status "Saltando descarga de $LM_MODEL_NAME (archivo ya existe)"
        fi
        
        # Verificar tamaño del modelo LM
        local lm_actual_size
        if [[ "$OSTYPE" == "darwin"* ]]; then
            lm_actual_size=$(stat -f%z "$DIR/models/$LM_MODEL_NAME")
        else
            lm_actual_size=$(stat -c%s "$DIR/models/$LM_MODEL_NAME")
        fi
        
        if [ "$lm_actual_size" -ne "$LM_SIZE" ]; then
            echo "Error: El tamaño del archivo $LM_MODEL_NAME es incorrecto. Esperado: $LM_SIZE, Actual: $lm_actual_size"
            exit 1
        fi
        print_status "✓ $LM_MODEL_NAME descargado correctamente (${lm_actual_size} bytes)"
    else
        echo "[SIMULACIÓN] curl -L --fail --retry 3 -C - \"$LM_MODEL_URL\" -o \"$DIR/models/$LM_MODEL_NAME\""
        echo "[SIMULACIÓN] Verificar tamaño de \"$DIR/models/$LM_MODEL_NAME\" ($LM_SIZE bytes)"
    fi
}

# Probar el modelo si se solicitó
test_model() {
    if [ -n "$TEST_AUDIO" ]; then
        if [ ! -f "$TEST_AUDIO" ]; then
            echo "Error: El archivo de audio para prueba no existe: $TEST_AUDIO"
            exit 1
        fi
        
        print_status "Probando modelo con archivo: $TEST_AUDIO"
        
        if [ "$SIMULATE" = false ]; then
            cd "$DIR"
            
            local model_path_vae="$DIR/models/$VAE_MODEL_NAME"
            local model_path_lm="$DIR/models/$LM_MODEL_NAME"
            
            echo "Ejecutando: build/bin/asr_infer --vae-model $model_path_vae --lm-model $model_path_lm --audio $TEST_AUDIO -t 3"
            build/bin/asr_infer --vae-model "$model_path_vae" --lm-model "$model_path_lm" --audio "$TEST_AUDIO" -t 3
        else
            echo "[SIMULACIÓN] cd \"$DIR\""
            echo "[SIMULACIÓN] build/bin/asr_infer --vae-model \"$DIR/models/$VAE_MODEL_NAME\" --lm-model \"$DIR/models/$LM_MODEL_NAME\" --audio \"$TEST_AUDIO\" -t 3"
        fi
    fi
}

# Función principal
main() {
    print_status "Iniciando instalación de VibeASR.cpp para StarSeed OS..."
    print_status "Directorio de instalación: $DIR"
    
    check_prerequisites
    check_status
    
    clone_or_update_repo
    compile_project
    download_models
    test_model
    
    print_status "¡Instalación de VibeASR.cpp completada exitosamente!"
    print_status "Ubicación: $DIR"
    print_status "Binario: $DIR/build/bin/asr_infer"
    print_status "Modelos: $DIR/models/"
}

# Ejecutar solo si no es modo simulación o estado
if [ "$STATUS_ONLY" = true ]; then
    check_status
else
    main
fi