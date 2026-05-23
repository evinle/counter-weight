import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { authRoutes } from "./routes.js";
import { mockEnv } from "../test/envHelpers.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function makeApp() {
  const app = Fastify({ logger: false });
  app.register(cookie);
  app.register(authRoutes, { prefix: "/auth" });
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockEnv();
});

describe("POST /auth/callback", () => {
  it("sets httpOnly cookie and returns idToken on successful code exchange", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id_token: "test-id-token",
        refresh_token: "test-refresh-token",
        expires_in: 3600,
      }),
    });

    const app = makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/auth/callback",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code: "auth-code-123",
        origin: "https://localhost:5174",
      }),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ idToken: "test-id-token", expiresIn: 3600 });
    const setCookie = res.headers["set-cookie"] as string;
    expect(setCookie).toContain("refresh_token=test-refresh-token");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Strict");
  });

  it("returns 400 if Cognito token exchange fails", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });

    const app = makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/auth/callback",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code: "bad-code",
        origin: "https://localhost:5174",
      }),
    });

    expect(res.statusCode).toBe(400);
  });
});

describe("POST /auth/refresh", () => {
  it("returns new idToken when valid refresh cookie is present", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id_token: "new-id-token", expires_in: 3600 }),
    });

    const app = makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      cookies: { refresh_token: "valid-refresh-token" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().idToken).toBe("new-id-token");
  });

  it("returns 401 when no refresh cookie is present", async () => {
    const app = makeApp();
    const res = await app.inject({ method: "POST", url: "/auth/refresh" });
    expect(res.statusCode).toBe(401);
  });

  it("clears cookie and returns 401 when Cognito rejects the refresh token", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });

    const app = makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      cookies: { refresh_token: "expired-token" },
    });

    expect(res.statusCode).toBe(401);
    const setCookie = res.headers["set-cookie"] as string;
    expect(setCookie).toContain("refresh_token=;");
  });
});

describe("POST /auth/logout", () => {
  it("clears the refresh_token cookie", async () => {
    const app = makeApp();
    const res = await app.inject({ method: "POST", url: "/auth/logout" });
    expect(res.statusCode).toBe(200);
    const setCookie = res.headers["set-cookie"] as string;
    expect(setCookie).toContain("refresh_token=;");
  });
});
