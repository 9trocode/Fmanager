"use client";

import { EyeIcon, EyeOffIcon } from "lucide-react";

import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import React, { useState } from "react";

interface PasswordInputProps extends React.ComponentProps<"input"> {
  label?: string;
  id?: string;
  placeholder?: string;
  labelClassName?: string;
  error?: string | null;
}

export function PasswordInput({
  label,
  id = "password",
  placeholder = "Enter Password",
  labelClassName,
  error,
  ...props
}: PasswordInputProps) {
  const [show, setShow] = useState<boolean>(false);

  return (
    <Field className="gap-0 space-y-1.5">
      {label && (
        <FieldLabel htmlFor={id} className={labelClassName}>
          {label}
        </FieldLabel>
      )}
      <InputGroup>
        <InputGroupInput
          id={id}
          type={show ? "text" : "password"}
          placeholder={placeholder}
          autoComplete={"off"}
          {...props}
        />
        <InputGroupButton
          type="button"
          onClick={() => setShow((p) => !p)}
          aria-label={show ? "Hide password" : "Show password"}
          className="mx-0.5"
        >
          {show ? (
            <EyeOffIcon className="size-4" />
          ) : (
            <EyeIcon className="size-4" />
          )}{" "}
        </InputGroupButton>
      </InputGroup>
      {error && (
        <FieldDescription className="text-destructive text-[0.75rem]">
          {error}
        </FieldDescription>
      )}
    </Field>
  );
}
