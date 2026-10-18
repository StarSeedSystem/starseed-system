# Astraura Bot Computer Service

## What is this?
This service provides an isolated cloud computer for each Astraura bot, enabling the bot to observe and react to the screen, code, brain files, and network, and to create and modify in real time with typed actions. Each bot gets its own secure computing environment.

## Why is this needed?
Each user can have multiple bots open and synchronized (their profile bot and bots from groups/pages), each with unique personality, senses, permissions, and memory. Group bots are governed democratically via PoliGenesis. Astraura local (Needle 3, Bonsai, BitNet, Jev, Laya) is the default runtime, while external APIs/bots (Grok, AG-UI) are guests. This service ensures each bot runs in isolation with guaranteed resources.

## How to install
1. Create a `.env` file in this directory:
   ```
   COMPUTER_TOKEN=your_computer_token_here
   SUPERVISOR_TOKEN=your_supervisor_token_here
   ```
   Obtain tokens from your secure token service (do not commit this file).

2. Start the service:
   ```bash
   docker compose up -d
   ```

3. Verify supervisor is running on host's 127.0.0.1:3000 (adjust port if needed).
   Agent computers will be provisioned on-demand by bots, up to 4 concurrent instances.

## How to shut down
```bash
docker compose down
```
This stops all agent computers and the supervisor, cleaning up resources.

## Resource consumption
- Each agent computer: 0.5 CPU, 1.5 GB RAM
- Maximum 4 agent computers running concurrently
- Peak usage: 2 CPU, 6 GB RAM (well within A1's 2 OCPU / 12 GB limit)

## Important notes
- This service runs alongside StarSeed OS but is not part of the OS package.
- CopilotKit Intelligence is NOT installed; we use only the agent computer and supervisor components from https://github.com/CopilotKit/openbot at commit a4dce8c (MIT licensed).
- All keys are supplied via environment variables; no secrets are stored in images or containers.
- Telemetry and tracking are explicitly disabled via environment variables.