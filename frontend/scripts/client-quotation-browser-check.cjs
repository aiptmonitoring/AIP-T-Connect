const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const env = fs.readFileSync(path.resolve(__dirname, "../.env.local"), "utf8");
const supabaseUrl = env.match(
  /^NEXT_PUBLIC_SUPABASE_URL\s*=\s*["']?([^\s"']+)/m,
)[1];
const ref = new URL(supabaseUrl).hostname.split(".")[0];
const base = {
  official_fee: 175,
  attorney_fee: 170,
  total_fee: 345,
  currency: "USD",
  available: true,
};
const client = {
  id: "client",
  assigned_id: 79,
  company_name: "infoaipt",
  email: "fixture@example.invalid",
  address: "Office 10, Bldg. 03, South of Manarat\nAl Riyadh School, Exit 8",
  country_id: "cy",
  status: "Active",
};
const lookup = {
  role: "client",
  current_client_id: "client",
  fee_dataset: { id: "fixture-v1", version_number: 1 },
  clients: [client],
  services: [
    {
      id: "service",
      name: "Trademark",
      category: "Trademark",
      description: "",
    },
  ],
  projects: [],
  countries: [
    { id: "cy", name: "Cyprus", abbreviation: "CY", flag_url: "" },
    { id: "af", name: "Afghanistan", abbreviation: "AF", flag_url: "" },
  ],
  procedures: [
    { id: "registration", name: "Registration", category: "Trademark" },
    { id: "renewal", name: "Renewal", category: "Trademark" },
  ],
  requirements: [
    {
      id: "r",
      country_id: "cy",
      service_id: "service",
      procedure_id: "registration",
      procedure: "Registration",
      description:
        "Trademark Application Requirements in Cyprus:\n• Information of the applicant: name, address, and nationality.\n• A signed POA.\n• Classes and Specifications of Goods/Services.\n• Priority document.\n• Mark representation (Logo).",
    },
  ],
  fees: ["cy", "af"].flatMap((country_id) =>
    ["Registration", "Renewal"].map((procedure_name) => ({
      ...base,
      id: country_id + procedure_name,
      country_id,
      category: "Trademark",
      procedure_name,
    })),
  ),
  class_rates: [],
  vat_rates: [],
  claiming_priority_fees: [],
  state_fees: [],
  aripo_country_ids: [],
};
const quotes = ["Pending Approval", "Approved", "Rejected", "Cancelled"].map(
  (status, i) => ({
    id: "quote" + i,
    reference_no: "T-2026-" + (6027 - i) + "-CY",
    status,
    vat_rate: 0,
    vatable: true,
    currency: "USD",
    client_matter_ref: i ? "" : "79",
    invoice_date: "2026-09-" + (23 - i),
    discount: 0,
    total_official_fee: 1225,
    total_attorney_fee: 1190,
    total_other_fee: 0,
    total_vat: 0,
    grand_total: 2415,
    created_at: "2026-09-23",
    subject: "Registration in Cyprus.",
    client,
    quotation_items: [
      {
        country_id: "cy",
        category: "Trademark",
        procedure_name: "Registration",
        quantity: 1,
        class_count: 7,
        class_numbers: [],
        official_fee: 1225,
        attorney_fee: 1190,
        other_fee: 0,
        vat_rate: 0,
        requirement_ids: ["r"],
      },
    ],
  }),
);
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1050 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const requests = [];
  let saved;
  let edited;
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const token =
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
      "base64url",
    ) +
    "." +
    Buffer.from(JSON.stringify({ sub: "fixture-user", exp: expires })).toString(
      "base64url",
    ) +
    ".fixture-signature";
  await page.addInitScript(
    ({ key, token, expires }) =>
      localStorage.setItem(
        key,
        JSON.stringify({
          access_token: token,
          refresh_token: "fixture-refresh",
          token_type: "bearer",
          expires_at: expires,
          expires_in: 3600,
          user: { id: "fixture-user", email: "fixture@example.invalid" },
        }),
      ),
    { key: "sb-" + ref + "-auth-token", token, expires },
  );
  await page.route(supabaseUrl + "/**", async (route) => {
    const url = new URL(route.request().url());
    let body;
    if (url.pathname.endsWith("/quotations")) {
      requests.push(url.search);
      if (route.request().method() === "POST") {
        saved = route.request().postDataJSON();
        body = { id: "saved", reference_no: "T-2026-6028-CY" };
      } else if (url.searchParams.get("lookup")) body = lookup;
      else {
        const rows = quotes.filter(
          (q) =>
            !url.searchParams.get("status") ||
            q.status === url.searchParams.get("status"),
        );
        if (url.searchParams.get("search") === "slow")
          await new Promise((r) => setTimeout(r, 650));
        body = { data: rows, total: rows.length };
      }
    } else if (url.pathname.endsWith("/quotations/quote0") && route.request().method() === "PUT") {
      edited = route.request().postDataJSON();
      body = { id: "quote0", reference_no: quotes[0].reference_no };
    } else if (url.pathname.includes("/auth/v1/user"))
      body = {
        id: "fixture-user",
        email: "fixture@example.invalid",
        user_metadata: { full_name: "Mohammad Alotaishan" },
      };
    else if (url.pathname.endsWith("/profiles"))
      body = {
        role: "client",
        client_id: "client",
        approval_status: "approved",
        account_status: "active",
      };
    else if (url.pathname.endsWith("/clients"))
      body = { email: "fixture@example.invalid" };
    else if (url.pathname.endsWith("/notifications")) body = [];
    else body = { tickets: [], data: [], total: 0 };
    await route
      .fulfill({
        status: 200,
        contentType: "application/json",
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "*",
        },
        body: JSON.stringify(body),
      })
      .catch(() => {});
  });
  try {
    await page.goto(
      (process.env.TEST_BASE_URL || "http://localhost:3000") +
        "/client-dashboard/quotations",
    );
    await page
      .locator(".client-quotation-page tbody tr")
      .filter({ hasText: "T-2026-6027-CY" })
      .waitFor();
    const out = path.resolve(__dirname, "../../tmp/client-quotation-check");
    fs.mkdirSync(out, { recursive: true });
    console.log(
      "Verified reference typography and colors:",
      await page
        .locator(".client-quotation-page th")
        .first()
        .evaluate((e) => ({
          color: getComputedStyle(e).color,
          background: getComputedStyle(e).backgroundColor,
          padding: getComputedStyle(e).padding,
          font: getComputedStyle(e).fontFamily,
        })),
    );
    await page.screenshot({
      path: path.join(out, "desktop.png"),
      fullPage: true,
    });
    const pending = page.locator(".client-quotation-page tbody tr").filter({ hasText: quotes[0].reference_no });
    assert.equal(await page.locator('.client-quotation-page button[title="Edit"]').count(), 1, "Only pending client quotations have Edit");
    await pending.getByTitle("Edit", { exact: true }).click();
    await page.locator(".invoice-dialog").waitFor();
    await page.getByPlaceholder("Search country").fill("Cyprus");
    await page.locator(".invoice-dialog .search-multi").filter({ hasText: "Country" }).getByRole("checkbox", { name: "Cyprus", exact: true }).check();
    assert.equal(await page.getByRole("checkbox", { name: "Cyprus", exact: true }).isVisible(), false, "Selection closes searchable fee dropdown");
    await page.getByPlaceholder("Enter reference and attention details...").fill("Updated client matter");
    await page.screenshot({ path: path.join(out, "edit-pending.png"), fullPage: true });
    await page.getByTitle("Update Quotation", { exact: true }).click();
    await page.locator(".invoice-dialog").waitFor({ state: "hidden" });
    assert.equal(edited.items.length, 1, "Editing preserves the existing cart without duplication");
    assert.equal(edited.client_id, client.id);
    assert.equal(edited.client_matter_ref, "Updated client matter");
    assert.equal(saved, undefined, "Editing uses PUT rather than creating another invoice");
    const header = await page.locator(".client-fee-selection h2").evaluate(e => ({ background: getComputedStyle(e).backgroundColor, color: getComputedStyle(e).color }));
    assert.deepEqual(header, { background: "rgb(37, 169, 194)", color: "rgb(255, 255, 255)" });
    const before = requests.filter((q) =>
      new URLSearchParams(q).get("lookup"),
    ).length;
    await page.getByRole("tab", { name: "Approved", exact: true }).click();
    await page.waitForTimeout(500);
    await page.getByRole("tab", { name: "All", exact: true }).click();
    await page.waitForTimeout(500);
    assert.equal(
      requests.filter((q) => new URLSearchParams(q).get("lookup")).length,
      before,
      "Filters must not reload fee lookup",
    );
    const search = page.getByPlaceholder(
      "Search invoice, client, country, procedure...",
    );
    const count = requests.length;
    await search.fill("s");
    await search.fill("sl");
    await search.fill("slow");
    await page.waitForTimeout(350);
    await search.fill("latest");
    await page.waitForTimeout(1100);
    assert.equal(
      requests
        .slice(count)
        .filter(
          (q) =>
            new URLSearchParams(q).get("search") === "s" ||
            new URLSearchParams(q).get("search") === "sl",
        ).length,
      0,
      "Search must debounce",
    );
    await search.fill("");
    await page.waitForTimeout(400);
    await page
      .getByRole("combobox", { name: "Country", exact: true })
      .selectOption("cy");
    await page.locator(".client-procedure-field summary").click();
    await page
      .getByRole("checkbox", { name: "Registration", exact: true })
      .check();
    assert.equal(await page.locator(".client-procedure-field details").getAttribute("open"), null, "Selecting a procedure closes its menu");
    await page.locator(".client-procedure-field summary").click();
    await page.keyboard.press("Escape");
    assert.equal(await page.locator(".client-procedure-field details").getAttribute("open"), null);
    await page
      .getByRole("combobox", { name: "Type of class", exact: true })
      .selectOption("Per mark per class");
    await page.getByRole("spinbutton", { name: "Number of classes" }).fill("7");
    await page.locator(".client-fee-selection button[type=submit]").click();
    await page
      .getByRole("dialog", { name: "Submit quotation", exact: true })
      .waitFor();
    assert.equal(
      await page
        .locator(".client-quotation-preview .quotation-fees tbody tr")
        .count(),
      7,
    );
    assert.match(
      await page
        .locator(".client-quotation-preview .quotation-due")
        .innerText(),
      /2,415.00/,
    );
    assert.match(
      await page
        .locator(".client-quotation-preview .quotation-requirements")
        .innerText(),
      /signed POA/,
    );
    assert.equal(
      await page
        .locator(".client-quotation-preview th")
        .filter({ hasText: "VAT" })
        .count(),
      0,
    );
    assert.equal(
      await page
        .locator(".client-quotation-preview .quotation-footer-frame")
        .isVisible(),
      false,
    );
    assert.equal(
      await page
        .locator(".client-quotation-preview")
        .evaluate((e) => e.scrollWidth > e.clientWidth),
      false,
      "Preview columns must fit the dialog",
    );
    await page.screenshot({
      path: path.join(out, "submit-preview.png"),
      fullPage: true,
    });
    await page
      .locator(".client-quotation-preview footer button[type=submit]")
      .click();
    await page.locator(".quotation-success").waitFor();
    assert.equal(saved.items.length, 1);
    assert.equal(saved.items[0].class_count, 7);
    assert.equal(saved.items[0].official_fee, 1225);
    assert.equal(saved.items[0].attorney_fee, 1190);
    assert.deepEqual(saved.items[0].requirement_ids, ["r"]);
    await page.reload();
    await page.locator(".client-fee-selection").waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    await page.screenshot({
      path: path.join(out, "mobile.png"),
      fullPage: true,
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
      false,
      "Page must fit mobile width",
    );
    await page.setViewportSize({ width: 1440, height: 1050 });
    for (const [route, selector] of [
      ["overview", ".panel-title"], ["notifications", ".panel-title"],
      ["fees", ".client-table th"], ["invoices", ".panel-title"],
      ["projects", ".client-project-card > header"],
      ["requirements", ".country-table-wrap th"], ["settings", ".account-modal > header"],
      ["customer-service", ".client-conversation-list > header"],
    ]) {
      await page.goto((process.env.TEST_BASE_URL || "http://localhost:3000") + "/client-dashboard/" + route);
      await page.locator(selector).first().waitFor();
      assert.equal(await page.locator(selector).first().evaluate(e => getComputedStyle(e).backgroundColor), "rgb(37, 169, 194)", route + " shares the reference card header");
    }
    assert.deepEqual(errors, []);
    console.log(
      "Client browser checks passed: pending-only editing, PUT save, dropdown dismissal, eight page headers, catalog reuse, preview, mock submission, mobile width.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
