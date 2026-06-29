import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ checkHealth: vi.fn(), summarize: vi.fn() }));
vi.mock("@/components/PdfCanvas", () => ({ PdfCanvas: () => null }));
vi.mock("@/components/BeamOverlay", () => ({ BeamOverlay: () => null }));

import Home from "@/app/page";
import { checkHealth } from "@/lib/api";

beforeEach(() => vi.clearAllMocks());

describe("health gating", () => {
  it("shows service-unavailable when health is down", async () => {
    (checkHealth as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    render(<Home />);
    await waitFor(() => expect(screen.getByText(/unavailable/i)).toBeInTheDocument());
  });

  it("enables the upload zone when health is ok", async () => {
    (checkHealth as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    render(<Home />);
    await waitFor(() => expect(screen.getByText(/Drop a PDF here/i)).toBeInTheDocument());
  });
});
