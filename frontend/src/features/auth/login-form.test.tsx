import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { LoginForm } from "./login-form";
import { renderWithQuery } from "@/src/test/render";

const mocks = vi.hoisted(() => {
  class ApiError extends Error {
    constructor(public readonly status: number) {
      super(`API request failed with status ${status}`);
    }
  }
  return { requestOtp: vi.fn(), verifyOtp: vi.fn(), replace: vi.fn(), ApiError };
});

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock("@/src/lib/api", () => ({
  ApiError: mocks.ApiError,
  api: { requestOtp: mocks.requestOtp, verifyOtp: mocks.verifyOtp },
}));

afterEach(() => {
  cleanup();
  mocks.requestOtp.mockReset();
  mocks.verifyOtp.mockReset();
  mocks.replace.mockReset();
});

test("validates a six-digit code before calling verify", async () => {
  mocks.requestOtp.mockResolvedValue({ ok: true });
  mocks.verifyOtp.mockResolvedValue({});
  renderWithQuery(<LoginForm />);

  fireEvent.change(screen.getByLabelText("Email address"), {
    target: { value: "admin@example.invalid" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send code" }));
  await screen.findByLabelText("6-digit code");

  fireEvent.change(screen.getByLabelText("6-digit code"), { target: { value: "12345" } });
  fireEvent.click(screen.getByRole("button", { name: "Verify" }));
  await waitFor(() => expect(screen.getByText("Enter the 6-digit code.")).toHaveFocus());
  expect(mocks.verifyOtp).not.toHaveBeenCalled();

  fireEvent.change(screen.getByLabelText("6-digit code"), { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: "Verify" }));
  await waitFor(() => expect(mocks.verifyOtp).toHaveBeenCalledWith("admin@example.invalid", "123456"));
});

async function reachCodeStep() {
  fireEvent.change(screen.getByLabelText("Email address"), {
    target: { value: "admin@example.invalid" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send code" }));
  await screen.findByLabelText("6-digit code");
  fireEvent.change(screen.getByLabelText("6-digit code"), { target: { value: "123456" } });
}

test("shows the invalid-code copy only on a 401 and a generic error otherwise", async () => {
  mocks.requestOtp.mockResolvedValue({ ok: true });
  renderWithQuery(<LoginForm />);
  await reachCodeStep();

  // A 401 from otp/verify is a genuine bad/expired code.
  mocks.verifyOtp.mockRejectedValueOnce(new mocks.ApiError(401));
  fireEvent.click(screen.getByRole("button", { name: "Verify" }));
  await waitFor(() => expect(screen.getByText("That code didn't match — check it or resend.")).toBeInTheDocument());

  // A 5xx is a transport failure, not a wrong code.
  mocks.verifyOtp.mockRejectedValueOnce(new mocks.ApiError(503));
  fireEvent.click(screen.getByRole("button", { name: "Verify" }));
  await waitFor(() => expect(screen.getByText("We couldn't verify the code. Try again.")).toBeInTheDocument());
});
