import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { AppRouter } from "./AppRouter";

describe("AppRouter lazy loading", () => {
  it("shows a suspense fallback before rendering lazy routes", async () => {
    render(
      <MemoryRouter initialEntries={["/not-a-real-route"]}>
        <AppRouter />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("route-loading")).toBeInTheDocument();
    expect(await screen.findByText(/Route not found/i)).toBeInTheDocument();
  });
});
