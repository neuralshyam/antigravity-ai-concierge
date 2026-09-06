import { NextRequest, NextResponse } from "next/server";
import { mockOrders, verifyUserToken } from "@/lib/mock-db";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const authUser = verifyUserToken(authHeader);

  if (!authUser) {
    return NextResponse.json(
      { error: "Unauthorized. Valid customer JWT required." },
      { status: 401 }
    );
  }

  // Filter orders strictly for the authenticated user ID
  const userOrders = mockOrders.filter((o) => o.userId === authUser.userId);

  return NextResponse.json({
    userId: authUser.userId,
    customerName: authUser.name,
    totalOrders: userOrders.length,
    orders: userOrders,
  });
}
