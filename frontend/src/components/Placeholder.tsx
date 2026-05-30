export function Placeholder({ title, phase }: { title: string; phase: string }) {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Bu ekran {phase} aşamasında uygulanacak. Yapı ve yönlendirme hazır.
      </p>
    </div>
  );
}
