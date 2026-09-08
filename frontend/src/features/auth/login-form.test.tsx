import { fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { LoginForm } from "./login-form";
import { renderWithQuery } from "@/src/test/render";

const mocks = vi.hoisted(() => ({
  requestOtp: vi.fn(),
  verifyOtp: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock("@/src/lib/api", () => ({
  api: { requestOtp: mocks.requestOtp, verifyOtp: mocks.verifyOtp },
}));

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
