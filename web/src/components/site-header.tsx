import Link from "next/link";
import { SignOutButton } from "@/features/members/components/sign-out-button";

type Props = { name: string; isAdmin: boolean };

export function SiteHeader({ name, isAdmin }: Props) {
  return (
    <header className="border-b">
      <div className="mx-auto flex w-full max-w-5xl items-center gap-4 px-4 py-3">
        <Link href="/" className="font-semibold">
          Job Search
        </Link>
        <nav className="flex flex-1 items-center gap-3 text-sm text-muted-foreground">
          <Link href="/profile" className="hover:text-foreground">
            Profile
          </Link>
          {isAdmin && (
            <Link href="/admin" className="hover:text-foreground">
              Admin
            </Link>
          )}
        </nav>
        <span className="hidden text-sm text-muted-foreground sm:inline">{name}</span>
        <SignOutButton />
      </div>
    </header>
  );
}
