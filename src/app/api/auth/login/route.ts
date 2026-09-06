import { NextRequest, NextResponse } from "next/server";
import { mockUsers, signUserToken } from "@/lib/mock-db";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email } = body;

    const user = Object.values(mockUsers).find((u) => u.email.toLowerCase() === (email || "").toLowerCase());
    if (!user) {
      return NextResponse.json(
        { error: "User not found. Try 'shyam@example.com' or 'govinda@example.com'" },
        { status: 404 }
      );
    }

    const token = signUserToken(user);
    return NextResponse.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        address: user.address,
      },
    });
  } catch {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
  }
}
