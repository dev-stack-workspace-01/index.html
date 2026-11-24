const ADMIN_EMAIL = window.BATHLY_AUTH_CONFIG.adminEmail;
const supabaseClient = window.BATHLY_SUPABASE_CLIENT;
let products = [];
let productsChannel = null;

const productList = document.querySelector(".product-list");
const searchInput = document.querySelector("#product-search");
const searchStatus = document.querySelector("#search-status");
const productsStatus = document.querySelector("#products-status");
const checkoutValidationStatus = document.querySelector(
  "#checkoutValidationStatus",
);
const promotionList = document.querySelector("#promotionList");
const promotionsStatus = document.querySelector("#promotionsStatus");
const reviewMessages = document.querySelector("#reviewMessages");
const reviewsStatus = document.querySelector("#reviewsStatus");
const reviewForm = document.querySelector("#reviewForm");
const reviewFormStatus = document.querySelector("#reviewFormStatus");
const reviewSubmit = document.querySelector("#reviewSubmit");

const adminDashboardLink = document.querySelector("#adminDashboardLink");
const loginButton = document.querySelector("#loginButton");
const loginDialog = document.querySelector("#loginDialog");
const loginForm = document.querySelector("#loginForm");
const loginEmail = document.querySelector("#loginEmail");
const loginCode = document.querySelector("#loginCode");
const loginCodeField = document.querySelector("#loginCodeField");
const loginMessage = document.querySelector("#loginMessage");
const loginSubmit = document.querySelector("#loginSubmit");
const resendCodeButton = document.querySelector("#resendCodeBtn");
const resendTimer = document.querySelector("#resendTimer");
let checkoutValidationReady = false;
let currentSession = null;
let awaitingLoginCode = false;
let resendCooldown = null;

function updateAuthUi(session) {
  currentSession = session;
  const isAdmin = session?.user.email?.toLocaleLowerCase() === ADMIN_EMAIL;
  adminDashboardLink.hidden = !isAdmin;
  loginButton.querySelector("span").textContent = session ? "خروج" : "دخول";
  loginButton.setAttribute(
    "aria-label",
    session ? "تسجيل الخروج" : "تسجيل الدخول",
  );
}

function resetLoginForm() {
  clearInterval(resendCooldown);
  resendCooldown = null;
  loginForm.reset();
  awaitingLoginCode = false;
  loginEmail.readOnly = false;
  loginCode.disabled = true;
  loginCode.required = false;
  loginCodeField.hidden = true;
  loginSubmit.textContent = "إرسال رمز التحقق";
  resendCodeButton.disabled = true;
  resendTimer.textContent = "";
  document.querySelector("#loginDescription").textContent =
    "أدخل بريدك الإلكتروني وسنرسل لك رمز تحقق.";
}

function startResendCooldown(seconds = 60) {
  clearInterval(resendCooldown);
  let remaining = seconds;
  resendCodeButton.disabled = true;
  resendTimer.textContent = `إعادة الإرسال خلال ${remaining}ث`;
  resendCooldown = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(resendCooldown);
      resendCooldown = null;
      resendCodeButton.disabled = false;
      resendTimer.textContent = "";
      return;
    }
    resendTimer.textContent = `إعادة الإرسال خلال ${remaining}ث`;
  }, 1000);
}

async function sendLoginCode(email) {
  if (!supabaseClient) {
    loginMessage.textContent = "إعداد تسجيل الدخول غير مكتمل.";
    return;
  }
  loginSubmit.disabled = true;
  resendCodeButton.disabled = true;
  loginMessage.textContent = "جاري إرسال رمز التحقق...";
  try {
    const { error } = await supabaseClient.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    if (error) {
      loginMessage.textContent = `تعذر إرسال رمز التحقق: ${error.message}`;
      if (awaitingLoginCode) resendCodeButton.disabled = false;
      return;
    }
    awaitingLoginCode = true;
    loginEmail.readOnly = true;
    loginCode.disabled = false;
    loginCode.required = true;
    loginCodeField.hidden = false;
    loginCode.value = "";
    loginSubmit.textContent = "تأكيد الدخول";
    document.querySelector("#loginDescription").textContent =
      "أدخل رمز التحقق الذي وصلك إلى بريدك.";
    loginMessage.textContent = "تم إرسال رمز التحقق إلى بريدك الإلكتروني.";
    loginCode.focus();
    startResendCooldown();
  } catch (error) {
    loginMessage.textContent = `تعذر إرسال رمز التحقق: ${error.message}`;
    if (awaitingLoginCode) resendCodeButton.disabled = false;
  } finally {
    loginSubmit.disabled = false;
  }
}

async function initializeAuth() {
  if (!supabaseClient) return;
  try {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) {
      loginMessage.textContent = `تعذر التحقق من حالة الدخول: ${error.message}`;
      return;
    }
    updateAuthUi(data.session);
    supabaseClient.auth.onAuthStateChange((_event, session) =>
      updateAuthUi(session),
    );
  } catch (error) {
    loginMessage.textContent = `تعذر التحقق من حالة الدخول: ${error.message}`;
  }
}

loginButton.addEventListener("click", async () => {
  if (currentSession && supabaseClient) {
    try {
      const { error } = await supabaseClient.auth.signOut();
      if (error) {
        loginMessage.textContent = `تعذر تسجيل الخروج: ${error.message}`;
        loginDialog.showModal();
        return;
      }
      updateAuthUi(null);
    } catch (error) {
      loginMessage.textContent = `تعذر تسجيل الخروج: ${error.message}`;
      loginDialog.showModal();
    }
    return;
  }
  loginMessage.textContent = supabaseClient
    ? ""
    : "لم يُرسل الرمز: أضف Project URL وanon/publishable key في auth-config.js أولًا.";
  loginDialog.showModal();
});

document
  .querySelector("#loginClose")
  .addEventListener("click", () => loginDialog.close());

resendCodeButton.addEventListener("click", () => {
  if (awaitingLoginCode && !resendCodeButton.disabled) {
    sendLoginCode(loginEmail.value.trim().toLocaleLowerCase());
  }
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginMessage.textContent = "";
  try {
    if (!supabaseClient) {
      loginMessage.textContent =
        "لم يُرسل الرمز: أضف Project URL وanon/publishable key في auth-config.js أولًا.";
      return;
    }

    const email = loginEmail.value.trim().toLocaleLowerCase();
    if (!awaitingLoginCode) {
      await sendLoginCode(email);
      return;
    }

    loginSubmit.disabled = true;
    const { data, error } = await supabaseClient.auth.verifyOtp({
      email,
      token: loginCode.value.trim(),
      type: "email",
    });
    if (error) {
      loginMessage.textContent = `رمز التحقق غير صالح أو انتهت صلاحيته: ${error.message}`;
      return;
    }
    updateAuthUi(data.session);
    clearInterval(resendCooldown);
    loginDialog.close();
    resetLoginForm();
  } catch (error) {
    loginMessage.textContent = `تعذر إكمال تسجيل الدخول: ${error.message}`;
  } finally {
    loginSubmit.disabled = false;
  }
});

function renderProducts() {
  productList.replaceChildren();
  products.forEach((product) => {
    const card = document.createElement("article");
    card.className = "product-item";
    card.dataset.category = String(product.category || "");
    const name = String(product.name || "");
    const description = String(product.description || "منتج Bathly");
    const price = Number(product.price);
    const discount = Math.min(
      100,
      Math.max(0, Number(product.discount_percent) || 0),
    );
    const salePrice = Number((price * (1 - discount / 100)).toFixed(2));
    let image;
    if (product.image_url) {
      image = document.createElement("img");
      image.className = "product-image";
      image.src = String(product.image_url);
      image.alt = name;
      image.loading = "lazy";
      image.onerror = () => {
        const placeholder = document.createElement("div");
        placeholder.className = "product-image-placeholder";
        placeholder.setAttribute("role", "img");
        placeholder.setAttribute("aria-label", name);
        placeholder.textContent = name;
        image.replaceWith(placeholder);
      };
    } else {
      image = document.createElement("div");
      image.className = "product-image-placeholder";
      image.setAttribute("role", "img");
      image.setAttribute("aria-label", name);
      image.textContent = name;
    }

    const title = document.createElement("h3");
    title.textContent = name;
    const details = document.createElement("p");
    details.textContent = description;
    const priceLabel = document.createElement("span");
    priceLabel.className = "price";
    if (discount > 0) {
      priceLabel.classList.add("discounted-price");
      const originalPrice = document.createElement("del");
      originalPrice.textContent = formatStorePrice(price);
      const currentPrice = document.createElement("strong");
      currentPrice.textContent = formatStorePrice(salePrice);
      const discountBadge = document.createElement("span");
      discountBadge.className = "discount-badge";
      discountBadge.textContent = `خصم ${discount}%`;
      priceLabel.append(originalPrice, currentPrice, discountBadge);
    } else {
      priceLabel.textContent = formatStorePrice(price);
    }

    const addButton = document.createElement("button");
    addButton.className = "add-to-cart snipcart-add-item";
    addButton.type = "button";
    addButton.dataset.itemId = String(product.id);
    addButton.dataset.itemName = name;
    addButton.dataset.itemPrice = String(salePrice);
    addButton.dataset.itemUrl = getValidationUrl(product.id);
    addButton.dataset.itemDescription = description;
    addButton.dataset.availableStock = String(product.stock);
    addButton.dataset.itemMaxQuantity = String(product.stock);
    if (product.image_url)
      addButton.dataset.itemImage = String(product.image_url);
    addButton.disabled = Number(product.stock) < 1 || !checkoutValidationReady;
    addButton.textContent = Number(product.stock) < 1
      ? "نفد المخزون"
      : "أضف إلى السلة";

    card.append(image, title, details, priceLabel, addButton);
    productList.append(card);
  });
  filterProducts();
  updateCheckoutButtons();
}

function formatStorePrice(price) {
  return `${Number(price).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ر.س`;
}

function getValidationUrl(itemId) {
  const projectUrl = window.BATHLY_AUTH_CONFIG.supabaseUrl.replace(/\/$/, "");
  return `${projectUrl}/functions/v1/snipcart-product?item_id=${encodeURIComponent(itemId)}`;
}

function updateCheckoutButtons() {
  document.querySelectorAll(".snipcart-add-item").forEach((button) => {
    const outOfStock =
      button.dataset.availableStock != null &&
      Number(button.dataset.availableStock) < 1;
    button.disabled = !checkoutValidationReady || outOfStock;
    if (outOfStock) button.textContent = "نفد المخزون";
  });
  document.querySelector("#cart-button").disabled = !checkoutValidationReady;
}

async function initializeCheckoutValidation() {
  const projectUrl = window.BATHLY_AUTH_CONFIG.supabaseUrl.replace(/\/$/, "");
  try {
    const response = await fetch(
      `${projectUrl}/functions/v1/snipcart-product?health=1`,
      {
        cache: "no-store",
        headers: { apikey: window.BATHLY_AUTH_CONFIG.supabaseAnonKey },
      },
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const { ready } = await response.json();
    checkoutValidationReady = ready === true;
    checkoutValidationStatus.textContent = checkoutValidationReady
      ? ""
      : "الشراء متوقف مؤقتًا حتى تفعيل التحقق الآمن من الأسعار.";
  } catch (error) {
    checkoutValidationReady = false;
    checkoutValidationStatus.textContent =
      "الشراء متوقف مؤقتًا حتى تفعيل التحقق الآمن من الأسعار.";
  }
  updateCheckoutButtons();
}

async function loadProducts() {
  if (!supabaseClient) {
    productsStatus.textContent =
      "تعذر تحميل المنتجات: إعداد اتصال Supabase غير مكتمل.";
    return;
  }
  productsStatus.textContent = "جاري تحميل المنتجات...";
  try {
    let { data, error } = await supabaseClient
      .from("products")
      .select(
        "id, name, description, price, discount_percent, stock, category, image_url",
      )
      .order("created_at", { ascending: false });
    let needsDiscountMigration = false;
    if (error?.message.includes("discount_percent")) {
      const fallback = await supabaseClient
        .from("products")
        .select("id, name, description, price, stock, category, image_url")
        .order("created_at", { ascending: false });
      data = fallback.data;
      error = fallback.error;
      needsDiscountMigration = !error;
    }
    if (error) {
      productsStatus.textContent = `تعذر تحميل المنتجات: ${error.message}`;
      return;
    }
    products = (data || []).map((product) => ({
      ...product,
      discount_percent: product.discount_percent || 0,
    }));
    renderProducts();
    productsStatus.textContent = needsDiscountMigration
      ? "تم تحميل المنتجات. نفّذ تحديث قاعدة البيانات لتفعيل الخصومات."
      : products.length
        ? ""
        : "لا توجد منتجات بعد. أضف منتجات من لوحة التحكم.";

    if (!productsChannel) {
      productsChannel = supabaseClient
        .channel("bathly-products")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "products" },
          loadProducts,
        )
        .subscribe((status) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            productsStatus.textContent =
              "تعذر تشغيل التحديث المباشر؛ أعد تحميل الصفحة لرؤية أحدث المنتجات.";
          }
        });
    }
  } catch (error) {
    productsStatus.textContent = `تعذر تحميل المنتجات: ${error.message}`;
  }
}

async function loadPromotions() {
  if (!supabaseClient) {
    promotionsStatus.textContent =
      "تعذر تحميل العروض: إعداد اتصال Supabase غير مكتمل.";
    return;
  }
  promotionsStatus.textContent = "جاري تحميل العروض...";
  try {
    const { data, error } = await supabaseClient
      .from("promotions")
      .select("id, title, description, offer_price")
      .order("created_at", { ascending: false });
    if (error) {
      promotionsStatus.textContent = `تعذر تحميل العروض: ${error.message}`;
      return;
    }
    let promotionLinks = [];
    let promotionProducts = [];
    if (data?.length) {
      const { data: links, error: linksError } = await supabaseClient
        .from("promotion_products")
        .select("promotion_id, product_id")
        .in(
          "promotion_id",
          data.map((promotion) => promotion.id),
        );
      if (linksError) throw linksError;
      promotionLinks = links || [];
      const productIds = [...new Set((links || []).map((link) => link.product_id))];
      if (productIds.length) {
        const { data: linkedProducts, error: productsError } =
          await supabaseClient
            .from("products")
            .select(
              "id, name, description, price, discount_percent, image_url, stock",
            )
            .in("id", productIds);
        if (productsError) throw productsError;
        promotionProducts = linkedProducts || [];
      }
    }
    promotionList.replaceChildren();
    (data || []).forEach((promotion) => {
      const card = document.createElement("article");
      card.className = "promotion-item";
      const title = document.createElement("h3");
      title.textContent = promotion.title;
      const description = document.createElement("p");
      description.textContent = promotion.description || "";
      const productsArea = document.createElement("div");
      productsArea.className = "promotion-products";
      const associatedIds = promotionLinks
        .filter((link) => link.promotion_id === promotion.id)
        .map((link) => link.product_id);
      const includedProducts = promotionProducts.filter((product) =>
        associatedIds.includes(product.id),
      );
      includedProducts.forEach((product) => {
          const productCard = document.createElement("div");
          productCard.className = "promotion-product";
          if (product.image_url) {
            const image = document.createElement("img");
            image.src = product.image_url;
            image.alt = product.name;
            image.loading = "lazy";
            productCard.append(image);
          }
          const productTitle = document.createElement("h4");
          productTitle.textContent = product.name;
          const productDescription = document.createElement("p");
          productDescription.textContent = product.description || "";
          const productPrice = document.createElement("p");
          productPrice.className = "promotion-product-price";
          const productDiscount = Math.min(
            100,
            Math.max(0, Number(product.discount_percent) || 0),
          );
          const productSalePrice = Number(
            (Number(product.price) * (1 - productDiscount / 100)).toFixed(2),
          );
          if (productDiscount > 0) {
            const originalPrice = document.createElement("del");
            originalPrice.textContent = formatStorePrice(product.price);
            const salePrice = document.createElement("strong");
            salePrice.textContent = formatStorePrice(productSalePrice);
            productPrice.append(originalPrice, salePrice);
          } else {
            productPrice.textContent = formatStorePrice(product.price);
          }
          productCard.append(productTitle, productDescription, productPrice);
          productsArea.append(productCard);
        });
      card.append(title, description);
      if (promotion.offer_price != null) {
        const offerPrice = document.createElement("p");
        offerPrice.className = "promotion-offer-price";
        offerPrice.textContent = `سعر العرض للمجموعة: ${formatStorePrice(promotion.offer_price)}`;
        card.append(offerPrice);
      }
      if (associatedIds.length) card.append(productsArea);
      if (promotion.offer_price != null && includedProducts.length) {
        const addButton = document.createElement("button");
        addButton.className = "add-to-cart promotion-add-to-cart snipcart-add-item";
        addButton.type = "button";
        addButton.dataset.itemId = `promotion-${promotion.id}`;
        addButton.dataset.itemName = promotion.title;
        addButton.dataset.itemPrice = String(promotion.offer_price);
        addButton.dataset.itemUrl = getValidationUrl(`promotion-${promotion.id}`);
        addButton.dataset.itemDescription = [
          promotion.description || "",
          `يشمل: ${includedProducts.map((product) => product.name).join("، ")}`,
        ]
          .filter(Boolean)
          .join(" ");
        if (includedProducts[0].image_url) {
          addButton.dataset.itemImage = includedProducts[0].image_url;
        }
        addButton.textContent = "أضف العرض إلى السلة";
        addButton.dataset.availableStock = String(
          Math.min(...includedProducts.map((product) => Number(product.stock))),
        );
        addButton.dataset.itemMaxQuantity = addButton.dataset.availableStock;
        card.append(addButton);
      }
      promotionList.append(card);
    });
    updateCheckoutButtons();
    promotionsStatus.textContent = data?.length
      ? ""
      : "لا توجد عروض ترويجية حاليًا.";
  } catch (error) {
    promotionsStatus.textContent = `تعذر تحميل العروض: ${error.message}`;
  }
}

function createReviewMessage(review) {
  const message = document.createElement("article");
  message.className = "review-message";
  const header = document.createElement("div");
  header.className = "review-message-header";
  const author = document.createElement("strong");
  author.textContent = review.display_name || "زائر";
  const time = document.createElement("time");
  time.dateTime = review.created_at;
  time.textContent = new Date(review.created_at).toLocaleString("ar");
  const content = document.createElement("p");
  content.textContent = review.content;
  header.append(author, time);
  message.append(header, content);
  return message;
}

async function loadReviews() {
  if (!supabaseClient) {
    reviewsStatus.textContent =
      "تعذر تحميل الآراء: إعداد اتصال Supabase غير مكتمل.";
    return;
  }
  reviewsStatus.textContent = "جاري تحميل الآراء...";
  try {
    const { data, error } = await supabaseClient
      .from("customer_reviews")
      .select("id, display_name, content, created_at")
      .order("created_at", { ascending: true })
      .limit(100);
    if (error) {
      reviewsStatus.textContent = `تعذر تحميل الآراء: ${error.message}`;
      return;
    }
    reviewMessages.replaceChildren(
      ...(data || []).map(createReviewMessage),
    );
    reviewsStatus.textContent = data?.length
      ? ""
      : "لا توجد آراء بعد. كن أول من يشارك تجربته.";
    reviewMessages.scrollTop = reviewMessages.scrollHeight;
  } catch (error) {
    reviewsStatus.textContent = `تعذر تحميل الآراء: ${error.message}`;
  }
}

reviewForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  reviewFormStatus.textContent = "";
  if (!reviewForm.checkValidity()) {
    reviewForm.reportValidity();
    return;
  }
  const formData = new FormData(reviewForm);
  const content = String(formData.get("content") || "").trim();
  if (content.length < 3) {
    reviewFormStatus.textContent = "اكتب رأيًا لا يقل عن 3 أحرف.";
    return;
  }
  reviewSubmit.disabled = true;
  reviewSubmit.textContent = "جارٍ إرسال رأيك...";
  try {
    const { data, error } = await supabaseClient
      .from("customer_reviews")
      .insert({
        display_name: String(formData.get("display_name") || "").trim() || "زائر",
        content,
      })
      .select("id, display_name, content, created_at")
      .single();
    if (error) throw error;
    const emptyState = reviewsStatus.textContent.startsWith("لا توجد آراء");
    if (emptyState) {
      reviewMessages.replaceChildren();
      reviewsStatus.textContent = "";
    }
    reviewMessages.append(createReviewMessage(data));
    reviewMessages.scrollTop = reviewMessages.scrollHeight;
    reviewForm.reset();
    reviewFormStatus.textContent = "تم نشر رأيك.";
  } catch (error) {
    reviewFormStatus.textContent = `تعذر إرسال رأيك: ${error.message}`;
  } finally {
    reviewSubmit.disabled = false;
    reviewSubmit.textContent = "إرسال الرأي";
  }
});

function filterProducts() {
  const cards = [...document.querySelectorAll(".product-item")];
  const query = searchInput.value.trim().toLocaleLowerCase("ar");
  let visibleCount = 0;
  cards.forEach((card) => {
    const matches = card.textContent.toLocaleLowerCase("ar").includes(query);
    card.hidden = !matches;
    if (matches) visibleCount += 1;
  });
  searchStatus.textContent = query
    ? visibleCount
      ? `عدد النتائج: ${visibleCount}`
      : "لم يتم العثور على منتجات مطابقة."
    : "";
}

searchInput.addEventListener("input", filterProducts);
document.querySelector(".search-bar").addEventListener("submit", (event) => {
  event.preventDefault();
  filterProducts();
  document.querySelector("#products").scrollIntoView({ behavior: "smooth" });
});

const aiForm = document.querySelector(".ai-assistant form");
if (aiForm) {
  aiForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = document.querySelector("#ai-question");
    const response = document.querySelector(".ai-response");
    const paragraph = document.createElement("p");
    paragraph.textContent = `اكتبنا سؤالك: "${input.value.trim()}". منتجاتنا متاحة في قسم المنتجات ويمكنك تصفيتها من البحث.`;
    response.replaceChildren(paragraph);
  });
}

loadProducts();
loadPromotions();
loadReviews();
initializeCheckoutValidation();
initializeAuth();
