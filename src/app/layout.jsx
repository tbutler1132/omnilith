import { Orbitron, Electrolize } from "next/font/google";
import Nav from "../components/Nav";
import "./globals.css";

const orbitron = Orbitron({
  variable: "--font-orbitron",
  subsets: ["latin"],
});

const electrolize = Electrolize({
  weight: "400",
  variable: "--font-electrolize",
  subsets: ["latin"],
});

export const metadata = {
  title: "OMNILITH",
  description: "Omnilith",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        className={`${orbitron.variable} ${orbitron.variable} ${electrolize.variable}`}
      >
        <Nav />
        {children}
      </body>
    </html>
  );
}
