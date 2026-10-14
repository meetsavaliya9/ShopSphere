import "./globals.css";
import { SiteChrome } from "../components/site-chrome";
import { StoreProvider } from "../components/store-provider";
import { AuthProvider } from "../components/auth-provider";

export const metadata = {
  title: {
    default: "ShopSphere — Objects for everyday",
    template: "%s — ShopSphere"
  },
  description: "A considered collection of everyday essentials, chosen to be used and loved."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="scroll-smooth motion-reduce:scroll-auto">
      <body className="m-0 bg-white font-sans text-ink antialiased">
        <AuthProvider>
          <StoreProvider>
            <SiteChrome>{children}</SiteChrome>
          </StoreProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
