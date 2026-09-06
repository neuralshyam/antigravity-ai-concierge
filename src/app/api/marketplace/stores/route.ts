import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "antigravity-saas-jwt-secret-108";

function getUserIdFromAuth(req: NextRequest): string | null {
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  try {
    const token = auth.replace("Bearer ", "").trim();
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    return decoded?.id || null;
  } catch {
    return null;
  }
}

// GET: List stores strictly for logged-in user
export async function GET(req: NextRequest) {
  try {
    const userId = getUserIdFromAuth(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized. Please log in." }, { status: 401 });
    }

    const stores = await prisma.store.findMany({
      where: { merchantId: userId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, stores });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// POST: Add a new site for logged-in user
export async function POST(req: NextRequest) {
  try {
    const userId = getUserIdFromAuth(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized. Please log in." }, { status: 401 });
    }

    const body = await req.json();
    const { storeName, frontendUrl, backendUrl } = body;

    if (!storeName || !frontendUrl || !backendUrl) {
      return NextResponse.json(
        { error: "storeName, frontendUrl, and backendUrl are required" },
        { status: 400 }
      );
    }

    const randomSuffix = crypto.randomBytes(16).toString("hex");
    const cleanSlug = storeName.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 6) || "app";
    const apiKey = `sk_live_${cleanSlug}_${randomSuffix}`;

    const newStore = await prisma.store.create({
      data: {
        merchantId: userId,
        storeName,
        frontendUrl,
        backendUrl,
        apiKey,
        tier: "STANDARD",
        monthlyQuota: 100000,
        status: "ACTIVE",
      },
    });

    return NextResponse.json({
      success: true,
      store: newStore,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
