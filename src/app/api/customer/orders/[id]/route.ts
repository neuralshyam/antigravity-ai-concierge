import { NextRequest, NextResponse } from "next/server";
import { mockOrders, verifyUserToken } from "@/lib/mock-db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authHeader = req.headers.get("authorization");
  const authUser = verifyUserToken(authHeader);

  if (!authUser) {
    return NextResponse.json(
      { error: "Unauthorized. Valid customer JWT required." },
      { status: 401 }
    );
  }

  const { id } = await params;
  const order = mockOrders.find((o) => o.id.toLowerCase() === id.toLowerCase() && o.userId === authUser.userId);

  if (!order) {
    return NextResponse.json(
      { error: `Order #${id} not found or does not belong to the authenticated account.` },
      { status: 404 }
    );
  }

  return NextResponse.json({ order });
}
