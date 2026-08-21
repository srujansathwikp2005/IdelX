"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { api, getToken, getStoredUser, setStoredUser, setToken, clearAuth, ApiError } from "@/lib/api-client";
import type { AuthResult, Kyc, User } from "@/lib/api-types";
import { ROUTES, PUBLIC_ROUTES, AUTH_PAGES } from "@/lib/constants";

type AuthContextValue = {
  user: User | null;
  login: (email: string, password: string) => Promise<User>;
  register: (payload: RegisterPayload) => Promise<User>;
  logout: () => void;
  refreshUser: () => Promise<User | null>;
};

export type RegisterPayload = {
  name: string;
  email: string;
  phone?: string;
  phoneVerificationToken?: string;
  password: string;
  becomeOwner?: boolean;
};

const AuthContext = React.createContext<AuthContextValue | null>(null);

/**
 * Frontend-only auth fallback. The backend may not be running yet, so
 * login/register first try the real API and, when the backend is
 * unreachable, fall back to a localStorage-backed mock store. This lets
 * the whole flow work purely in the frontend for now.
 */

type MockUser = User & { password: string };

const MOCK_USERS_KEY = "idlex_mock_users";
const MOCK_TOKEN_PREFIX = "mock-";

const DEMO_USER: MockUser = {
  _id: "mock-demo-user",
  name: "Demo Renter",
  email: "demo@idlex.com",
  phone: "+91 00000 00000",
  password: "demo1234",
  role: "renter",
  isOwner: false,
  isRenter: true,
  isPhoneVerified: false,
  isEmailVerified: true,
  isActive: true,
  avatarUrl: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

// Default admin account — mirrors the backend seed (admin@idlex.com / admin12345)
// so the admin console works in offline demo mode too.
const ADMIN_DEMO_USER: MockUser = {
  _id: "mock-admin-user",
  name: "Admin",
  email: "admin@idlex.com",
  password: "admin12345",
  role: "admin",
  isOwner: true,
  isRenter: true,
  isPhoneVerified: true,
  isEmailVerified: true,
  isActive: true,
  avatarUrl: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export function isNetworkError(err: unknown): boolean {
  return err instanceof Error && !("status" in err);
}

export function isUnauthorizedError(err: unknown): boolean {
  return err instanceof Error && "status" in err && err.status === 401;
}

export function isMockSession(): boolean {
  return !!getToken()?.startsWith(MOCK_TOKEN_PREFIX);
}

function getMockUsers(): MockUser[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(MOCK_USERS_KEY);
    return raw ? (JSON.parse(raw) as MockUser[]) : [];
  } catch {
    return [];
  }
}

function saveMockUsers(users: MockUser[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MOCK_USERS_KEY, JSON.stringify(users));
}

function seedMockUsers(): void {
  // Drop the legacy demo admin (admin@gmail.com / admin) left in older
  // localStorage stores — the backend seeds admin@idlex.com / admin12345,
  // and a mock session for an account the backend doesn't know silently
  // breaks the admin console.
  const users = getMockUsers().filter((u) => !(u.email === "admin@gmail.com" && u.password === "admin"));
  for (const demo of [DEMO_USER, ADMIN_DEMO_USER]) {
    if (!users.some((u) => u.email === demo.email)) users.push(demo);
  }
  saveMockUsers(users);
}

function mockLogin(email: string, password: string): User {
  seedMockUsers();
  const match = getMockUsers().find(
    (u) => u.email.toLowerCase() === email.trim().toLowerCase() && u.password === password
  );
  if (!match) {
    throw new Error("Invalid email or password.");
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password: _pw, ...safe } = match;
  setToken(`${MOCK_TOKEN_PREFIX}${Date.now()}`);
  setStoredUser(safe);
  return safe;
}

function mockRegister(payload: RegisterPayload): User {
  seedMockUsers();
  const users = getMockUsers();
  const email = payload.email.trim().toLowerCase();
  if (users.some((u) => u.email === email)) {
    throw new Error("Email already registered");
  }
  const user: MockUser = {
    _id: `mock-${Date.now()}`,
    name: payload.name,
    email,
    phone: payload.phone,
    password: payload.password,
    role: payload.becomeOwner ? "owner" : "renter",
    isOwner: !!payload.becomeOwner,
    isRenter: true,
    // Mock mode can't send SMS OTPs, so a registered phone counts as verified.
    isPhoneVerified: !!payload.phone,
    isEmailVerified: true,
    isActive: true,
    avatarUrl: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  users.push(user);
  saveMockUsers(users);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password: _pw, ...safe } = user;
  setToken(`${MOCK_TOKEN_PREFIX}${Date.now()}`);
  setStoredUser(safe);
  return safe;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(() => getStoredUser<User>());

  const login = React.useCallback(async (email: string, password: string) => {
    let result: AuthResult;
    try {
      result = await api.post<AuthResult>("/api/auth/login", { email, password });
    } catch (err) {
      if (isNetworkError(err)) {
        result = { user: mockLogin(email, password), accessToken: "", refreshToken: "" };
      } else if (isUnauthorizedError(err)) {
        // Backend is up but has no record of this locally-registered account.
        try {
          result = { user: mockLogin(email, password), accessToken: "", refreshToken: "" };
        } catch {
          throw err;
        }
      } else {
        throw err;
      }
    }
    setToken(result.accessToken);
    setStoredUser(result.user);
    setUser(result.user);
    return result.user;
  }, []);

  const register = React.useCallback(async (payload: RegisterPayload) => {
    let result: AuthResult;
    try {
      result = await api.post<AuthResult>("/api/auth/register", {
        name: payload.name,
        email: payload.email,
        phone: payload.phone,
        phoneVerificationToken: payload.phoneVerificationToken,
        password: payload.password,
      });
    } catch (err) {
      if (!isNetworkError(err)) throw err;
      result = { user: mockRegister(payload), accessToken: "", refreshToken: "" };
    }
    setToken(result.accessToken);
    setStoredUser(result.user);
    setUser(result.user);

    if (payload.becomeOwner) {
      try {
        const updated = await api.patch<User>("/api/auth/me", { becomeOwner: true });
        setStoredUser(updated);
        setUser(updated);
        return updated;
      } catch (err) {
        if (!isNetworkError(err)) throw err;
        const updated: User = { ...result.user, role: "owner", isOwner: true };
        const users = getMockUsers();
        const idx = users.findIndex((u) => u.email === updated.email);
        if (idx >= 0) {
          users[idx] = { ...users[idx], role: "owner", isOwner: true };
          saveMockUsers(users);
        }
        setStoredUser(updated);
        setUser(updated);
        return updated;
      }
    }
    return result.user;
  }, []);

  const refreshUser = React.useCallback(async () => {
    try {
      const fresh = await api.get<User>("/api/auth/me");
      setStoredUser(fresh);
      setUser(fresh);
      return fresh;
    } catch (err) {
      if (!isNetworkError(err) && !isMockSession()) throw err;
      const stored = getStoredUser<User>();
      if (stored) {
        setUser(stored);
        return stored;
      }
      throw err;
    }
  }, []);

  const logout = React.useCallback(() => {
    clearAuth();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function useErrorMessage(error: Error | null): string {
  return React.useMemo(() => (error instanceof Error ? error.message : ""), [error]);
}

/**
 * True only after the component has hydrated. Auth state is restored from
 * localStorage during hydration, so anything user-dependent must wait for
 * the client to mount — otherwise SSR renders the loading state while the
 * client hydrates the real page, and React throws a hydration mismatch.
 */
export function useIsMounted(): boolean {
  return React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
}

/**
 * Client-side auth guard. Renders children once a user is loaded; if no
 * token exists it redirects to /login and shows a loading placeholder.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, refreshUser } = useAuth();
  const router = useRouter();
  const mounted = useIsMounted();

  React.useEffect(() => {
    if (getStoredUser<User>() && !user && !isMockSession()) {
      refreshUser().catch(() => clearAuth());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (mounted && !user) router.replace(ROUTES.LOGIN);
  }, [user, router, mounted]);

  if (!mounted || !user) {
    return (
      <div className="grid min-h-screen place-items-center bg-muted">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }
  return <>{children}</>;
}

/**
 * Global route guard (client-side). Public pages — home and the auth
 * pages — are always visible; every other page requires a logged-in
 * user and redirects to /login. Logged-in users are sent back to home
 * when they visit an auth page.
 */
export function RouteGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const mounted = useIsMounted();

  const isPublic = PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
  const isAuthPage = AUTH_PAGES.some((route) => pathname === route || pathname.startsWith(`${route}/`));

  React.useEffect(() => {
    if (isPublic) return;
    if (mounted && !user) {
      router.replace(`${ROUTES.LOGIN}?next=${encodeURIComponent(pathname)}`);
    }
  }, [pathname, user, isPublic, mounted, router]);

  React.useEffect(() => {
    if (mounted && user && isAuthPage) {
      router.replace(ROUTES.HOME);
    }
  }, [user, isAuthPage, mounted, router]);

  if (!isPublic && (!mounted || !user)) {
    return (
      <div className="grid min-h-screen place-items-center bg-muted">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }
  return <>{children}</>;
}

/**
 * KYC gate. Blocks the listing form (and any other wrapped page) until
 * the user's KYC verification has been approved — anyone who hasn't
 * completed it is redirected to /kyc to finish it first.
 */
export function RequireKyc({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const mounted = useIsMounted();
  const [verified, setVerified] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    if (!mounted) return;
    let cancelled = false;
    api
      .get<Kyc>("/api/kyc")
      .then((kyc) => {
        if (cancelled) return;
        const approved = kyc.status === "approved";
        setVerified(approved);
        if (!approved) router.replace(ROUTES.KYC);
      })
      .catch(() => {
        if (cancelled) return;
        setVerified(false);
        router.replace(ROUTES.KYC);
      });
    return () => {
      cancelled = true;
    };
  }, [mounted, router]);

  if (!mounted || verified !== true) {
    return (
      <div className="grid min-h-screen place-items-center bg-muted">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }
  return <>{children}</>;
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof Error && "status" in err;
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError && err.details && typeof err.details === "object") {
    const fieldErrors = err.details as Record<string, string[] | undefined>;
    const parts = Object.entries(fieldErrors)
      .filter(([, messages]) => Array.isArray(messages) && messages.length > 0)
      .map(([field, messages]) => `${field}: ${(messages as string[]).join(", ")}`);
    if (parts.length > 0) {
      return `${err.message} — ${parts.join("; ")}`;
    }
  }
  if (err instanceof Error) return err.message;
  return String(err);
}
