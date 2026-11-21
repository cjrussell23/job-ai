import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  reinstateAction,
  removeAction,
  spendCapAction,
  suspendAction,
} from "@/features/admin/actions";
import type { Member } from "@/features/members/members";

type Props = {
  members: Member[];
  defaultSpendCapCents: number;
  /** AI spend this month in dollars, keyed by user id. */
  spendByUser: Map<string, number>;
};

const stateLabels: Record<Member["state"], string> = {
  invited: "Invited",
  active: "Active",
  suspended: "Suspended",
};

export function MembersTable({ members, defaultSpendCapCents, spendByUser }: Props) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Google address</TableHead>
          <TableHead>State</TableHead>
          <TableHead>Spent this month</TableHead>
          <TableHead>Monthly cap ($)</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {members.map((member) => (
          <TableRow key={member.id}>
            <TableCell>
              {member.email}
              {member.role === "admin" && (
                <Badge variant="secondary" className="ml-2">
                  Admin
                </Badge>
              )}
            </TableCell>
            <TableCell>
              <Badge variant={member.state === "suspended" ? "destructive" : "outline"}>
                {stateLabels[member.state]}
              </Badge>
            </TableCell>
            <TableCell className="tabular-nums">
              ${(member.userId ? (spendByUser.get(member.userId) ?? 0) : 0).toFixed(2)}
            </TableCell>
            <TableCell>
              <form action={spendCapAction} className="flex gap-2">
                <input type="hidden" name="memberId" value={member.id} />
                <Input
                  name="spendCap"
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-24"
                  aria-label={`Monthly cap for ${member.email}`}
                  placeholder={(defaultSpendCapCents / 100).toFixed(2)}
                  defaultValue={
                    member.spendCapCents === null ? "" : (member.spendCapCents / 100).toFixed(2)
                  }
                />
                <Button type="submit" variant="outline" size="sm">
                  Set
                </Button>
              </form>
            </TableCell>
            <TableCell>
              {member.role !== "admin" && (
                <div className="flex justify-end gap-2">
                  <form action={member.state === "suspended" ? reinstateAction : suspendAction}>
                    <input type="hidden" name="memberId" value={member.id} />
                    <Button type="submit" variant="outline" size="sm">
                      {member.state === "suspended" ? "Reinstate" : "Suspend"}
                    </Button>
                  </form>
                  <form action={removeAction}>
                    <input type="hidden" name="memberId" value={member.id} />
                    <Button type="submit" variant="destructive" size="sm">
                      Remove
                    </Button>
                  </form>
                </div>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
