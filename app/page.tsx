import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function Home() {
  const { userId } = await auth();
  
  // Redirect to /chat if already authenticated
  if (userId) {
    redirect("/chat");
  }

  return (
    <div className="flex flex-col flex-1 items-center justify-center min-h-screen bg-gradient-to-b from-[var(--background)] via-[var(--background)] to-[var(--nav-hover)]">
      <main className="flex flex-col items-center justify-center gap-8 text-center">
        <div className="space-y-4">
          <div className="inline-flex items-center gap-3 mb-6">
            <div className="relative">
              <div className="absolute -inset-1 bg-gradient-to-r from-purple-500/20 to-violet-500/20 rounded-lg blur-xl" />
              <div className="relative">
                <h1 className="text-6xl font-bold bg-gradient-to-r from-[var(--accent)] to-[var(--accent-secondary)] bg-clip-text text-transparent">
                  Athene
                </h1>
              </div>
            </div>
          </div>
          <p className="text-2xl text-[var(--sidebar-text-secondary)]">
            Intelligent assistant for your organization
          </p>
        </div>
        <p className="text-base text-[var(--sidebar-text-secondary)]">
          Please sign in to continue.
        </p>
      </main>
    </div>
  );
}
