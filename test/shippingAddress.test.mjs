import test from "node:test";
import assert from "node:assert/strict";
import { shippingAddressError } from "../validators/orderValidators.js";

test("accepts valid address with first and last name", () => {
  assert.equal(
    shippingAddressError({
      firstName: "Ada",
      lastName: "Lovelace",
      phone: "9876543210",
      address: "12 Brigade Road",
      city: "Bengaluru",
      state: "KA",
      pincode: "560001",
    }),
    null
  );
});

test("accepts valid address with fullName only", () => {
  assert.equal(
    shippingAddressError({
      fullName: "Ada Lovelace",
      phone: "9876543210",
      address: "12 Brigade Road",
      city: "Bengaluru",
      state: "KA",
      pincode: "560001",
    }),
    null
  );
});

test("rejects invalid phone", () => {
  assert.ok(
    shippingAddressError({
      fullName: "Ada Lovelace",
      phone: "12345",
      address: "12 Brigade Road",
      city: "Bengaluru",
      state: "KA",
      pincode: "560001",
    })
  );
});

test("rejects invalid pincode", () => {
  assert.ok(
    shippingAddressError({
      fullName: "Ada Lovelace",
      phone: "9876543210",
      address: "12 Brigade Road",
      city: "Bengaluru",
      state: "KA",
      pincode: "56001",
    })
  );
});
