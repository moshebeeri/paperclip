/**
 * CloudAccessGate tests — auth redirect, bootstrap_pending, ready, loading, error
 */
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, Outlet } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";

// We need to import the App module which contains CloudAccessGate (not exported directly).
// CloudAccessGate is used as a route element, so we test through App's route structure.
// Instead, we replicate the component logic in a minimal way by mocking the APIs it calls.

const mockHealthGet = vi.fn();
const mockGetSession = vi.fn();

vi.mock("../api/health", () => ({
  healthApi: { get: (...args: unknown[]) => mockHealthGet(...args) },
}));

vi.mock("../api/auth", () => ({
  authApi: { getSession: () => mockGetSession() },
}));

// Mock the router module to pass through react-router-dom
vi.mock("@/lib/router", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: actual.useNavigate,
    useSearchParams: actual.useSearchParams,
    Link: actual.Link,
    Navigate: actual.Navigate,
  };
});

// Mock heavy page components that CloudAccessGate renders as Outlet children
vi.mock("../pages/Dashboard", () => ({
  Dashboard: () => <div data-testid="dashboard">Dashboard</div>,
}));

// Mock context providers used by Layout / other components
vi.mock("../context/CompanyContext", () => ({
  useCompany: vi.fn(() => ({
    companies: [{ id: "comp-1", name: "Test Co", issuePrefix: "TC" }],
    selectedCompanyId: "comp-1",
    selectedCompany: { id: "comp-1", name: "Test Co", issuePrefix: "TC" },
    setSelectedCompanyId: vi.fn(),
    loading: false,
    error: null,
  })),
}));

vi.mock("../context/DialogContext", () => ({
  useDialog: vi.fn(() => ({
    openOnboarding: vi.fn(),
    closeOnboarding: vi.fn(),
    onboardingOpen: false,
    onboardingOptions: {},
    openNewIssue: vi.fn(),
    openNewGoal: vi.fn(),
  })),
}));

vi.mock("../context/BreadcrumbContext", () => ({
  useBreadcrumbs: vi.fn(() => ({ setBreadcrumbs: vi.fn() })),
}));

// Mock all page/layout imports from App.tsx that we don't need
vi.mock("../components/Layout", () => ({
  Layout: ({ children }: { children?: React.ReactNode }) => <div>{children}<Outlet /></div>,
}));
vi.mock("../components/OnboardingWizard", () => ({
  OnboardingWizard: () => null,
}));
vi.mock("../pages/Companies", () => ({ Companies: () => <div>Companies</div> }));
vi.mock("../pages/Agents", () => ({ Agents: () => <div>Agents</div> }));
vi.mock("../pages/AgentDetail", () => ({ AgentDetail: () => <div>AgentDetail</div> }));
vi.mock("../pages/Projects", () => ({ Projects: () => <div>Projects</div> }));
vi.mock("../pages/ProjectDetail", () => ({ ProjectDetail: () => <div>ProjectDetail</div> }));
vi.mock("../pages/Issues", () => ({ Issues: () => <div>Issues</div> }));
vi.mock("../pages/IssueDetail", () => ({ IssueDetail: () => <div>IssueDetail</div> }));
vi.mock("../pages/Goals", () => ({ Goals: () => <div>Goals</div> }));
vi.mock("../pages/GoalDetail", () => ({ GoalDetail: () => <div>GoalDetail</div> }));
vi.mock("../pages/Approvals", () => ({ Approvals: () => <div>Approvals</div> }));
vi.mock("../pages/ApprovalDetail", () => ({ ApprovalDetail: () => <div>ApprovalDetail</div> }));
vi.mock("../pages/Costs", () => ({ Costs: () => <div>Costs</div> }));
vi.mock("../pages/Activity", () => ({ Activity: () => <div>Activity</div> }));
vi.mock("../pages/Inbox", () => ({ Inbox: () => <div>Inbox</div> }));
vi.mock("../pages/CompanySettings", () => ({ CompanySettings: () => <div>CompanySettings</div> }));
vi.mock("../pages/DesignGuide", () => ({ DesignGuide: () => <div>DesignGuide</div> }));
vi.mock("../pages/OrgChart", () => ({ OrgChart: () => <div>OrgChart</div> }));
vi.mock("../pages/Auth", () => ({ AuthPage: () => <div data-testid="auth-page">Auth</div> }));
vi.mock("../pages/BoardClaim", () => ({ BoardClaimPage: () => <div>BoardClaim</div> }));
vi.mock("../pages/InviteLanding", () => ({ InviteLandingPage: () => <div>InviteLanding</div> }));

import { App } from "../App";

function renderApp(initialRoute = "/TC/dashboard") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("CloudAccessGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading state while health is loading", () => {
    mockHealthGet.mockReturnValue(new Promise(() => {})); // never resolves
    mockGetSession.mockResolvedValue(null);
    renderApp();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("shows error when health API fails", async () => {
    mockHealthGet.mockRejectedValue(new Error("Server down"));
    mockGetSession.mockResolvedValue(null);
    renderApp();
    expect(await screen.findByText("Server down")).toBeInTheDocument();
  });

  it("shows generic error when health fails with non-Error", async () => {
    mockHealthGet.mockRejectedValue("unknown");
    mockGetSession.mockResolvedValue(null);
    renderApp();
    expect(await screen.findByText("Failed to load app state")).toBeInTheDocument();
  });

  it("renders outlet content in local_trusted mode (no auth required)", async () => {
    mockHealthGet.mockResolvedValue({
      status: "ok",
      deploymentMode: "local_trusted",
      bootstrapStatus: "ready",
    });
    mockGetSession.mockResolvedValue(null);
    renderApp();
    expect(await screen.findByTestId("dashboard")).toBeInTheDocument();
  });

  it("redirects to /auth when authenticated mode and no session", async () => {
    mockHealthGet.mockResolvedValue({
      status: "ok",
      deploymentMode: "authenticated",
      bootstrapStatus: "ready",
    });
    mockGetSession.mockResolvedValue(null);
    renderApp("/TC/dashboard");
    // Should redirect to auth page
    expect(await screen.findByTestId("auth-page")).toBeInTheDocument();
  });

  it("shows bootstrap pending page when authenticated and bootstrap_pending", async () => {
    mockHealthGet.mockResolvedValue({
      status: "ok",
      deploymentMode: "authenticated",
      bootstrapStatus: "bootstrap_pending",
    });
    mockGetSession.mockResolvedValue({ userId: "user-1", email: "a@b.com" });
    renderApp();
    expect(await screen.findByText("Instance setup required")).toBeInTheDocument();
    expect(screen.getByText(/pnpm paperclipai auth bootstrap-ceo/)).toBeInTheDocument();
  });

  it("renders outlet when authenticated with valid session and ready status", async () => {
    mockHealthGet.mockResolvedValue({
      status: "ok",
      deploymentMode: "authenticated",
      bootstrapStatus: "ready",
    });
    mockGetSession.mockResolvedValue({ userId: "user-1", email: "a@b.com" });
    renderApp();
    expect(await screen.findByTestId("dashboard")).toBeInTheDocument();
  });

  it("shows loading when session is loading in authenticated mode", () => {
    mockHealthGet.mockResolvedValue({
      status: "ok",
      deploymentMode: "authenticated",
    });
    mockGetSession.mockReturnValue(new Promise(() => {})); // never resolves
    renderApp();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });
});
