import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'NahaKids Game Factory',
  description: 'Turn a child’s imagination into a playable mini-game.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
