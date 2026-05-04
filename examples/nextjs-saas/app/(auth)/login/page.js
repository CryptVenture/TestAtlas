import LoginForm from '@/components/login-form.js';

export default function LoginPage() {
  return (
    <section>
      <h1>Sign in</h1>
      <p>Enter any non-empty email and password — auth is mocked.</p>
      <LoginForm />
    </section>
  );
}
