type Product = {
  id: string;
  name: string;
  description: string;
  price: string | number;
  discount_percent: string | number;
  stock: number;
  image_url: string;
};

type Promotion = {
  id: string;
  title: string;
  description: string;
  offer_price: string | number;
};

const productIdPattern = /^[A-Za-z0-9_-]{1,120}$/;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

function validationPage(
  item: {
    id: string;
    name: string;
    price: number;
    description: string;
    maxQuantity: number;
    image?: string;
  },
  itemUrl: string,
): Response {
  const html = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>Product validation</title></head>
  <body>
    <button class="snipcart-add-item"
      data-item-id="${escapeHtml(item.id)}"
      data-item-price="${item.price.toFixed(2)}"
      data-item-name="${escapeHtml(item.name)}"
      data-item-description="${escapeHtml(item.description)}"
      data-item-url="${escapeHtml(itemUrl)}"
      data-item-max-quantity="${item.maxQuantity}"
      ${item.image ? `data-item-image="${escapeHtml(item.image)}"` : ""}>
      ${escapeHtml(item.name)}
    </button>
  </body>
</html>`;
  return new Response(html, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Security-Policy":
        "default-src 'none'; script-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      "Content-Type": "text/html; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

Deno.serve(async (request) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  };
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const apiKey =
    Deno.env.get("SUPABASE_ANON_KEY") ??
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const snipcartSecret = Deno.env.get("SNIPCART_SECRET_API_KEY");
  const requestUrl = new URL(request.url);
  if (requestUrl.searchParams.get("health") === "1") {
    return new Response(
      JSON.stringify({
        ready: Boolean(supabaseUrl && apiKey && snipcartSecret),
      }),
      {
        headers: {
          ...corsHeaders,
          "Cache-Control": "no-store",
          "Content-Type": "application/json; charset=utf-8",
        },
      },
    );
  }
  if (!supabaseUrl || !apiKey || !snipcartSecret) {
    console.error("Product validation secrets are not configured.");
    return new Response("Product validation is unavailable.", { status: 500 });
  }

  async function selectRows<T>(
    table: string,
    params: Record<string, string>,
  ): Promise<T[]> {
    const url = new URL(`/rest/v1/${table}`, `${supabaseUrl.replace(/\/$/, "")}/`);
    Object.entries(params).forEach(([key, value]) =>
      url.searchParams.set(key, value),
    );
    const response = await fetch(url, {
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${apiKey}`,
      },
    });
    if (!response.ok) {
      console.error(`Supabase read failed for ${table}: ${response.status}`);
      throw new Error("Unable to read product data.");
    }
    return (await response.json()) as T[];
  }

  try {
    const requestToken = request.headers.get("X-Snipcart-RequestToken");
    if (
      request.headers.get("X-Snipcart-Purpose") !== "Crawling" ||
      !requestToken
    ) {
      return new Response("Forbidden", { status: 403 });
    }
    const tokenResponse = await fetch(
      `https://app.snipcart.com/api/requestvalidation/${encodeURIComponent(requestToken)}`,
      {
        headers: {
          Accept: "application/json",
          Authorization: `Basic ${btoa(`${snipcartSecret}:`)}`,
        },
      },
    );
    if (!tokenResponse.ok) {
      return new Response("Forbidden", { status: 403 });
    }
    const tokenData = (await tokenResponse.json()) as { resource?: string };
    if (!tokenData.resource) {
      return new Response("Forbidden", { status: 403 });
    }
    let resourceUrl: URL;
    try {
      resourceUrl = new URL(tokenData.resource);
    } catch {
      return new Response("Forbidden", { status: 403 });
    }
    if (resourceUrl.href !== requestUrl.href) {
      return new Response("Forbidden", { status: 403 });
    }

    const itemId = requestUrl.searchParams.get("item_id") || "";
    let item: {
      id: string;
      name: string;
      price: number;
      description: string;
      maxQuantity: number;
      image?: string;
    };

    if (itemId.startsWith("promotion-")) {
      const promotionId = itemId.slice("promotion-".length);
      if (!uuidPattern.test(promotionId)) {
        return new Response("Product not found.", { status: 404 });
      }
      const [promotion] = await selectRows<Promotion>("promotions", {
        select: "id,title,description,offer_price",
        id: `eq.${promotionId}`,
        limit: "1",
      });
      if (!promotion || promotion.offer_price == null) {
        return new Response("Product not found.", { status: 404 });
      }
      const links = await selectRows<{ product_id: string }>(
        "promotion_products",
        {
          select: "product_id",
          promotion_id: `eq.${promotionId}`,
        },
      );
      if (
        !links.length ||
        links.length > 100 ||
        links.some((link) => !productIdPattern.test(link.product_id))
      ) {
        return new Response("Product not found.", { status: 404 });
      }
      const productIds = links.map((link) => link.product_id);
      const products = await selectRows<Product>("products", {
        select: "id,name,stock",
        id: `in.(${productIds.join(",")})`,
      });
      if (
        products.length !== productIds.length ||
        products.some((product) => Number(product.stock) < 1)
      ) {
        return new Response("Product not found.", { status: 404 });
      }
      const price = Number(promotion.offer_price);
      if (!Number.isFinite(price) || price < 0) {
        return new Response("Product not found.", { status: 404 });
      }
      item = {
        id: itemId,
        name: promotion.title,
        price,
        maxQuantity: Math.min(
          ...products.map((product) => Number(product.stock)),
        ),
        description: [
          promotion.description,
          `Includes: ${products.map((product) => product.name).join(", ")}`,
        ]
          .filter(Boolean)
          .join(" "),
      };
    } else {
      if (!productIdPattern.test(itemId)) {
        return new Response("Product not found.", { status: 404 });
      }
      const [product] = await selectRows<Product>("products", {
        select: "id,name,description,price,discount_percent,stock,image_url",
        id: `eq.${itemId}`,
        limit: "1",
      });
      if (!product || Number(product.stock) < 1) {
        return new Response("Product not found.", { status: 404 });
      }
      const price = Number(product.price);
      const discount = Number(product.discount_percent);
      if (
        !Number.isFinite(price) ||
        !Number.isFinite(discount) ||
        price < 0 ||
        discount < 0 ||
        discount > 100
      ) {
        return new Response("Product not found.", { status: 404 });
      }
      item = {
        id: product.id,
        name: product.name,
        price: Math.round((price * (100 - discount)) / 100 * 100) / 100,
        maxQuantity: Number(product.stock),
        description: product.description || "",
        image: product.image_url,
      };
    }

    return validationPage(item, requestUrl.href);
  } catch (error) {
    console.error("Product validation failed.", error);
    return new Response("Product validation is unavailable.", { status: 500 });
  }
});
