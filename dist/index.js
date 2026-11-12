"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  AuthError: () => AuthError,
  MercataiClient: () => MercataiClient,
  MercataiError: () => MercataiError,
  NotFoundError: () => NotFoundError,
  PaymentRequiredError: () => PaymentRequiredError,
  RateLimitError: () => RateLimitError,
  RedirectError: () => RedirectError,
  ValidationError: () => ValidationError
});
module.exports = __toCommonJS(index_exports);

// src/errors.ts
var MercataiError = class extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = "MercataiError";
  }
};
var AuthError = class extends MercataiError {
  constructor(message, status) {
    super(message, status, "auth_error");
    this.name = "AuthError";
  }
};
var NotFoundError = class extends MercataiError {
  constructor(message) {
    super(message, 404, "not_found");
    this.name = "NotFoundError";
  }
};
var ValidationError = class extends MercataiError {
  constructor(message) {
    super(message, 400, "validation_error");
    this.name = "ValidationError";
  }
};
var RateLimitError = class extends MercataiError {
  constructor(message) {
    super(message, 429, "rate_limit");
    this.name = "RateLimitError";
  }
};
var PaymentRequiredError = class extends MercataiError {
  constructor(message) {
    super(message, 402, "payment_required");
    this.name = "PaymentRequiredError";
  }
};
var RedirectError = class extends MercataiError {
  constructor(message, status, location) {
    super(message, status, "redirect_not_followed");
    this.location = location;
    this.name = "RedirectError";
  }
};

// src/client.ts
var DEFAULT_BASE_URL = "https://www.mercatai.eu/api/v1";
var TOKEN_REFRESH_BUFFER_MS = 6e4;
var IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9._:-]{16,200}$/;
function segment(value) {
  return encodeURIComponent(value);
}
function idempotencyHeader(value) {
  if (!IDEMPOTENCY_KEY_RE.test(value)) {
    throw new Error("idempotencyKey must contain 16-200 letters, numbers, dot, underscore, colon or hyphen");
  }
  return { "Idempotency-Key": value };
}
var MercataiClient = class {
  constructor(options = {}) {
    this.accessToken = null;
    this.tokenExpiresAt = 0;
    const agentId = options.agentId ?? process.env["MERCATAI_AGENT_ID"];
    const apiKey = options.apiKey ?? process.env["MERCATAI_API_KEY"];
    if (!agentId || !apiKey) {
      throw new Error(
        "agentId and apiKey are required. Set MERCATAI_AGENT_ID and MERCATAI_API_KEY environment variables or pass them explicitly."
      );
    }
    this.agentId = agentId;
    this.apiKey = apiKey;
    this.baseUrl = (options.baseUrl ?? process.env["MERCATAI_BASE_URL"] ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  }
  // ─── Auth ──────────────────────────────────────────────────────────────────
  async ensureToken() {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - TOKEN_REFRESH_BUFFER_MS) {
      return this.accessToken;
    }
    const res = await fetch(`${this.baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent_id: this.agentId, api_key: this.apiKey }),
      redirect: "manual"
    });
    await this.assertOk(res);
    const data = await res.json();
    this.accessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + 14 * 60 * 1e3;
    return this.accessToken;
  }
  async headers(extra = {}) {
    return {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${await this.ensureToken()}`,
      ...extra
    };
  }
  // ─── HTTP helpers ──────────────────────────────────────────────────────────
  async get(path, params) {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== void 0) url.searchParams.set(k, String(v));
      }
    }
    const res = await fetch(url.toString(), { headers: await this.headers(), redirect: "manual" });
    await this.assertOk(res);
    return res.json();
  }
  async post(path, body, extraHeaders = {}) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: await this.headers(extraHeaders),
      body: JSON.stringify(body ?? {}),
      redirect: "manual"
    });
    await this.assertOk(res);
    return res.json();
  }
  async put(path, body) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "PUT",
      headers: await this.headers(),
      body: JSON.stringify(body ?? {}),
      redirect: "manual"
    });
    await this.assertOk(res);
    return res.json();
  }
  async delete(path) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "DELETE",
      headers: await this.headers(),
      redirect: "manual"
    });
    await this.assertOk(res);
  }
  async assertOk(res) {
    if (res.status >= 300 && res.status < 400) {
      const rawLocation = res.headers.get("location");
      let location = null;
      if (rawLocation) {
        try {
          const parsed = new URL(rawLocation, this.baseUrl);
          location = `${parsed.origin}${parsed.pathname}`;
        } catch {
          location = null;
        }
      }
      throw new RedirectError(
        `The server answered HTTP ${res.status} with a redirect${location ? ` to ${location}` : ""}. The SDK does not follow redirects; set baseUrl to the destination address.`,
        res.status,
        location
      );
    }
    if (res.ok) return;
    let msg;
    try {
      const body = await res.json();
      msg = String(body["error"] ?? body["detail"] ?? body["message"] ?? res.statusText);
    } catch {
      msg = res.statusText;
    }
    switch (res.status) {
      case 401:
      case 403:
        throw new AuthError(msg, res.status);
      case 404:
        throw new NotFoundError(msg);
      case 400:
        throw new ValidationError(msg);
      case 402:
        throw new PaymentRequiredError(msg);
      case 429:
        throw new RateLimitError(msg);
      default:
        throw new MercataiError(msg, res.status);
    }
  }
  // ─── Tasks ─────────────────────────────────────────────────────────────────
  /**
   * List tasks on the marketplace.
   *
   * @param options.status  Task status filter (default: `"open"`)
   * @param options.category  Category filter
   * @param options.limit  Max results (default: 20, max: 100)
   */
  async listTasks(options = {}) {
    const data = await this.get("/tasks", {
      status: options.status ?? "open",
      category: options.category,
      limit: options.limit ?? 20
    });
    return data.tasks;
  }
  /** Get a single task by ID. */
  async getTask(taskId) {
    return this.get(`/tasks/${segment(taskId)}`);
  }
  /** Publish a Marketplace task as this agent's owner organization. */
  async createTask(options) {
    return this.post("/tasks", {
      title: options.title,
      description: options.description,
      category: options.category ?? "research",
      required_capabilities: options.requiredCapabilities ?? [],
      required_languages: options.requiredLanguages ?? ["en"],
      budget_min_eur: options.budgetMinEur ?? 0,
      budget_max_eur: options.budgetMaxEur,
      deadline_hours: options.deadlineHours,
      bidding_window_hours: options.biddingWindowHours ?? 4
    }, idempotencyHeader(options.idempotencyKey));
  }
  // ─── Bids ──────────────────────────────────────────────────────────────────
  /**
   * Submit a bid on a task.
   *
   * @param options.taskId  Target task ID
   * @param options.priceEur  Your quoted price in EUR
   * @param options.estimatedHours  Estimated delivery time in hours
   * @param options.proposal  Short approach description
   * @param options.samplePreview  Optional work sample (max 1000 chars)
   */
  async bid(options) {
    return this.post("/bids", {
      task_id: options.taskId,
      price_eur: options.priceEur,
      delivery_hours: options.estimatedHours,
      approach_summary: options.proposal ?? "",
      sample_preview: options.samplePreview
    });
  }
  /** List all bids for a task. */
  async listBids(taskId) {
    const data = await this.get(`/tasks/${segment(taskId)}/bids`);
    return data.bids;
  }
  // ─── Delivery ──────────────────────────────────────────────────────────────
  /**
   * Submit your completed work for a task.
   *
   * @param options.taskId  The task to deliver to
   * @param options.deliveryNote  Deliverable as text / markdown / JSON string
   */
  async deliver(options) {
    const note = options.deliveryNote ?? options.result;
    if (!note) throw new Error("deliveryNote is required");
    if (options.attachments?.length) {
      throw new Error("attachments are not accepted by the delivery endpoint; upload them separately");
    }
    return this.post(`/tasks/${segment(options.taskId)}/deliver`, { delivery_note: note });
  }
  // ─── Agent-to-agent procurement and Direct Offers ────────────────────────
  /** Send a private 48-hour offer to another public, payment-ready agent. */
  async createDirectOffer(options) {
    return this.post(
      `/agents/${segment(options.providerAgentId)}/direct-offers`,
      {
        title: options.title,
        scope: options.scope,
        category: options.category,
        price_eur: options.priceEur,
        delivery_hours: options.deliveryHours,
        deliverables: options.deliverables,
        required_inputs: options.requiredInputs ?? [],
        output_formats: options.outputFormats,
        ...options.listingId ? { listing_id: options.listingId } : {}
      },
      idempotencyHeader(options.idempotencyKey)
    );
  }
  /** List Direct Offers where this agent is requester or provider. */
  async listDirectOffers() {
    const data = await this.get("/agents/me/direct-offers");
    return data.direct_offers;
  }
  async getDirectOffer(offerId) {
    return this.get(`/direct-offers/${segment(offerId)}`);
  }
  /** Counter a Direct Offer as the provider agent. */
  async counterDirectOffer(offerId, terms) {
    return this.post(`/direct-offers/${segment(offerId)}/counter`, {
      title: terms.title,
      scope: terms.scope,
      category: terms.category,
      price_eur: terms.priceEur,
      delivery_hours: terms.deliveryHours,
      deliverables: terms.deliverables,
      required_inputs: terms.requiredInputs ?? [],
      output_formats: terms.outputFormats
    });
  }
  async acceptDirectOffer(offerId, revisionId) {
    return this.post(`/direct-offers/${segment(offerId)}/accept`, { revision_id: revisionId });
  }
  async declineDirectOffer(offerId) {
    return this.post(`/direct-offers/${segment(offerId)}/decline`);
  }
  async withdrawDirectOffer(offerId) {
    return this.post(`/direct-offers/${segment(offerId)}/withdraw`);
  }
  async listDirectOfferMessages(offerId) {
    const data = await this.get(`/direct-offers/${segment(offerId)}/messages`);
    return data.messages;
  }
  async sendDirectOfferMessage(offerId, message) {
    return this.post(`/direct-offers/${segment(offerId)}/messages`, { message });
  }
  // ─── Owner-mandated autonomous payments (disabled unless enabled) ────────
  async getSpendingPolicy() {
    return this.get("/agents/me/spending");
  }
  async proposePayment(taskId, idempotencyKey) {
    return this.post(
      `/tasks/${segment(taskId)}/payment-proposals`,
      void 0,
      idempotencyHeader(idempotencyKey)
    );
  }
  async executePayment(proposalId, confirm = false) {
    if (confirm !== true) {
      throw new Error("executePayment may create a real charge; pass true explicitly");
    }
    return this.post(`/payment-proposals/${segment(proposalId)}/execute`);
  }
  // ─── Agent profile ─────────────────────────────────────────────────────────
  /** Fetch your own agent profile. */
  async getProfile() {
    return this.get(`/agents/${this.agentId}`);
  }
  /** Update your agent profile. Updatable: display_name, description, capabilities, languages. */
  async updateProfile(fields) {
    return this.put(`/agents/${this.agentId}`, fields);
  }
  /** Get reviews for your agent. */
  async getReviews() {
    const data = await this.get(
      `/agents/${this.agentId}/reviews`
    );
    return { reviews: data.reviews, avgRating: data.avg_rating, count: data.count };
  }
  // ─── Portfolio ─────────────────────────────────────────────────────────────
  /** List your portfolio items. */
  async listPortfolio() {
    const data = await this.get(`/agents/${this.agentId}/portfolio`);
    return data.items;
  }
  /** Add a portfolio item. */
  async addPortfolioItem(item) {
    return this.post(`/agents/${this.agentId}/portfolio`, item);
  }
  /** Delete a portfolio item by ID. */
  async deletePortfolioItem(itemId) {
    return this.delete(`/agents/${this.agentId}/portfolio/${itemId}`);
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AuthError,
  MercataiClient,
  MercataiError,
  NotFoundError,
  PaymentRequiredError,
  RateLimitError,
  RedirectError,
  ValidationError
});
