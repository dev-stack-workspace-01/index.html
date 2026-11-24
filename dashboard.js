const SALES_KEY = "bathly_sales";
const ADMIN_EMAIL = window.BATHLY_AUTH_CONFIG.adminEmail;
const supabaseClient = window.BATHLY_SUPABASE_CLIENT;
const adminLogin = document.querySelector("#adminLogin");
const adminLoginForm = document.querySelector("#adminLoginForm");
const adminLoginError = document.querySelector("#adminLoginError");
const adminEmail = document.querySelector("#adminEmail");
const adminCode = document.querySelector("#adminCode");
const adminCodeField = document.querySelector("#adminCodeField");
const adminLoginSubmit = document.querySelector("#adminLoginSubmit");
const adminLoginStatus = document.querySelector("#adminLoginStatus");
const adminResendRow = document.querySelector("#adminResendRow");
const adminResend = document.querySelector("#adminResend");
const adminResendTimer = document.querySelector("#adminResendTimer");
const productsLoadStatus = document.querySelector("#productsLoadStatus");
const adminProductsBody = document.querySelector("#adminProductsBody");
const promotionForm = document.querySelector("#promotionForm");
const promotionFormStatus = document.querySelector("#promotionFormStatus");
const savePromotionButton = document.querySelector("#savePromotionButton");
const promotionsLoadStatus = document.querySelector("#promotionsLoadStatus");
const adminPromotionList = document.querySelector("#adminPromotionList");
const promotionProductOptions = document.querySelector("#promotionProductOptions");
const reviewsLoadStatus = document.querySelector("#reviewsLoadStatus");
const adminReviewsBody = document.querySelector("#adminReviewsBody");
const customersBody = document.querySelector("#customersBody");
const globalSearch = document.querySelector("#globalSearch");
const productImageInput = document.querySelector("#productImage");
const productImagePreview = document.querySelector("#productImagePreview");
const productFormMessage = document.querySelector("#productFormMessage");
const saveProductButton = document.querySelector("#saveProductButton");
let awaitingCode = false;
let resendCooldown = null;
let products = [];
let promotions = [];
let activePeriod = { days: 30, yearToDate: false };
let imagePreviewUrl = null;
let showAllOrders = false;

function showLoginError(message) {
  adminLoginError.textContent = message;
  if (message) adminLoginStatus.textContent = "";
}

function renderAdminProducts() {
  adminProductsBody.replaceChildren();
  if (!products.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 6;
    cell.textContent = "لا توجد منتجات بعد. استخدم زر إضافة منتج.";
    row.append(cell);
    adminProductsBody.append(row);
    return;
  }

  products.forEach((product) => {
    const row = document.createElement("tr");
    row.dataset.searchable = "true";
    const imageCell = document.createElement("td");
    if (product.image_url) {
      const image = document.createElement("img");
      image.className = "dashboard-product-image";
      image.src = product.image_url;
      image.alt = String(product.name || "صورة المنتج");
      image.loading = "lazy";
      imageCell.append(image);
    } else {
      const placeholder = document.createElement("span");
      placeholder.className = "dashboard-product-placeholder";
      placeholder.textContent = "بلا صورة";
      imageCell.append(placeholder);
    }

    [
      product.name,
      product.category,
      `${formatNumber(product.price)} ر.س`,
      formatNumber(product.stock),
    ].forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = String(value ?? "");
      row.append(cell);
    });
    const discountCell = document.createElement("td");
    const discountInput = document.createElement("input");
    discountInput.className = "product-discount-input";
    discountInput.type = "number";
    discountInput.min = "0";
    discountInput.max = "100";
    discountInput.step = "0.01";
    discountInput.value = String(product.discount_percent || 0);
    discountInput.setAttribute("aria-label", `خصم ${product.name}`);
    const saveDiscountButton = document.createElement("button");
    saveDiscountButton.className = "save-discount-button";
    saveDiscountButton.type = "button";
    saveDiscountButton.dataset.productDiscountId = product.id;
    saveDiscountButton.textContent = "حفظ";
    discountCell.append(discountInput, saveDiscountButton);
    row.append(discountCell);
    row.prepend(imageCell);
    adminProductsBody.append(row);
  });
  filterDashboardRows();
}

function renderPromotionProductOptions() {
  promotionProductOptions.replaceChildren();
  if (!products.length) {
    const message = document.createElement("p");
    message.textContent = "أضف المنتجات أولًا من قسم المنتجات لتختارها هنا.";
    promotionProductOptions.append(message);
    return;
  }
  products.forEach((product) => {
    const label = document.createElement("label");
    label.className = "promotion-product-option";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.name = "product_ids";
    checkbox.value = product.id;
    const image = document.createElement("img");
    image.src = product.image_url;
    image.alt = "";
    image.loading = "lazy";
    const details = document.createElement("span");
    const name = document.createElement("strong");
    name.textContent = product.name;
    const price = document.createElement("small");
    price.textContent = `${formatNumber(product.price)} ر.س`;
    details.append(name, price);
    label.append(checkbox, image, details);
    promotionProductOptions.append(label);
  });
}

function renderCustomers(sales) {
  const customers = new Map();
  sales.forEach((sale) => {
    const name = String(sale.customer || "").trim();
    if (!name) return;
    const customer = customers.get(name) || { orders: 0, total: 0 };
    customer.orders += 1;
    customer.total += Number(sale.total || 0);
    customers.set(name, customer);
  });

  adminReviewsBody.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-review-id]");
    if (!button || !window.confirm("هل تريد حذف هذا الرأي نهائيًا؟")) return;
    button.disabled = true;
    reviewsLoadStatus.textContent = "جاري حذف الرأي...";
    try {
      const { error } = await supabaseClient
        .from("customer_reviews")
        .delete()
        .eq("id", button.dataset.reviewId);
      if (error) throw error;
      await loadAdminReviews();
    } catch (error) {
      reviewsLoadStatus.textContent = `تعذر حذف الرأي: ${error.message}`;
      button.disabled = false;
    }
  });

  customersBody.replaceChildren();
  if (!customers.size) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 3;
    cell.textContent = "لا توجد بيانات عملاء مرتبطة بالمبيعات بعد.";
    row.append(cell);
    customersBody.append(row);
    return [...customers.keys()];
  }

  customers.forEach((summary, name) => {
    const row = document.createElement("tr");
    row.dataset.searchable = "true";
    [
      name,
      formatNumber(summary.orders),
      `${formatNumber(summary.total)} ر.س`,
    ].forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    });
    customersBody.append(row);
  });
  filterDashboardRows();
  return [...customers.keys()];
}

function filterDashboardRows() {
  const query = globalSearch.value.trim().toLocaleLowerCase("ar");
  document.querySelectorAll("[data-searchable='true']").forEach((row) => {
    row.hidden = !row.textContent.toLocaleLowerCase("ar").includes(query);
  });
}

async function loadAdminProducts() {
  productsLoadStatus.textContent = "جاري تحميل المنتجات من Supabase...";
  try {
    let { data, error } = await supabaseClient
      .from("products")
      .select(
        "id, name, description, price, discount_percent, stock, category, image_url, image_path, created_at",
      )
      .order("created_at", { ascending: false });
    let needsDiscountMigration = false;
    if (error?.message.includes("discount_percent")) {
      const fallback = await supabaseClient
        .from("products")
        .select(
          "id, name, description, price, stock, category, image_url, image_path, created_at",
        )
        .order("created_at", { ascending: false });
      data = fallback.data;
      error = fallback.error;
      needsDiscountMigration = !error;
    }
    if (error) {
      productsLoadStatus.textContent = `تعذر تحميل المنتجات: ${error.message}`;
      return false;
    }
    products = (data || []).map((product) => ({
      ...product,
      discount_percent: product.discount_percent || 0,
    }));
    renderAdminProducts();
    renderPromotionProductOptions();
    renderAdminPromotions();
    productsLoadStatus.textContent = needsDiscountMigration
      ? "تم تحميل المنتجات. نفّذ تحديث قاعدة البيانات لتفعيل الخصومات."
      : products.length
        ? ""
        : "لا توجد منتجات بعد. أضف منتجًا لعرضه في المتجر.";
    updateDashboard();
    return true;
  } catch (error) {
    productsLoadStatus.textContent = `تعذر تحميل المنتجات: ${error.message}`;
    return false;
  }
}

function renderAdminPromotions() {
  adminPromotionList.replaceChildren();
  promotions.forEach((promotion) => {
    const item = document.createElement("article");
    item.className = "admin-promotion-item";
    const details = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = promotion.title;
    const description = document.createElement("p");
    description.textContent = promotion.description || "";
    const price = document.createElement("p");
    price.textContent =
      promotion.offer_price == null
        ? "لم يتم تحديد سعر للمجموعة."
        : `سعر العرض: ${formatNumber(promotion.offer_price)} ر.س`;
    const selectedProducts = products.filter((product) =>
      promotion.product_ids?.includes(product.id),
    );
    const productNames = document.createElement("p");
    productNames.textContent = selectedProducts.length
      ? `المنتجات: ${selectedProducts.map((product) => product.name).join("، ")}`
      : "لا توجد منتجات مرتبطة بهذا العرض.";
    const removeButton = document.createElement("button");
    removeButton.className = "promotion-delete-button";
    removeButton.type = "button";
    removeButton.dataset.promotionId = promotion.id;
    removeButton.textContent = "حذف العرض";
    details.append(title, description, price, productNames);
    item.append(details, removeButton);
    adminPromotionList.append(item);
  });
}

async function loadAdminPromotions() {
  promotionsLoadStatus.textContent = "جاري تحميل العروض...";
  try {
    const { data, error } = await supabaseClient
      .from("promotions")
      .select("id, title, description, offer_price, created_at")
      .order("created_at", { ascending: false });
    if (error) {
      promotionsLoadStatus.textContent = `تعذر تحميل العروض: ${error.message}`;
      return false;
    }
    promotions = data || [];
    if (promotions.length) {
      const { data: links, error: linksError } = await supabaseClient
        .from("promotion_products")
        .select("promotion_id, product_id")
        .in(
          "promotion_id",
          promotions.map((promotion) => promotion.id),
        );
      if (linksError) throw linksError;
      promotions.forEach((promotion) => {
        promotion.product_ids = (links || [])
          .filter((link) => link.promotion_id === promotion.id)
          .map((link) => link.product_id);
      });
    }
    renderAdminPromotions();
    promotionsLoadStatus.textContent = promotions.length
      ? ""
      : "لا توجد عروض مضافة بعد.";
    return true;
  } catch (error) {
    promotionsLoadStatus.textContent = `تعذر تحميل العروض: ${error.message}`;
    return false;
  }
}

function renderAdminReviews(reviews) {
  adminReviewsBody.replaceChildren();
  if (!reviews.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 4;
    cell.textContent = "لا توجد آراء منشورة.";
    row.append(cell);
    adminReviewsBody.append(row);
    return;
  }
  reviews.forEach((review) => {
    const row = document.createElement("tr");
    const nameCell = document.createElement("td");
    nameCell.textContent = review.display_name || "زائر";
    const contentCell = document.createElement("td");
    contentCell.className = "admin-review-content";
    contentCell.textContent = review.content;
    const dateCell = document.createElement("td");
    dateCell.textContent = new Date(review.created_at).toLocaleString("ar-SA");
    const actionCell = document.createElement("td");
    const deleteButton = document.createElement("button");
    deleteButton.className = "delete-review-button";
    deleteButton.type = "button";
    deleteButton.dataset.reviewId = review.id;
    deleteButton.textContent = "حذف";
    actionCell.append(deleteButton);
    row.append(nameCell, contentCell, dateCell, actionCell);
    adminReviewsBody.append(row);
  });
}

async function loadAdminReviews() {
  reviewsLoadStatus.textContent = "جاري تحميل الآراء...";
  try {
    const { data, error } = await supabaseClient
      .from("customer_reviews")
      .select("id, display_name, content, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      reviewsLoadStatus.textContent = `تعذر تحميل الآراء: ${error.message}`;
      return false;
    }
    renderAdminReviews(data || []);
    reviewsLoadStatus.textContent = "";
    return true;
  } catch (error) {
    reviewsLoadStatus.textContent = `تعذر تحميل الآراء: ${error.message}`;
    return false;
  }
}

function startResendCooldown(seconds = 60) {
  clearInterval(resendCooldown);
  let remaining = seconds;
  adminResend.disabled = true;
  adminResendTimer.textContent = `إعادة الإرسال خلال ${remaining}ث`;
  resendCooldown = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(resendCooldown);
      resendCooldown = null;
      adminResend.disabled = false;
      adminResendTimer.textContent = "";
      return;
    }
    adminResendTimer.textContent = `إعادة الإرسال خلال ${remaining}ث`;
  }, 1000);
}

async function sendAdminCode(email) {
  adminLoginSubmit.disabled = true;
  adminResend.disabled = true;
  showLoginError("");
  try {
    const { error } = await supabaseClient.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });
    if (error) {
      showLoginError(`تعذر إرسال رمز التحقق: ${error.message}`);
      if (awaitingCode) adminResend.disabled = false;
      return;
    }

    awaitingCode = true;
    adminEmail.readOnly = true;
    adminCode.disabled = false;
    adminCode.required = true;
    adminCodeField.hidden = false;
    adminResendRow.hidden = false;
    document.querySelector("#adminLoginDescription").textContent =
      "أدخل رمز التحقق الذي وصلك إلى بريدك.";
    adminLoginSubmit.textContent = "تأكيد الرمز";
    adminLoginStatus.textContent = "تم إرسال رمز التحقق إلى بريدك الإلكتروني.";
    startResendCooldown();
  } catch (error) {
    showLoginError(`تعذر إرسال رمز التحقق: ${error.message}`);
    if (awaitingCode) adminResend.disabled = false;
  } finally {
    adminLoginSubmit.disabled = false;
  }
}

function unlockDashboard() {
  clearInterval(resendCooldown);
  resendCooldown = null;
  adminLogin.hidden = true;
  document.body.classList.remove("dashboard-locked");
  updateDashboard();
  loadAdminProducts();
  loadAdminPromotions();
  loadAdminReviews();
}

function lockDashboard(message = "") {
  adminLogin.hidden = false;
  document.body.classList.add("dashboard-locked");
  if (message) showLoginError(message);
}

async function initializeAdminAuth() {
  if (!supabaseClient) {
    lockDashboard();
    showLoginError(
      "يلزم إعداد رابط Supabase والمفتاح العام لتفعيل تسجيل الدخول.",
    );
    adminLoginSubmit.disabled = true;
    return;
  }

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    if (session?.user.email?.toLocaleLowerCase() === ADMIN_EMAIL) {
      unlockDashboard();
    } else {
      lockDashboard();
    }
  });

  const { data, error } = await supabaseClient.auth.getSession();
  if (error) {
    lockDashboard();
    showLoginError(`تعذر التحقق من الجلسة: ${error.message}`);
    return;
  }
  if (data.session?.user.email?.toLocaleLowerCase() === ADMIN_EMAIL) {
    unlockDashboard();
    return;
  }
  if (data.session) {
    lockDashboard(
      "هذا الحساب لا يملك صلاحية لوحة التحكم. استخدم البريد المصرح به.",
    );
  }
}

adminLoginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showLoginError("");
  const email = adminEmail.value.trim().toLocaleLowerCase();
  if (email !== ADMIN_EMAIL) {
    showLoginError("هذا البريد غير مصرح له بالدخول.");
    return;
  }
  if (!awaitingCode) {
    await sendAdminCode(email);
    adminCode.focus();
    return;
  }

  adminLoginSubmit.disabled = true;
  try {
    const { data, error } = await supabaseClient.auth.verifyOtp({
      email,
      token: adminCode.value.trim(),
      type: "email",
    });
    if (error) {
      showLoginError(`رمز التحقق غير صالح أو انتهت صلاحيته: ${error.message}`);
      return;
    }
    if (data.user?.email?.toLocaleLowerCase() !== ADMIN_EMAIL) {
      await supabaseClient.auth.signOut();
      showLoginError("هذا البريد غير مصرح له بالدخول.");
      return;
    }
    unlockDashboard();
  } catch (error) {
    showLoginError(`تعذر إكمال تسجيل الدخول: ${error.message}`);
  } finally {
    adminLoginSubmit.disabled = false;
  }
});

adminResend.addEventListener("click", () => {
  if (awaitingCode && !adminResend.disabled) {
    sendAdminCode(adminEmail.value.trim().toLocaleLowerCase());
  }
});

document.querySelector("#logoutButton").addEventListener("click", async () => {
  try {
    const { error } = await supabaseClient.auth.signOut();
    if (error) {
      showLoginError(`تعذر تسجيل الخروج: ${error.message}`);
      return;
    }
  } catch (error) {
    showLoginError(`تعذر تسجيل الخروج: ${error.message}`);
    return;
  }
  adminEmail.readOnly = false;
  adminCode.disabled = true;
  adminCode.required = false;
  adminCode.value = "";
  adminCodeField.hidden = true;
  adminResendRow.hidden = true;
  adminResend.disabled = true;
  adminResendTimer.textContent = "";
  adminLoginStatus.textContent = "";
  clearInterval(resendCooldown);
  resendCooldown = null;
  awaitingCode = false;
  adminLoginSubmit.textContent = "إرسال رمز التحقق";
  document.querySelector("#adminLoginDescription").textContent =
    "أدخل بريد مالك المتجر لإرسال رمز تحقق.";
  lockDashboard();
});

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("ar-SA", {
    maximumFractionDigits: 2,
  });
}

function setTrend(elementId, current, previous) {
  const element = document.querySelector(`#${elementId}`);
  if (!element) return;
  const percent =
    previous > 0
      ? ((current - previous) / previous) * 100
      : current > 0
        ? 100
        : 0;
  element.textContent = `${percent >= 0 ? "↑" : "↓"} ${Math.abs(percent).toFixed(1)}%`;
  element.classList.toggle("up", percent >= 0);
  element.classList.toggle("down", percent < 0);
}

function updateDashboard() {
  if (document.body.classList.contains("dashboard-locked")) return;
  const sales = readJson(SALES_KEY, []);
  const viewAllOrders = document.querySelector("#viewAllOrders");
  const now = new Date();
  const currentStart = activePeriod.yearToDate
    ? new Date(now.getFullYear(), 0, 1)
    : new Date(now.getTime() - activePeriod.days * 24 * 60 * 60 * 1000);
  const periodDuration = Math.max(now.getTime() - currentStart.getTime(), 1);
  const previousStart = new Date(currentStart.getTime() - periodDuration);
  const currentSales = sales.filter((sale) => {
    const time = new Date(sale.date).getTime();
    return time >= currentStart.getTime() && time <= now.getTime();
  });
  const previousSales = sales.filter((sale) => {
    const time = new Date(sale.date).getTime();
    return time >= previousStart.getTime() && time < currentStart.getTime();
  });
  const total = sales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  const currentTotal = currentSales.reduce(
    (sum, sale) => sum + Number(sale.total || 0),
    0,
  );
  const previousTotal = previousSales.reduce(
    (sum, sale) => sum + Number(sale.total || 0),
    0,
  );
  const average = sales.length ? total / sales.length : 0;
  const currentAverage = currentSales.length
    ? currentTotal / currentSales.length
    : 0;
  const previousAverage = previousSales.length
    ? previousTotal / previousSales.length
    : 0;
  const customers = renderCustomers(sales);
  viewAllOrders.hidden = sales.length <= 6;

  document.querySelector("#todayLabel").textContent = now.toLocaleDateString(
    "ar-SA",
    {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    },
  );
  document.querySelector("#salesTotal").innerHTML =
    `${formatNumber(total)} <small>ر.س</small>`;
  document.querySelector("#ordersTotal").textContent = formatNumber(
    sales.length,
  );
  document.querySelector("#customersTotal").textContent = formatNumber(
    customers.length,
  );
  document.querySelector("#averageOrder").innerHTML =
    `${formatNumber(average)} <small>ر.س</small>`;
  document.querySelector("#productCount").textContent = formatNumber(
    products.length,
  );
  document.querySelector("#donutTotal").textContent =
    formatNumber(currentTotal);
  document.querySelector("#chartTotal").textContent =
    `${formatNumber(currentTotal)} ر.س`;
  const latestDate = sales
    .map((sale) => new Date(sale.date))
    .filter((date) => Number.isFinite(date.getTime()))
    .sort((a, b) => b - a)[0];
  if (latestDate) {
    document.querySelector("#chartDate").textContent =
      latestDate.toLocaleDateString("ar-SA");
  } else {
    document.querySelector("#chartDate").textContent = "لا توجد مبيعات";
  }

  setTrend("salesTrend", currentTotal, previousTotal);
  setTrend("ordersTrend", currentSales.length, previousSales.length);
  setTrend("customersTrend", currentSales.length, previousSales.length);
  setTrend("averageTrend", currentAverage, previousAverage);

  const bars = document.querySelectorAll("#salesBars i");
  const barValues = Array.from({ length: 6 }, (_, index) => {
    const start = currentStart.getTime() + (periodDuration * index) / 6;
    const end = currentStart.getTime() + (periodDuration * (index + 1)) / 6;
    return currentSales
      .filter((sale) => {
        const time = new Date(sale.date).getTime();
        return (
          time >= start &&
          (time < end || (index === 5 && time <= now.getTime()))
        );
      })
      .reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  });
  const maxBar = Math.max(...barValues, 1);
  bars.forEach((bar, index) => {
    bar.style.height = `${Math.max(12, (barValues[index] / maxBar) * 100)}%`;
  });
  const chartPoints = barValues.map((value, index) => ({
    x: (700 * index) / (barValues.length - 1),
    y: 190 - (value / maxBar) * 145,
  }));
  const chartLine = chartPoints
    .map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`)
    .join(" ");
  document.querySelector(".chart .line").setAttribute("d", chartLine);
  document
    .querySelector(".chart .area")
    .setAttribute("d", `${chartLine} L 700 220 L 0 220 Z`);
  const chartMarker = document.querySelector(".chart circle");
  chartMarker.setAttribute("cx", String(chartPoints[chartPoints.length - 1].x));
  chartMarker.setAttribute("cy", String(chartPoints[chartPoints.length - 1].y));

  const progress = sales.length
    ? Math.min(100, (sales.length / Math.max(products.length, 1)) * 100)
    : 0;
  document.querySelector("#ordersProgress").style.width = `${progress}%`;

  const avatarBox = document.querySelector("#customerAvatars");
  avatarBox.replaceChildren();
  customers.slice(0, 4).forEach((customer) => {
    const avatar = document.createElement("i");
    avatar.textContent = customer.trim().charAt(0) || "ع";
    avatarBox.append(avatar);
  });
  if (customers.length > 4) {
    const extra = document.createElement("em");
    extra.textContent = `+${customers.length - 4}`;
    avatarBox.append(extra);
  }

  const categoryTotals = {};
  currentSales.forEach((sale) => {
    (sale.items || []).forEach((item) => {
      const category = item.category || "إكسسوارات الحمام";
      categoryTotals[category] =
        (categoryTotals[category] || 0) +
        Number(item.price || 0) * Number(item.quantity || 0);
    });
  });
  const categoryNames = [
    "إكسسوارات الحمام",
    "المناشف والأقمشة",
    "الأدوات الذكية",
    "التجميل والعناية",
  ];
  const categoryElements = document.querySelectorAll("#categoryList div");
  const categoryGrandTotal = Object.values(categoryTotals).reduce(
    (sum, value) => sum + value,
    0,
  );
  categoryNames.forEach((name, index) => {
    const percent = categoryGrandTotal
      ? ((categoryTotals[name] || 0) / categoryGrandTotal) * 100
      : 0;
    const strong = categoryElements[index]?.querySelector("strong");
    if (strong) strong.textContent = `${percent.toFixed(1)}%`;
  });
  if (categoryGrandTotal) {
    let cursor = 0;
    const colors = ["#955b5b", "#c27586", "#b5797f", "#d8b8ad"];
    const segments = categoryNames.map((name, index) => {
      const percent = ((categoryTotals[name] || 0) / categoryGrandTotal) * 100;
      const segment = `${colors[index]} ${cursor}% ${cursor + percent}%`;
      cursor += percent;
      return segment;
    });
    document.querySelector("#salesDonut").style.background =
      `conic-gradient(${segments.join(",")})`;
  } else {
    document.querySelector("#salesDonut").style.background = "#edf0f4";
  }

  const tableBody = document.querySelector(".orders-panel tbody");
  tableBody.replaceChildren();
  if (!sales.length) {
    const row = document.createElement("tr");
    row.innerHTML = `<td colspan="5" style="text-align:center;color:#8a93a3;height:90px">لا توجد مبيعات مسجلة بعد</td>`;
    tableBody.append(row);
  } else {
    const displayedSales = [...sales].reverse();
    (showAllOrders ? displayedSales : displayedSales.slice(0, 6)).forEach(
      (sale, index) => {
        const row = document.createElement("tr");
        row.dataset.searchable = "true";
        const orderCell = document.createElement("td");
        orderCell.textContent = `#${String(sales.length - index).padStart(4, "0")}`;
        const customerCell = document.createElement("td");
        const customer = document.createElement("span");
        customer.className = "customer";
        const avatar = document.createElement("i");
        avatar.textContent =
          String(sale.customer || "ع")
            .trim()
            .charAt(0) || "ع";
        customer.append(
          avatar,
          document.createTextNode(String(sale.customer || "عميل")),
        );
        customerCell.append(customer);
        const productCell = document.createElement("td");
        productCell.textContent =
          (sale.items || [])
            .map((item) => String(item.name || ""))
            .join("، ") || "-";
        const totalCell = document.createElement("td");
        const totalLabel = document.createElement("strong");
        totalLabel.textContent = `${formatNumber(sale.total)} ر.س`;
        totalCell.append(totalLabel);
        const statusCell = document.createElement("td");
        const status = document.createElement("span");
        status.className = "status completed";
        status.textContent = "مكتمل";
        statusCell.append(status);
        row.append(orderCell, customerCell, productCell, totalCell, statusCell);
        tableBody.append(row);
      },
    );
  }
  filterDashboardRows();

  const activityList = document.querySelector("#activityList");
  activityList.replaceChildren();
  if (!sales.length) {
    const empty = document.createElement("div");
    const icon = document.createElement("span");
    icon.className = "activity-icon purple";
    icon.textContent = "●";
    const message = document.createElement("p");
    const title = document.createElement("strong");
    title.textContent = "لا توجد نشاطات بعد";
    const details = document.createElement("small");
    details.textContent = "ستظهر المبيعات المسجلة هنا";
    message.append(title, details);
    const time = document.createElement("time");
    time.textContent = "الآن";
    empty.append(icon, message, time);
    activityList.append(empty);
  } else {
    [...sales]
      .reverse()
      .slice(0, 5)
      .forEach((sale) => {
        const item = document.createElement("div");
        const date = new Date(sale.date);
        const elapsedMinutes = Math.max(
          0,
          Math.round((Date.now() - date.getTime()) / 60000),
        );
        const timeText =
          elapsedMinutes < 60
            ? `${elapsedMinutes} دقيقة`
            : `${Math.floor(elapsedMinutes / 60)} ساعة`;
        const icon = document.createElement("span");
        icon.className = "activity-icon green";
        icon.textContent = "✓";
        const message = document.createElement("p");
        const title = document.createElement("strong");
        title.textContent = "تم تسجيل بيع جديد";
        const details = document.createElement("small");
        details.textContent = `${String(sale.customer || "عميل")} - ${formatNumber(sale.total)} ر.س`;
        message.append(title, details);
        const timeElement = document.createElement("time");
        timeElement.textContent = timeText;
        item.append(icon, message, timeElement);
        activityList.append(item);
      });
  }
}

const sidebar = document.querySelector("#sidebar");
document
  .querySelector("#menuButton")
  .addEventListener("click", () => sidebar.classList.toggle("open"));

const periodButton = document.querySelector("#periodButton");
const periodMenu = document.querySelector("#periodMenu");
const periodText = document.querySelector("#periodText");
periodButton.addEventListener("click", (event) => {
  event.stopPropagation();
  periodMenu.classList.toggle("open");
});
periodMenu.querySelectorAll("button").forEach((button) =>
  button.addEventListener("click", () => {
    const label = button.textContent.trim();
    periodText.textContent = label;
    activePeriod =
      label === "هذا العام"
        ? { days: 0, yearToDate: true }
        : {
            days: label === "آخر 7 أيام" ? 7 : label === "آخر 3 أشهر" ? 90 : 30,
            yearToDate: false,
          };
    document.querySelector(".category-panel .panel-header p").textContent =
      `توزيع مبيعات ${label}`;
    periodMenu.classList.remove("open");
    updateDashboard();
  }),
);

document
  .querySelector("#themeButton")
  .addEventListener("click", () => document.body.classList.toggle("dark"));

const addModal = document.querySelector("#addModal");
const addForm = document.querySelector("#addForm");
const openAddProductModal = () => addModal.showModal();
document
  .querySelector("#addProductButton")
  .addEventListener("click", openAddProductModal);
document
  .querySelector("#addProductFromList")
  .addEventListener("click", openAddProductModal);

function resetProductImagePreview() {
  if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
  imagePreviewUrl = null;
  productImagePreview.removeAttribute("src");
  productImagePreview.hidden = true;
}

function closeAddProductModal() {
  addModal.close();
  addForm.reset();
  resetProductImagePreview();
  productFormMessage.textContent = "";
}

document
  .querySelector(".modal-close")
  .addEventListener("click", closeAddProductModal);
document
  .querySelector(".cancel-button")
  .addEventListener("click", closeAddProductModal);
productImageInput.addEventListener("change", () => {
  productFormMessage.textContent = "";
  resetProductImagePreview();
  const file = productImageInput.files[0];
  if (!file) return;
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    productFormMessage.textContent = "اختر صورة بصيغة JPG أو PNG أو WebP.";
    productImageInput.value = "";
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    productFormMessage.textContent = "حجم الصورة يتجاوز الحد المسموح (5 MB).";
    productImageInput.value = "";
    return;
  }
  imagePreviewUrl = URL.createObjectURL(file);
  productImagePreview.src = imagePreviewUrl;
  productImagePreview.hidden = false;
});

addForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  productFormMessage.textContent = "";
  if (!addForm.checkValidity()) {
    addForm.reportValidity();
    return;
  }
  const data = new FormData(addForm);
  const file = productImageInput.files[0];
  if (!file) {
    productFormMessage.textContent = "أرفق صورة للمنتج قبل الحفظ.";
    return;
  }

  saveProductButton.disabled = true;
  saveProductButton.textContent = "جارٍ رفع الصورة...";
  let uploadedPath = "";
  try {
    const extension = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
    }[file.type];
    uploadedPath = `products/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;
    const { error: uploadError } = await supabaseClient.storage
      .from("bathly-products")
      .upload(uploadedPath, file, {
        cacheControl: "3600",
        contentType: file.type,
        upsert: false,
      });
    if (uploadError) throw uploadError;

    const { data: imageData } = supabaseClient.storage
      .from("bathly-products")
      .getPublicUrl(uploadedPath);
    const product = {
      id: `product-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: String(data.get("name")).trim(),
      description: String(data.get("description") || "").trim(),
      price: Number(data.get("price")),
      discount_percent: Number(data.get("discount_percent") || 0),
      stock: Number(data.get("stock")),
      category: String(data.get("category")),
      image_url: imageData.publicUrl,
      image_path: uploadedPath,
    };
    const { error: insertError } = await supabaseClient
      .from("products")
      .insert(product);
    if (insertError) {
      const { error: cleanupError } = await supabaseClient.storage
        .from("bathly-products")
        .remove([uploadedPath]);
      const cleanupMessage = cleanupError
        ? ` تعذر حذف الصورة المرفوعة: ${cleanupError.message}`
        : "";
      throw new Error(`${insertError.message}${cleanupMessage}`);
    }

    closeAddProductModal();
    if (await loadAdminProducts()) {
      productsLoadStatus.textContent = "تمت إضافة المنتج والصورة بنجاح.";
    }
  } catch (error) {
    productFormMessage.textContent = `تعذر حفظ المنتج: ${error.message}`;
  } finally {
    saveProductButton.disabled = false;
    saveProductButton.textContent = "حفظ المنتج";
  }
});

document.querySelectorAll(".side-nav [data-target]").forEach((item) =>
  item.addEventListener("click", () => {
    document
      .querySelectorAll(".side-nav .nav-item")
      .forEach((nav) => nav.classList.remove("active"));
    item.classList.add("active");
    document
      .getElementById(item.dataset.target)
      .scrollIntoView({ behavior: "smooth", block: "start" });
    sidebar.classList.remove("open");
  }),
);
document.querySelector("#viewAllOrders").addEventListener("click", () => {
  showAllOrders = !showAllOrders;
  document.querySelector("#viewAllOrders").textContent = showAllOrders
    ? "عرض آخر 6"
    : "عرض كل الطلبات";
  updateDashboard();
  document.querySelector('[data-target="ordersSection"]').click();
});

globalSearch.addEventListener("input", filterDashboardRows);

promotionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  promotionFormStatus.textContent = "";
  if (!promotionForm.checkValidity()) {
    promotionForm.reportValidity();
    return;
  }
  const formData = new FormData(promotionForm);
  const title = String(formData.get("title")).trim();
  const selectedProductIds = [
    ...promotionProductOptions.querySelectorAll(
      'input[name="product_ids"]:checked',
    ),
  ].map((input) => input.value);
  if (!title) {
    promotionFormStatus.textContent = "أدخل عنوانًا صالحًا للعرض.";
    return;
  }
  if (!selectedProductIds.length) {
    promotionFormStatus.textContent = "اختر منتجًا واحدًا على الأقل للعرض.";
    return;
  }
  savePromotionButton.disabled = true;
  savePromotionButton.textContent = "جارٍ حفظ العرض...";
  try {
    const { data: promotion, error } = await supabaseClient
      .from("promotions")
      .insert({
        title,
        description: String(formData.get("description") || "").trim(),
        offer_price: Number(formData.get("offer_price")),
      })
      .select("id")
      .single();
    if (error) throw error;
    const { error: productsError } = await supabaseClient
      .from("promotion_products")
      .insert(
        selectedProductIds.map((productId) => ({
          promotion_id: promotion.id,
          product_id: productId,
        })),
      );
    if (productsError) {
      const { error: cleanupError } = await supabaseClient
        .from("promotions")
        .delete()
        .eq("id", promotion.id);
      const cleanupMessage = cleanupError
        ? ` وتعذر التراجع عن إنشاء العرض: ${cleanupError.message}`
        : "";
      throw new Error(`${productsError.message}${cleanupMessage}`);
    }
    promotionForm.reset();
    promotionProductOptions
      .querySelectorAll('input[name="product_ids"]')
      .forEach((input) => {
        input.checked = false;
      });
    if (await loadAdminPromotions()) {
      promotionFormStatus.textContent = "تمت إضافة العرض بنجاح.";
    }
  } catch (error) {
    promotionFormStatus.textContent = `تعذر حفظ العرض: ${error.message}`;
  } finally {
    savePromotionButton.disabled = false;
    savePromotionButton.textContent = "إضافة العرض";
  }
});

adminPromotionList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-promotion-id]");
  if (!button) return;
  button.disabled = true;
  promotionsLoadStatus.textContent = "جاري حذف العرض...";
  try {
    const { error } = await supabaseClient
      .from("promotions")
      .delete()
      .eq("id", button.dataset.promotionId);
    if (error) throw error;
    await loadAdminPromotions();
  } catch (error) {
    promotionsLoadStatus.textContent = `تعذر حذف العرض: ${error.message}`;
    button.disabled = false;
  }
});

adminProductsBody.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-product-discount-id]");
  if (!button) return;
  const input = button.parentElement.querySelector(".product-discount-input");
  const discount = Number(input.value);
  if (!Number.isFinite(discount) || discount < 0 || discount > 100) {
    productsLoadStatus.textContent = "يجب أن يكون الخصم بين 0 و100٪.";
    input.focus();
    return;
  }
  button.disabled = true;
  productsLoadStatus.textContent = "جاري حفظ الخصم...";
  try {
    const { error } = await supabaseClient
      .from("products")
      .update({ discount_percent: discount })
      .eq("id", button.dataset.productDiscountId);
    if (error) throw error;
    if (await loadAdminProducts()) {
      productsLoadStatus.textContent = "تم حفظ خصم المنتج.";
    }
  } catch (error) {
    productsLoadStatus.textContent = `تعذر حفظ الخصم: ${error.message}`;
    button.disabled = false;
  }
});

document.addEventListener("click", (event) => {
  if (!periodMenu.contains(event.target) && event.target !== periodButton)
    periodMenu.classList.remove("open");
});
document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    globalSearch.focus();
  }
});

window.addEventListener("storage", updateDashboard);
initializeAdminAuth();
