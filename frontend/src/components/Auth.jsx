import React, { useState } from "react";
import { signInWithMagicLink } from "../supabaseClient";
import { LogIn, TrendingUp, Shield, Activity, Mail } from "lucide-react";

export default function Auth() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const handleSignIn = async (e) => {
    e.preventDefault();
    if (!email) return setError("Please enter your email.");
    
    setLoading(true);
    setError("");
    try {
      await signInWithMagicLink(email);
      setSent(true);
    } catch (err) {
      setError(err.message || "Failed to send magic link. Please try again.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-logo">Antigravity</div>
        <div className="auth-subtitle">
          Portfolio-centric market intelligence. Load your holdings to fetch a customized news feed.
        </div>

        {sent ? (
          <div style={{ textAlign: "center", padding: "1rem", color: "hsl(var(--text-primary))", backgroundColor: "hsl(var(--surface-sunken))", borderRadius: "8px" }}>
            <Mail size={32} style={{ color: "hsl(var(--accent-primary))", marginBottom: "0.5rem" }} />
            <h3 style={{ marginBottom: "0.5rem" }}>Check your inbox</h3>
            <p style={{ fontSize: "0.85rem", color: "hsl(var(--text-secondary))" }}>We've sent a magic login link to {email}</p>
          </div>
        ) : (
          <form onSubmit={handleSignIn} style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1rem" }}>
            <input 
              type="email" 
              placeholder="Enter your email address" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              style={{ width: "100%", padding: "0.85rem 1rem", borderRadius: "8px", border: "1px solid hsl(var(--border-subtle))", backgroundColor: "hsl(var(--surface-default))", color: "hsl(var(--text-primary))" }}
            />
            <button 
              type="submit"
              disabled={loading || !email} 
              className="btn-minimal btn-accent"
              style={{ width: "100%", justifyContent: "center", padding: "0.85rem 1rem" }}
            >
              {loading ? (
                <Activity className="spinner" size={18} />
              ) : (
                <>
                  <LogIn size={18} />
                  Send Magic Link
                </>
              )}
            </button>
          </form>
        )}

        {error && (
          <div style={{ color: "hsl(var(--accent-warning))", fontSize: "0.8rem", marginBottom: "1rem" }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "2rem", textAlign: "left" }}>
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
            <div style={{ color: "hsl(var(--accent-primary))", marginTop: "0.15rem" }}>
              <TrendingUp size={16} />
            </div>
            <div>
              <h4 style={{ fontSize: "0.85rem", fontWeight: "600", color: "hsl(var(--text-primary))" }}>
                Holdings-First News Feed
              </h4>
              <p style={{ fontSize: "0.8rem", color: "hsl(var(--text-secondary))" }}>
                Filter general market feeds in-memory. Zero leakage of your portfolio details to external APIs.
              </p>
            </div>
          </div>

          <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
            <div style={{ color: "hsl(var(--accent-primary))", marginTop: "0.15rem" }}>
              <Shield size={16} />
            </div>
            <div>
              <h4 style={{ fontSize: "0.85rem", fontWeight: "600", color: "hsl(var(--text-primary))" }}>
                Secure Supabase Vault
              </h4>
              <p style={{ fontSize: "0.8rem", color: "hsl(var(--text-secondary))" }}>
                Protected by strict Row Level Security (RLS) rules. Your stock data is visible only to you.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
