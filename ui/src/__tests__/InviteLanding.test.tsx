/**
 * InviteLanding tests — bootstrap CEO, company join, expired/invalid invites
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetInvite = vi.fn();
const mockAcceptInvite = vi.fn();
const mockHealthGet = vi.fn();
const mockGetSession = vi.fn();

vi.mock("../api/access", () => ({
  accessApi: {
    getInvite: (...args: unknown[]) => mockGetInvite(...args),
    acceptInvite: (...args: unknown[]) => mockAcceptInvite(...args),
  },
}));

vi.mock("../api/health", () => ({
  healthApi: { get: () => mockHealthGet() },
}));

vi.mock("../api/auth", () => ({
  authApi: { getSession: () => mockGetSession() },
}));

vi.mock("@/lib/router", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: actual.useNavigate,
    useParams: actual.useParams,
    Link: actual.Link,
  };
});

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, disabled, onClick, asChild, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) => {
    if (asChild) return <>{children}</>;
    return <button disabled={disabled} onClick={onClick} {...props}>{children}</button>;
  },
}));

vi.mock("@paperclipai/shared", () => ({
  AGENT_ADAPTER_TYPES: ["openclaw", "claude_local", "codex_local", "opencode_local", "cursor", "process", "http"],
}));

import { InviteLandingPage } from "../pages/InviteLanding";

function renderInvite(token = "test-token-123") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/invite/${token}`]}>
        <Routes>
          <Route path="/invite/:token" element={<InviteLandingPage />} />
          <Route path="/auth" element={<div data-testid="auth-page">Auth</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function renderInviteNoToken() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/invite/ "]}>
        <Routes>
          <Route path="/invite/:token" element={<InviteLandingPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("InviteLandingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHealthGet.mockResolvedValue({
      status: "ok",
      deploymentMode: "local_trusted",
    });
    mockGetSession.mockResolvedValue(null);
  });

  // ── Loading & error states ──────────────────────────────────────────────

  it("shows loading while invite is being fetched", () => {
    mockGetInvite.mockReturnValue(new Promise(() => {})); // never resolves
    renderInvite();
    expect(screen.getByText("Loading invite...")).toBeInTheDocument();
  });

  it("shows invalid token message for blank token", () => {
    renderInviteNoToken();
    expect(screen.getByText("Invalid invite token.")).toBeInTheDocument();
  });

  it("shows invite not available when fetch fails", async () => {
    mockGetInvite.mockRejectedValue(new Error("Not found"));
    renderInvite();
    expect(await screen.findByText("Invite not available")).toBeInTheDocument();
    expect(screen.getByText(/expired, revoked, or already used/)).toBeInTheDocument();
  });

  // ── Bootstrap CEO invite ────────────────────────────────────────────────

  it("renders bootstrap CEO invite page", async () => {
    mockGetInvite.mockResolvedValue({
      id: "inv-1",
      companyId: null,
      inviteType: "bootstrap_ceo",
      allowedJoinTypes: "both",
      expiresAt: "2026-12-31T00:00:00Z",
    });
    renderInvite();
    expect(await screen.findByText("Bootstrap your Paperclip instance")).toBeInTheDocument();
    expect(screen.getByText("Accept bootstrap invite")).toBeInTheDocument();
  });

  it("does not show join type toggle for bootstrap invite", async () => {
    mockGetInvite.mockResolvedValue({
      id: "inv-1",
      companyId: null,
      inviteType: "bootstrap_ceo",
      allowedJoinTypes: "both",
      expiresAt: "2026-12-31T00:00:00Z",
    });
    renderInvite();
    await screen.findByText("Bootstrap your Paperclip instance");
    expect(screen.queryByText("Join as human")).not.toBeInTheDocument();
    expect(screen.queryByText("Join as agent")).not.toBeInTheDocument();
  });

  it("shows bootstrap complete after accepting bootstrap invite", async () => {
    mockGetInvite.mockResolvedValue({
      id: "inv-1",
      companyId: null,
      inviteType: "bootstrap_ceo",
      allowedJoinTypes: "both",
      expiresAt: "2026-12-31T00:00:00Z",
    });
    mockAcceptInvite.mockResolvedValue({ bootstrapAccepted: true, userId: "u-1" });

    const user = userEvent.setup();
    renderInvite();
    await screen.findByText("Accept bootstrap invite");
    await user.click(screen.getByText("Accept bootstrap invite"));

    expect(await screen.findByText("Bootstrap complete")).toBeInTheDocument();
    expect(screen.getByText(/first instance admin is now configured/)).toBeInTheDocument();
    expect(screen.getByText("Open board")).toBeInTheDocument();
  });

  // ── Company join invite ─────────────────────────────────────────────────

  it("renders company join invite page with join type toggles", async () => {
    mockGetInvite.mockResolvedValue({
      id: "inv-2",
      companyId: "comp-1",
      inviteType: "company_join",
      allowedJoinTypes: "both",
      expiresAt: "2026-12-31T00:00:00Z",
    });
    renderInvite();
    expect(await screen.findByText("Join this Paperclip company")).toBeInTheDocument();
    expect(screen.getByText("Join as human")).toBeInTheDocument();
    expect(screen.getByText("Join as agent")).toBeInTheDocument();
  });

  it("shows agent form fields when Join as agent is selected", async () => {
    mockGetInvite.mockResolvedValue({
      id: "inv-2",
      companyId: "comp-1",
      inviteType: "company_join",
      allowedJoinTypes: "both",
      expiresAt: "2026-12-31T00:00:00Z",
    });

    const user = userEvent.setup();
    renderInvite();
    await screen.findByText("Join this Paperclip company");
    await user.click(screen.getByText("Join as agent"));

    expect(screen.getByText("Agent name")).toBeInTheDocument();
    expect(screen.getByText("Adapter type")).toBeInTheDocument();
  });

  it("disables submit when agent name is empty", async () => {
    mockGetInvite.mockResolvedValue({
      id: "inv-2",
      companyId: "comp-1",
      inviteType: "company_join",
      allowedJoinTypes: "both",
      expiresAt: "2026-12-31T00:00:00Z",
    });

    const user = userEvent.setup();
    renderInvite();
    await screen.findByText("Join this Paperclip company");
    await user.click(screen.getByText("Join as agent"));

    expect(screen.getByText("Submit join request")).toBeDisabled();
  });

  it("submits human join request", async () => {
    mockGetInvite.mockResolvedValue({
      id: "inv-2",
      companyId: "comp-1",
      inviteType: "company_join",
      allowedJoinTypes: "both",
      expiresAt: "2026-12-31T00:00:00Z",
    });
    mockAcceptInvite.mockResolvedValue({
      id: "req-1",
      requestType: "human",
      status: "pending_approval",
    });

    const user = userEvent.setup();
    renderInvite();
    await screen.findByText("Join this Paperclip company");
    // Human is default, just click submit
    await user.click(screen.getByText("Submit join request"));

    await waitFor(() => {
      expect(mockAcceptInvite).toHaveBeenCalledWith("test-token-123", { requestType: "human" });
    });

    expect(await screen.findByText("Join request submitted")).toBeInTheDocument();
  });

  it("shows error on failed accept", async () => {
    mockGetInvite.mockResolvedValue({
      id: "inv-2",
      companyId: "comp-1",
      inviteType: "company_join",
      allowedJoinTypes: "both",
      expiresAt: "2026-12-31T00:00:00Z",
    });
    mockAcceptInvite.mockRejectedValue(new Error("Invite expired"));

    const user = userEvent.setup();
    renderInvite();
    await screen.findByText("Submit join request");
    await user.click(screen.getByText("Submit join request"));

    expect(await screen.findByText("Invite expired")).toBeInTheDocument();
  });

  // ── Auth required for human join ────────────────────────────────────────

  it("shows sign-in prompt when authenticated mode and no session for human join", async () => {
    mockHealthGet.mockResolvedValue({
      status: "ok",
      deploymentMode: "authenticated",
    });
    mockGetSession.mockResolvedValue(null);
    mockGetInvite.mockResolvedValue({
      id: "inv-2",
      companyId: "comp-1",
      inviteType: "company_join",
      allowedJoinTypes: "human",
      expiresAt: "2026-12-31T00:00:00Z",
    });

    renderInvite();
    expect(await screen.findByText(/Sign in or create an account/)).toBeInTheDocument();
    expect(screen.getByText("Sign in / Create account")).toBeInTheDocument();
    expect(screen.getByText("Submit join request")).toBeDisabled();
  });

  // ── Only agent join type ────────────────────────────────────────────────

  it("shows only agent option when allowedJoinTypes is agent", async () => {
    mockGetInvite.mockResolvedValue({
      id: "inv-3",
      companyId: "comp-1",
      inviteType: "company_join",
      allowedJoinTypes: "agent",
      expiresAt: "2026-12-31T00:00:00Z",
    });

    renderInvite();
    await screen.findByText("Join this Paperclip company");
    expect(screen.getByText("Join as agent")).toBeInTheDocument();
    expect(screen.queryByText("Join as human")).not.toBeInTheDocument();
    // Agent form fields should be visible
    expect(screen.getByText("Agent name")).toBeInTheDocument();
  });

  it("shows expiry date", async () => {
    mockGetInvite.mockResolvedValue({
      id: "inv-2",
      companyId: "comp-1",
      inviteType: "company_join",
      allowedJoinTypes: "both",
      expiresAt: "2026-12-31T00:00:00Z",
    });
    renderInvite();
    await screen.findByText("Join this Paperclip company");
    expect(screen.getByText(/Invite expires/)).toBeInTheDocument();
  });
});
