import { fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { LoginForm } from "./login-form";
import { renderWithQuery } from "@/src/test/render";

const mocks = vi.hoisted(() => ({ requestOtp: vi.fn(), verifyOtp: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@/src/lib/api", () => ({
  api: { requestOtp: mocks.requestOtp, verifyOtp: mocks.verifyOtp },
}));

test("resend re-requests the code with the uniform ack and use a different email returns to the email step", async () => {
  mocks.requestOtp.mockResolvedValue({ ok: true });
  renderWithQuery(<LoginForm />);

  fireEvent.change(screen.getByLabelText("Email address"), {
    target: { value: "admin@example.invalid" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send code" }));
  const code = await screen.findByLabelText("6-digit code");
  expect(code).toHaveFocus();
  expect(screen.getByText("If that email has access, a code is on its way.")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Resend code" }));
  await waitFor(() => expect(mocks.requestOtp).toHaveBeenCalledTimes(2));
  expect(code).toHaveFocus();
  expect(screen.getByText("If that email has access, a code is on its way.")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Use a different email" }));
  expect(screen.getByLabelText("Email address")).toHaveFocus();
});
