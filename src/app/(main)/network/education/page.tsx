// src/app/(main)/network/education/page.tsx
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { articles, courses } from "@/lib/data";
import { BookOpen, Newspaper, Star } from "lucide-react";
import Link from "next/link";

function CourseCard({ course }: { course: typeof courses[0] }) {
  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <div className="flex items-center gap-2 text-primary mb-2">
          <BookOpen className="w-5 h-5"/>
          <CardDescription>Curso</CardDescription>
        </div>
        <CardTitle className="font-headline text-xl">{course.title}</CardTitle>
        <p className="text-sm text-muted-foreground pt-2">{course.description}</p>
      </CardHeader>
      <CardContent className="flex-1">
        <div className="flex items-center justify-between text-sm text-muted-foreground mb-2">
          <span>Progreso</span>
          <span>{course.progress}%</span>
        </div>
        <Progress value={course.progress} />
        <div className="flex items-center gap-2 mt-4">
            <span className="text-sm font-semibold">Temas:</span>
            <div className="flex flex-wrap gap-1">
                {course.tags.map(tag => <Badge key={tag} variant="secondary">{tag}</Badge>)}
            </div>
        </div>
      </CardContent>
      <CardFooter>
        <Button className="w-full">Continuar Aprendiendo</Button>
      </CardFooter>
    </Card>
  )
}

function ArticleCard({ article }: { article: typeof articles[0] }) {
    return (
        <Card className="h-full flex flex-col">
            <CardHeader>
                <div className="flex items-center gap-2 text-accent mb-2">
                    <Newspaper className="w-5 h-5"/>
                    <CardDescription>Artículo</CardDescription>
                </div>
                <CardTitle className="font-headline text-xl">{article.title}</CardTitle>
                <div className="flex items-center gap-4 pt-2">
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Star className="w-4 h-4 text-yellow-500" />
                        <span>{article.rating.toFixed(1)}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">Por {article.author}</p>
                </div>
            </CardHeader>
            <CardContent className="flex-1">
                 <p className="text-sm text-muted-foreground">{article.excerpt}</p>
                 <div className="flex items-center gap-2 mt-4">
                    <span className="text-sm font-semibold">Temas:</span>
                    <div className="flex flex-wrap gap-1">
                        {article.tags.map(tag => <Badge key={tag} variant="secondary">{tag}</Badge>)}
                    </div>
                </div>
            </CardContent>
            <CardFooter>
                <Button variant="outline" className="w-full" asChild>
                    <Link href={article.href}>Leer Artículo</Link>
                </Button>
            </CardFooter>
        </Card>
    )
}

export default function EducationPage() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-2xl font-bold font-headline mb-2">Categoría: Ciencia</h2>
        <p className="text-muted-foreground">Explora cursos y artículos sobre los fundamentos científicos de nuestro universo.</p>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mt-4">
            <CourseCard course={courses[0]} />
            <ArticleCard article={articles[0]} />
        </div>
      </div>
       <div>
        <h2 className="text-2xl font-bold font-headline mb-2">Categoría: Sociedad</h2>
        <p className="text-muted-foreground">Analiza las estructuras, éticas y tecnologías que moldean nuestra realidad colectiva.</p>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mt-4">
            <CourseCard course={courses[1]} />
            <ArticleCard article={articles[1]} />
            <ArticleCard article={articles[2]} />
        </div>
      </div>
    </div>
  );
}
