"use client";

import { useState, useEffect } from "react";
import { Plus, Copy, Check, Globe, Server, Key, LogOut, ArrowRight, Lock, Mail, User, Flame, Zap, ShieldCheck, BookOpen, Terminal, Code, Cpu, Layers } from "lucide-react";

interface Site {
  id: string;
  storeName: string;
  frontendUrl: string;
  backendUrl: string;
  apiKey: string;
  tier?: string;
  monthlyQuota?: number;
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

  const [sites, setSites] = useState<Site[]>([]);
  const [loadingSites, setLoadingSites] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [upgradingPlan, setUpgradingPlan] = useState(false);
  const [checkoutSuccessMessage, setCheckoutSuccessMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"dashboard" | "docs" | "pricing">("dashboard");

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

  const handleRazorpayCheckout = async (planKey: string = "pro") => {
    if (!token) return;
    try {
      setUpgradingPlan(true);
      setCheckoutSuccessMessage(null);

      const loadScript = () => {
        return new Promise((resolve) => {
          if ((window as any).Razorpay) return resolve(true);
          const script = document.createElement("script");
          script.src = "https://checkout.razorpay.com/v1/checkout.js";
          script.onload = () => resolve(true);
          script.onerror = () => resolve(false);
          document.body.appendChild(script);
        });
      };

      const scriptLoaded = await loadScript();

      if (scriptLoaded && (window as any).Razorpay) {
        const options = {
          key: "rzp_test_mockKeyId108",
          amount: 100000, // 1000 INR in paise
          currency: "INR",
          name: "AI Concierge Developer SaaS",
          description: "Pro Merchant Plan Subscription (₹1,000 / mo)",
          image: "https://ebakx.com/logo.png",
          handler: async function (response: any) {
            const upgradeRes = await fetch("/api/marketplace/stores", {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                planKey,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_order_id: response.razorpay_order_id,
              }),
            });
            const upgradeData = await upgradeRes.json();
            if (upgradeData.success) {
              setCheckoutSuccessMessage("Payment verified! Your stores have been upgraded to Pro (₹1,000/mo).");
              await loadSites(token);
            }
          },
          prefill: {
            name: user?.name || "Store Owner",
            email: user?.email || "merchant@ebakx.com",
            contact: "9999999999",
          },
          theme: {
            color: "#000000",
          },
        };

        const rzp = new (window as any).Razorpay(options);
        rzp.on("payment.failed", function (response: any) {
          alert(`Payment Failed: ${response.error.description || "Transaction cancelled"}`);
        });
        rzp.open();
      } else {
        // Direct API update fallback
        const upgradeRes = await fetch("/api/marketplace/stores", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ planKey }),
        });
        const upgradeData = await upgradeRes.json();
        if (upgradeData.success) {
          setCheckoutSuccessMessage("Successfully upgraded plan to Pro (₹1,000/mo).");
          await loadSites(token);
        }
      }
    } catch (err: any) {
      alert(err?.message || "Failed to initiate Razorpay checkout");
    } finally {
      setUpgradingPlan(false);
    }
  };

  const copyKey = (key: string, id: string) => {
    navigator.clipboard.writeText(key);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // 1. Full Public Developer Landing Page & Docs (Visible without login)
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans selection:bg-white selection:text-black">
      {/* Top Global Navigation */}
      <header className="border-b border-neutral-800/80 sticky top-0 z-50 bg-neutral-950/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white text-black flex items-center justify-center font-bold font-mono text-sm">
              AG
            </div>
            <div>
              <span className="font-bold text-white text-sm tracking-tight">AI Concierge Core</span>
              <span className="text-[10px] bg-neutral-800 text-neutral-300 font-mono px-1.5 py-0.5 rounded border border-neutral-700 ml-2">v2.0</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("dashboard")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                activeTab === "dashboard" ? "bg-white text-black font-semibold" : "text-neutral-400 hover:text-white"
              }`}
            >
              {user ? "My Sites & Keys" : "Developer Portal"}
            </button>
            <button
              onClick={() => setActiveTab("docs")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                activeTab === "docs" ? "bg-white text-black font-semibold" : "text-neutral-400 hover:text-white"
              }`}
            >
              Documentation
            </button>
            <button
              onClick={() => setActiveTab("pricing")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                activeTab === "pricing" ? "bg-white text-black font-semibold" : "text-neutral-400 hover:text-white"
              }`}
            >
              Pricing (₹1K/mo)
            </button>

            {user ? (
              <button
                onClick={handleLogout}
                className="text-xs text-neutral-400 hover:text-white px-3 py-1.5 border border-neutral-800 hover:border-neutral-700 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ml-2"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12">
        {/* PUBLIC HERO SECTION */}
        <section className="text-center py-12 md:py-16 space-y-5 border-b border-neutral-800/80 mb-12">
          <div className="inline-flex items-center gap-2 bg-neutral-900 border border-neutral-800 px-3 py-1 rounded-full text-[11px] text-neutral-300">
            <Flame className="w-3.5 h-3.5 text-amber-400" />
            <span>Zero-Trust E-Commerce AI Agent & Tool Execution Gateway</span>
          </div>
          <h1 className="text-3xl md:text-5xl font-extrabold text-white tracking-tight max-w-3xl mx-auto leading-tight">
            High-Performance AI Concierge for Modern E-Commerce
          </h1>
          <p className="text-neutral-400 text-sm md:text-base max-w-2xl mx-auto leading-relaxed">
            Turn your store catalog and buyer journeys into an intelligent streaming shopping assistant. Sub-second streaming with Meta Llama Prompt Guard 2 protection, cart mutations, live order tracking, and coupons.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-3">
            <button
              onClick={() => setActiveTab("dashboard")}
              className="px-5 py-2.5 bg-white hover:bg-neutral-200 text-black font-semibold rounded-lg text-xs transition-all flex items-center gap-2 cursor-pointer shadow-lg"
            >
              <span>{user ? "Go to Keys Dashboard" : "Get API Key"}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setActiveTab("docs")}
              className="px-5 py-2.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-white font-medium rounded-lg text-xs transition-all flex items-center gap-2 cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5 text-neutral-400" />
              <span>Explore Documentation</span>
            </button>
          </div>
        </section>

        {/* TAB: DOCUMENTATION */}
        {activeTab === "docs" && (
          <div className="space-y-8 text-xs text-neutral-300">
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 space-y-3">
              <div className="flex items-center gap-2 text-white font-semibold text-sm">
                <BookOpen className="w-4 h-4 text-emerald-400" />
                <span>Zero-Trust Architecture & Workflow</span>
              </div>
              <p className="text-neutral-400 leading-relaxed">
                The AI Concierge connects to your storefront via a bidirectional proxy callback. The SaaS platform never stores or directly accesses your customer database; instead, tool requests are dispatched in real-time to your pinned merchant backend with verified JWT authorization headers.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-3">
                <div className="flex items-center gap-2 text-white font-semibold">
                  <Code className="w-4 h-4 text-amber-400" />
                  <span>1. Client Streaming Gateway</span>
                </div>
                <p className="text-neutral-400 text-[11px]">
                  Forward user prompts from the frontend to your local backend (<code className="text-neutral-200">/api/v1/ai-concierge/chat</code>) with text/event-stream headers.
                </p>
                <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3 font-mono text-[11px] text-neutral-300 overflow-x-auto">
                  <pre>{`fetch('/api/v1/ai-concierge/chat', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream',
    'Authorization': 'Bearer ' + customerToken
  },
  body: JSON.stringify({ messages })
});`}</pre>
                </div>
              </div>

              <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-3">
                <div className="flex items-center gap-2 text-white font-semibold">
                  <Terminal className="w-4 h-4 text-sky-400" />
                  <span>2. Action Webhook Callback</span>
                </div>
                <p className="text-neutral-400 text-[11px]">
                  When an action is selected (e.g. search products, coupons, carts), the SaaS server calls your registered <code className="text-neutral-200">backendUrl</code> at <code className="text-neutral-200">/execute-action</code>.
                </p>
                <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3 font-mono text-[11px] text-neutral-300 overflow-x-auto">
                  <pre>{`// POST /execute-action payload
{
  "intent": "search_products",
  "search_params": {
    "searchTerm": "kitchen",
    "limit": 5
  }
}`}</pre>
                </div>
              </div>
            </div>

            {/* Buyer Tool Reference Table */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-4">
              <h3 className="font-semibold text-white text-sm">Supported Buyer Tool Intents</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px] font-mono">
                  <thead>
                    <tr className="border-b border-neutral-800 text-neutral-400">
                      <th className="pb-2">Intent Name</th>
                      <th className="pb-2">Auth Level</th>
                      <th className="pb-2">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/60 text-neutral-300">
                    <tr>
                      <td className="py-2 text-amber-300">search_products</td>
                      <td className="py-2 text-neutral-400">Public</td>
                      <td className="py-2">Search catalog by keyword, category, and budget range</td>
                    </tr>
                    <tr>
                      <td className="py-2 text-amber-300">get_top_searched_products</td>
                      <td className="py-2 text-neutral-400">Public</td>
                      <td className="py-2">Return trending & most-searched products</td>
                    </tr>
                    <tr>
                      <td className="py-2 text-amber-300">validate_coupon</td>
                      <td className="py-2 text-neutral-400">Public / User</td>
                      <td className="py-2">Verify promo codes and compute discount amounts</td>
                    </tr>
                    <tr>
                      <td className="py-2 text-amber-300">get_product_reviews</td>
                      <td className="py-2 text-neutral-400">Public</td>
                      <td className="py-2">Fetch customer ratings and review comments</td>
                    </tr>
                    <tr>
                      <td className="py-2 text-emerald-400">get_my_orders / track_single_order</td>
                      <td className="py-2 text-emerald-300 font-semibold">JWT Required</td>
                      <td className="py-2">Retrieve customer order history and real-time tracking</td>
                    </tr>
                    <tr>
                      <td className="py-2 text-emerald-400">add_to_cart / remove_from_cart</td>
                      <td className="py-2 text-emerald-300 font-semibold">JWT Required</td>
                      <td className="py-2">Real-time cart mutation and quantity updates</td>
                    </tr>
                    <tr>
                      <td className="py-2 text-emerald-400">get_my_wishlist / add_to_wishlist</td>
                      <td className="py-2 text-emerald-300 font-semibold">JWT Required</td>
                      <td className="py-2">Customer wishlist items and favorites synchronization</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB: KEYS & DASHBOARD */}
        {activeTab === "dashboard" && (
          <div>
            {!user || !token ? (
              <div className="max-w-md mx-auto bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-2xl space-y-6">
                <div className="space-y-1 text-center">
                  <h2 className="text-xl font-bold text-white tracking-tight">
                    {isRegister ? "Create Developer Account" : "Sign In to Developer Portal"}
                  </h2>
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
            ) : (
              <div className="space-y-8">
                {/* Add Site Form */}
                <form
                  onSubmit={handleAddSite}
                  className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-4"
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
            )}
          </div>
        )}

        {/* TAB: PRICING SECTION */}
        {(activeTab === "pricing" || activeTab === "docs") && (
          <div className="mt-12 pt-8 border-t border-neutral-800">
            <div className="flex flex-col md:flex-row md:items-end justify-between mb-6">
              <div>
                <h2 className="text-sm font-bold text-white tracking-tight uppercase tracking-wider text-[11px] text-neutral-400">Subscription Plans</h2>
                <p className="text-base font-semibold text-white mt-1">Simple, Transparent Developer Pricing</p>
              </div>
              <span className="text-xs text-neutral-400 mt-2 md:mt-0 font-medium">Billed monthly in INR • Cancel anytime</span>
            </div>

            {checkoutSuccessMessage && (
              <div className="mb-6 p-3 rounded-lg bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400" />
                <span>{checkoutSuccessMessage}</span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              {/* Starter Plan */}
              <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-5 flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-neutral-300">Starter</span>
                    <span className="text-[10px] bg-neutral-800 text-neutral-400 px-2 py-0.5 rounded font-mono">5K Req/mo</span>
                  </div>
                  <div className="text-2xl font-bold text-white font-mono">
                    ₹499<span className="text-xs font-normal text-neutral-400">/mo</span>
                  </div>
                  <p className="text-neutral-400 text-[11px]">
                    Essential AI Concierge tool proxy for hobby stores and single-brand outlets.
                  </p>
                  <ul className="space-y-1.5 text-[11px] text-neutral-300 border-t border-neutral-800/80 pt-3">
                    <li className="flex items-center gap-1.5"><Check className="w-3 h-3 text-emerald-400" /> 1 Live Store Pinned Proxy</li>
                    <li className="flex items-center gap-1.5"><Check className="w-3 h-3 text-emerald-400" /> Top-Searched & Product Catalog Search</li>
                    <li className="flex items-center gap-1.5"><Check className="w-3 h-3 text-emerald-400" /> Prompt Guard 2 Protection</li>
                  </ul>
                </div>
                <button className="w-full py-2 bg-neutral-800 text-neutral-400 rounded-lg font-medium cursor-default">
                  Current Tier
                </button>
              </div>

              {/* Pro / Production Plan (INR 1K / Month) */}
              <div className="bg-gradient-to-b from-neutral-900 to-neutral-950 border-2 border-white/20 rounded-xl p-5 flex flex-col justify-between space-y-4 relative shadow-xl">
                <div className="absolute -top-2.5 right-4 bg-white text-black text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Most Popular
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white flex items-center gap-1">
                      <Flame className="w-3.5 h-3.5 text-amber-400" /> Pro Merchant
                    </span>
                    <span className="text-[10px] bg-white/10 text-white px-2 py-0.5 rounded font-mono">50K Req/mo</span>
                  </div>
                  <div className="text-2xl font-bold text-white font-mono">
                    ₹1,000<span className="text-xs font-normal text-neutral-400">/mo</span>
                  </div>
                  <p className="text-neutral-400 text-[11px]">
                    Full buyer automation suite with real-time cart, wishlist, orders & returns execution.
                  </p>
                  <ul className="space-y-1.5 text-[11px] text-neutral-200 border-t border-neutral-800 pt-3">
                    <li className="flex items-center gap-1.5"><Check className="w-3 h-3 text-emerald-400" /> Up to 3 Active Store Frontends</li>
                    <li className="flex items-center gap-1.5"><Check className="w-3 h-3 text-emerald-400" /> All 16 Buyer & Order Lifecycle Tools</li>
                    <li className="flex items-center gap-1.5"><Check className="w-3 h-3 text-emerald-400" /> Sub-Second LLM Streaming SLA</li>
                    <li className="flex items-center gap-1.5"><Check className="w-3 h-3 text-emerald-400" /> Zero-Trust Verified Customer JWT Auth</li>
                  </ul>
                </div>
                <button
                  onClick={() => handleRazorpayCheckout("pro")}
                  disabled={upgradingPlan}
                  className="w-full py-2 bg-white hover:bg-neutral-200 text-black font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Zap className="w-3.5 h-3.5 fill-black" />
                  <span>{upgradingPlan ? "Opening Razorpay..." : "Pay ₹1,000 / mo with Razorpay"}</span>
                </button>
              </div>

              {/* Scale Plan */}
              <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-5 flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-neutral-300">Scale / Multi-Brand</span>
                    <span className="text-[10px] bg-neutral-800 text-neutral-400 px-2 py-0.5 rounded font-mono">250K Req/mo</span>
                  </div>
                  <div className="text-2xl font-bold text-white font-mono">
                    ₹2,999<span className="text-xs font-normal text-neutral-400">/mo</span>
                  </div>
                  <p className="text-neutral-400 text-[11px]">
                    High throughput for multi-tenant retail networks and high-traffic marketplaces.
                  </p>
                  <ul className="space-y-1.5 text-[11px] text-neutral-300 border-t border-neutral-800/80 pt-3">
                    <li className="flex items-center gap-1.5"><Check className="w-3 h-3 text-emerald-400" /> Unlimited Storefronts & Brands</li>
                    <li className="flex items-center gap-1.5"><Check className="w-3 h-3 text-emerald-400" /> Dedicated High-Concurrency Worker Pool</li>
                    <li className="flex items-center gap-1.5"><Check className="w-3 h-3 text-emerald-400" /> Custom Analytics & Intent Webhooks</li>
                  </ul>
                </div>
                <button className="w-full py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg transition-colors font-medium cursor-pointer">
                  Contact for Enterprise
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
