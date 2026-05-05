import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Athene AI | Enterprise Orchestration",
  description: "Enterprise Multi-Agent Orchestration.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // The ClerkProvider is the master wrapper that fixes your error
    <ClerkProvider
      appearance={{
        baseTheme: dark,
      }}
    >
      <html lang="en" className="dark">
        <body className={`${inter.className} bg-background text-foreground antialiased min-h-screen`}>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}