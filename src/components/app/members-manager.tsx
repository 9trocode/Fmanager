"use client";

import { useState, useTransition } from "react";
import { Copy, Trash2, UserPlus, Mail, Clock, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  createInviteAction,
  removeMember,
  revokeInviteAction,
  setRegistrationMode,
} from "@/lib/actions/members";
import type { ListedInvite, ListedUser } from "@/lib/db/users";

type Mode = "closed" | "invite" | "open";

const MODE_COPY: Record<
  Mode,
  { label: string; dot: string; help: string }
> = {
  closed: {
    label: "Closed",
    dot: "bg-muted-foreground/40",
    help: "Nobody can register. Existing members can still sign in.",
  },
  invite: {
    label: "Invite-only",
    dot: "bg-emerald-500",
    help: "Only people with a code you've issued can create an account. Recommended for self-hosted instances on the open internet.",
  },
  open: {
    label: "Open",
    dot: "bg-amber-500",
    help: "Anyone reaching the registration URL can sign up — defaults to viewer (read-only). Switch back to invite-only if this URL is internet-reachable.",
  },
};

export function MembersManager({
  mode,
  users,
  invites,
  ownerEmail,
}: {
  mode: Mode;
  users: ListedUser[];
  invites: ListedInvite[];
  ownerEmail: string | null;
}) {
  return (
    <div className="space-y-4">
      <RegistrationModeCard currentMode={mode} />
      {mode !== "closed" ? <NewInviteCard /> : null}
      <InvitesList invites={invites} />
      <UsersList users={users} ownerEmail={ownerEmail} />
    </div>
  );
}

function RegistrationModeCard({ currentMode }: { currentMode: Mode }) {
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useState<Mode>(currentMode);

  function handleChange(next: Mode) {
    setOptimistic(next);
    const fd = new FormData();
    fd.set("mode", next === "closed" ? "" : next);
    startTransition(async () => {
      try {
        await setRegistrationMode(fd);
        toast.success(`Registration set to ${MODE_COPY[next].label}.`);
      } catch (e) {
        setOptimistic(currentMode);
        toast.error(e instanceof Error ? e.message : "Couldn't update.");
      }
    });
  }

  const copy = MODE_COPY[optimistic];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Registration</CardTitle>
        <CardDescription>
          Let family members or co-founders create their own accounts. Each
          account gets its own login + role.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-3">
          <Select
            value={optimistic}
            onValueChange={(v) => handleChange(v as Mode)}
            disabled={pending}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="closed">Closed</SelectItem>
              <SelectItem value="invite">Invite-only</SelectItem>
              <SelectItem value="open">Open</SelectItem>
            </SelectContent>
          </Select>
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <span
              className={`inline-block size-2 rounded-full ${copy.dot}`}
            />
            {copy.label}
          </span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {copy.help}
        </p>
      </CardContent>
    </Card>
  );
}

function NewInviteCard() {
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      try {
        await createInviteAction(formData);
        toast.success("Invite created.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't create invite.");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <UserPlus className="size-4 text-muted-foreground" />
          New invite
        </CardTitle>
        <CardDescription>
          Generate a one-time code. Share the link or code privately.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="invite_data_scope">Data access</Label>
              <Select name="data_scope" defaultValue="shared">
                <SelectTrigger id="invite_data_scope">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="shared">
                    Shared — sees your data
                  </SelectItem>
                  <SelectItem value="isolated">
                    Isolated — their own workspace
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite_role">Role</Label>
              <Select name="role" defaultValue="viewer">
                <SelectTrigger id="invite_role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">Viewer (read-only)</SelectItem>
                  <SelectItem value="admin">Admin (full access)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="invite_email">Email (optional)</Label>
              <Input
                id="invite_email"
                name="email"
                type="email"
                placeholder="lock to one address"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite_expires">Expires</Label>
              <Select name="expires_hours" defaultValue="168">
                <SelectTrigger id="invite_expires">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 hour</SelectItem>
                  <SelectItem value="24">1 day</SelectItem>
                  <SelectItem value="168">7 days</SelectItem>
                  <SelectItem value="720">30 days</SelectItem>
                  <SelectItem value="0">Never</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="rounded-md bg-secondary/50 p-2.5 text-[11px] text-muted-foreground leading-relaxed space-y-1">
            <p>
              <span className="font-medium text-foreground">Shared</span>{" "}
              — for partners and family who manage the same finances. They
              read + write your accounts, budgets, goals.
            </p>
            <p>
              <span className="font-medium text-foreground">Isolated</span>{" "}
              — for resell or hosting strangers. They get their own private
              SQLite file at{" "}
              <span className="font-mono">tenant_&lt;id&gt;.db</span>; you
              can&apos;t see their data and they can&apos;t see yours.
            </p>
          </div>
          <div>
            <Button type="submit" disabled={pending} loading={pending}>
              {pending ? "Creating…" : "Create invite"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function InvitesList({ invites }: { invites: ListedInvite[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Active invites</CardTitle>
        <CardDescription>
          {invites.length === 0
            ? "No active invites."
            : `${invites.length} unused, unexpired code${invites.length === 1 ? "" : "s"}.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {invites.length === 0 ? null : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code / link</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {invites.map((i) => (
                <InviteRow key={i.id} invite={i} />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function InviteRow({ invite }: { invite: ListedInvite }) {
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  function copyLink() {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/register?code=${invite.code}${invite.email ? `&email=${encodeURIComponent(invite.email)}` : ""}`;
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopied(true);
        toast.success("Invite link copied.");
        window.setTimeout(() => setCopied(false), 1800);
      })
      .catch(() => toast.error("Couldn't copy."));
  }

  function handleRevoke() {
    const fd = new FormData();
    fd.set("id", String(invite.id));
    startTransition(async () => {
      try {
        await revokeInviteAction(fd);
        toast.success("Invite revoked.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't revoke.");
      }
    });
  }

  return (
    <TableRow>
      <TableCell>
        <button
          type="button"
          onClick={copyLink}
          className="font-mono text-xs hover:text-foreground inline-flex items-center gap-1.5 text-muted-foreground"
          title="Click to copy invite link"
        >
          {copied ? (
            <Check className="size-3 text-emerald-500" />
          ) : (
            <Copy className="size-3" />
          )}
          {invite.code.slice(0, 8)}…{invite.code.slice(-4)}
        </button>
      </TableCell>
      <TableCell className="text-xs">
        {invite.email ? (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Mail className="size-3" />
            {invite.email}
          </span>
        ) : (
          <span className="text-muted-foreground/60">— any —</span>
        )}
      </TableCell>
      <TableCell>
        <Badge variant={invite.role === "admin" ? "default" : "secondary"}>
          {invite.role}
        </Badge>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {invite.expiresAt ? (
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3" />
            {new Date(invite.expiresAt).toLocaleString()}
          </span>
        ) : (
          <span className="text-muted-foreground/60">never</span>
        )}
      </TableCell>
      <TableCell>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground hover:text-destructive"
          onClick={handleRevoke}
          disabled={pending}
          title="Revoke"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

function UsersList({
  users,
  ownerEmail,
}: {
  users: ListedUser[];
  ownerEmail: string | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Members</CardTitle>
        <CardDescription>
          {users.length === 0
            ? "No additional members yet — only the owner can sign in."
            : `${users.length} additional member${users.length === 1 ? "" : "s"} besides the owner.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow className="bg-secondary/30">
              <TableCell className="font-mono text-xs">
                {ownerEmail ?? "—"}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                You (owner)
              </TableCell>
              <TableCell>
                <Badge>admin</Badge>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                —
              </TableCell>
              <TableCell />
            </TableRow>
            {users.map((u) => (
              <UserRow key={u.id} user={u} />
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function UserRow({ user }: { user: ListedUser }) {
  const [pending, startTransition] = useTransition();

  function handleRemove() {
    const fd = new FormData();
    fd.set("id", String(user.id));
    startTransition(async () => {
      try {
        await removeMember(fd);
        toast.success(`Removed ${user.email}.`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't remove.");
      }
    });
  }

  return (
    <TableRow>
      <TableCell className="font-mono text-xs">{user.email}</TableCell>
      <TableCell className="text-sm">
        {user.name ?? <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell>
        <Badge variant={user.role === "admin" ? "default" : "secondary"}>
          {user.role}
        </Badge>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {new Date(user.createdAt).toLocaleDateString()}
      </TableCell>
      <TableCell>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground hover:text-destructive"
              disabled={pending}
              title="Remove member"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove {user.email}?</AlertDialogTitle>
              <AlertDialogDescription>
                Their account is deleted. They lose access immediately and any
                active session is invalidated on next request.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleRemove}>
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </TableCell>
    </TableRow>
  );
}
