import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "../ui/button";

const courses = [
    { name: "Introducción a la Ontocracia", progress: 75 },
    { name: "Física Cuántica para Todos", progress: 40 },
    { name: "Principios de Permacultura", progress: 90 },
]

export function LearningPathWidget() {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="font-headline">Ruta de Aprendizaje</CardTitle>
                <CardDescription>Tu progreso en los cursos y conocimientos activos.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {courses.map(course => (
                    <div key={course.name}>
                        <div className="flex justify-between items-center mb-1">
                            <p className="text-sm font-medium">{course.name}</p>
                            <p className="text-sm text-muted-foreground">{course.progress}%</p>
                        </div>
                        <Progress value={course.progress} />
                    </div>
                ))}
                <Button variant="outline" className="w-full mt-2">Sugerir Siguiente Paso</Button>
            </CardContent>
        </Card>
    )
}
