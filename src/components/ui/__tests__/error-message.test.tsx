import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"
import { ErrorMessage, type ErrorMessageProps } from "../error-message"

const renderErrorMessage = (props: Partial<ErrorMessageProps> = {}) => {
  return render(<ErrorMessage {...props} />)
}

describe("ErrorMessage", () => {
  it("renders error message with default variant", () => {
    renderErrorMessage({ message: "Algo salió mal" })
    expect(screen.getByRole("alert")).toHaveTextContent("Algo salió mal")
  })

  it("renders error message with destructive variant", () => {
    renderErrorMessage({ message: "Error crítico", variant: "destructive" })
    const alert = screen.getByRole("alert")
    expect(alert).toHaveTextContent("Error crítico")
    expect(alert).toHaveClass("text-destructive")
  })

  it("renders error message with warning variant using accent", () => {
    renderErrorMessage({ message: "Advertencia importante", variant: "warning" })
    const alert = screen.getByRole("alert")
    expect(alert).toHaveTextContent("Advertencia importante")
    expect(alert).toHaveClass("text-accent")
  })

  it("renders error message with info variant using primary", () => {
    renderErrorMessage({ message: "Información", variant: "info" })
    const alert = screen.getByRole("alert")
    expect(alert).toHaveTextContent("Información")
    expect(alert).toHaveClass("text-primary")
  })

  it("renders title when provided", () => {
    renderErrorMessage({ message: "Detalles del error", title: "Error de conexión" })
    expect(screen.getByText("Error de conexión")).toBeInTheDocument()
    expect(screen.getByText("Detalles del error")).toBeInTheDocument()
  })

  it("renders action button when provided", () => {
    const handleClick = vi.fn()
    renderErrorMessage({
      message: "Error",
      action: { label: "Reintentar", onClick: handleClick },
    })
    const button = screen.getByRole("button", { name: "Reintentar" })
    expect(button).toBeInTheDocument()
    button.click()
    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it("applies correct contrast classes for accessibility", () => {
    renderErrorMessage({ message: "Error", variant: "destructive" })
    const alert = screen.getByRole("alert")
    expect(alert).toHaveClass("border-destructive/50")
    expect(alert).toHaveClass("text-destructive")
  })

  it("supports dismissible errors", () => {
    const onDismiss = vi.fn()
    renderErrorMessage({ message: "Error", dismissible: true, onDismiss })
    const dismissButton = screen.getByRole("button", { name: /cerrar|dismiss/i })
    expect(dismissButton).toBeInTheDocument()
    dismissButton.click()
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it("uses proper ARIA attributes", () => {
    renderErrorMessage({ message: "Error", id: "error-1" })
    const alert = screen.getByRole("alert")
    expect(alert).toHaveAttribute("id", "error-1")
    expect(alert).toHaveAttribute("aria-live", "assertive")
  })

  it("applies glass morphism styling with design tokens", () => {
    renderErrorMessage({ message: "Error", variant: "destructive" })
    const alert = screen.getByRole("alert")
    expect(alert).toHaveClass("backdrop-blur-[var(--glass-blur)]")
    expect(alert).toHaveClass("bg-[rgba(var(--card-rgb),var(--glass-opacity))]")
  })
})