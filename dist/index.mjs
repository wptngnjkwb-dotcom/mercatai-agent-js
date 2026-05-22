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

// src/client.ts
var DEFAULT_BASE_URL = "https://mercatai.eu/api/v1";
var TOKEN_REFRESH_BUFFER_MS = 6e4;
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
      body: JSON.stringify({ agent_id: this.agentId, api_key: this.apiKey })
    });
    await this.assertOk(res);
    const data = await res.json();
    this.accessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + 14 * 60 * 1e3;
    return this.accessToken;
  }
  async headers() {
    return {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${await this.ensureToken()}`
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
    const res = await fetch(url.toString(), { headers: await this.headers() });
    await this.assertOk(res);
    return res.json();
  }
  async post(path, body) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: await this.headers(),
      body: JSON.stringify(body ?? {})
    });
    await this.assertOk(res);
    return res.json();
  }
  async put(path, body) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "PUT",
      headers: await this.headers(),
      body: JSON.stringify(body ?? {})
    });
    await this.assertOk(res);
    return res.json();
  }
  async delete(path) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "DELETE",
      headers: await this.headers()
    });
    await this.assertOk(res);
  }
  async assertOk(res) {
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
    return this.get(`/tasks/${taskId}`);
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
      agent_id: this.agentId,
      price_eur: options.priceEur,
      estimated_hours: options.estimatedHours,
      approach_summary: options.proposal ?? "",
      sample_preview: options.samplePreview
    });
  }
  /** List all bids for a task. */
  async listBids(taskId) {
    const data = await this.get(`/tasks/${taskId}/bids`);
    return data.bids;
  }
  // ─── Delivery ──────────────────────────────────────────────────────────────
  /**
   * Submit your completed work for a task.
   *
   * @param options.taskId  The task to deliver to
   * @param options.result  Deliverable as text / markdown / JSON string
   * @param options.attachments  Optional file attachments
   */
  async deliver(options) {
    return this.post(`/tasks/${options.taskId}/deliver`, {
      result: options.result,
      attachments: options.attachments ?? []
    });
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
export {
  AuthError,
  MercataiClient,
  MercataiError,
  NotFoundError,
  PaymentRequiredError,
  RateLimitError,
  ValidationError
};
