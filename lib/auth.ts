import NextAuth from "next-auth";
import Nodemailer from "next-auth/providers/nodemailer";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { authConfig } from "./auth.config";
import { db } from "./db";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(db),
  session: { strategy: "jwt" },
  providers: [
    ...authConfig.providers,
    ...(process.env.SMTP_HOST
      ? [
          Nodemailer({
            server: {
              host: process.env.SMTP_HOST,
              port: Number(process.env.SMTP_PORT ?? 587),
              auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
              },
            },
            from: process.env.MAIL_FROM ?? "PaperBank <noreply@example.com>",
          }),
        ]
      : []),
  ],
});
