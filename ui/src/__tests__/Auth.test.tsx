/**
 * Auth page tests — sign in / sign up flow
 */
import { render, screen, within } from "@testing-library/react";
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

// Mock auth API
const mockSignInEmail = vi.fn(() => Promise.resolve());
const mockSignUpEmail = vi.fn(() => Promise.resolve());
const mockGetSession = vi.fn(() => Promise.resolve(null));

vi.mock("../api/auth", () => ({
  authApi: {
    signInEmail: (...args: unknown[]) => mockSignInEmail(...args),
    signUpEmail: (...args: unknown[]) => mockSignUpEmail(...args),
    getSession: () => mockGetSession(),
  },
}));

// Mock AsciiArtAnimation (heavy component)
vi.mock("@/components/AsciiArtAnimation", () => ({
  AsciiArtAnimation: () => <div data-testid="ascii-art">Animation</div>,
}));

import { AuthPage } from "../pages/Auth";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

/** Helper: get input field by the label text next to it */
function getFieldByLabel(label: string): HTMLInputElement {
  const labelEl = screen.getByText(label, { selector: "label" });
  const parent = labelEl.parentElement!;
  return within(parent).getByRole("textbox", { hidden: false }) as HTMLInputElement
    ?? parent.querySelector("input") as HTMLInputElement;
}

function getInputByAutoComplete(value: string): HTMLInputElement {
  return document.querySelector(`input[autocomplete="${value}"]`) as HTMLInputElement;
}

describe("AuthPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(null);
  });

  it("renders sign in form by default", async () => {
    render(<AuthPage />, { wrapper: createWrapper() });
    expect(await screen.findByText("Sign in to Paperclip")).toBeInTheDocument();
    expect(screen.getByText("Sign In")).toBeInTheDocument();
  });

  it("shows email and password input fields", async () => {
    render(<AuthPage />, { wrapper: createWrapper() });
    await screen.findByText("Sign in to Paperclip");
    expect(screen.getByText("Email", { selector: "label" })).toBeInTheDocument();
    expect(screen.getByText("Password", { selector: "label" })).toBeInTheDocument();
    expect(getInputByAutoComplete("email")).toBeInTheDocument();
    expect(getInputByAutoComplete("current-password")).toBeInTheDocument();
  });

  it("does not show name field in sign in mode", async () => {
    render(<AuthPage />, { wrapper: createWrapper() });
    await screen.findByText("Sign in to Paperclip");
    expect(screen.queryByText("Name", { selector: "label" })).not.toBeInTheDocument();
  });

  it("switches to sign up mode when clicking 'Create one'", async () => {
    const user = userEvent.setup();
    render(<AuthPage />, { wrapper: createWrapper() });
    await screen.findByText("Sign in to Paperclip");

    await user.click(screen.getByText("Create one"));

    expect(screen.getByText("Create your Paperclip account")).toBeInTheDocument();
    expect(screen.getByText("Create Account")).toBeInTheDocument();
    expect(screen.getByText("Name", { selector: "label" })).toBeInTheDocument();
  });

  it("switches back to sign in from sign up", async () => {
    const user = userEvent.setup();
    render(<AuthPage />, { wrapper: createWrapper() });
    await screen.findByText("Sign in to Paperclip");

    await user.click(screen.getByText("Create one"));
    expect(screen.getByText("Create your Paperclip account")).toBeInTheDocument();

    await user.click(screen.getByText("Sign in"));
    expect(screen.getByText("Sign in to Paperclip")).toBeInTheDocument();
  });

  it("disables submit when email is empty", async () => {
    const user = userEvent.setup();
    render(<AuthPage />, { wrapper: createWrapper() });
    await screen.findByText("Sign in to Paperclip");

    await user.type(getInputByAutoComplete("current-password"), "password123");

    expect(screen.getByText("Sign In")).toBeDisabled();
  });

  it("disables submit when password is less than 8 chars", async () => {
    const user = userEvent.setup();
    render(<AuthPage />, { wrapper: createWrapper() });
    await screen.findByText("Sign in to Paperclip");

    await user.type(getInputByAutoComplete("email"), "test@example.com");
    await user.type(getInputByAutoComplete("current-password"), "short");

    expect(screen.getByText("Sign In")).toBeDisabled();
  });

  it("enables submit when email and password are valid", async () => {
    const user = userEvent.setup();
    render(<AuthPage />, { wrapper: createWrapper() });
    await screen.findByText("Sign in to Paperclip");

    await user.type(getInputByAutoComplete("email"), "test@example.com");
    await user.type(getInputByAutoComplete("current-password"), "password123");

    expect(screen.getByText("Sign In")).not.toBeDisabled();
  });

  it("calls signInEmail on form submit", async () => {
    const user = userEvent.setup();
    render(<AuthPage />, { wrapper: createWrapper() });
    await screen.findByText("Sign in to Paperclip");

    await user.type(getInputByAutoComplete("email"), "test@example.com");
    await user.type(getInputByAutoComplete("current-password"), "password123");
    await user.click(screen.getByText("Sign In"));

    expect(mockSignInEmail).toHaveBeenCalledWith({
      email: "test@example.com",
      password: "password123",
    });
  });

  it("calls signUpEmail with name in sign up mode", async () => {
    const user = userEvent.setup();
    render(<AuthPage />, { wrapper: createWrapper() });
    await screen.findByText("Sign in to Paperclip");

    await user.click(screen.getByText("Create one"));

    await user.type(getInputByAutoComplete("name"), "Test User");
    await user.type(getInputByAutoComplete("email"), "test@example.com");
    await user.type(getInputByAutoComplete("new-password"), "password123");
    await user.click(screen.getByText("Create Account"));

    expect(mockSignUpEmail).toHaveBeenCalledWith({
      name: "Test User",
      email: "test@example.com",
      password: "password123",
    });
  });

  it("shows error message on auth failure", async () => {
    mockSignInEmail.mockRejectedValueOnce(new Error("Invalid credentials"));

    const user = userEvent.setup();
    render(<AuthPage />, { wrapper: createWrapper() });
    await screen.findByText("Sign in to Paperclip");

    await user.type(getInputByAutoComplete("email"), "test@example.com");
    await user.type(getInputByAutoComplete("current-password"), "wrongpass1");
    await user.click(screen.getByText("Sign In"));

    expect(await screen.findByText("Invalid credentials")).toBeInTheDocument();
  });

  it("shows loading state when checking session", () => {
    mockGetSession.mockReturnValue(new Promise(() => {})); // never resolves
    render(<AuthPage />, { wrapper: createWrapper() });
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("shows Paperclip branding", async () => {
    render(<AuthPage />, { wrapper: createWrapper() });
    await screen.findByText("Sign in to Paperclip");
    expect(screen.getByText("Paperclip")).toBeInTheDocument();
  });

  it("disables sign up submit when name is empty", async () => {
    const user = userEvent.setup();
    render(<AuthPage />, { wrapper: createWrapper() });
    await screen.findByText("Sign in to Paperclip");

    await user.click(screen.getByText("Create one"));
    await user.type(getInputByAutoComplete("email"), "test@example.com");
    await user.type(getInputByAutoComplete("new-password"), "password123");
    // Name is empty

    expect(screen.getByText("Create Account")).toBeDisabled();
  });
});
