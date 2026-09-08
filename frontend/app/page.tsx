import { Button } from "@/src/components/ui/button";

export default function Home() {
  return (
    <main className="grid min-h-screen place-items-center bg-page p-6 text-ink">
      <section className="rounded-md border border-line bg-card p-6 text-center">
        <p className="text-body">3F frontend foundation</p>
        <Button type="button">Ready</Button>
      </section>
    </main>
  );
}
