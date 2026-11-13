import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import "./globals.css";
import "@fontsource/ibm-plex-sans-thai/400.css";
import "@fontsource/ibm-plex-sans-thai/500.css";
import "@fontsource/ibm-plex-sans-thai/600.css";
export const metadata: Metadata = {
  title: { default: "Korat Leave Monitoring", template: "%s · Korat" },
  description: "ระบบติดตามใบลาและตรวจสอบหลักฐาน ศูนย์โคราช",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
