"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Mail } from "lucide-react";
import { TeamLogo } from "@/components/TeamLogo";
import { createClient } from "@/lib/supabase/client";

function LoginContent() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSignupMode, setIsSignupMode] = useState(false);
  const [isResetPassword, setIsResetPassword] = useState(false);
  const [resetPassword, setResetPassword] = useState("");
  const [confirmResetPassword, setConfirmResetPassword] = useState("");
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [resetUserEmail, setResetUserEmail] = useState<string | null>(null);
  const [recoveryValid, setRecoveryValid] = useState(true);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const errorParam = searchParams.get("error");
    if (errorParam) {
      const msg = decodeURIComponent(errorParam);
      let friendly = msg;
      if (msg.toLowerCase().includes("rate") || msg.toLowerCase().includes("too many")) {
        friendly = "Too many attempts — please wait a few minutes before trying again.";
      } else if (msg === "auth" || msg.includes("expired") || msg.includes("invalid")) {
        friendly = "Authentication failed or link expired. Please try signing up or logging in again.";
      } else if (msg.includes("already registered") || msg.includes("User already registered")) {
        friendly = "This email is already registered. Please log in instead.";
      }
      toast.error(friendly);
      const url = new URL(window.location.href);
      url.searchParams.delete("error");
      window.history.replaceState({}, "", url.toString());
    }
    const success = searchParams.get("success");
    if (success) {
      // success param is used for various flows (mostly legacy signup/magic).
      // For password reset we now auto-redirect to dashboard after update and toast directly.
      if (success === "reset") {
        // Rare path (old links). Show friendly message and let them log in normally.
        toast.success("Password has been updated. Please log in with your new password.");
      } else {
        toast.success("Signed up successfully! You're now logged in.");
      }
      const url = new URL(window.location.href);
      url.searchParams.delete("success");
      window.history.replaceState({}, "", url.toString());
    }
    const type = searchParams.get("type");
    if (type === "recovery") {
      setIsResetPassword(true);
      setIsSignupMode(false);
      setResetEmailSent(false);
      setResetPassword("");
      setConfirmResetPassword("");
      setRecoveryValid(true);
      setResetUserEmail(null);
      const url = new URL(window.location.href);
      url.searchParams.delete("type");
      window.history.replaceState({}, "", url.toString());
    }
  }, [searchParams]);

  // If the user is already authenticated (normal session), don't show login page — send them to the app.
  // Do not redirect away when we are processing a password recovery (temporary recovery session).
  useEffect(() => {
    const checkExistingSession = async () => {
      // If the URL indicates a recovery flow, never auto-redirect from here.
      const isRecoveryFlow = searchParams.get("type") === "recovery" || isResetPassword;
      if (isRecoveryFlow) return;

      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          router.replace("/dashboard");
        }
      } catch (e) {
        // ignore — not logged in or transient
      }
    };
    // Run shortly after mount.
    const t = setTimeout(checkExistingSession, 0);
    return () => clearTimeout(t);
  }, [router, isResetPassword, searchParams]);

  // When entering recovery mode (from reset email link), hydrate the client session
  // and capture the email so we can show a friendly "resetting for ..." message.
  // If no user from recovery session, the link was bad/expired.
  useEffect(() => {
    if (!isResetPassword) {
      setResetUserEmail(null);
      setRecoveryValid(true);
      return;
    }

    const hydrateRecoverySession = async () => {
      try {
        const supabase = createClient();
        // Force the browser client to read the session cookies set by the server verify step
        await supabase.auth.getSession();

        const { data: { user }, error } = await supabase.auth.getUser();

        if (user && !error) {
          setResetUserEmail(user.email ?? null);
          setRecoveryValid(true);
        } else {
          setRecoveryValid(false);
          setResetUserEmail(null);
          toast.error("This password reset link is invalid or expired. Please request a new one.");
        }
      } catch (e: any) {
        setRecoveryValid(false);
        setResetUserEmail(null);
        toast.error("Could not load reset session. The link may have expired.");
      }
    };

    hydrateRecoverySession();
  }, [isResetPassword]);

  const handleEmailPasswordAuth = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !password) {
      toast.error(isSignupMode ? "Please enter email and password to sign up" : "Please enter email and password");
      return;
    }

    if (isSignupMode && password.length < 6) {
      toast.error("Password must be at least 6 characters long");
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      const emailTrimmed = email.trim();

      if (isSignupMode) {
        // Signup with Email + Password - immediate, no confirmation step in app
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: emailTrimmed,
          password,
        });

        if (signUpError) throw signUpError;

        // Auto-create basic profile for new user (idempotent)
        if (signUpData.user) {
          try {
            const { data: existing } = await supabase
              .from("profiles")
              .select("id")
              .eq("id", signUpData.user.id)
              .maybeSingle();

            if (!existing) {
              await supabase.from("profiles").insert({
                id: signUpData.user.id,
                email: signUpData.user.email,
                role: "parent",
                first_name: "",
                last_name: "",
                is_admin: false,
                created_at: new Date().toISOString(),
              } as any);
            }
          } catch (profileErr) {
            console.warn("Profile auto-creation skipped (may already exist):", profileErr);
          }
        }

        // Immediately sign in to make it seamless (disables confirmation requirement in flow)
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: emailTrimmed,
          password,
        });

        if (signInError) {
          if (signInError.message.toLowerCase().includes("confirm") || signInError.message.toLowerCase().includes("not confirmed")) {
            // Confirmation may be required by Supabase settings; profile created, switch to login
            toast.success("Account created! Please log in (check email if confirmation required).");
            setIsSignupMode(false);
            return;
          } else {
            throw signInError;
          }
        }

        toast.success("Account created and logged in! Welcome to Mavericks 12U.");
        router.push("/dashboard");
        router.refresh();
      } else {
        // Login with Email + Password
        const { error } = await supabase.auth.signInWithPassword({
          email: emailTrimmed,
          password,
        });
        if (error) throw error;

        // Auto-create basic profile if missing (for first login of existing auth users)
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data: existing } = await supabase
              .from("profiles")
              .select("id")
              .eq("id", user.id)
              .maybeSingle();
            if (!existing) {
              await supabase.from("profiles").insert({
                id: user.id,
                email: user.email,
                role: "parent",
                first_name: "",
                last_name: "",
                is_admin: false,
                created_at: new Date().toISOString(),
              } as any);
            }
          }
        } catch (profileErr) {
          console.warn("Profile check on login skipped:", profileErr);
        }

        toast.success("Logged in successfully!");
        router.push("/dashboard");
        router.refresh();
      }
    } catch (err: any) {
      let msg = err.message || (isSignupMode ? "Signup failed" : "Login failed");
      if (msg.toLowerCase().includes("rate") || msg.toLowerCase().includes("too many")) {
        msg = "Too many attempts — please wait a few minutes before trying again.";
      } else if (msg.includes("already registered") || msg.includes("User already registered")) {
        msg = "This email is already registered. Please try logging in instead.";
      } else if (msg.includes("Invalid login credentials")) {
        msg = "Invalid email or password. Please try again.";
      }
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!email) {
      toast.error("Please enter your email address to reset password");
      return;
    }
    setLoading(true);
    try {
      const supabase = createClient();
      // Use the configured public URL when available (important for prod + email link validity).
      // Supabase appends the token_hash + type=recovery query params automatically.
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${baseUrl.replace(/\/$/, "")}/auth/confirm`,
      });
      if (error) throw error;
      toast.success("Password reset link sent! Check your email (and spam folder).");
      setResetEmailSent(true);
    } catch (err: any) {
      let msg = err.message || "Failed to send reset link";
      if (msg.toLowerCase().includes("rate") || msg.toLowerCase().includes("too many")) {
        msg = "Too many attempts — please wait a few minutes before trying again.";
      }
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPassword || resetPassword.length < 6) {
      toast.error("New password must be at least 6 characters");
      return;
    }
    if (resetPassword !== confirmResetPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: resetPassword });
      if (error) throw error;

      // Success! After updateUser on a recovery session, Supabase converts it into a
      // normal authenticated session. Refresh to ensure cookies/JWT are up to date.
      await supabase.auth.refreshSession().catch(() => {});

      setIsResetPassword(false);
      setResetPassword("");
      setConfirmResetPassword("");
      setPassword("");
      setResetUserEmail(null);

      toast.success("Password updated successfully! You're now logged in.");
      router.push("/dashboard");
      router.refresh();
    } catch (err: any) {
      let msg = err.message || "Failed to reset password";
      if (msg.toLowerCase().includes("session") || msg.toLowerCase().includes("auth session")) {
        msg = "Reset session expired. Please request a new password reset link from the login page.";
      }
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        {/* Team branding header with logo */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <TeamLogo size="lg" className="drop-shadow-md" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Mavericks 12U</h1>
          <p className="text-muted-foreground mt-1 text-sm">Travel Baseball • Team Hub</p>
        </div>

        <Card className="mavericks-card">
          <CardHeader>
            <CardTitle className="text-2xl">
              {isResetPassword
                ? "Reset your password"
                : isSignupMode
                  ? "Create your Mavericks 12U account"
                  : "Log in to Mavericks 12U"}
            </CardTitle>
            <CardDescription>
              {isResetPassword
                ? "Choose a new password for your account."
                : isSignupMode
                  ? "Sign up with email and password for instant access. A profile is created automatically."
                  : "Enter your email and password. Use “Forgot Password?” if you need to reset it."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isResetPassword ? (
              /* Dedicated Reset Password view - shown when arriving from Supabase recovery email link */
              <div className="space-y-4">
                {!recoveryValid ? (
                  <div className="space-y-4">
                    <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3 text-sm">
                      This reset link is no longer valid or has expired.
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full h-11"
                      onClick={() => {
                        setIsResetPassword(false);
                        setResetPassword("");
                        setConfirmResetPassword("");
                        setResetUserEmail(null);
                        setRecoveryValid(true);
                      }}
                    >
                      Back to login
                    </Button>
                    <p className="text-center text-xs text-muted-foreground">
                      Request a new password reset from the Log in screen.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="rounded-md bg-muted/60 p-3 text-sm text-muted-foreground space-y-1">
                      <div>
                        Resetting password for{" "}
                        <span className="font-medium text-foreground">
                          {resetUserEmail || "your account"}
                        </span>
                      </div>
                      <div>Enter and confirm a new password below (minimum 6 characters).</div>
                    </div>

                    <form onSubmit={handleResetPassword} className="space-y-4">
                      <div className="space-y-2">
                        <label htmlFor="new-password" className="text-sm font-medium">
                          New password
                        </label>
                        <Input
                          id="new-password"
                          type="password"
                          value={resetPassword}
                          onChange={(e) => setResetPassword(e.target.value)}
                          placeholder="••••••••"
                          required
                          minLength={6}
                        />
                        <p className="text-xs text-muted-foreground">At least 6 characters.</p>
                      </div>

                      <div className="space-y-2">
                        <label htmlFor="confirm-password" className="text-sm font-medium">
                          Confirm new password
                        </label>
                        <Input
                          id="confirm-password"
                          type="password"
                          value={confirmResetPassword}
                          onChange={(e) => setConfirmResetPassword(e.target.value)}
                          placeholder="••••••••"
                          required
                          minLength={6}
                        />
                      </div>

                      <div className="flex gap-3 pt-2">
                        <Button
                          type="submit"
                          className="mavericks-btn-primary flex-1 h-11"
                          disabled={loading || !resetPassword || !confirmResetPassword}
                        >
                          {loading ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Updating password...
                            </>
                          ) : (
                            "Update Password &amp; Sign In"
                          )}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="flex-1 h-11"
                          onClick={() => {
                            setIsResetPassword(false);
                            setResetPassword("");
                            setConfirmResetPassword("");
                            setResetUserEmail(null);
                          }}
                          disabled={loading}
                        >
                          Cancel
                        </Button>
                      </div>
                    </form>

                    <p className="text-center text-xs text-muted-foreground">
                      After setting your new password you will be signed in automatically and taken to the team hub.
                    </p>
                  </>
                )}
              </div>
            ) : (
              /* Normal Email + Password login / signup */
              <>
                {/* Mode tabs - Email + Password is always primary */}
                <div className="flex rounded-lg border p-1 mb-6 bg-muted/50">
                  <button
                    type="button"
                    onClick={() => { setIsSignupMode(false); setResetEmailSent(false); }}
                    className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                      !isSignupMode
                        ? "bg-background shadow-sm text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Log in
                  </button>
                  <button
                    type="button"
                    onClick={() => { setIsSignupMode(true); setResetEmailSent(false); }}
                    className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                      isSignupMode
                        ? "bg-background shadow-sm text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Sign up
                  </button>
                </div>

                <form onSubmit={handleEmailPasswordAuth} className="space-y-4">
                  <div className="space-y-2">
                    <label htmlFor="email" className="text-sm font-medium">
                      Email address
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (resetEmailSent) setResetEmailSent(false);
                        }}
                        className="pl-10"
                        placeholder="you@example.com"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label htmlFor="password" className="text-sm font-medium">
                        Password {isSignupMode ? "(min 6 characters)" : ""}
                      </label>
                      {/* Clear "Forgot Password?" link - only visible on login, not signup */}
                      {!isSignupMode && (
                        resetEmailSent ? (
                          <span className="text-xs text-emerald-500 flex items-center gap-1">
                            Reset link sent.
                            <button
                              type="button"
                              onClick={handlePasswordReset}
                              disabled={loading || !email}
                              className="underline hover:no-underline disabled:opacity-50"
                            >
                              Resend
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={handlePasswordReset}
                            disabled={loading || !email}
                            className="text-xs font-medium text-primary underline-offset-2 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Forgot Password?
                          </button>
                        )
                      )}
                    </div>
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                    />
                    {isSignupMode && (
                      <p className="text-xs text-muted-foreground">Must be at least 6 characters long.</p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    className="mavericks-btn-primary w-full h-11 text-base"
                    disabled={loading || !email || !password}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {isSignupMode ? "Creating account..." : "Logging in..."}
                      </>
                    ) : (
                      isSignupMode ? "Sign up with Email + Password" : "Log in with Email + Password"
                    )}
                  </Button>

                  {/* Helpful instructions */}
                  {isSignupMode ? (
                    <div className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
                      Create your account instantly with email + password. A basic parent profile is created automatically. No email confirmation needed to get started.
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground text-center">
                      Use the same email you registered with the team.
                    </div>
                  )}

                  <p className="text-center text-xs text-muted-foreground pt-1">
                    {isSignupMode ? (
                      <>Already have an account? <button type="button" className="underline hover:no-underline" onClick={() => { setIsSignupMode(false); setResetEmailSent(false); }}>Log in instead</button></>
                    ) : (
                      <>New here? <button type="button" className="underline hover:no-underline" onClick={() => { setIsSignupMode(true); setResetEmailSent(false); }}>Sign up with email + password</button></>
                    )}
                  </p>
                </form>
              </>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Mavericks 12U Team App
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <LoginContent />
    </Suspense>
  );
}
