"use client";

import { createContext, useContext } from "react";

export type Role = "admin" | "viewer";

const RoleCtx = createContext<Role>("admin");

export function RoleProvider({
  role,
  children,
}: {
  role: Role;
  children: React.ReactNode;
}) {
  return <RoleCtx.Provider value={role}>{children}</RoleCtx.Provider>;
}

export function useRole(): Role {
  return useContext(RoleCtx);
}

export function useIsAdmin(): boolean {
  return useContext(RoleCtx) === "admin";
}

export function useIsViewer(): boolean {
  return useContext(RoleCtx) === "viewer";
}
