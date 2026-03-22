/**
 * Dashboard page tests — metrics, activity, empty states
 */
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock router
vi.mock("@/lib/router", () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams()],
  Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...props}>{children}</a>
  ),
}));

// Mock contexts
const mockOpenOnboarding = vi.fn();

vi.mock("../context/CompanyContext", () => ({
  useCompany: vi.fn(() => ({
    companies: [{ id: "comp-1", name: "Test Co" }],
    selectedCompanyId: "comp-1",
    selectedCompany: { id: "comp-1", name: "Test Co" },
    loading: false,
    error: null,
  })),
}));

vi.mock("../context/DialogContext", () => ({
  useDialog: vi.fn(() => ({
    openOnboarding: mockOpenOnboarding,
    openNewIssue: vi.fn(),
    openNewGoal: vi.fn(),
  })),
}));

vi.mock("../context/BreadcrumbContext", () => ({
  useBreadcrumbs: vi.fn(() => ({
    setBreadcrumbs: vi.fn(),
  })),
}));

// Mock APIs
vi.mock("../api/dashboard", () => ({
  dashboardApi: {
    summary: vi.fn(() => Promise.resolve({
      agents: { active: 2, running: 1, paused: 1, error: 0 },
      tasks: { open: 5, inProgress: 2, blocked: 1 },
      costs: { monthSpendCents: 5000, monthBudgetCents: 10000, monthUtilizationPercent: 50 },
      pendingApprovals: 3,
      staleTasks: 1,
    })),
  },
}));

vi.mock("../api/activity", () => ({
  activityApi: { list: vi.fn(() => Promise.resolve([])) },
}));

vi.mock("../api/issues", () => ({
  issuesApi: { list: vi.fn(() => Promise.resolve([])) },
}));

vi.mock("../api/agents", () => ({
  agentsApi: { list: vi.fn(() => Promise.resolve([])) },
}));

vi.mock("../api/projects", () => ({
  projectsApi: { list: vi.fn(() => Promise.resolve([])) },
}));

vi.mock("../api/heartbeats", () => ({
  heartbeatsApi: { list: vi.fn(() => Promise.resolve([])) },
}));

// Mock heavy chart components
vi.mock("../components/ActiveAgentsPanel", () => ({
  ActiveAgentsPanel: () => <div data-testid="active-agents">Active Agents</div>,
}));

vi.mock("../components/ActivityCharts", () => ({
  ChartCard: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div data-testid={`chart-${title}`}>{children}</div>
  ),
  RunActivityChart: () => <div>RunActivity</div>,
  PriorityChart: () => <div>Priority</div>,
  IssueStatusChart: () => <div>IssueStatus</div>,
  SuccessRateChart: () => <div>SuccessRate</div>,
}));

vi.mock("../components/PageSkeleton", () => ({
  PageSkeleton: () => <div data-testid="page-skeleton">Loading...</div>,
}));

vi.mock("../components/EmptyState", () => ({
  EmptyState: ({ message, action, onAction }: { message: string; action?: string; onAction?: () => void }) => (
    <div data-testid="empty-state">
      <p>{message}</p>
      {action && <button onClick={onAction}>{action}</button>}
    </div>
  ),
}));

vi.mock("../components/MetricCard", () => ({
  MetricCard: ({ label, value }: { label: string; value: string | number }) => (
    <div data-testid={`metric-${label}`}>{value} {label}</div>
  ),
}));

import { Dashboard } from "../pages/Dashboard";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("Dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders metric cards", async () => {
    render(<Dashboard />, { wrapper: createWrapper() });
    expect(await screen.findByTestId("metric-Agents Enabled")).toBeInTheDocument();
    expect(screen.getByTestId("metric-Tasks In Progress")).toBeInTheDocument();
    expect(screen.getByTestId("metric-Month Spend")).toBeInTheDocument();
    expect(screen.getByTestId("metric-Pending Approvals")).toBeInTheDocument();
  });

  it("renders active agents panel", async () => {
    render(<Dashboard />, { wrapper: createWrapper() });
    expect(await screen.findByTestId("active-agents")).toBeInTheDocument();
  });

  it("renders chart cards", async () => {
    render(<Dashboard />, { wrapper: createWrapper() });
    await screen.findByTestId("metric-Agents Enabled");
    expect(screen.getByTestId("chart-Run Activity")).toBeInTheDocument();
    expect(screen.getByTestId("chart-Issues by Priority")).toBeInTheDocument();
  });

  it("shows Recent Tasks section", async () => {
    render(<Dashboard />, { wrapper: createWrapper() });
    await screen.findByTestId("metric-Agents Enabled");
    expect(screen.getByText("Recent Tasks")).toBeInTheDocument();
    expect(screen.getByText("No tasks yet.")).toBeInTheDocument();
  });

  // ── No agents warning ──────────────────────────────────────────────────

  it("shows no agents warning when agent list is empty", async () => {
    render(<Dashboard />, { wrapper: createWrapper() });
    await screen.findByTestId("metric-Agents Enabled");
    expect(screen.getByText("You have no agents.")).toBeInTheDocument();
    expect(screen.getByText("Create one here")).toBeInTheDocument();
  });

  // ── Active agents panel renders ────────────────────────────────────────

  it("renders active agents panel with company ID", async () => {
    render(<Dashboard />, { wrapper: createWrapper() });
    await screen.findByTestId("active-agents");
    expect(screen.getByText("Active Agents")).toBeInTheDocument();
  });
});
