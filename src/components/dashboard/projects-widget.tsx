import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

const projects = [
  { name: "Proyecto Fénix", status: "Activo", progress: 75 },
  { name: "Dashboard Nebula", status: "Activo", progress: 40 },
  { name: "Sincronización de Datos Orión", status: "En Pausa", progress: 30 },
  { name: "Núcleo de IA Nova", status: "Completado", progress: 100 },
];

export function ProjectsWidget() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-headline">Proyectos Recientes</CardTitle>
        <CardDescription>Un resumen de tu trabajo más reciente.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Proyecto</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Progreso</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects.map((project) => (
              <TableRow key={project.name}>
                <TableCell className="font-medium">{project.name}</TableCell>
                <TableCell>
                  <Badge variant={project.status === "Activo" ? "default" : "secondary"}>
                    {project.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">{project.progress}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
