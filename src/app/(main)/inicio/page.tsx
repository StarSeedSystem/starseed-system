// (2026-09-28) El inicio NO es una página aparte: es la pestaña «Inicio» de los dashboards, con
// los mismos widgets. Quien llegue aquí (un enlace viejo) va al dashboard.
import { redirect } from "next/navigation";

export default function InicioPage() {
    redirect("/dashboard");
}
