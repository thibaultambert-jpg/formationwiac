import { SignOutButton } from "@/components/layout/sign-out-button";
import { displayName, type CurrentUser } from "@/server/auth/guards";
import { ROLE_LABELS } from "@/server/auth/policy";

export function UserMenu({ user }: { user: CurrentUser }) {
  return (
    <div className="flex items-center gap-3">
      <div className="hidden text-right text-sm leading-tight sm:block">
        <p className="font-medium">{displayName(user)}</p>
        <p className="text-foreground/70">{ROLE_LABELS[user.role]}</p>
      </div>
      <SignOutButton />
    </div>
  );
}
