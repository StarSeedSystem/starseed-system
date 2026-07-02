import { redirect } from 'next/navigation';

export default function Home() {
  // Escritorios es ahora la pantalla principal del OS (los dashboards
  // siguen disponibles en /dashboard).
  redirect('/escritorios');
}
