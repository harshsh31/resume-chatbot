import "./globals.css";

export const metadata = { title: "Resume Chatbot" };

// r[impl chat-ui.mobile-friendly]
export const viewport = { width: "device-width", initialScale: 1 };

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
