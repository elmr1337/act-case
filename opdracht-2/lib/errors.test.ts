import { describe, expect, it } from "vitest";

import { AppError, codeForStatus, humanizeFieldError } from "./errors";

describe("codeForStatus", () => {
  it("vertaalt de statussen die de v4-spec noemt", () => {
    expect(codeForStatus(401)).toBe("unauthorized");
    expect(codeForStatus(404)).toBe("not_found");
    expect(codeForStatus(409)).toBe("conflict");
    expect(codeForStatus(422)).toBe("validation");
    expect(codeForStatus(429)).toBe("rate_limited");
    expect(codeForStatus(500)).toBe("upstream");
  });
});

describe("humanizeFieldError", () => {
  it("vertaalt de Laravel-achtige teksten van Storyteq", () => {
    expect(humanizeFieldError(["The scene_1.headline field is required."])).toBe(
      "Dit veld is verplicht.",
    );
    expect(humanizeFieldError(["The title may not be greater than 40 characters."])).toBe(
      "Dit is te lang — maximaal 40 tekens.",
    );
    expect(humanizeFieldError(["The link must be a valid URL."])).toBe(
      "Dit moet een geldige link zijn.",
    );
  });

  it("valt terug op iets neutraals bij een onbekende tekst", () => {
    expect(humanizeFieldError(["Kaboom in the render farm"])).toBe(
      "Deze waarde klopt nog niet.",
    );
  });
});

describe("AppError", () => {
  it("laat de upstream-tekst nooit in de response-body belanden", () => {
    const error = new AppError("unauthorized", {
      detail: "Token abc123 is revoked for company 42",
    });
    const body = JSON.stringify(error.toResponseBody());

    expect(body).not.toContain("abc123");
    expect(body).not.toContain("company 42");
    expect(error.toResponseBody().error.message).toMatch(/API-sleutel/);
  });

  it("markeert alleen de fouten waar opnieuw proberen zin heeft", () => {
    expect(new AppError("timeout").retryable).toBe(true);
    expect(new AppError("rate_limited").retryable).toBe(true);
    expect(new AppError("config").retryable).toBe(false);
    expect(new AppError("validation").retryable).toBe(false);
  });
});
