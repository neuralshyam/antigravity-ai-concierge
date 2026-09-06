"use client";

import { useState, useEffect } from "react";
import { Plus, Copy, Check, Globe, Server, Key, LogOut, ArrowRight, Lock, Mail, User } from "lucide-react";

interface Site {
  id: string;
  storeName: string;
  frontendUrl: string;
  backendUrl: string;
  apiKey: string;
  createdAt: string;
}

interface UserProfile {
  id: string;
  name: string;
  email: string;
}

export default function MarketplacePage() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  // Auth form state
  const [isRegister, setIsRegister] = useState(false);
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  // Sites state
  const [sites, setSites] = useState<Site[]>([]);
  const [loadingSites, setLoadingSites] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Add Site form state
  const [siteName, setSiteName] = useState("");
  const [frontendUrl, setFrontendUrl] = useState("");
  const [backendUrl, setBackendUrl] = useState("");
  const [submittingSite, setSubmittingSite] = useState(false);

  // Restore session from localStorage
  useEffect(() => {
    try {
      const savedToken = localStorage.getItem("ag_saas_token");
      const savedUser = localStorage.getItem("ag_saas_user");
      if (savedToken && savedUser) {
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsHydrated(true);
    }
  }, []);

  // Fetch sites when user is authenticated
  const loadSites = async (jwtToken: string) => {
    try {
      setLoadingSites(true);
      const res = await fetch("/api/marketplace/stores", {
        headers: { Authorization: `Bearer ${jwtToken}` },
      });
      const data = await res.json();
      if (data.success) {
        setSites(data.stores || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingSites(false);
    }
  };

  useEffect(() => {
    if (token) {
      loadSites(token);
    }
  }, [token]);

  // Auth Submit (Login / Register)
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);

    try {
      const res = await fetch("/api/marketplace/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: isRegister ? "register" : "login",
          email: authEmail.trim(),
          password: authPassword,
          name: authName.trim(),
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setToken(data.token);
        setUser(data.user);
        localStorage.setItem("ag_saas_token", data.token);
        localStorage.setItem("ag_saas_user", JSON.stringify(data.user));
      } else {
        setAuthError(data.error || "Authentication failed");
      }
    } catch (e: any) {
      setAuthError(e.message || "Failed to reach server");
    } finally {
      setAuthLoading(false);
    }
  };

  // Logout
  const handleLogout = () => {
    localStorage.removeItem("ag_saas_token");
    localStorage.removeItem("ag_saas_user");
    setToken(null);
    setUser(null);
    setSites([]);
  };

  // Add Site
  const handleAddSite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!siteName.trim() || !frontendUrl.trim() || !backendUrl.trim() || submittingSite || !token) return;

    try {
      setSubmittingSite(true);
      const res = await fetch("/api/marketplace/stores", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          storeName: siteName.trim(),
          frontendUrl: frontendUrl.trim(),
          backendUrl: backendUrl.trim(),
        }),
      });

      const data = await res.json();
      if (data.success) {
        setSiteName("");
        setFrontendUrl("");
        setBackendUrl("");
        await loadSites(token);
      } else {
        alert(data.error || "Failed to add site");
      }
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSubmittingSite(false);
    }
  };

  const copyKey = (key: string, id: string) => {
    navigator.clipboard.writeText(key);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (!isHydrated) return null;

  // 1. Unauthenticated: Clean Login / Register Screen
  if (!user || !token) {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center p-4 font-sans selection:bg-white selection:text-black">
        <div className="w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-2xl space-y-6">
          <div className="space-y-1 text-center">
            <h1 className="text-xl font-bold text-white tracking-tight">
              {isRegister ? "Create Developer Account" : "Sign In to Developer Platform"}
            </h1>
            <p className="text-xs text-neutral-400">
              {isRegister
                ? "Register to create and manage your API keys."
                : "Enter your credentials to manage your sites and keys."}
            </p>
          </div>

          {authError && (
            <div className="p-3 rounded-lg bg-red-950/50 border border-red-800/60 text-red-300 text-xs">
              {authError}
            </div>
          )}

          <form onSubmit={handleAuth} className="space-y-3.5 text-xs">
            {isRegister && (
              <div>
                <label className="block text-neutral-400 mb-1">Your Name</label>
                <div className="relative">
                  <User className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    placeholder="Alex Smith"
                    value={authName}
                    onChange={(e) => setAuthName(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg pl-9 pr-3 py-2 text-white placeholder-neutral-600 focus:outline-none focus:border-neutral-500"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-neutral-400 mb-1">Email Address</label>
              <div className="relative">
                <Mail className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  placeholder="name@company.com"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg pl-9 pr-3 py-2 text-white placeholder-neutral-600 focus:outline-none focus:border-neutral-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-neutral-400 mb-1">Password</label>
              <div className="relative">
                <Lock className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg pl-9 pr-3 py-2 text-white placeholder-neutral-600 focus:outline-none focus:border-neutral-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={authLoading}
              className="w-full py-2.5 px-4 bg-white hover:bg-neutral-200 text-black font-semibold rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-2"
            >
              <span>{authLoading ? "Processing..." : isRegister ? "Create Account" : "Sign In"}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>

          <div className="text-center pt-2 border-t border-neutral-800/60">
            <button
              type="button"
              onClick={() => {
                setIsRegister(!isRegister);
                setAuthError("");
              }}
              className="text-xs text-neutral-400 hover:text-white transition-colors cursor-pointer"
            >
              {isRegister ? "Already have an account? Sign In" : "Don't have an account? Register"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. Authenticated Dashboard: Clean Sites & API Key Management
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans p-6 md:p-12 max-w-5xl mx-auto">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-neutral-800 pb-5 mb-8">
        <div>
          <h1 className="text-lg font-bold text-white tracking-tight">API Keys & Sites</h1>
          <p className="text-xs text-neutral-400 mt-0.5">
            Logged in as <span className="text-neutral-200 font-medium">{user.email}</span>
          </p>
        </div>

        <button
          onClick={handleLogout}
          className="text-xs text-neutral-400 hover:text-white px-3 py-1.5 border border-neutral-800 hover:border-neutral-700 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign Out
        </button>
      </div>

      {/* Add Site Form */}
      <form
        onSubmit={handleAddSite}
        className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 mb-8 space-y-4"
      >
        <h2 className="text-sm font-semibold text-neutral-200">Register New Site</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div>
            <label className="block text-neutral-400 mb-1">Site / App Name</label>
            <input
              type="text"
              required
              placeholder="e.g. My Online Store"
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white placeholder-neutral-600 focus:outline-none focus:border-neutral-500"
            />
          </div>

          <div>
            <label className="block text-neutral-400 mb-1">Frontend URL</label>
            <input
              type="url"
              required
              placeholder="https://example.com"
              value={frontendUrl}
              onChange={(e) => setFrontendUrl(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white placeholder-neutral-600 focus:outline-none focus:border-neutral-500"
            />
          </div>

          <div>
            <label className="block text-neutral-400 mb-1">Backend Server Address</label>
            <input
              type="url"
              required
              placeholder="https://api.example.com"
              value={backendUrl}
              onChange={(e) => setBackendUrl(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white placeholder-neutral-600 focus:outline-none focus:border-neutral-500"
            />
          </div>
        </div>

        <div className="flex justify-end pt-1">
          <button
            type="submit"
            disabled={submittingSite}
            className="px-4 py-2 text-xs font-semibold bg-white text-black hover:bg-neutral-200 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" />
            {submittingSite ? "Adding..." : "Add Site & Generate Key"}
          </button>
        </div>
      </form>

      {/* Sites List */}
      <div>
        <h2 className="text-sm font-semibold text-neutral-200 mb-3">Your Registered Sites</h2>

        {loadingSites ? (
          <div className="text-xs text-neutral-500 py-6 text-center">Loading sites from database...</div>
        ) : sites.length === 0 ? (
          <div className="bg-neutral-900/50 border border-neutral-800/80 rounded-xl p-8 text-center text-xs text-neutral-400">
            No sites registered yet. Fill in the form above to add your first site and generate an API key.
          </div>
        ) : (
          <div className="space-y-3">
            {sites.map((site) => (
              <div
                key={site.id}
                className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs"
              >
                <div className="space-y-1">
                  <div className="font-semibold text-white text-sm">{site.storeName}</div>
                  <div className="flex flex-wrap items-center gap-3 text-neutral-400 font-mono text-[11px]">
                    <span className="flex items-center gap-1">
                      <Globe className="w-3 h-3 text-neutral-500" />
                      {site.frontendUrl}
                    </span>
                    <span className="flex items-center gap-1">
                      <Server className="w-3 h-3 text-neutral-500" />
                      {site.backendUrl}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 bg-neutral-950 border border-neutral-800 px-3 py-1.5 rounded-lg font-mono text-[11px] text-neutral-300">
                    <Key className="w-3 h-3 text-neutral-500" />
                    <span>{site.apiKey}</span>
                    <button
                      onClick={() => copyKey(site.apiKey, site.id)}
                      className="text-neutral-400 hover:text-white transition-colors ml-1 cursor-pointer"
                      title="Copy Key"
                    >
                      {copiedId === site.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
