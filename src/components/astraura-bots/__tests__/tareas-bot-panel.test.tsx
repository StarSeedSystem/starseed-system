import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TareasBotPanel } from "../tareas-bot-panel";
import { Bot } from "@/lib/astraura-bots/tipos";

// Mock de los adaptadores de almacenamiento
jest.mock("@/lib/astraura-bots/adaptadores/almacen-tareas", () => ({
  listar: jest.fn(),
  guardar: jest.fn(),
  verificarCriterio: jest.fn(),
  obtenerVerificaciones: jest.fn(),
}));

describe("TareasBotPanel", () => {
  const botMock: Bot = {
    id: "bot1",
    nombre: "Bot de prueba",
    dueno: {
      tipo: "perfil",
      id: "perfil1",
      cuentaId: "cuenta1",
    },
    origen: "astraura",
    gobierno: "jerarquico",
    personalidad: {
      calidez: 0.5,
      energia: 0.5,
      formalidad: 0.5,
      curiosidad: 0.5,
      humor: 0.5,
      concision: 0.5,
    },
    cuerpo: {
      forma: "orbe",
      tono: 0,
      escala: 1,
    },
    sentidosHabilitados: [],
    activo: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("renderiza sin errores", () => {
    render(<TareasBotPanel bot={botMock} />);
    expect(screen.getByRole("heading", { level: 3, name: /Nueva tarea/i })).toBeInTheDocument();
  });

  test("muestra el formulario de nueva tarea", () => {
    render(<TareasBotPanel bot={botMock} />);
    expect(screen.getByLabelText(/título/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/criterios/i)).toBeInTheDocument();
    expect(screen.getByText(/+ añadir criterio/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /crear tarea/i })).toBeInTheDocument();
  });

  test("agrega un criterio al hacer clic en +", () => {
    render(<TareasBotPanel bot={botMock} />);
    const agregarBtn = screen.getByText(/+ añadir criterio/i);
    fireEvent.click(agregarBtn);
    const inputs = screen.getAllByPlaceholderText(/criterio \d+/i);
    expect(inputs).toHaveLength(2);
  });

  test("elimina un criterio al hacer clic en −", () => {
    render(<TareasBotPanel bot={botMock} />);
    // Primero agregamos un criterio para tener al menos dos
    const agregarBtn = screen.getByText(/+ añadir criterio/i);
    fireEvent.click(agregarBtn);
    const inputs = screen.getAllByPlaceholderText(/criterio \d+/i);
    expect(inputs).toHaveLength(2);
    // Ahora eliminamos el segundo criterio
    const eliminarBtns = screen.getAllByRole("button", { name: /−/i });
    fireEvent.click(eliminarBtns[1]); // El segundo botón de eliminación
    const inputsAfter = screen.getAllByPlaceholderText(/criterio \d+/i);
    expect(inputsAfter).toHaveLength(1);
  });

  test("envía una nueva tarea válida", async () => {
    render(<TareasBotPanel bot={botMock} />);
    // Llenamos el formulario
    const tituloInput = screen.getByLabelText(/título/i) as HTMLInputElement;
    fireEvent.change(tituloInput, { target: { value: "Tarea de prueba" } });
    // Aseguramos de tener al menos un criterio
    const criterioInput = screen.getAllByPlaceholderText(/criterio \d+/i)[0] as HTMLInputElement;
    fireEvent.change(criterioInput, { target: { value: "Criterio de prueba" } });
    // Enviamos el formulario
    const form = screen.getByRole("form");
    fireEvent.submit(form);
    // Esperamos a que se llame a guardar
    await waitFor(() => {
      expect(require("@/lib/astraura-bots/adaptadores/almacen-tareas").guardar).toHaveBeenCalled();
    });
    // Verificamos que se llama a guardar con una tarea
    const guardarMock = require("@/lib/astraura-bots/adaptadores/almacen-tareas").guardar;
    expect(guardarMock).toHaveBeenCalledWith(
      expect.objectContaining({
        titulo: "Tarea de prueba",
        criterios: ["Criterio de prueba"],
      }),
      false
    );
  });

  test("verifica un criterio", async () => {
    // Simulamos que ya hay una tarea almacenada
    const tareaMock = {
      id: "tarea1",
      titulo: "Tarea existente",
      director: "bot1",
      agentes: [],
      criterios: ["Criterio 1", "Criterio 2"],
      verificador: "persona",
      origen: "genesis",
      estado: "propuesta",
    };
    // Mock de listar para devolver esta tarea
    (require("@/lib/astraura-bots/adaptadores/almacen-tareas").listar as jest.Mock).mockReturnValue([tareaMock]);
    // Mock de obtenerVerificaciones para devolver un objeto vacío
    (require("/src/lib/astraura-bots/adaptadores/almacen-tareas").obtenerVerificaciones as jest.Mock).mockReturnValue({});

    render(<TareasBotPanel bot={botMock} />);
    // Esperamos a que se renderice la tarea
    await waitFor(() => {
      expect(screen.getByText(/tarea existente/i)).toBeInTheDocument();
    });
    // Hacemos clic en el botón de verificar del primer criterio
    const verificarBtns = screen.getAllByRole("button", { name: /verificar/i });
    fireEvent.click(verificarBtns[0]);
    // Esperamos a que se llame a verificarCriterio
    await waitFor(() => {
      expect(require("@/lib/astraura-bots/adaptadores/almacen-tareas").verificarCriterio).toHaveBeenCalledWith(
        "tarea1",
        0,
        "perfil1" // El id del dueno del bot
     );
   });

   test("muestra error cuando el título está vacío", async () => {
     render(<TareasBotPanel bot={botMock} />);
     const tituloInput = screen.getByLabelText(/título/i) as HTMLInputElement;
     fireEvent.change(tituloInput, { target: { value: "" } });
     const form = screen.getByRole("form");
     fireEvent.submit(form);
     expect(await screen.findByText(/título vacío/i)).toBeInTheDocument();
   });
});
});