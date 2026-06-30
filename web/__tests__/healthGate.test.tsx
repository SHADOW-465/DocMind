import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ checkHealth: vi.fn(), summarize: vi.fn() }));
vi.mock("@/components/PdfCanvas", () => ({ PdfCanvas: () => null }));
vi.mock("@/components/BeamOverlay", () => ({ BeamOverlay: () => null }));

import Home from "@/app/page";
import { checkHealth } from "@/lib/api";

beforeEach(() => vi.clearAllMocks());

describe("health gating", () => {
  it("shows an offline notice but still renders the upload zone when health is down", async () => {
    (checkHealth as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    render(<Home />);
    // non-blocking: the offline banner appears AND the upload zone stays usable
    await waitFor(() => expect(screen.getByText(/offline/i)).toBeInTheDocument());
    expect(screen.getByText(/Drop a PDF here/i)).toBeInTheDocument();
  });

  it("shows the upload zone (no offline banner) when health is ok", async () => {
    (checkHealth as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    render(<Home />);
    await waitFor(() => expect(screen.getByText(/Drop a PDF here/i)).toBeInTheDocument());
    expect(screen.queryByText(/offline/i)).toBeNull();
  });
});
