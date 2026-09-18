import type { Metadata } from 'next';
import { IBM_Plex_Mono, Noto_Sans_Georgian } from 'next/font/google';
import './globals.css';

// SPEC §7 typography: Noto Sans Georgian for all text, IBM Plex Mono only for
// identifiers and numbers. Both are self-hosted at build time by next/font.
const noto = Noto_Sans_Georgian({
  subsets: ['georgian', 'latin'],
  weight: ['400', '500', '700'],
  variable: '--font-noto',
  display: 'swap',
});

const plex = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-plex',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'AVP Simulator',
  description:
    'Interactive 3D simulator of an automated underground vehicle-parking facility.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${noto.variable} ${plex.variable}`}>
      <body>{children}</body>
    </html>
  );
}
