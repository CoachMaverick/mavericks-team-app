"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Mail } from "lucide-react";
import { TeamLogo } from "@/components/TeamLogo";
import { createClient } from "@/lib/supabase/client";
import { listAllFamilies, createFamilyAndLink, joinExistingFamily, skipFamilySetup } from '@/lib/actions';

export default function LoginContent() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSignupMode, setIsSignupMode] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [showFamilySetup, setShowFamilySetup] = useState(false);
  const [famName, setFamName] = useState('');
  const [allFamilies, setAllFamilies] = useState<any[]>([]);
  const [famLoading, setFamLoading] = useState(false);
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
      toast.success("Signed up successfully! You're now logged in.");
      const url = new URL(window.location.href);
      url.searchParams.delete("success");
      window.history.replaceState({}, "", url.toString());
    }

    // If someone lands here with a recovery token from an older link, forward to the dedicated reset page.
    const type = searchParams.get("type");
    if (type === "recovery") {
      // Preserve any token_hash / code so the reset page can consume it.
      const currentSearch = window.location.search || "";
      router.replace(`/auth/reset-password${currentSearch}`);
    }
  }, [searchParams, router]);

  // If already authenticated with a normal session, send user into the app.
  // (Recovery sessions are handled on the dedicated reset-password page.)
  useEffect(() => {
    const checkExistingSession = async () => {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const userEmail = session.user.email?.toLowerCase() || '';
          const isAdminAccount = userEmail === 'coach@comavericksbaseball.com';
          // Zero friction for admin/coach account: never show family setup
          if (isAdminAccount) {
            router.replace("/dashboard");
            return;
          }
          const { data: prof } = await supabase.from('profiles').select('family_id, has_completed_onboarding, last_name').eq('id', session.user.id).maybeSingle() as any;
          const forcePrompt = searchParams.get('prompt') === 'family';
          const needsSetup = (prof?.has_completed_onboarding === false || (prof?.has_completed_onboarding == null && !prof?.family_id));
          if ((needsSetup || forcePrompt) && !isAdminAccount) {
            // Mark done on first show (via skip action) so prompt appears exactly once for regular users on first login.
            // Skip button will also invoke it with UX.
            skipFamilySetup().catch(() => {});
            setFamName(prof?.last_name ? `${prof.last_name} Family` : '');
            const fams = await listAllFamilies();
            setAllFamilies(fams);
            setShowFamilySetup(true);
            return;
          }
          router.replace("/dashboard");
        }
      } catch (e) {
        // not authenticated or transient error — stay on login
      }
    };
    const t = setTimeout(checkExistingSession, 10);
    return () => clearTimeout(t);
  }, [router, searchParams]);

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
              const isAdminAccount = (signUpData.user.email || '').toLowerCase() === 'coach@comavericksbaseball.com';
              await supabase.from("profiles").insert({
                id: signUpData.user.id,
                email: signUpData.user.email,
                role: isAdminAccount ? "admin" : "parent",
                first_name: "",
                last_name: "",
                is_admin: isAdminAccount,
                has_completed_onboarding: isAdminAccount, // admin skips family setup entirely
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
        const isAdminSignup = emailTrimmed.toLowerCase() === 'coach@comavericksbaseball.com';
        if (isAdminSignup) {
          router.push('/dashboard');
          router.refresh();
        } else {
          await checkAndPromptFamily();
        }
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
              const isAdminAccount = (user.email || '').toLowerCase() === 'coach@comavericksbaseball.com';
              await supabase.from("profiles").insert({
                id: user.id,
                email: user.email,
                role: isAdminAccount ? "admin" : "parent",
                first_name: "",
                last_name: "",
                is_admin: isAdminAccount,
                has_completed_onboarding: isAdminAccount,
                created_at: new Date().toISOString(),
              } as any);
            }
          }
        } catch (profileErr) {
          console.warn("Profile check on login skipped:", profileErr);
        }

        toast.success("Logged in successfully!");
        const isAdminLogin = emailTrimmed.toLowerCase() === 'coach@comavericksbaseball.com';
        if (isAdminLogin) {
          router.push('/dashboard');
          router.refresh();
        } else {
          await checkAndPromptFamily();
        }
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
      // Point the reset email link directly to the dedicated reset password page.
      // Supabase will append token_hash + type=recovery (or code) to this URL.
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${baseUrl.replace(/\/$/, "")}/auth/reset-password`,
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

  const checkAndPromptFamily = async () => {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const userEmail = user.email?.toLowerCase() || '';
        const isAdminAccount = userEmail === 'coach@comavericksbaseball.com';
        if (isAdminAccount) {
          router.push("/dashboard");
          router.refresh();
          return;
        }
        const { data: prof } = await supabase.from('profiles').select('family_id, has_completed_onboarding, last_name').eq('id', user.id).maybeSingle() as any;
        const needsSetup = prof?.has_completed_onboarding === false || (prof?.has_completed_onboarding == null && !prof?.family_id);
        if (needsSetup) {
          // Mark done on first show (via skip action) so prompt appears exactly once for regular users on first login.
          // Skip button will also invoke it with UX.
          skipFamilySetup().catch(() => {});
          setFamName(prof?.last_name ? `${prof.last_name} Family` : '');
          const fams = await listAllFamilies();
          setAllFamilies(fams);
          setShowFamilySetup(true);
          return;
        }
      }
    } catch (e) {}
    router.push("/dashboard");
    router.refresh();
  };

  const doCreate = async () => {
    if (!famName.trim()) {
      toast.error('Enter a family name');
      return;
    }
    setFamLoading(true);
    try {
      await createFamilyAndLink(famName.trim());
      toast.success('Family created and linked!');
      router.push('/dashboard');
      router.refresh();
    } catch (e: any) {
      toast.error(e.message || 'Failed to create family');
    } finally {
      setFamLoading(false);
    }
  };

  const doJoin = async (id: string) => {
    setFamLoading(true);
    try {
      await joinExistingFamily(id);
      toast.success('Joined family!');
      router.push('/dashboard');
      router.refresh();
    } catch (e: any) {
      toast.error(e.message || 'Failed to join');
    } finally {
      setFamLoading(false);
    }
  };

  const doJoinByName = async () => {
    if (!famName.trim()) return;
    setFamLoading(true);
    try {
      const match = allFamilies.find((f: any) => f.name.toLowerCase() === famName.trim().toLowerCase());
      if (match) {
        await joinExistingFamily(match.id);
        toast.success('Joined family!');
        router.push('/dashboard');
        router.refresh();
      } else {
        toast.error('Family not found, try Create instead');
      }
    } catch (e: any) {
      toast.error(e.message || 'Failed');
    } finally {
      setFamLoading(false);
    }
  };

  const doSkip = async () => {
    setFamLoading(true);
    try {
      await skipFamilySetup();
      toast.success("Setup skipped. You can set up your family later from the Roster page.");
      router.push('/dashboard');
      router.refresh();
    } catch (e: any) {
      toast.error(e.message || 'Failed to skip');
      // still proceed so user isn't stuck
      router.push('/dashboard');
      router.refresh();
    } finally {
      setFamLoading(false);
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

        {!showFamilySetup ? (
          <Card className="mavericks-card">
            <CardHeader>
              <CardTitle className="text-2xl">
                {isSignupMode ? "Create your Mavericks 12U account" : "Log in to Mavericks 12U"}
              </CardTitle>
              <CardDescription>
                {isSignupMode
                  ? "Sign up with email and password for instant access. A profile is created automatically."
                  : "Enter your email and password to access the team hub."}
              </CardDescription>
            </CardHeader>
            <CardContent>
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
                  <label htmlFor="password" className="text-sm font-medium">
                    Password {isSignupMode ? "(min 6 characters)" : ""}
                  </label>
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

                  {/* Clear, prominent "Forgot Password?" link — only on login tab */}
                  {!isSignupMode && (
                    <div className="-mt-1">
                      {resetEmailSent ? (
                        <div className="rounded-md bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-xs text-emerald-400">
                          Reset link sent to <span className="font-medium">{email}</span>. Check your inbox (and spam).
                          {" "}
                          <button
                            type="button"
                            onClick={handlePasswordReset}
                            disabled={loading || !email}
                            className="underline hover:no-underline font-medium disabled:opacity-50"
                          >
                            Resend
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={handlePasswordReset}
                          disabled={loading || !email}
                          className="text-sm font-medium text-primary underline-offset-2 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Forgot Password?
                        </button>
                      )}
                    </div>
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
                    Use the email you registered with. Click “Forgot Password?” below if you need a reset link.
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
            </CardContent>
          </Card>
        ) : (
          <Card className="mavericks-card border-primary/40">
            <CardHeader>
              <CardTitle className="text-2xl">Almost done — set up your family</CardTitle>
              <CardDescription>
                Create My Family (recommended) or join existing. This auto-links your profile.family_id so the app shows your real family name everywhere (RSVPs, dashboard, etc).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Simple for parents: one click to create your family.</p>
            </CardContent>
          </Card>
        )}

        <Dialog open={showFamilySetup} onOpenChange={(open) => {
          if (!open) {
            router.push('/dashboard');
            router.refresh();
          }
          setShowFamilySetup(open);
        }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Setup Your Family</DialogTitle>
              <DialogDescription>
                Create a new family or join an existing one. This links your profile via <span className="font-medium">family_id</span> so RSVPs (Schedule + Dashboard), roster and lists show your actual family name.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <Button onClick={doCreate} disabled={famLoading} className="w-full mavericks-btn-primary h-12 text-base font-semibold">
                {famLoading ? 'Working...' : `Create My Family${famName ? ` (${famName})` : ''}`}
              </Button>
              <div className="text-center text-xs text-muted-foreground">or join existing</div>
              {allFamilies.length > 0 && (
                <div className="space-y-1 max-h-40 overflow-auto">
                  {allFamilies.map((f: any) => (
                    <Button key={f.id} variant="outline" className="w-full" disabled={famLoading} onClick={() => doJoin(f.id)}>
                      Join {f.name}
                    </Button>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input value={famName} onChange={(e) => setFamName(e.target.value)} placeholder="Family name to join" />
                <Button onClick={doJoinByName} disabled={famLoading || !famName} variant="outline">Join</Button>
              </div>
              <p className="text-[10px] text-center text-muted-foreground">Tip: Use "Create My Family" for the quickest parent setup.</p>

              <div className="pt-2 border-t">
                <Button
                  variant="ghost"
                  onClick={doSkip}
                  disabled={famLoading}
                  className="w-full text-muted-foreground hover:text-foreground"
                >
                  Skip for now — I'll set up my family later
                </Button>
                <p className="text-[10px] text-center text-muted-foreground mt-1">You can complete family setup anytime from the Roster page.</p>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Mavericks 12U Team App
        </p>
      </div>
    </div>
  );
}
