import { describe, expect, it, vi } from "vitest";
import {
  BOOTSTRAP_SECTIONS,
  fetchBootstrap,
  isAuthFailureResponse,
  isBootstrapResponse,
} from "../src/api.js";

const ENDPOINT = "https://example.com/exec";
const jsonResponse = (obj) => ({ json: async () => obj });

// A full bootstrap payload, in the shape social-gas serves it:
// every section exactly what its own request returns, the
// detail section being the sns_detail overview scope.
const reportSection = () => ({ ok: true, data: { rows: [] } });
const bootstrapPayload = () => ({
  ok: true,
  action: "bootstrap",
  totals: {
    ok: true,
    data: {
      rows: [
        {
          metricValues: [{ value: "1000" }, { value: "100" }, { value: "120" }],
        },
      ],
    },
  },
  daily: reportSection(),
  pages: reportSection(),
  speed: reportSection(),
  scroll: reportSection(),
  sources: reportSection(),
  detail: { ok: true, action: "sns_detail", detail_scope: "overview" },
  history: { ok: true, rows: [] },
});

describe("fetchBootstrap", () => {
  it("asks the bridge for the bootstrap action with the caller's auth", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(bootstrapPayload()));
    const result = await fetchBootstrap(
      ENDPOINT,
      { sessionToken: "session-1" },
      fetchImpl,
    );
    expect(result.action).toBe("bootstrap");
    const url = new URL(fetchImpl.mock.calls[0][0]);
    expect(url.searchParams.get("action")).toBe("bootstrap");
    expect(url.searchParams.get("session_token")).toBe("session-1");
  });
});

describe("isBootstrapResponse", () => {
  it("accepts a full bootstrap payload", () => {
    expect(isBootstrapResponse(bootstrapPayload())).toBe(true);
  });

  it("rejects the report payload an old bridge answers the action with", () => {
    // No bootstrap branch: the request falls through to the
    // blog report builder, whose answer is a plain report —
    // possibly ok: true, never a bootstrap.
    expect(isBootstrapResponse({ ok: true, data: { rows: [] } })).toBe(false);
    expect(
      isBootstrapResponse({ ok: true, action: "sns_detail", data: { rows: [] } }),
    ).toBe(false);
  });

  it("rejects a payload missing any one section", () => {
    for (const key of BOOTSTRAP_SECTIONS) {
      const payload = bootstrapPayload();
      delete payload[key];
      expect(isBootstrapResponse(payload)).toBe(false);
    }
  });

  it("rejects a payload whose section is not an object", () => {
    const payload = bootstrapPayload();
    payload.history = null;
    expect(isBootstrapResponse(payload)).toBe(false);
    payload.history = "rows";
    expect(isBootstrapResponse(payload)).toBe(false);
  });

  it("rejects non-objects", () => {
    expect(isBootstrapResponse(null)).toBe(false);
    expect(isBootstrapResponse(undefined)).toBe(false);
    expect(isBootstrapResponse("bootstrap")).toBe(false);
  });
});

describe("isAuthFailureResponse", () => {
  it("recognises the 401 / 403 verdict shape", () => {
    expect(isAuthFailureResponse({ ok: false, status: 401, error: "x" })).toBe(
      true,
    );
    expect(isAuthFailureResponse({ ok: false, status: 403, error: "x" })).toBe(
      true,
    );
  });

  it("does not read other failures as the auth verdict", () => {
    // A section-style failure carries no status: it is an
    // ordinary failure, not the verdict.
    expect(isAuthFailureResponse({ ok: false, error: "bridge error" })).toBe(
      false,
    );
    expect(isAuthFailureResponse({ ok: false, status: 500, error: "x" })).toBe(
      false,
    );
    expect(isAuthFailureResponse({ ok: true, status: 401 })).toBe(false);
    expect(isAuthFailureResponse(null)).toBe(false);
  });
});
