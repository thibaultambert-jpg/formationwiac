import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import "next-auth/jwt";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { isAllowedGoogleAccount, normalizeEmail, resolveRoleOnSignIn, type Role } from "@/server/auth/policy";

const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
// The role cached in the JWT is refreshed from the database at this interval,
// so a promotion or deactivation reaches the proxy quickly. Server guards
// always read the database (see src/server/auth/guards.ts).
const ROLE_REFRESH_INTERVAL_MS = 60 * 1000;

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
      role: Role;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    role?: Role;
    roleCheckedAt?: number;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const env = getEnv();

  return {
    secret: env.NEXTAUTH_SECRET,
    trustHost: true,
    session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_SECONDS },
    pages: { signIn: "/connexion", error: "/acces-refuse" },
    providers: [
      Google({
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        authorization: {
          params: { hd: env.ALLOWED_GOOGLE_DOMAIN, prompt: "select_account" },
        },
      }),
    ],
    callbacks: {
      async signIn({ account, profile }) {
        if (account?.provider !== "google" || !profile) return false;

        const allowed = isAllowedGoogleAccount(
          {
            email: profile.email,
            emailVerified: profile.email_verified as boolean | undefined,
            hostedDomain: profile.hd as string | undefined,
          },
          env.ALLOWED_GOOGLE_DOMAIN,
        );
        if (!allowed) return "/acces-refuse?raison=domaine";

        const email = normalizeEmail(profile.email!);
        const existing = await db.user.findUnique({ where: { email } });
        if (existing && !existing.active) return "/acces-refuse?raison=inactif";

        const role = resolveRoleOnSignIn(email, existing?.role ?? null, env.INITIAL_ADMIN_EMAIL);
        const names = {
          firstName: (profile.given_name as string | undefined) ?? null,
          lastName: (profile.family_name as string | undefined) ?? null,
        };

        if (!existing) {
          const created = await db.user.create({
            data: { email, role, lastLoginAt: new Date(), ...names },
          });
          await db.auditLog.create({
            data: {
              userId: created.id,
              action: "create",
              entity: "user",
              entityId: created.id,
              after: { email, role },
            },
          });
          return true;
        }

        await db.user.update({
          where: { id: existing.id },
          data: {
            role,
            lastLoginAt: new Date(),
            firstName: existing.firstName ?? names.firstName,
            lastName: existing.lastName ?? names.lastName,
          },
        });
        if (role !== existing.role) {
          await db.auditLog.create({
            data: {
              userId: existing.id,
              action: "role_change",
              entity: "user",
              entityId: existing.id,
              before: { role: existing.role },
              after: { role, reason: "INITIAL_ADMIN_EMAIL" },
            },
          });
        }
        return true;
      },

      async jwt({ token, profile }) {
        const now = Date.now();
        const isSignIn = Boolean(profile?.email);
        const isStale = !token.roleCheckedAt || now - token.roleCheckedAt > ROLE_REFRESH_INTERVAL_MS;
        if (!isSignIn && !isStale) return token;

        const email = normalizeEmail(isSignIn ? profile!.email! : (token.email ?? ""));
        const user = email
          ? await db.user.findUnique({
              where: { email },
              select: { id: true, role: true, active: true },
            })
          : null;

        // Deleted or deactivated accounts lose their session.
        if (!user || !user.active) return null;

        token.userId = user.id;
        token.role = user.role;
        token.roleCheckedAt = now;
        return token;
      },

      session({ session, token }) {
        if (token.userId && token.role) {
          session.user.id = token.userId;
          session.user.role = token.role;
        }
        return session;
      },
    },
  };
});
