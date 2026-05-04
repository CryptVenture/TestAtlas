import LoginForm from '@/components/login-form.js';

export default function SignupPage() {
  return (
    <section>
      <h1>Create account</h1>
      <p>
        Mock signup — submitting any non-empty credentials issues a session cookie and redirects to{' '}
        <code>/dashboard</code>.
      </p>
      <LoginForm />
    </section>
  );
}
