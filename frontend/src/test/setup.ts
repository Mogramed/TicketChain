import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach } from "vitest";

beforeEach(() => {
  window.localStorage.setItem("chainticket.onboarding-seen", "true");
});

afterEach(() => {
  window.localStorage.clear();
});
