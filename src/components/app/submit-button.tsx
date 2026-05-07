"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import type { ComponentProps } from "react";

/**
 * `<SubmitButton>` for forms that POST a server action directly via
 * `<form action={serverAction}>` — i.e. forms that don't manage their own
 * `useTransition` state.
 *
 * Reads `useFormStatus().pending` from the parent <form> and forwards it
 * as `loading` to <Button>, so the user gets a spinner + disabled state
 * automatically while the action is in flight.
 *
 * Drop-in for any place that currently has `<Button type="submit">…</Button>`
 * inside a server-action form.
 */
export function SubmitButton({
  children,
  loadingText,
  ...buttonProps
}: ComponentProps<typeof Button> & { loadingText?: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      {...buttonProps}
      disabled={pending || buttonProps.disabled}
      loading={pending}
      loadingText={loadingText}
    >
      {children}
    </Button>
  );
}
