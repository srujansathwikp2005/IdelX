import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider, RouteGuard } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";

export const metadata: Metadata = {
  title: "IdleX — Rent Smart. Own Less. Live More.",
  description:
    "IdleX is your trusted community marketplace to rent items you love and earn from what you don't use.",
};

// The browser chrome around the page, so a tab or an installed shortcut is
// the app's violet rather than the browser default.
export const viewport = {
  themeColor: "#6c4ef5",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        {/* Runs before the first paint, so a person who chose dark does not
            get a white page for the length of a hydration. React cannot do
            this from a component — by the time one renders, the flash has
            already happened. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');var d=t==='dark'||((!t||t==='system')&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.setAttribute('data-theme',d?'dark':'light')}catch(e){}})()`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground select-none">
        <ThemeProvider>
          <AuthProvider>
            <RouteGuard>{children}</RouteGuard>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
