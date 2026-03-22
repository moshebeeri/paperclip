/**
 * Companies page tests — list, create, edit, delete companies
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

// Mock CompanyContext
const mockSetSelectedCompanyId = vi.fn();
const mockOpenOnboarding = vi.fn();

vi.mock("../context/CompanyContext", () => ({
  useCompany: vi.fn(() => ({
    companies: [
      {
        id: "comp-1",
        name: "Acme Corp",
        description: "Main company",
        status: "active",
        budgetMonthlyCents: 100000,
        spentMonthlyCents: 45000,
        createdAt: "2026-01-15T00:00:00Z",
      },
      {
        id: "comp-2",
        name: "Side Project",
        description: null,
        status: "paused",
        budgetMonthlyCents: 0,
        spentMonthlyCents: 0,
        createdAt: "2026-02-01T00:00:00Z",
      },
    ],
    selectedCompanyId: "comp-1",
    setSelectedCompanyId: mockSetSelectedCompanyId,
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

// Mock companies API
vi.mock("../api/companies", () => ({
  companiesApi: {
    stats: vi.fn(() => Promise.resolve({
      "comp-1": { agentCount: 3, issueCount: 12 },
      "comp-2": { agentCount: 0, issueCount: 0 },
    })),
    update: vi.fn(() => Promise.resolve()),
    remove: vi.fn(() => Promise.resolve()),
  },
}));

import { Companies } from "../pages/Companies";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("Companies", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders company cards", () => {
    render(<Companies />, { wrapper: createWrapper() });
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    expect(screen.getByText("Side Project")).toBeInTheDocument();
  });

  it("shows New Company button", () => {
    render(<Companies />, { wrapper: createWrapper() });
    expect(screen.getByText("New Company")).toBeInTheDocument();
  });

  it("shows company status badges", () => {
    render(<Companies />, { wrapper: createWrapper() });
    expect(screen.getByText("active")).toBeInTheDocument();
    expect(screen.getByText("paused")).toBeInTheDocument();
  });

  it("shows company description", () => {
    render(<Companies />, { wrapper: createWrapper() });
    expect(screen.getByText("Main company")).toBeInTheDocument();
  });

  it("calls openOnboarding when New Company clicked", async () => {
    const user = userEvent.setup();
    render(<Companies />, { wrapper: createWrapper() });

    await user.click(screen.getByText("New Company"));
    expect(mockOpenOnboarding).toHaveBeenCalled();
  });

  it("selects company on card click", async () => {
    const user = userEvent.setup();
    render(<Companies />, { wrapper: createWrapper() });

    await user.click(screen.getByText("Side Project"));
    expect(mockSetSelectedCompanyId).toHaveBeenCalledWith("comp-2");
  });

  it("shows budget info", () => {
    render(<Companies />, { wrapper: createWrapper() });
    expect(screen.getByText(/Unlimited budget/)).toBeInTheDocument();
  });

  // ── Agent/issue counts ──────────────────────────────────────────────────

  it("shows agent and issue counts from stats", async () => {
    render(<Companies />, { wrapper: createWrapper() });
    // Stats mock returns 3 agents, 12 issues for comp-1
    expect(await screen.findByText("3 agents")).toBeInTheDocument();
    expect(screen.getByText("12 issues")).toBeInTheDocument();
  });

  it("shows zero counts for company without stats", async () => {
    render(<Companies />, { wrapper: createWrapper() });
    expect(await screen.findByText("0 agents")).toBeInTheDocument();
    expect(screen.getByText("0 issues")).toBeInTheDocument();
  });
});
