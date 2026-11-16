import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  ErrorMessage,
  InlineError,
  FieldError,
  BannerError,
  ToastError,
  CardError,
  errorMessageVariants,
  type ErrorSeverity,
  type ErrorVariant,
} from "@/components/ui/error-message";

describe("errorMessageVariants", () => {
  it("genera clases base para error inline", () => {
    const classes = errorMessageVariants({ severity: "error", variant: "inline", dismissible: false });
    expect(classes).toContain("border-rose-500/30");
    expect(classes).toContain("bg-rose-500/10");
    expect(classes).toContain("text-rose-100");
  });

  it("genera clases para warning", () => {
    const classes = errorMessageVariants({ severity: "warning", variant: "inline", dismissible: false });
    expect(classes).toContain("border-amber-500/30");
    expect(classes).toContain("bg-amber-500/10");
    expect(classes).toContain("text-amber-100");
  });

  it("genera clases para info", () => {
    const classes = errorMessageVariants({ severity: "info", variant: "inline", dismissible: false });
    expect(classes).toContain("border-cyan-500/30");
    expect(classes).toContain("bg-cyan-500/10");
    expect(classes).toContain("text-cyan-100");
  });

  it("genera clases para success", () => {
    const classes = errorMessageVariants({ severity: "success", variant: "inline", dismissible: false });
    expect(classes).toContain("border-emerald-500/30");
    expect(classes).toContain("bg-emerald-500/10");
    expect(classes).toContain("text-emerald-100");
  });

  it("genera clases para loading", () => {
    const classes = errorMessageVariants({ severity: "loading", variant: "inline", dismissible: false });
    expect(classes).toContain("animate-pulse");
  });

  it("aplica variante banner con sombra", () => {
    const classes = errorMessageVariants({ severity: "error", variant: "banner", dismissible: false });
    expect(classes).toContain("shadow-lg");
    expect(classes).toContain("rounded-2xl");
  });

  it("aplica variante toast con max-w-sm", () => {
    const classes = errorMessageVariants({ severity: "error", variant: "toast", dismissible: false });
    expect(classes).toContain("max-w-sm");
    expect(classes).toContain("shadow-xl");
  });

  it("aplica variante card", () => {
    const classes = errorMessageVariants({ severity: "error", variant: "card", dismissible: false });
    expect(classes).toContain("rounded-2xl");
  });

  it("añade padding para dismissible", () => {
    const classes = errorMessageVariants({ severity: "error", variant: "inline", dismissible: true });
    expect(classes).toContain("pr-10");
  });

  it("añade ring para error banner", () => {
    const classes = errorMessageVariants({ severity: "error", variant: "banner", dismissible: false });
    expect(classes).toContain("ring-1");
    expect(classes).toContain("ring-rose-500/20");
  });

  it("añade ring para warning banner", () => {
    const classes = errorMessageVariants({ severity: "warning", variant: "banner", dismissible: false });
    expect(classes).toContain("ring-1");
    expect(classes).toContain("ring-amber-500/20");
  });
});

describe("ErrorMessage", () => {
  it("renderiza el mensaje con título y descripción", () => {
    render(
      <ErrorMessage
        severity="error"
        title="Error de conexión"
        description="No se pudo conectar al servidor"
      />
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Error de conexión")).toBeInTheDocument();
    expect(screen.getByText("No se pudo conectar al servidor")).toBeInTheDocument();
  });

  it("renderiza icono según severidad", () => {
    const { rerender } = render(<ErrorMessage severity="error" title="Error" />);
    expect(screen.getByRole("alert")).toBeInTheDocument();

    rerender(<ErrorMessage severity="warning" title="Advertencia" />);
    expect(screen.getByRole("alert")).toBeInTheDocument();

    rerender(<ErrorMessage severity="info" title="Información" />);
    expect(screen.getByRole("status")).toBeInTheDocument();

    rerender(<ErrorMessage severity="success" title="Éxito" />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("no renderiza icono cuando showIcon es false", () => {
    render(<ErrorMessage severity="error" title="Error" showIcon={false} />);
    expect(screen.queryByRole("img", { hidden: true })).not.toBeInTheDocument();
  });

  it("renderiza acción cuando se proporciona", () => {
    render(
      <ErrorMessage
        severity="error"
        title="Error"
        action={<button type="button">Reintentar</button>}
      />
    );

    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });

  it("renderiza botón de cerrar cuando dismissible es true", () => {
    const onDismiss = vi.fn();
    render(
      <ErrorMessage
        severity="error"
        title="Error"
        dismissible
        onDismiss={onDismiss}
      />
    );

    const closeButton = screen.getByRole("button", { name: "Cerrar" });
    expect(closeButton).toBeInTheDocument();

    fireEvent.click(closeButton);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("no renderiza botón de cerrar cuando dismissible es false", () => {
    render(<ErrorMessage severity="error" title="Error" dismissible={false} />);
    expect(screen.queryByRole("button", { name: "Cerrar" })).not.toBeInTheDocument();
  });

  it("aplica aria-live assertive para error y warning", () => {
    const { container } = render(<ErrorMessage severity="error" title="Error" />);
    expect(container.firstChild).toHaveAttribute("aria-live", "assertive");

    const { container: container2 } = render(<ErrorMessage severity="warning" title="Advertencia" />);
    expect(container2.firstChild).toHaveAttribute("aria-live", "assertive");
  });

  it("aplica aria-live polite para info, success y loading", () => {
    const { container } = render(<ErrorMessage severity="info" title="Info" />);
    expect(container.firstChild).toHaveAttribute("aria-live", "polite");

    const { container: container2 } = render(<ErrorMessage severity="success" title="Éxito" />);
    expect(container2.firstChild).toHaveAttribute("aria-live", "polite");

    const { container: container3 } = render(<ErrorMessage severity="loading" title="Cargando" />);
    expect(container3.firstChild).toHaveAttribute("aria-live", "polite");
  });

  it("permite sobrescribir role", () => {
    render(<ErrorMessage severity="error" title="Error" role="status" />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("renderiza variantes correctamente", () => {
    const { rerender } = render(<ErrorMessage severity="error" title="Error" variant="inline" />);
    expect(screen.getByRole("alert")).toBeInTheDocument();

    rerender(<ErrorMessage severity="error" title="Error" variant="banner" />);
    expect(screen.getByRole("alert")).toHaveClass("rounded-2xl");

    rerender(<ErrorMessage severity="error" title="Error" variant="toast" />);
    expect(screen.getByRole("alert")).toHaveClass("max-w-sm");

    rerender(<ErrorMessage severity="error" title="Error" variant="card" />);
    expect(screen.getByRole("alert")).toHaveClass("rounded-2xl");
  });
});

describe("InlineError", () => {
  it("renderiza mensaje de error inline", () => {
    render(<InlineError message="Campo requerido" fieldId="email" />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Campo requerido")).toBeInTheDocument();
  });

  it("renderiza hint cuando se proporciona", () => {
    render(<InlineError message="Email inválido" hint="Debe contener @" fieldId="email" />);

    expect(screen.getByText("Email inválido")).toBeInTheDocument();
    expect(screen.getByText("Debe contener @")).toBeInTheDocument();
  });

  it("usa severidad warning cuando se especifica", () => {
    render(<InlineError message="Advertencia" severity="warning" fieldId="test" />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});

describe("FieldError", () => {
  it("renderiza error de campo con ID asociado", () => {
    render(<FieldError message="Este campo es requerido" fieldId="username" />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Este campo es requerido")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveAttribute("id", "username-error");
  });
});

describe("BannerError", () => {
  it("renderiza banner de error con título y descripción", () => {
    render(
      <BannerError
        title="Error de sincronización"
        description="No se pudieron guardar los cambios"
      />
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Error de sincronización")).toBeInTheDocument();
    expect(screen.getByText("No se pudieron guardar los cambios")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveClass("rounded-2xl");
  });

  it("renderiza acción cuando se proporciona", () => {
    render(
      <BannerError
        title="Error"
        action={<button type="button">Reintentar</button>}
      />
    );

    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });

  it("renderiza botón de cerrar por defecto", () => {
    const onDismiss = vi.fn();
    render(<BannerError title="Error" onDismiss={onDismiss} />);

    const closeButton = screen.getByRole("button", { name: "Cerrar" });
    expect(closeButton).toBeInTheDocument();

    fireEvent.click(closeButton);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("no renderiza botón de cerrar cuando dismissible es false", () => {
    render(<BannerError title="Error" dismissible={false} />);
    expect(screen.queryByRole("button", { name: "Cerrar" })).not.toBeInTheDocument();
  });
});

describe("ToastError", () => {
  it("renderiza toast de error", () => {
    render(<ToastError title="Error de red" description="Sin conexión" />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Error de red")).toBeInTheDocument();
    expect(screen.getByText("Sin conexión")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveClass("max-w-sm");
  });

  it("permite severidad success", () => {
    render(<ToastError title="Guardado" severity="success" />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});

describe("CardError", () => {
  it("renderiza error en formato card", () => {
    render(<CardError title="Error de validación" description="Revisa los campos" />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Error de validación")).toBeInTheDocument();
    expect(screen.getByText("Revisa los campos")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveClass("rounded-2xl");
  });
});