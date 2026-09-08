"use client";

import type { AuthUser } from "@3f/contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/src/components/ui/button";
import { api } from "@/src/lib/api";
import { sessionQueryKey } from "./session";

const ACK = "If that email has access, a code is on its way.";
const INVALID_CODE = "That code didn't match — check it or resend.";

export function LoginForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const messageRef = useRef<HTMLParagraphElement>(null);
  const requestCode = useMutation({ mutationFn: api.requestOtp });
  const verifyCode = useMutation({
    mutationFn: ({ email, code }: { email: string; code: string }) => api.verifyOtp(email, code),
  });

  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
    else emailRef.current?.focus();
  }, [step]);

  async function sendCode(event?: FormEvent) {
    event?.preventDefault();
    setError(false);
    setMessage("");
    try {
      await requestCode.mutateAsync(email);
      setMessage(ACK);
      setStep("code");
      // Restore focus to the code field on every send, including Resend where
      // the step does not change so the step-transition focus effect never fires.
      requestAnimationFrame(() => codeRef.current?.focus());
    } catch {
      setMessage("We couldn't send a code. Try again.");
      setError(true);
      requestAnimationFrame(() => messageRef.current?.focus());
    }
  }

  async function verify(event: FormEvent) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setMessage("Enter the 6-digit code.");
      setError(true);
      requestAnimationFrame(() => messageRef.current?.focus());
      return;
    }

    try {
      const user = await verifyCode.mutateAsync({ email, code });
      queryClient.setQueryData<AuthUser>(sessionQueryKey, user);
      router.replace("/dashboard");
    } catch {
      setMessage(INVALID_CODE);
      setError(true);
      requestAnimationFrame(() => messageRef.current?.focus());
    }
  }

  function useDifferentEmail() {
    setStep("email");
    setCode("");
    setMessage("");
    setError(false);
  }

  return (
    <div className="login-card">
      {step === "email" ? (
        <form className="login-step" onSubmit={sendCode}>
          <p className="login-eyebrow">Secure access</p>
          <h1 className="login-title">Sign in to 3F</h1>
          <p className="login-intro">Use your work email to receive a one-time code.</p>
          <label className="field-label" htmlFor="email">
            Email address
          </label>
          <input
            ref={emailRef}
            className="field-input"
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <Button className="primary-action" type="submit" disabled={requestCode.isPending}>
            Send code
          </Button>
          <p ref={messageRef} className="login-message" data-error={error} aria-live="polite" tabIndex={-1}>
            {message}
          </p>
        </form>
      ) : (
        <form className="login-step" onSubmit={verify}>
          <p className="login-eyebrow">Check your email</p>
          <h1 className="login-title">Enter your code</h1>
          <p className="login-intro">We sent a one-time code to {email}.</p>
          <label className="field-label" htmlFor="code">
            6-digit code
          </label>
          <input
            ref={codeRef}
            className="field-input otp-input"
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
          />
          <Button className="primary-action" type="submit" disabled={verifyCode.isPending}>
            Verify
          </Button>
          <p ref={messageRef} className="login-message" data-error={error} aria-live="polite" tabIndex={-1}>
            {message}
          </p>
          <div className="login-secondary">
            <button className="text-action" type="button" onClick={useDifferentEmail}>
              Use a different email
            </button>
            <button className="text-action" type="button" onClick={() => void sendCode()}>
              Resend code
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
