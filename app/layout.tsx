import type {Metadata} from 'next';
import './globals.css';
import { Inter, JetBrains_Mono } from "next/font/google";
import { cn } from "@/lib/utils";
import { ClientLayout } from '@/components/ClientLayout';
import { FeishuRuntimeScripts } from '@/components/FeishuRuntimeScripts';
import { Toaster } from '@/components/ui/sonner';

const inter = Inter({subsets:['latin'],variable:'--font-sans'});
const jetbrainsMono = JetBrains_Mono({subsets:['latin'],variable:'--font-mono'});

export const metadata: Metadata = {
  title: '培训考试与题库管理系统',
  description: '基于飞书表格的培训考试与题库管理系统',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" className={cn("font-sans h-full", inter.variable, jetbrainsMono.variable)}>
      <body suppressHydrationWarning className="antialiased h-full overflow-hidden text-slate-900 bg-slate-50">
        <FeishuRuntimeScripts />
        <ClientLayout>{children}</ClientLayout>
        <Toaster />
      </body>
    </html>
  );
}
