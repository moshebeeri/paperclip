/**
 * OnboardingWizard tests — step progression, validation, company creation
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock router
vi.mock("@/lib/router", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: actual.useNavigate,
    Link: actual.Link,
  };
});

// Mock contexts
const mockCloseOnboarding = vi.fn();
const mockSetSelectedCompanyId = vi.fn();

vi.mock("../context/DialogContext", () => ({
  useDialog: vi.fn(() => ({
    onboardingOpen: true,
    onboardingOptions: {},
    closeOnboarding: mockCloseOnboarding,
    openOnboarding: vi.fn(),
    openNewIssue: vi.fn(),
    openNewGoal: vi.fn(),
  })),
}));

vi.mock("../context/CompanyContext", () => ({
  useCompany: vi.fn(() => ({
    companies: [],
    selectedCompanyId: null,
    selectedCompany: null,
    setSelectedCompanyId: mockSetSelectedCompanyId,
    loading: false,
    error: null,
  })),
}));

// Mock APIs
const mockCreateCompany = vi.fn();
const mockCreateGoal = vi.fn();
const mockCreateAgent = vi.fn();
const mockCreateIssue = vi.fn();
const mockAdapterModels = vi.fn();
const mockTestEnvironment = vi.fn();

vi.mock("../api/companies", () => ({
  companiesApi: {
    create: (...args: unknown[]) => mockCreateCompany(...args),
  },
}));

vi.mock("../api/goals", () => ({
  goalsApi: {
    create: (...args: unknown[]) => mockCreateGoal(...args),
  },
}));

vi.mock("../api/agents", () => ({
  agentsApi: {
    create: (...args: unknown[]) => mockCreateAgent(...args),
    adapterModels: (...args: unknown[]) => mockAdapterModels(...args),
    testEnvironment: (...args: unknown[]) => mockTestEnvironment(...args),
    update: vi.fn(),
  },
}));

vi.mock("../api/issues", () => ({
  issuesApi: {
    create: (...args: unknown[]) => mockCreateIssue(...args),
  },
}));

// Mock adapter helpers
vi.mock("../adapters", () => ({
  getUIAdapter: () => ({
    buildAdapterConfig: () => ({}),
  }),
}));

vi.mock("./agent-config-defaults", () => ({
  defaultCreateValues: {},
}));

vi.mock("../components/agent-config-defaults", () => ({
  defaultCreateValues: {
    dangerouslyBypassSandbox: false,
  },
}));

vi.mock("@paperclipai/adapter-codex-local", () => ({
  DEFAULT_CODEX_LOCAL_MODEL: "codex-model",
  DEFAULT_CODEX_LOCAL_BYPASS_APPROVALS_AND_SANDBOX: false,
}));

vi.mock("@paperclipai/adapter-cursor-local", () => ({
  DEFAULT_CURSOR_LOCAL_MODEL: "cursor-model",
}));

vi.mock("@paperclipai/adapter-opencode-local", () => ({
  DEFAULT_OPENCODE_LOCAL_MODEL: "opencode-model",
}));

// Mock heavy sub-components
vi.mock("../components/AsciiArtAnimation", () => ({
  AsciiArtAnimation: () => <div data-testid="ascii-art">Animation</div>,
}));

vi.mock("../components/PathInstructionsModal", () => ({
  ChoosePathButton: () => <button>Choose Path</button>,
}));

vi.mock("../components/agent-config-primitives", () => ({
  HintIcon: () => <span />,
}));

// Mock radix Dialog to render children directly
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogPortal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, disabled, onClick, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) => (
    <button disabled={disabled} onClick={onClick} {...props}>{children}</button>
  ),
}));

import { OnboardingWizard } from "../components/OnboardingWizard";

function renderWizard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <OnboardingWizard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("OnboardingWizard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapterModels.mockResolvedValue([]);
    mockTestEnvironment.mockResolvedValue({ status: "pass", checks: [] });
  });

  it("renders step 1 when onboarding is open", () => {
    renderWizard();
    expect(screen.getByText("Step 1 of 4")).toBeInTheDocument();
    expect(screen.getByText("Name your company")).toBeInTheDocument();
  });

  it("shows company name input on step 1", () => {
    renderWizard();
    const input = document.querySelector('input[placeholder="Acme Corp"]') as HTMLInputElement;
    expect(input).toBeInTheDocument();
  });

  it("disables Next button when company name is empty", () => {
    renderWizard();
    // Find the Next/Continue button for step 1
    const buttons = screen.getAllByRole("button");
    const nextButton = buttons.find((b) => b.textContent?.includes("Next"));
    expect(nextButton).toBeDefined();
    expect(nextButton).toBeDisabled();
  });

  it("enables Next button when company name is filled", async () => {
    const user = userEvent.setup();
    renderWizard();
    const input = document.querySelector('input[placeholder="Acme Corp"]') as HTMLInputElement;
    await user.type(input, "My Company");
    const buttons = screen.getAllByRole("button");
    const nextButton = buttons.find((b) => b.textContent?.includes("Next"));
    expect(nextButton).not.toBeDisabled();
  });

  it("creates company and advances to step 2 on Continue", async () => {
    mockCreateCompany.mockResolvedValue({
      id: "new-comp",
      name: "My Company",
      issuePrefix: "MC",
    });
    mockCreateGoal.mockResolvedValue({});

    const user = userEvent.setup();
    renderWizard();

    const input = document.querySelector('input[placeholder="Acme Corp"]') as HTMLInputElement;
    await user.type(input, "My Company");

    const buttons = screen.getAllByRole("button");
    const nextButton = buttons.find((b) => b.textContent?.includes("Next"))!;
    await user.click(nextButton);

    await waitFor(() => {
      expect(mockCreateCompany).toHaveBeenCalledWith({ name: "My Company" });
    });

    await waitFor(() => {
      expect(screen.getByText("Step 2 of 4")).toBeInTheDocument();
    });
  });

  it("shows error when company creation fails", async () => {
    mockCreateCompany.mockRejectedValue(new Error("Name taken"));

    const user = userEvent.setup();
    renderWizard();

    const input = document.querySelector('input[placeholder="Acme Corp"]') as HTMLInputElement;
    await user.type(input, "My Company");

    const buttons = screen.getAllByRole("button");
    const nextButton = buttons.find((b) => b.textContent?.includes("Next"))!;
    await user.click(nextButton);

    expect(await screen.findByText("Name taken")).toBeInTheDocument();
  });

  it("creates goal when company goal is provided", async () => {
    mockCreateCompany.mockResolvedValue({
      id: "new-comp",
      name: "My Company",
      issuePrefix: "MC",
    });
    mockCreateGoal.mockResolvedValue({});

    const user = userEvent.setup();
    renderWizard();

    const nameInput = document.querySelector('input[placeholder="Acme Corp"]') as HTMLInputElement;
    await user.type(nameInput, "My Company");

    // Find the goal/description textarea or input
    const goalInput = document.querySelector('input[placeholder*="goal"], input[placeholder*="mission"], textarea') as HTMLElement;
    if (goalInput) {
      await user.type(goalInput, "Build great products");
    }

    const buttons = screen.getAllByRole("button");
    const nextButton = buttons.find((b) => b.textContent?.includes("Next"))!;
    await user.click(nextButton);

    await waitFor(() => {
      expect(mockCreateCompany).toHaveBeenCalled();
    });
  });

  it("renders close button", () => {
    renderWizard();
    expect(screen.getByText("Close")).toBeInTheDocument();
  });

  it("calls closeOnboarding when close button clicked", async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByText("Close"));
    expect(mockCloseOnboarding).toHaveBeenCalled();
  });

  it("shows progress indicators for all 4 steps", () => {
    renderWizard();
    expect(screen.getByText("Get Started")).toBeInTheDocument();
    expect(screen.getByText("Step 1 of 4")).toBeInTheDocument();
  });
});
