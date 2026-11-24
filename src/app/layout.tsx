import type { Metadata } from "next";
import { Oswald, Source_Serif_4, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { NavBar } from "@/components/NavBar";

const oswald = Oswald({
  variable: "--font-oswald",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

// Nota: pedir varios pesos + itálica a la vez en esta fuente hace que
// Turbopack falle en el build de Vercel ("next/font/google queries have
// exactly one entry") aunque localmente compile bien. Se deja solo la
// variante normal; el itálico que se usa en un par de textos pequeños se
// sintetiza con font-style, que se ve prácticamente igual a esta escala.
const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  weight: ["400", "600"],
  style: ["normal"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "CRM Rhinoboots",
  description: "CRM de ventas, licitaciones y recuperación de cartera",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${oswald.variable} ${sourceSerif.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-paper font-body">
        <NavBar />
        <div className="flex-1">{children}</div>
      </body>
    </html>
  );
}
