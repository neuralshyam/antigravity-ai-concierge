import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "super-secure-mock-jwt-secret-key-108";

export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  currency: string;
  stock: number;
  description: string;
  tags: string[];
}

export interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
}

export interface Order {
  id: string;
  userId: string;
  customerName: string;
  createdAt: string;
  status: "processing" | "shipped" | "delivered" | "cancelled";
  trackingNumber: string;
  estimatedDelivery: string;
  carrier: string;
  shippingAddress: string;
  totalAmount: number;
  currency: string;
  items: OrderItem[];
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
}

// Mock Database
export const mockUsers: Record<string, User> = {
  "user_1": {
    id: "user_1",
    name: "Shyam Charan Das",
    email: "shyam@example.com",
    phone: "+91-9876543210",
    address: "ISKCON Mayapur, Sri Mayapur Dham, Nadia, West Bengal 741313",
  },
  "user_2": {
    id: "user_2",
    name: "Govinda Sharma",
    email: "govinda@example.com",
    phone: "+91-9123456780",
    address: "Vrindavan, Mathura, UP 281121",
  }
};

export const mockProducts: Product[] = [
  {
    id: "prod_1",
    name: "Pure Brass Kanti Mala (Double Strand)",
    category: "Devotional",
    price: 15.00,
    currency: "USD",
    stock: 42,
    description: "Handcrafted pure Tulasi neck beads with engraved silver-coated brass clasp.",
    tags: ["tulasi", "mala", "devotional", "spiritual"]
  },
  {
    id: "prod_2",
    name: "Organic Ayurvedic Herbal Tea - Tulasi & Brahmi",
    category: "Wellness",
    price: 12.50,
    currency: "USD",
    stock: 120,
    description: "Soothing natural tea blend with organic Tulasi, Brahmi, and Ashwagandha. 50 tea bags.",
    tags: ["tea", "herbal", "wellness", "organic", "ayurveda"]
  },
  {
    id: "prod_3",
    name: "Handmade Neem Wood Japa Japa Bag",
    category: "Accessories",
    price: 8.00,
    currency: "USD",
    stock: 75,
    description: "Durable organic cotton japa bead bag with reinforced stitching and soft strap.",
    tags: ["japa", "bead bag", "cotton", "accessories"]
  },
  {
    id: "prod_4",
    name: "Cold-Pressed Pure Sesame Oil (1 Litre)",
    category: "Groceries",
    price: 18.00,
    currency: "USD",
    stock: 18,
    description: "Wood cold-pressed unrefined black sesame oil, rich in antioxidants and pure aroma.",
    tags: ["cooking", "oil", "organic", "ayurveda"]
  },
  {
    id: "prod_5",
    name: "Natural Clay Incense Holder",
    category: "Home",
    price: 9.99,
    currency: "USD",
    stock: 0, // Out of stock to test stock checks
    description: "Hand-moulded terracotta incense burner tray with lotus motif.",
    tags: ["incense", "holder", "home", "handcrafted"]
  }
];

export const mockOrders: Order[] = [
  {
    id: "ord_1001",
    userId: "user_1",
    customerName: "Shyam Charan Das",
    createdAt: "2026-09-02T10:30:00Z",
    status: "shipped",
    trackingNumber: "TRK-984210",
    carrier: "BlueDart Express",
    estimatedDelivery: "2026-09-07",
    shippingAddress: "ISKCON Mayapur, Sri Mayapur Dham, Nadia, West Bengal 741313",
    totalAmount: 27.50,
    currency: "USD",
    items: [
      {
        productId: "prod_1",
        productName: "Pure Brass Kanti Mala (Double Strand)",
        quantity: 1,
        unitPrice: 15.00
      },
      {
        productId: "prod_2",
        productName: "Organic Ayurvedic Herbal Tea - Tulasi & Brahmi",
        quantity: 1,
        unitPrice: 12.50
      }
    ]
  },
  {
    id: "ord_1002",
    userId: "user_1",
    customerName: "Shyam Charan Das",
    createdAt: "2026-08-15T14:15:00Z",
    status: "delivered",
    trackingNumber: "TRK-772183",
    carrier: "India Post Speed Post",
    estimatedDelivery: "2026-08-18",
    shippingAddress: "ISKCON Mayapur, Sri Mayapur Dham, Nadia, West Bengal 741313",
    totalAmount: 18.00,
    currency: "USD",
    items: [
      {
        productId: "prod_4",
        productName: "Cold-Pressed Pure Sesame Oil (1 Litre)",
        quantity: 1,
        unitPrice: 18.00
      }
    ]
  },
  {
    id: "ord_2001",
    userId: "user_2",
    customerName: "Govinda Sharma",
    createdAt: "2026-09-05T09:00:00Z",
    status: "processing",
    trackingNumber: "TRK-Pending",
    carrier: "DHL",
    estimatedDelivery: "2026-09-10",
    shippingAddress: "Vrindavan, Mathura, UP 281121",
    totalAmount: 8.00,
    currency: "USD",
    items: [
      {
        productId: "prod_3",
        productName: "Handmade Neem Wood Japa Japa Bag",
        quantity: 1,
        unitPrice: 8.00
      }
    ]
  }
];

// JWT Helpers
export function signUserToken(user: User): string {
  return jwt.sign(
    {
      sub: user.id,
      name: user.name,
      email: user.email,
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

export function verifyUserToken(authHeader: string | null): { userId: string; name: string; email: string } | null {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.substring(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string; name: string; email: string };
    return {
      userId: payload.sub,
      name: payload.name,
      email: payload.email,
    };
  } catch {
    return null;
  }
}
