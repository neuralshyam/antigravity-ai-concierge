import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "antigravity-saas-jwt-secret-108";

// POST: Register or Login
export async function POST(req: NextRequest) {
  try {
    const { action, email, password, name } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    const cleanEmail = email.toLowerCase().trim();

    if (action === "register") {
      const existing = await prisma.merchant.findUnique({
        where: { email: cleanEmail },
      });

      if (existing) {
        return NextResponse.json({ error: "User already exists. Please log in." }, { status: 400 });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const merchant = await prisma.merchant.create({
        data: {
          email: cleanEmail,
          passwordHash,
          name: name?.trim() || cleanEmail.split("@")[0],
        },
      });

      const token = jwt.sign(
        { id: merchant.id, email: merchant.email, name: merchant.name },
        JWT_SECRET,
        { expiresIn: "7d" }
      );

      return NextResponse.json({
        success: true,
        token,
        user: { id: merchant.id, email: merchant.email, name: merchant.name },
      });
    } else {
      // Login
      const merchant = await prisma.merchant.findUnique({
        where: { email: cleanEmail },
      });

      if (!merchant) {
        return NextResponse.json({ error: "Account not found. Please register." }, { status: 404 });
      }

      const isMatch = await bcrypt.compare(password, merchant.passwordHash);
      if (!isMatch) {
        return NextResponse.json({ error: "Invalid password" }, { status: 401 });
      }

      const token = jwt.sign(
        { id: merchant.id, email: merchant.email, name: merchant.name },
        JWT_SECRET,
        { expiresIn: "7d" }
      );

      return NextResponse.json({
        success: true,
        token,
        user: { id: merchant.id, email: merchant.email, name: merchant.name },
      });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
