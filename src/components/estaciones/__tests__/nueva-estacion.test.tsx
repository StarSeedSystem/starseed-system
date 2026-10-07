import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppearanceProvider } from "@/context/appearance-context";
import { NuevaEstacion } from "../nueva-estacion";
import * as datos from "@/lib/estaciones/datos";
import * as malla from "@/lib/estaciones/malla";

vi.spyOn(datos, "publicarEstacion").mockResolvedValue({ ok: true, estacion: { id:"1", owner_id:"u", ambito_tipo:"persona", entidad_ref:null, titulo:"T", descripcion:"", tipo:"audio", fuente:"enlace", enlace:"https://x.com", formato:"audio", imagen:null, idioma:"es", categorias:[], licencia:"cc-by", visibilidad:"publica", empieza_en:null, termina_en:null, ultimo_latido:null, pausada:false, en_malla:false, espectadores:0, created_at:"", updated_at:"" } as any });
vi.spyOn(datos, "editarEstacion").mockResolvedValue({ ok: true, estacion: { id:"1", owner_id:"u", ambito_tipo:"persona", entidad_ref:null, titulo:"T", descripcion:"", tipo:"audio", fuente:"enlace", enlace:"https://x.com", formato:"audio", imagen:null, idioma:"es", categorias:[], licencia:"cc-by", visibilidad:"publica", empieza_en:null, termina_en:null, ultimo_latido:null, pausada:false, en_malla:false, espectadores:0, created_at:"", updated_at:"" } as any });
vi.spyOn(malla, "anunciarEnMalla").mockResolvedValue({ servidor:true, radio:true });

const wrap = (ui:any)=> <AppearanceProvider>{ui}</AppearanceProvider>;

describe("NuevaEstacion", () => {
  it("muestra motivo de detección y sugiere tipo", async () => {
    const user = userEvent.setup();
    render(wrap(<NuevaEstacion abierto onCerrar={()=>{}} />));
    const enlace = screen.getAllByRole("textbox")[0];
    await user.type(enlace, "https://youtu.be/abc");
    await waitFor(() => expect(screen.getByText(/YouTube en directo/i)).toBeTruthy());
  });

  it("valida título requerido", async () => {
    const user = userEvent.setup();
    const onCerrar = vi.fn();
    render(wrap(<NuevaEstacion abierto onCerrar={onCerrar} />));
    const enlace = screen.getAllByRole("textbox")[0];
    await user.type(enlace, "https://ejemplo.com");
    await user.click(screen.getByRole("button", { name:/guardar/i }));
    await waitFor(() => expect(screen.getByText(/título debe tener entre 2 y 100/i)).toBeTruthy());
  });

  it("publica y anuncia en malla", async () => {
    const user = userEvent.setup();
    const onGuardada = vi.fn();
    render(wrap(<NuevaEstacion abierto onCerrar={()=>{}} onGuardada={onGuardada} />));
    const inputs = screen.getAllByRole("textbox");
    await user.type(inputs[1], "Estación de prueba");
    await user.type(inputs[0], "https://ejemplo.com");
    const checkbox = screen.getByRole("checkbox");
    await user.click(checkbox);
    await user.click(screen.getByRole("button", { name:/guardar/i }));
    await waitFor(() => expect(datos.publicarEstacion).toHaveBeenCalled());
    expect(malla.anunciarEnMalla).toHaveBeenCalled();
    expect(onGuardada).toHaveBeenCalled();
  });
});
