import { NextRequest, NextResponse } from "next/server";
import { mockUsers, verifyUserToken } from "@/lib/mock-db";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const authUser = verifyUserToken(authHeader);

  if (!authUser) {
    return NextResponse.json(
      { error: "Unauthorized. Valid customer JWT required." },
      { status: 401 }
    );
  }

  const user = mockUsers[authUser.userId];
  if (!user) {
    return NextResponse.json({ error: "User record not found" }, { status: 404 });
  }

  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      address: user.address,
    },
  });
}
