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
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [magicSent, setMagicSent] = useState(false);
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
        friendly = "Authentication failed or link expired. Please try again or use email + password.";
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
  }, [searchParams]);

  const handleEmailPasswordSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !password) {
      toast.error("Please enter email and password to sign up");
      return;
    }

    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();

      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) throw error;

      // Auto-create basic profile for new user
      if (data.user) {
        try {
          const { data: existing } = await supabase
            .from("profiles")
            .select("id")
            .eq("id", data.user.id)
            .maybeSingle();

          if (!existing) {
            await supabase.from("profiles").insert({
              id: data.user.id,
              email: data.user.email,
              role: "parent",
              first_name: "",
              last_name: "",
              is_admin: false,
            } as any);
          }
        } catch (profileErr) {
          console.warn("Profile creation skipped (may already exist):", profileErr);
        }
      }

      if (data.session) {
        // Auto logged in (if email confirmation not required or already confirmed)
        toast.success("Account created! Welcome to Mavericks 12U.");
        router.push("/dashboard");
        router.refresh();
      } else {
        // Email confirmation required
        toast.success("Account created! Check your email to confirm and log in.");
        setMagicSent(true);
      }
    } catch (err: any) {
      let msg = err.message || "Signup failed";
      if (msg.toLowerCase().includes("rate") || msg.toLowerCase().includes("too many")) {
        msg = "Too many attempts — please wait a few minutes before trying again.";
      } else if (msg.includes("already registered")) {
        msg = "This email is already registered. Try logging in instead.";
      }
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !password) {
      toast.error("Please enter email and password");
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();

      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) throw error;

      toast.success("Logged in successfully!");
      router.push("/dashboard");
      router.refresh();
    } catch (err: any) {
      let msg = err.message || "Login failed";
      if (msg.toLowerCase().includes("rate") || msg.toLowerCase().includes("too many")) {
        msg = "Too many attempts — please wait a few minutes before trying again.";
      }
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const sendMagicLink = async (isSignup: boolean = false) => {
    if (!email) {
      toast.error("Please enter your email address");
      return;
    }

    setLoading(true);
    setMagicSent(false);

    try {
      const supabase = createClient();

      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          shouldCreateUser: isSignup,
        },
      });

      if (error) throw error;

      setMagicSent(true);
      toast.success(
        isSignup
          ? "Magic link sent! Check your email to create your account and sign in."
          : "Magic link sent! Check your email to log in."
      );
    } catch (err: any) {
      let msg = err.message || "Failed to send magic link";
      if (msg.toLowerCase().includes("rate") || msg.toLowerCase().includes("too many")) {
        msg = "Too many attempts — please wait a few minutes before trying again.";
      }
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // Alias for buttons
  const handleMagicLink = sendMagicLink;

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
              {mode === "login" ? "Log in to Mavericks 12U" : "Sign up for Mavericks 12U"}
            </CardTitle>
            <CardDescription>
              {mode === "login"
                ? "Enter your email and password, or use a magic link."
                : "Sign up easily with a magic link — no password needed!"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Mode switch for clearer signup/login */}
            <div className="flex rounded-lg border p-1 mb-6 bg-muted/50">
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setMagicSent(false);
                }}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                  mode === "login"
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Log in
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("signup");
                  setMagicSent(false);
                }}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                  mode === "signup"
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Sign up
              </button>
            </div>

            <form 
              onSubmit={mode === "login" ? handleLogin : handleEmailPasswordSignup} 
              className="space-y-4"
            >
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
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium">
                  Password {mode === "signup" ? "(required for email + password signup)" : "(optional for magic link)"}
                </label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required={mode === "signup"}
                />
              </div>

              {mode === "login" ? (
                <>
                  <Button
                    type="submit"
                    className="mavericks-btn-primary w-full h-11 text-base"
                    disabled={loading || !email || !password}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Logging in...
                      </>
                    ) : (
                      "Log in with Email + Password"
                    )}
                  </Button>

                  <div className="relative my-4">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-background px-2 text-muted-foreground">or use magic link (no password)</span>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => handleMagicLink(false)}
                    disabled={loading || !email}
                  >
                    {loading ? "Sending..." : "Send magic link to log in"}
                  </Button>
                </>
              ) : (
                <>
                  {/* Signup: Email + Password primary, magic secondary */}
                  <Button
                    type="submit"
                    className="mavericks-btn-primary w-full h-11 text-base"
                    disabled={loading || !email || !password}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating account...
                      </>
                    ) : (
                      "Sign up with Email + Password"
                    )}
                  </Button>

                  <div className="relative my-4">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-background px-2 text-muted-foreground">or use magic link (no password)</span>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => handleMagicLink(true)}
                    disabled={loading || !email}
                  >
                    {loading ? "Sending..." : "Sign up with magic link"}
                  </Button>

                  <div className="rounded-md bg-blue-50 p-3 text-sm text-blue-700 border border-blue-200">
                    <strong>Quick start:</strong> Use Email + Password for instant access. 
                    A basic profile will be created for you automatically. Magic link is available as an alternative.
                  </div>

                  <p className="text-center text-xs text-muted-foreground">
                    Already have an account?{" "}
                    <button
                      type="button"
                      className="underline hover:no-underline"
                      onClick={() => {
                        setMode("login");
                        setMagicSent(false);
                      }}
                    >
                      Log in instead
                    </button>
                  </p>
                </>
              )}

              {magicSent && (
                <div className="text-center text-sm text-green-600 bg-green-50 p-3 rounded-md border border-green-200">
                  {mode === "signup"
                    ? "We've sent a magic link to your email. Click it to finish signing up (your profile will be created automatically) and you'll be logged in automatically."
                    : "We've sent a magic link to your email. Click it to log in automatically and be redirected to the dashboard."}
                  <br />
                  <span className="text-xs text-muted-foreground">Didn't receive it? Check spam or try again in a minute.</span>
                </div>
              )}
            </form>
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
