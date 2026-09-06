import { NextRequest, NextResponse } from "next/server";
import { mockProducts } from "@/lib/mock-db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawQ = searchParams.get("q")?.toLowerCase() || "";
  const rawCategory = searchParams.get("category")?.toLowerCase() || "";
  const maxPrice = searchParams.get("maxPrice") ? parseFloat(searchParams.get("maxPrice")!) : null;
  const inStockOnly = searchParams.get("inStockOnly") === "true";

  // Tokenize search query words (e.g. "chamomile tea" -> ["chamomile", "tea"])
  const queryTokens = rawQ
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9]/g, ""))
    .filter((w) => w.length > 1);

  let scoredProducts = mockProducts.map((p) => {
    let score = 0;
    const nameLower = p.name.toLowerCase();
    const descLower = p.description.toLowerCase();
    const catLower = p.category.toLowerCase();
    const tagsLower = p.tags.map((t) => t.toLowerCase());

    // Exact full query match bonus
    if (rawQ && (nameLower.includes(rawQ) || descLower.includes(rawQ))) {
      score += 10;
    }

    // Token matches
    for (const token of queryTokens) {
      if (nameLower.includes(token)) score += 5;
      if (tagsLower.some((t) => t.includes(token))) score += 4;
      if (descLower.includes(token)) score += 3;
      if (catLower.includes(token)) score += 2;
    }

    // Category match
    if (rawCategory && (catLower.includes(rawCategory) || rawCategory.includes(catLower))) {
      score += 3;
    }

    return { product: p, score };
  });

  // If search terms were provided, filter by score > 0. If no search term, return all.
  let matching = queryTokens.length > 0
    ? scoredProducts.filter((sp) => sp.score > 0).sort((a, b) => b.score - a.score).map((sp) => sp.product)
    : mockProducts;

  // If token match was too strict (e.g. user asked for 'chamomile' but catalog has 'ayurvedic herbal tea'),
  // fallback gracefully to category matching or broad catalog so LLM can suggest relevant alternatives!
  if (matching.length === 0 && rawCategory) {
    matching = mockProducts.filter((p) => p.category.toLowerCase().includes(rawCategory));
  }

  // If still empty and user was searching for tea/drink/oil/mala, give close alternative products
  if (matching.length === 0 && queryTokens.length > 0) {
    matching = mockProducts.slice(0, 3); // Return top curated store items so the bot can suggest alternatives
  }

  if (maxPrice !== null && !isNaN(maxPrice)) {
    matching = matching.filter((p) => p.price <= maxPrice);
  }

  if (inStockOnly) {
    matching = matching.filter((p) => p.stock > 0);
  }

  return NextResponse.json({
    count: matching.length,
    products: matching,
  });
}
