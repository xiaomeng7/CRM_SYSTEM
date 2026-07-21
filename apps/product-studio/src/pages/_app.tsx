import type { AppProps } from "next/app";
import "@/styles/screen.css";
import "@/styles/print.css";
import "@/styles/product-os-sheet.css";
import "@/styles/configurator.css";
import "@/styles/sales-studio.css";

export default function App({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
