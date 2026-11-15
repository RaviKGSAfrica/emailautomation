import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Audit CRM Portal",
  description: "Inbound email automation and audit pipeline CRM",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
