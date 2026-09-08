import { LoginForm } from "@/src/features/auth/login-form";

export default function LoginPage() {
  return (
    <main className="login-page">
      <section className="login-brand" aria-label="3F Financial MIS">
        <div className="login-brand-mark">3F Financial MIS</div>
        <div>
          <div className="login-brand-caption">Financial MIS, straight from SAP</div>
        </div>
      </section>
      <section className="login-content" aria-label="Sign in">
        <LoginForm />
      </section>
    </main>
  );
}
