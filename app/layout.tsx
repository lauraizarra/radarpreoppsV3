import "./globals.css";

export const metadata = {
  title: "PreOpp Radar | Monitoreo Comercial",
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