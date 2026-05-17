"use client";

import { EyeIcon, EyeOffIcon } from "lucide-react";

import { Field, FieldLabel } from "@/components/ui/field";
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
}

export function PasswordInput({
  label = "Password",
  id = "password",
  placeholder = "Enter Password",
  ...props
}: PasswordInputProps) {
  const [show, setShow] = useState<boolean>(false);

  return (
    <Field className="max-w-sm gap-0 space-y-1.5">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
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
    </Field>
  );
}
