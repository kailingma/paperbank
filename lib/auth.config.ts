import type { NextAuthConfig } from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";

export const authConfig = {
  pages: { signIn: "/signin" },
  providers: [
    ...(process.env.GITHUB_CLIENT_ID ? [GitHub] : []),
    ...(process.env.GOOGLE_CLIENT_ID ? [Google] : []),
  ],
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      if (
        pathname === "/" ||
        pathname.startsWith("/signin") ||
        pathname.startsWith("/invite") ||
        pathname.startsWith("/api/auth")
      ) {
        return true;
      }
      return !!auth?.user;
    },
  },
} satisfies NextAuthConfig;
