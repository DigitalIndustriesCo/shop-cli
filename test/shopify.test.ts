import { describe, expect, it } from "vitest";

import { assertNoUserErrors } from "../src/shopify";

describe("assertNoUserErrors", () => {
  it("passes an empty or absent payload through", () => {
    expect(() => assertNoUserErrors("productUpdate", [])).not.toThrow();
    expect(() => assertNoUserErrors("productUpdate", undefined)).not.toThrow();
  });

  it("names the mutation and the rejected field path", () => {
    expect(() =>
      assertNoUserErrors("productSet", [{ field: ["input", "variants", "0", "price"], message: "is invalid" }]),
    ).toThrow("productSet: input.variants.0.price: is invalid");
  });

  it("omits the prefix when the error is about the operation rather than an input", () => {
    expect(() => assertNoUserErrors("productSet", [{ message: "Product not found" }])).toThrow(
      "productSet: Product not found",
    );
    expect(() => assertNoUserErrors("productSet", [{ field: [], message: "Product not found" }])).toThrow(
      "productSet: Product not found",
    );
    expect(() => assertNoUserErrors("productSet", [{ field: null, message: "Product not found" }])).toThrow(
      "productSet: Product not found",
    );
  });

  it("falls back when a message is absent", () => {
    expect(() => assertNoUserErrors("productSet", [{ field: ["handle"] }])).toThrow(
      "productSet: handle: unknown error",
    );
  });

  it("joins every error in the payload", () => {
    expect(() =>
      assertNoUserErrors("productSet", [
        { field: ["handle"], message: "is taken" },
        { message: "quota exceeded" },
      ]),
    ).toThrow("productSet: handle: is taken; quota exceeded");
  });
});
