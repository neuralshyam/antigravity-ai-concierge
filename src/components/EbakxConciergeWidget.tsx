"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  MessageSquare,
  X,
  Send,
  Sparkles,
  ShoppingBag,
  Package,
  RotateCcw,
  User,
  ChevronRight,
  ExternalLink,
} from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolExecutions?: any[];
}

export interface EbakxConciergeWidgetProps {
  apiEndpoint?: string; // defaults to http://localhost:3000/api/bot/chat
  storeName?: string;
  primaryColor?: string; // defaults to Ebakx green #29845a
}

export default function EbakxConciergeWidget({
  apiEndpoint = "http://localhost:3000/api/bot/chat",
  storeName = "Ebakx Concierge",
  primaryColor = "#29845a",
}: EbakxConciergeWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "m_init",
      role: "assistant",
      content:
        "Hey! 👋 Looking for something specific or want to check your cart & active orders?",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  // Read active JWT safely from localStorage or document cookie
  const getAuthToken = () => {
    if (typeof window === "undefined") return null;
    const local = localStorage.getItem("accessToken") || localStorage.getItem("token");
    if (local) return local;

    const match = document.cookie.match(/(?:^|; )accessToken=([^;]*)/);
    return match ? decodeURIComponent(match[1]) : null;
  };

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text || loading) return;

    const userMessage: Message = {
      id: `u_${Date.now()}`,
      role: "user",
      content: text,
    };

    const updated = [...messages, userMessage];
    setMessages(updated);
    setInput("");
    setLoading(true);

    try {
      const token = getAuthToken();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch(apiEndpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          messages: updated.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setMessages((prev) => [
          ...prev,
          {
            id: `a_${Date.now()}`,
            role: "assistant",
            content: data.reply || "Done!",
            toolExecutions: data.toolExecutions,
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: `err_${Date.now()}`,
            role: "assistant",
            content: "Sorry, I had a momentary hiccup. Please try asking again!",
          },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `net_err_${Date.now()}`,
          role: "assistant",
          content: "Unable to reach the concierge service right now.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const quickChips = [
    { label: "👟 Running Shoes", query: "Show me running shoes in stock" },
    { label: "📱 Pro Max Phone", query: "Details on Pro Max Smart-Phone" },
    { label: "🛒 My Cart", query: "What is in my cart right now?" },
  ];

  return (
    <div className="fixed bottom-6 right-6 z-50 font-sans antialiased text-gray-900">
      {/* Floating Launcher Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          style={{ backgroundColor: primaryColor }}
          className="flex items-center gap-2 px-4 py-3 text-white rounded-full shadow-xl hover:opacity-95 hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer"
        >
          <div className="relative">
            <MessageSquare className="w-5 h-5" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-300 rounded-full animate-pulse ring-2 ring-white" />
          </div>
          <span className="text-sm font-semibold tracking-tight">Chat with Concierge</span>
        </button>
      )}

      {/* Modern Pop-up Dialog Window */}
      {isOpen && (
        <div className="w-[380px] sm:w-[410px] h-[580px] max-h-[85vh] bg-white rounded-2xl shadow-2xl border border-gray-100 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          {/* Header */}
          <div
            style={{ backgroundColor: primaryColor }}
            className="px-5 py-4 text-white flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center text-white">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold leading-tight">{storeName}</h3>
                <p className="text-[11px] text-emerald-100 font-medium flex items-center gap-1.5 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-300" />
                  Live Store Assistant
                </p>
              </div>
            </div>

            <button
              onClick={() => setIsOpen(false)}
              className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors text-white/90"
              title="Close Chat"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Action Chips Bar */}
          <div className="bg-gray-50 border-b border-gray-100 px-3 py-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {quickChips.map((chip, i) => (
              <button
                key={i}
                onClick={() => handleSend(chip.query)}
                className="text-[11px] font-medium bg-white hover:bg-gray-100 text-gray-700 px-2.5 py-1 rounded-full border border-gray-200/80 shadow-2xs whitespace-nowrap transition-colors flex items-center gap-1 cursor-pointer"
              >
                {chip.label}
              </button>
            ))}
          </div>

          {/* Message Thread */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-gray-50/50">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                    m.role === "user"
                      ? "text-white font-medium rounded-br-xs shadow-2xs"
                      : "bg-white border border-gray-200/80 text-gray-800 rounded-bl-xs shadow-2xs space-y-2"
                  }`}
                  style={m.role === "user" ? { backgroundColor: primaryColor } : undefined}
                >
                  <p className="whitespace-pre-wrap">{m.content}</p>
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex items-center gap-2 text-gray-400 text-xs italic px-2 py-1">
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
                Searching live catalog & reasoning...
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Footer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="p-3 bg-white border-t border-gray-100 flex items-center gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about products, sizes, cart..."
              className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-emerald-600 focus:bg-white transition-all"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              style={{ backgroundColor: primaryColor }}
              className="text-white p-2 rounded-xl hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer flex items-center justify-center"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
