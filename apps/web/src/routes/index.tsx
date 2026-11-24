import { Button } from "@mordus-platform/ui/components/button";
import { Link, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({ component: HomeComponent });
function HomeComponent() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-5xl flex-col items-start justify-center px-6 py-16">
      <p className="text-sm font-medium text-muted-foreground">Plataforma de observabilidade</p>
      <h1 className="mt-3 max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
        Mordus Platform ajuda a entender o que acontece nos seus dados.
      </h1>
      <p className="mt-5 max-w-xl text-lg leading-7 text-muted-foreground">
        Uma API para receber eventos, consultar informações e acompanhar a operação em um só lugar.
      </p>
      <Button nativeButton={false} className="mt-7" render={<Link to="/about" />}>
        Sobre o projeto
      </Button>
    </main>
  );
}
