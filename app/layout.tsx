import type { Metadata } from 'next';
import { Inter, Sora, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/layout/Providers';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const sora = Sora({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-sora' });
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-jetbrains' });

export const metadata: Metadata = {
  title: 'Predicta XI — Admin',
  description: 'Admin panel for Predicta XI prediction engine',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${sora.variable} ${mono.variable} h-full`}>
      <body className="h-full bg-background text-text-primary antialiased">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
