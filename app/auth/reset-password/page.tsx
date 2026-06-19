"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Mail, KeyRound } from "lucide-react";
import { TeamLogo } from "@/components/TeamLogo";
import { createClient } from "@/lib/supabase/client";

function ResetPasswordContent() {
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [ready, setReady] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [requestSent, setRequestSent] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();

  // On mount: consume any tokens from the email link (token_hash or code)
  // and establish the recovery session so updateUser can be called.
  useEffect(() => {
    const processRecoveryLink = async () => {
      setVerifying(true);
      try {
        const supabase = createClient();

        const code = searchParams.get("code");
        const token_hash = searchParams.get("token_hash");
        const type = searchParams.get("type");

        let verified = false;

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          verified = true;
        } else if (token_hash && type) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash,
            type: type as "recovery" | "signup" | "magiclink" | "invite" | "email_change",
          });
          if (error) throw error;
          verified = true;
        }

        // Check if we now have a usable session (recovery sessions allow password update)
        const { data: { user } } = await supabase.auth.getUser();

        if (user) {
          setUserEmail(user.email || null);
          setReady(true);

          // Clean the URL (remove tokens) for nicer UX and to avoid leaking them in history
          if (code || token_hash) {
            router.replace("/auth/reset-password");
          }
        } else if (verified) {
          // Tokens were processed but no user surfaced — rare, treat as error
          setReady(false);
          toast.error("Unable to start password reset. Please request a new link.");
        } else {
          // No tokens at all (direct visit or consumed already). Allow requesting a reset.
          setReady(false);
        }
      } catch (err: any) {
        console.error("Reset link processing error:", err);
        setReady(false);
        const msg = err?.message || "This reset link is invalid or has expired.";
        toast.error(msg.includes("expired") || msg.includes("invalid")
          ? "This reset link is invalid or has expired. Please request a new one."
          : msg);
      } finally {
        setVerifying(false);
      }
    };

    processRecoveryLink();
  }, [searchParams]);

  // Send (or re-send) the reset email from this page
  const handleRequestReset = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const targetEmail = email.trim();
    if (!targetEmail) {
      toast.error("Please enter your email address");
      return;
    }
    setLoading(true);
    try {
      const supabase = createClient();
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
      const { error } = await supabase.auth.resetPasswordForEmail(targetEmail, {
        redirectTo: `${baseUrl.replace(/\/$/, "")}/auth/reset-password`,
      });
      if (error) throw error;
      setRequestSent(true);
      toast.success("Password reset link sent! Check your email (and spam folder).");
    } catch (err: any) {
      let msg = err?.message || "Failed to send reset link";
      if (msg.toLowerCase().includes("rate") || msg.toLowerCase().includes("too many")) {
        msg = "Too many attempts — please wait a few minutes before trying again.";
      }
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // Set the new password using the recovery session
  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newPassword || newPassword.length < 6) {
      toast.error("New password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      // The recovery session is upgraded to a regular session after a successful password update.
      await supabase.auth.refreshSession().catch(() => {});

      toast.success("Password updated successfully! You're now logged in.");

      // Clear sensitive fields
      setNewPassword("");
      setConfirmPassword("");

      // Go to the app
      router.push("/dashboard");
      router.refresh();
    } catch (err: any) {
      let msg = err?.message || "Failed to reset password";
      if (msg.toLowerCase().includes("session")) {
        msg = "Reset session expired. Please go back to the login page and request a new link.";
      }
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // While we are consuming the link from the email
  if (verifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md text-center">
          <div className="flex justify-center mb-6">
            <TeamLogo size="lg" className="drop-shadow-md" />
          </div>
          <Card className="mavericks-card">
            <CardContent className="py-10 flex flex-col items-center gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Verifying reset link...</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        {/* Branding */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <TeamLogo size="lg" className="drop-shadow-md" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Mavericks 12U</h1>
          <p className="text-muted-foreground mt-1 text-sm">Travel Baseball • Team Hub</p>
        </div>

        <Card className="mavericks-card">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-primary/10 p-2">
                <KeyRound className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-2xl">Reset your password</CardTitle>
                <CardDescription>
                  {ready
                    ? "Enter a new password for your account."
                    : "Enter your email to receive a password reset link."}
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            {ready ? (
              /* Form to choose a new password (recovery session is active) */
              <form onSubmit={handleUpdatePassword} className="space-y-4">
                {userEmail && (
                  <div className="rounded-md bg-muted/60 p-3 text-sm">
                    Resetting password for <span className="font-medium">{userEmail}</span>
                  </div>
                )}

                <div className="space-y-2">
                  <label htmlFor="new-password" className="text-sm font-medium">
                    New password
                  </label>
                  <Input
                    id="new-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={6}
                    disabled={loading}
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
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={6}
                    disabled={loading}
                  />
                </div>

                <Button
                  type="submit"
                  className="mavericks-btn-primary w-full h-11 text-base mt-2"
                  disabled={loading || !newPassword || !confirmPassword}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Updating password...
                    </>
                  ) : (
                    "Update Password & Sign In"
                  )}
                </Button>

                <p className="text-center text-xs text-muted-foreground pt-1">
                  After updating, you will be logged in and redirected to the team hub.
                </p>

                <div className="pt-2 text-center">
                  <button
                    type="button"
                    onClick={() => router.push("/login")}
                    className="text-xs text-muted-foreground underline hover:text-foreground"
                  >
                    Back to login
                  </button>
                </div>
              </form>
            ) : (
              /* No valid recovery session — show request form */
              <div className="space-y-4">
                {requestSent ? (
                  <div className="rounded-md border bg-emerald-500/10 p-4 text-sm">
                    <p className="font-medium text-emerald-400">Check your inbox</p>
                    <p className="mt-1 text-muted-foreground">
                      We sent a password reset link. Click the link in the email to set a new password.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setRequestSent(false);
                        setEmail("");
                      }}
                      className="mt-3 text-xs underline"
                    >
                      Send to a different email
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleRequestReset} className="space-y-4">
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
                          onChange={(e) => setEmail(e.target.value)}
                          className="pl-10"
                          placeholder="you@example.com"
                          required
                          disabled={loading}
                        />
                      </div>
                    </div>

                    <Button
                      type="submit"
                      className="mavericks-btn-primary w-full h-11"
                      disabled={loading || !email}
                    >
                      {loading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Sending reset link...
                        </>
                      ) : (
                        "Send password reset link"
                      )}
                    </Button>
                  </form>
                )}

                <div className="text-center pt-1">
                  <p className="text-xs text-muted-foreground">
                    Remembered your password?{" "}
                    <button
                      type="button"
                      onClick={() => router.push("/login")}
                      className="underline hover:no-underline"
                    >
                      Log in
                    </button>
                  </p>
                </div>

                <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
                  If you clicked a reset link and landed here, it may have expired. Request a new one above.
                </div>
              </div>
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

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <TeamLogo size="lg" />
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    }>
      <ResetPasswordContent />
    </Suspense>
  );
}
