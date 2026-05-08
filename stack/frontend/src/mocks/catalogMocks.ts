/**
 * Mock data for development/demo purposes
 * Remove this file and its usage before production
 */

export type MockCountry = {
  code: string;
  name: string;
};

export type MockCategory = {
  slug: string;
  label: string;
};

export type MockPackage = {
  id: string;
  value: number;
  price: number;
};

export type MockProduct = {
  id: string;
  name: string;
  currency: string;
  recipient_type: string;
  in_stock: boolean;
  categories: string[];
  packages: MockPackage[];
  range: null;
  country_code: string;
};

// Countries available in the catalog
export const MOCK_COUNTRIES: MockCountry[] = [
  { code: "BR", name: "Brasil" },
  { code: "AR", name: "Argentina" },
  { code: "CL", name: "Chile" },
  { code: "CO", name: "Colômbia" },
  { code: "MX", name: "México" },
  { code: "PE", name: "Peru" },
  { code: "UY", name: "Uruguai" },
  { code: "US", name: "Estados Unidos" },
  { code: "PT", name: "Portugal" },
  { code: "ES", name: "Espanha" },
];

// Categories available
export const MOCK_CATEGORIES: MockCategory[] = [
  { slug: "", label: "Todas as categorias" },
  { slug: "gaming", label: "Games" },
  { slug: "mobile", label: "Recarga de celular" },
  { slug: "entertainment", label: "Entretenimento" },
  { slug: "food", label: "Alimentação" },
  { slug: "shopping", label: "Compras" },
  { slug: "travel", label: "Viagem" },
  { slug: "utilities", label: "Serviços" },
];

// Products by category
export const MOCK_PRODUCTS: MockProduct[] = [
  // Gaming
  {
    id: "steam-br",
    name: "Steam Brasil",
    currency: "BRL",
    recipient_type: "none",
    in_stock: true,
    categories: ["gaming"],
    packages: [
      { id: "steam-20", value: 20, price: 20 },
      { id: "steam-50", value: 50, price: 50 },
      { id: "steam-100", value: 100, price: 100 },
      { id: "steam-200", value: 200, price: 200 },
    ],
    range: null,
    country_code: "BR",
  },
  {
    id: "playstation-br",
    name: "PlayStation Store Brasil",
    currency: "BRL",
    recipient_type: "none",
    in_stock: true,
    categories: ["gaming"],
    packages: [
      { id: "psn-60", value: 60, price: 60 },
      { id: "psn-100", value: 100, price: 100 },
      { id: "psn-200", value: 200, price: 200 },
      { id: "psn-250", value: 250, price: 250 },
    ],
    range: null,
    country_code: "BR",
  },
  {
    id: "xbox-br",
    name: "Xbox Gift Card Brasil",
    currency: "BRL",
    recipient_type: "none",
    in_stock: true,
    categories: ["gaming"],
    packages: [
      { id: "xbox-25", value: 25, price: 25 },
      { id: "xbox-50", value: 50, price: 50 },
      { id: "xbox-100", value: 100, price: 100 },
    ],
    range: null,
    country_code: "BR",
  },
  {
    id: "nintendo-br",
    name: "Nintendo eShop Brasil",
    currency: "BRL",
    recipient_type: "none",
    in_stock: true,
    categories: ["gaming"],
    packages: [
      { id: "nintendo-50", value: 50, price: 50 },
      { id: "nintendo-100", value: 100, price: 100 },
      { id: "nintendo-200", value: 200, price: 200 },
    ],
    range: null,
    country_code: "BR",
  },
  {
    id: "roblox-br",
    name: "Roblox",
    currency: "BRL",
    recipient_type: "none",
    in_stock: true,
    categories: ["gaming"],
    packages: [
      { id: "roblox-25", value: 25, price: 25 },
      { id: "roblox-50", value: 50, price: 50 },
      { id: "roblox-100", value: 100, price: 100 },
    ],
    range: null,
    country_code: "BR",
  },
  {
    id: "freefire-br",
    name: "Free Fire Diamantes",
    currency: "BRL",
    recipient_type: "none",
    in_stock: true,
    categories: ["gaming"],
    packages: [
      { id: "ff-50", value: 50, price: 50 },
      { id: "ff-100", value: 100, price: 100 },
      { id: "ff-200", value: 200, price: 200 },
    ],
    range: null,
    country_code: "BR",
  },

  // Mobile - Recargas
  {
    id: "claro-br",
    name: "Claro Recarga",
    currency: "BRL",
    recipient_type: "phone_number",
    in_stock: true,
    categories: ["mobile"],
    packages: [
      { id: "claro-15", value: 15, price: 15 },
      { id: "claro-20", value: 20, price: 20 },
      { id: "claro-30", value: 30, price: 30 },
      { id: "claro-50", value: 50, price: 50 },
      { id: "claro-100", value: 100, price: 100 },
    ],
    range: null,
    country_code: "BR",
  },
  {
    id: "vivo-br",
    name: "Vivo Recarga",
    currency: "BRL",
    recipient_type: "phone_number",
    in_stock: true,
    categories: ["mobile"],
    packages: [
      { id: "vivo-15", value: 15, price: 15 },
      { id: "vivo-20", value: 20, price: 20 },
      { id: "vivo-35", value: 35, price: 35 },
      { id: "vivo-50", value: 50, price: 50 },
      { id: "vivo-100", value: 100, price: 100 },
    ],
    range: null,
    country_code: "BR",
  },
  {
    id: "tim-br",
    name: "TIM Recarga",
    currency: "BRL",
    recipient_type: "phone_number",
    in_stock: true,
    categories: ["mobile"],
    packages: [
      { id: "tim-15", value: 15, price: 15 },
      { id: "tim-20", value: 20, price: 20 },
      { id: "tim-30", value: 30, price: 30 },
      { id: "tim-50", value: 50, price: 50 },
    ],
    range: null,
    country_code: "BR",
  },
  {
    id: "oi-br",
    name: "Oi Recarga",
    currency: "BRL",
    recipient_type: "phone_number",
    in_stock: false, // Exemplo de produto indisponível
    categories: ["mobile"],
    packages: [
      { id: "oi-20", value: 20, price: 20 },
      { id: "oi-30", value: 30, price: 30 },
    ],
    range: null,
    country_code: "BR",
  },

  // Entertainment
  {
    id: "spotify-br",
    name: "Spotify Premium",
    currency: "BRL",
    recipient_type: "none",
    in_stock: true,
    categories: ["entertainment"],
    packages: [
      { id: "spotify-1m", value: 22, price: 22 },
      { id: "spotify-3m", value: 60, price: 60 },
      { id: "spotify-6m", value: 115, price: 115 },
    ],
    range: null,
    country_code: "BR",
  },
  {
    id: "netflix-br",
    name: "Netflix Gift Card",
    currency: "BRL",
    recipient_type: "none",
    in_stock: true,
    categories: ["entertainment"],
    packages: [
      { id: "netflix-35", value: 35, price: 35 },
      { id: "netflix-70", value: 70, price: 70 },
      { id: "netflix-100", value: 100, price: 100 },
      { id: "netflix-150", value: 150, price: 150 },
    ],
    range: null,
    country_code: "BR",
  },
  {
    id: "prime-br",
    name: "Amazon Prime Video",
    currency: "BRL",
    recipient_type: "none",
    in_stock: true,
    categories: ["entertainment"],
    packages: [
      { id: "prime-15", value: 15, price: 15 },
      { id: "prime-30", value: 30, price: 30 },
    ],
    range: null,
    country_code: "BR",
  },
  {
    id: "youtube-br",
    name: "YouTube Premium",
    currency: "BRL",
    recipient_type: "none",
    in_stock: true,
    categories: ["entertainment"],
    packages: [
      { id: "yt-25", value: 25, price: 25 },
      { id: "yt-50", value: 50, price: 50 },
    ],
    range: null,
    country_code: "BR",
  },

  // Food
  {
    id: "ifood-br",
    name: "iFood",
    currency: "BRL",
    recipient_type: "none",
    in_stock: true,
    categories: ["food"],
    packages: [
      { id: "ifood-25", value: 25, price: 25 },
      { id: "ifood-50", value: 50, price: 50 },
      { id: "ifood-100", value: 100, price: 100 },
      { id: "ifood-150", value: 150, price: 150 },
    ],
    range: null,
    country_code: "BR",
  },
  {
    id: "rappi-br",
    name: "Rappi",
    currency: "BRL",
    recipient_type: "none",
    in_stock: true,
    categories: ["food"],
    packages: [
      { id: "rappi-30", value: 30, price: 30 },
      { id: "rappi-50", value: 50, price: 50 },
      { id: "rappi-100", value: 100, price: 100 },
    ],
    range: null,
    country_code: "BR",
  },
  {
    id: "uber-eats-br",
    name: "Uber Eats",
    currency: "BRL",
    recipient_type: "none",
    in_stock: true,
    categories: ["food"],
    packages: [
      { id: "ubereats-25", value: 25, price: 25 },
      { id: "ubereats-50", value: 50, price: 50 },
      { id: "ubereats-100", value: 100, price: 100 },
    ],
    range: null,
    country_code: "BR",
  },

  // Shopping
  {
    id: "amazon-br",
    name: "Amazon Brasil",
    currency: "BRL",
    recipient_type: "none",
    in_stock: true,
    categories: ["shopping"],
    packages: [
      { id: "amazon-50", value: 50, price: 50 },
      { id: "amazon-100", value: 100, price: 100 },
      { id: "amazon-200", value: 200, price: 200 },
      { id: "amazon-500", value: 500, price: 500 },
    ],
    range: null,
    country_code: "BR",
  },
  {
    id: "mercadolivre-br",
    name: "Mercado Livre",
    currency: "BRL",
    recipient_type: "none",
    in_stock: true,
    categories: ["shopping"],
    packages: [
      { id: "meli-50", value: 50, price: 50 },
      { id: "meli-100", value: 100, price: 100 },
      { id: "meli-200", value: 200, price: 200 },
    ],
    range: null,
    country_code: "BR",
  },
  {
    id: "americanas-br",
    name: "Americanas",
    currency: "BRL",
    recipient_type: "none",
    in_stock: true,
    categories: ["shopping"],
    packages: [
      { id: "americanas-50", value: 50, price: 50 },
      { id: "americanas-100", value: 100, price: 100 },
    ],
    range: null,
    country_code: "BR",
  },

  // Travel
  {
    id: "uber-br",
    name: "Uber Créditos",
    currency: "BRL",
    recipient_type: "none",
    in_stock: true,
    categories: ["travel"],
    packages: [
      { id: "uber-25", value: 25, price: 25 },
      { id: "uber-50", value: 50, price: 50 },
      { id: "uber-100", value: 100, price: 100 },
    ],
    range: null,
    country_code: "BR",
  },
  {
    id: "99-br",
    name: "99 Créditos",
    currency: "BRL",
    recipient_type: "none",
    in_stock: true,
    categories: ["travel"],
    packages: [
      { id: "99-25", value: 25, price: 25 },
      { id: "99-50", value: 50, price: 50 },
      { id: "99-100", value: 100, price: 100 },
    ],
    range: null,
    country_code: "BR",
  },
  {
    id: "airbnb",
    name: "Airbnb Gift Card",
    currency: "BRL",
    recipient_type: "none",
    in_stock: true,
    categories: ["travel"],
    packages: [
      { id: "airbnb-100", value: 100, price: 100 },
      { id: "airbnb-200", value: 200, price: 200 },
      { id: "airbnb-500", value: 500, price: 500 },
    ],
    range: null,
    country_code: "BR",
  },

  // Utilities
  {
    id: "google-play-br",
    name: "Google Play",
    currency: "BRL",
    recipient_type: "none",
    in_stock: true,
    categories: ["utilities"],
    packages: [
      { id: "gplay-15", value: 15, price: 15 },
      { id: "gplay-30", value: 30, price: 30 },
      { id: "gplay-50", value: 50, price: 50 },
      { id: "gplay-100", value: 100, price: 100 },
    ],
    range: null,
    country_code: "BR",
  },
  {
    id: "apple-br",
    name: "Apple Gift Card Brasil",
    currency: "BRL",
    recipient_type: "none",
    in_stock: true,
    categories: ["utilities"],
    packages: [
      { id: "apple-50", value: 50, price: 50 },
      { id: "apple-100", value: 100, price: 100 },
      { id: "apple-200", value: 200, price: 200 },
      { id: "apple-500", value: 500, price: 500 },
    ],
    range: null,
    country_code: "BR",
  },
];

// Flag to enable/disable mocks (set to false for production)
export const USE_MOCKS = false;

// Helper to filter products by category and country
export function getMockProducts(categorySlug: string, countryCode: string): MockProduct[] {
  return MOCK_PRODUCTS.filter((p) => {
    const matchesCountry = p.country_code === countryCode;
    const matchesCategory = !categorySlug || p.categories.includes(categorySlug);
    return matchesCountry && matchesCategory;
  });
}
