import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRightOutlined, MailOutlined } from '@ant-design/icons';
import { Alert, Button, Input, PasswordInput, toast } from '@/components/ui';
import AuthShell from '@/components/brand/AuthShell';
import { ApiError } from '@/services/BaseService';
import { authService } from '@/services/authService';
import { useAppDispatch } from '@/store';
import { signedIn } from '@/store/authSlice';
import { usePermissions } from '@/hooks/usePermissions';

/**
 * A-01 — staff sign-in.
 *
 * The three non-obvious states `screen-inventory.md` requires, and what each
 * has to leave the user able to do next:
 *
 *  - **wrong credentials** — one message for both a bad address and a bad
 *    password. The backend does not distinguish them (it must not), and neither
 *    does this screen.
 *  - **locked account** — says how long, because "try again later" is not an
 *    instruction. The API's message already carries the minutes.
 *  - **no-role account** — sign-in SUCCEEDS and this screen says why the app
 *    will look empty and who fixes it. Refusing the login instead would be
 *    indistinguishable from a wrong password, and the person would have no idea
 *    that the fix is an access request rather than a password reset.
 *
 * There is deliberately no "forgot password" link: no staff reset flow exists in
 * M1, and a link to nowhere is worse than its absence. Recovery is a super admin
 * resetting the account (AJ-9). For the same reason the approved comp's tab strip
 * (Sign In · Sign Up · Password recovery) is not reproduced — see `AuthShell`.
 *
 * The screen was reskinned to that comp; none of the behaviour above moved. The
 * frame comes from `AuthShell`, and the three states below render into it
 * unchanged.
 */

interface FormState {
  email: string;
  password: string;
}

export const Login = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, permissions, isSuperAdmin } = usePermissions();

  const [form, setForm] = useState<FormState>({ email: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<ApiError | null>(null);

  /*
    The sign-in failure is announced as a toast rather than a banner in the form.
    A banner pushed the fields down the moment it appeared, so the password input
    moved out from under the cursor on the one screen where the user is about to
    retype into it.

    `error` is still state, not a fire-and-forget call: `resetForm` reads it, and
    a toast is a view of that state rather than a replacement for it.

    It auto-dismisses on the host's default. The standing lockout policy is
    printed under the form permanently, so nothing here is the only copy of
    something the user needs — the toast reports what just happened and then gets
    out of the way of the fields they are about to retype.
  */
  useEffect(() => {
    if (!error) {
      return;
    }

    const rateLimited = error.code === 'RATE_LIMITED';

    toast[rateLimited ? 'warning' : 'error'](
      rateLimited ? 'Too many attempts' : 'Could not sign you in',
      // The API already speaks in finished sentences ("Too many failed attempts.
      // Try again after 15 minutes"), including the lockout countdown, so it is
      // shown rather than re-worded.
      { description: error.message },
    );
  }, [error]);
  const [submitting, setSubmitting] = useState(false);

  /** Where the user was headed before the guard bounced them here. */
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  // Already signed in and holding something: skip the form entirely.
  if (isAuthenticated && (isSuperAdmin || permissions.length > 0)) {
    return <Navigate to={from} replace />;
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setFieldErrors({});

    const errors: Record<string, string> = {};

    if (!form.email.trim()) {
      errors.email = 'Enter your work email address';
    }

    if (!form.password) {
      errors.password = 'Enter your password';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);

    try {
      const result = await authService.signIn(form.email.trim(), form.password);

      dispatch(
        signedIn({
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          profile: result.profile,
        }),
      );

      // An account with no role signs in but has nothing to navigate to. Stay
      // here and explain, rather than dropping them on a work queue whose every
      // section is hidden.
      if (!result.profile.isSuperAdmin && result.profile.permissions.length === 0) {
        return;
      }

      navigate(from, { replace: true });
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught
          : new ApiError('INTERNAL_ERROR', 'Something went wrong. Please try again.', 500),
      );

      if (caught instanceof ApiError && caught.fields) {
        setFieldErrors(caught.fields);
      }
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Clicking the backdrop returns the card to how it looked before anyone typed:
   * fields empty, field errors gone, the API banner gone.
   *
   * Guarded on "is there anything to clear" so a stray click on an untouched
   * screen is not a state update, and on `submitting` so it cannot yank the
   * fields out from under a request that is already in flight.
   */
  const resetForm = () => {
    if (submitting) return;
    if (!form.email && !form.password && !error && Object.keys(fieldErrors).length === 0) return;

    setForm({ email: '', password: '' });
    setFieldErrors({});
    setError(null);
  };

  // Signed in, but the account holds nothing — the third A-01 state.
  const signedInWithoutRole = isAuthenticated && !isSuperAdmin && permissions.length === 0;

  if (signedInWithoutRole) {
    return (
      <AuthShell
        title="Your account has no role yet"
        intro="Your staff account is active and your password is correct — there is just nothing assigned to it."
      >
        <div className="flex flex-col gap-3">
          <Alert
            variant="warning"
            message="Signed in, but nothing is assigned to you"
            description="Your staff account is active and your password is correct. A super admin still needs to give it a role before any screen has content."
          />
          <p className="m-0 text-supporting text-fg-muted">
            Ask a super admin to assign a role under Configure &rarr; Staff accounts. You will see
            the work queue the next time you sign in.
          </p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Sign in" onDismiss={resetForm}>
      {/*
        The "Association staff only." strapline is commented out at the client's
        request. To bring it back, pass it to AuthShell again:
          intro="Association staff only."
        The prop itself is still in use by the no-role screen above, so nothing
        else needs restoring with it.
      */}
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Input
          label="Work Email"
          type="email"
          autoComplete="username"
          autoFocus
          required
          prefix={<MailOutlined />}
          placeholder="you@ilgda.org"
          value={form.email}
          error={fieldErrors.email}
          onChange={(event) => setForm({ ...form, email: event.target.value })}
        />

        <PasswordInput
          label="Password"
          autoComplete="current-password"
          required
          value={form.password}
          placeholder="********"
          error={fieldErrors.password}
          onChange={(event) => setForm({ ...form, password: event.target.value })}
        />

        <Button variant="primary" htmlType="submit" loading={submitting} block>
          Sign in <ArrowRightOutlined aria-hidden="true" />
        </Button>

        <p className="m-0 border-t border-border pt-4 text-center text-supporting text-fg-subtle">
          Five failed attempts lock the account for 15 minutes. If you are locked out or have
          forgotten your password, ask a super admin to reset it.
        </p>
      </form>
    </AuthShell>
  );
};

export default Login;
