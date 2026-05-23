import { useState, useEffect, useRef } from "react";
import { setIdToken } from "../lib/trpc";

export type AuthState =
  | "loading"
  | "unauthenticated"
  | "authenticated"
  | "guest";

export interface AuthUser {
  userId: string;
  email: string;
}

export interface UseAuth {
  state: AuthState;
  user: AuthUser | null;
  login: () => void;
  logout: () => Promise<void>;
  continueAsGuest: () => void;
}

function parseJwt(token: string): AuthUser | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return { userId: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}

export function useAuth(): UseAuth {
  const [state, setState] = useState<AuthState>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const mounted = useRef(false);

  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    fetch("/auth/refresh", {
      method: "POST",
      credentials: "include",
      signal: controller.signal,
    })
      .then(async (res) => {
        clearTimeout(timeout);
        if (!res.ok) {
          setState("unauthenticated");
          return;
        }
        const { idToken } = (await res.json()) as { idToken: string };
        setIdToken(idToken);
        const u = parseJwt(idToken);
        setUser(u);
        setState(u ? "authenticated" : "unauthenticated");
      })
      .catch(() => {
        clearTimeout(timeout);
        setState("unauthenticated");
      });
  }, []);

  function login() {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: import.meta.env.VITE_COGNITO_CLIENT_ID,
      redirect_uri: `${window.location.origin}/auth/callback`,
      scope: "email openid profile",
    });
    window.location.href = `${import.meta.env.VITE_COGNITO_DOMAIN}/oauth2/authorize?${params}`;
  }

  function continueAsGuest() {
    setState("guest");
  }

  async function logout() {
    if (state !== "guest") {
      await fetch("/auth/logout", { method: "POST", credentials: "include" });
    }
    setIdToken(null);
    setUser(null);
    setState("unauthenticated");
    localStorage.removeItem("cw:lastSyncedAt");
  }

  return { state, user, login, logout, continueAsGuest };
}
