import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Formulate Pro',
  description: 'Tablet formulation calculator for nutraceutical manufacturing',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.19.0/dist/tabler-icons.min.css"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
