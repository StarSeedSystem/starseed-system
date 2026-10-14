import { 
  recordar, 
  recuerdos, 
  regularAhora, 
  transferir 
} from "../memoria-cerebro";
import { 
  saveMemoryFile, 
  updateMemoryContent, 
  listMemoryFiles,
  deleteMemoryFile
} from "@/lib/cerebro/memory-files";
import { 
  writeMemoryContentResilient 
} from "@/lib/brains/memory-offline";
import { 
  memoriaVisible, 
  puedeEscribirMemoria
} from "@/lib/astraura-bots/permisos";
import { 
  actorDeBot 
} from "@/lib/astraura-bots/permisos";
import { 
  AlcanceMemoria 
} from "@/lib/nucleo/alcance-memoria";
import { 
  regular, 
  cuotaPara
} from "@/lib/astraura-bots/memoria-bot";
import { 
  esBotDeEntidad 
} from "@/lib/astraura-bots/tipos";

// Mock the dependencies using Vitest
vi.mock("@/lib/cerebro/memory-files");
vi.mock("@/lib/brains/memory-offline");
vi.mock("@/lib/astraura-bots/permisos");
vi.mock("@/lib/astraura-bots/memoria-bot");
vi.mock("@/lib/astraura-bots/tipos");
vi.mock("@/lib/network/archivos-malla");

const mockSaveMemoryFile = vi.mocked(saveMemoryFile);
const mockUpdateMemoryContent = vi.mocked(updateMemoryContent);
const mockListMemoryFiles = vi.mocked(listMemoryFiles);
const mockDeleteMemoryFile = vi.mocked(deleteMemoryFile);
const mockWriteMemoryContentResilient = vi.mocked(writeMemoryContentResilient);
const mockMemoriaVisible = vi.mocked(memoriaVisible);
const mockPuedeEscribirMemoria = vi.mocked(puedeEscribirMemoria);
const mockActorDeBot = vi.mocked(actorDeBot);
const mockRegular = vi.mocked(regular);
const mockCuotaPara = vi.mocked(cuotaPara);
const mockEsBotDeEntidad = vi.mocked(esBotDeEntidad);
const mockMotorArchivosCompartido = vi.fn();

describe("memoria-cerebro adaptador", () => {
  const brainId = "test-brain-id";
  const bot: any = {
    id: "test-bot-id",
    dueno: {
      id: "test-dueno-id",
      tipo: "perfil",
      cuentaId: "test-cuenta-id"
    },
    activo: true,
    sentidosHabilitados: [],
    gobierno: "jerarquico",
    origen: "astraura",
    personalidad: {},
    cuerpo: {
      forma: "orbe",
      tono: 0,
      escala: 1
    }
  };

  const dep = { brainId };

  beforeEach(() => {
    vi.clearAllMocks();
  });

   describe("recordar", () => {
     it("should throw an error if the bot cannot write to the alcance", async () => {
       mockPuedeEscribirMemoria.mockReturnValue(false);
       await expect(recordar(bot, "personal", "test texto", dep)).rejects.toThrow("El bot no tiene permiso para escribir en el alcance personal");
     });

     it("should save a memory file when permission is granted", async () => {
       mockPuedeEscribirMemoria.mockReturnValue(true);
       const mockSavedFile = {
         id: "saved-file-id",
         brain_id: brainId,
         name: "recuerdo-test.md",
         content: "",
         source: "starseed",
         meta: {},
         sync: false,
         updated_at: new Date().toISOString()
       };
       mockSaveMemoryFile.mockResolvedValue(mockSavedFile);

       await recordar(bot, "personal", "test texto", dep);

       expect(mockSaveMemoryFile).toHaveBeenCalledWith(
         expect.objectContaining({
           brain_id: brainId,
           content: "",
           source: "starseed",
           meta: {},
           sync: false
         })
       );
       const firstArg = mockSaveMemoryFile.mock.calls[0][0];
       expect(firstArg.name).toMatch(/^recuerdo-[a-z0-9\-]+\.md$/);

       // Check that writeMemoryContentResilient was called with the saved file's id and the correct content
       expect(mockWriteMemoryContentResilient).toHaveBeenCalledWith(
         {
           id: mockSavedFile.id,
           brain_id: mockSavedFile.brain_id,
           name: mockSavedFile.name,
           updated_at: mockSavedFile.updated_at
         },
         expect.any(String)
       );
     });

     it("should set groupId when bot is an entity bot and alcance is grupo", async () => {
       mockPuedeEscribirMemoria.mockReturnValue(true);
       mockEsBotDeEntidad.mockReturnValue(true);
       const mockSavedFile = {
         id: "saved-file-id",
         brain_id: brainId,
         name: "recuerdo-test.md",
         content: "",
         source: "starseed",
         meta: {},
         sync: false,
         updated_at: new Date().toISOString()
       };
       mockSaveMemoryFile.mockResolvedValue(mockSavedFile);

       const grupoBot = {
         ...bot,
         dueno: {
           ...bot.dueno,
           tipo: "grupo",
           id: "test-group-id"
         }
       };

       await recordar(grupoBot, "grupo", "test texto", dep);

       const firstArg = mockSaveMemoryFile.mock.calls[0][0];
       expect(firstArg.name).toMatch(/^recuerdo-[a-z0-9\-]+\.md$/);

       // Check that writeMemoryContentResilient was called with the saved file's id and the correct content
       expect(mockWriteMemoryContentResilient).toHaveBeenCalledWith(
         {
           id: mockSavedFile.id,
           brain_id: mockSavedFile.brain_id,
           name: mockSavedFile.name,
           updated_at: mockSavedFile.updated_at
         },
         expect.stringContaining('"grupoId":"test-group-id"')
       );
     });
   });

  describe("recuerdos", () => {
    it("should return an empty list when there are no memory files", async () => {
      mockListMemoryFiles.mockResolvedValue([]);
      mockMemoriaVisible.mockReturnValue(["personal", "perfil", "grupo", "publica"]);

      const result = await recuerdos(bot, "test", dep);
      expect(result).toEqual([]);
    });

    it("should return memories that match the consulta", async () => {
      const mockFiles = [
        {
          id: "file1",
          brain_id: brainId,
          name: "recuerdo-1.md",
          content: "---\nrecuerdo: {\"id\":\"id1\",\"alcance\":\"personal\",\"texto\":\"hello world\",\"origen\":\"desconocido\",\"at\":1000,\"etiquetas\":[]}\n---\n# Recuerdo de bot\n\nhello world\n",
          source: "starseed",
          meta: {},
          sync: false,
          updated_at: new Date().toISOString()
        },
        {
          id: "file2",
          brain_id: brainId,
          name: "recuerdo-2.md",
          content: "---\nrecuerdo: {\"id\":\"id2\",\"alcance\":\"personal\",\"texto\":\"foo bar\",\"origen\":\"desconocido\",\"at\":2000,\"etiquetas\":[]}\n---\n# Recuerdo de bot\n\nfoo bar\n",
          source: "starseed",
          meta: {},
          sync: false,
          updated_at: new Date().toISOString()
        }
      ];
      mockListMemoryFiles.mockResolvedValue(mockFiles);
      mockMemoriaVisible.mockReturnValue(["personal", "perfil", "grupo", "publica"]);

      const result = await recuerdos(bot, "hello", dep);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("id1");
      expect(result[0].texto).toBe("hello world");
    });

    it("should filter by visible alcances", async () => {
      const mockFiles = [
        {
          id: "file1",
          brain_id: brainId,
          name: "recuerdo-1.md",
          content: "---\nrecuerdo: {\"id\":\"id1\",\"alcance\":\"personal\",\"texto\":\"secret\",\"origen\":\"desconocido\",\"at\":1000,\"etiquetas\":[]}\n---\n# Recuerdo de bot\n\nsecret\n",
          source: "starseed",
          meta: {},
          sync: false,
          updated_at: new Date().toISOString()
        }
      ];
      mockListMemoryFiles.mockResolvedValue(mockFiles);
      // Mock that the bot can only see public memory
      mockMemoriaVisible.mockReturnValue(["publica"]);

      const result = await recuerdos(bot, "secret", dep);
      expect(result).toHaveLength(0);
    });
  });

  describe("regularAhora", () => {
    it("should call regular with the correct parameters and delete forgotten memories", async () => {
      const mockFiles = [
        {
          id: "file1",
          brain_id: brainId,
          name: "recuerdo-1.md",
          content: "---\nrecuerdo: {\"id\":\"id1\",\"alcance\":\"personal\",\"texto\":\"memoria1\",\"origen\":\"desconocido\",\"at\":1000,\"etiquetas\":[],\"botId\":\"bot-id\",\"bytes\":10,\"usos\":0,\"fijado\":false}\n---\n# Recuerdo de bot\n\nmemoria1\n",
          source: "starseed",
          meta: {},
          sync: false,
          updated_at: new Date().toISOString()
        },
        {
          id: "file2",
          brain_id: brainId,
          name: "recuerdo-2.md",
          content: "---\nrecuerdo: {\"id\":\"id2\",\"alcance\":\"personal\",\"texto\":\"memoria2\",\"origen\":\"desconocido\",\"at\":2000,\"etiquetas\":[],\"botId\":\"bot-id\",\"bytes\":10,\"usos\":0,\"fijado\":false}\n---\n# Recuerdo de bot\n\nmemoria2\n",
          source: "starseed",
          meta: {},
          sync: false,
          updated_at: new Date().toISOString()
        }
      ];
      mockListMemoryFiles.mockResolvedValue(mockFiles);

      // Create the recuerdo objects from the mockFiles
      const recuerdo1 = {
        id: "id1",
        alcance: "personal",
        texto: "memoria1",
        origen: "desconocido",
        at: 1000,
        etiquetas: [],
        botId: "bot-id",
        bytes: 10,
        usos: 0,
        fijado: false,
        grupoId: undefined
      };
      const recuerdo2 = {
        id: "id2",
        alcance: "personal",
        texto: "memoria2",
        origen: "desconocido",
        at: 2000,
        etiquetas: [],
        botId: "bot-id",
        bytes: 10,
        usos: 0,
        fijado: false,
        grupoId: undefined
      };

      // Mock the regular function to return that we should forget the first recuerdo
      mockRegular.mockReturnValue({ conservar: [recuerdo2], olvidar: [recuerdo1] });

      // Mock cuotaPara to return a small quota so that regular forgets one
      mockCuotaPara.mockReturnValue(5); // 5 bytes, each recuerdo is 10 bytes, so one should be forgotten

      await regularAhora(bot, "web", dep);

      expect(mockRegular).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ id: "id1" }), expect.objectContaining({ id: "id2" })]),
        5,
        expect.any(Number)
      );

      expect(mockDeleteMemoryFile).toHaveBeenCalledWith("file1");
      expect(mockDeleteMemoryFile).not.toHaveBeenCalledWith("file2");
    });
  });

  describe("transferir", () => {
    it("should throw an error because transfer is not implemented", async () => {
      await expect(transferir(bot, {})).rejects.toThrow("Transferencia por la malla no implementada");
    });
  });
});