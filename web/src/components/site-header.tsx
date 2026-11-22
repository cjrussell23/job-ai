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
          <Link href="/board" className="hover:text-foreground">
            Board
          </Link>
          <Link href="/interview" className="hover:text-foreground">
            Interview
          </Link>
          <Link href="/profile" className="hover:text-foreground">
            Profile
          </Link>
          <Link href="/resumes" className="hover:text-foreground">
            Resumes
          </Link>
          <Link href="/targets" className="hover:text-foreground">
            Job targets
          </Link>
          <Link href="/companies" className="hover:text-foreground">
            Companies
          </Link>
          {isAdmin && (
            <Link href="/admin" className="hover:text-foreground">
              Admin
            </Link>
          )}
        </nav>
        <Link
          href="/account"
          className="hidden text-sm text-muted-foreground hover:text-foreground sm:inline"
        >
          {name}
        </Link>
        <SignOutButton />
      </div>
    </header>
  );
}
