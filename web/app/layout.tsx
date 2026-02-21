import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ROS2 System WebView",
  description: "Real-time log viewer for ROS 2 systems",
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
