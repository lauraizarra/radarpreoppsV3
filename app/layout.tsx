import "./globals.css";

export const metadata = {
  title: "PreOpp Radar | Escala 24x7",
  description: "Dashboard semanal de pre-oportunidades comerciales",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}