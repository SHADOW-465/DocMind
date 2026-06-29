import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SummaryCard } from "@/components/SummaryCard";
import type { SummaryPoint } from "@/lib/types";

const pt: SummaryPoint = {
  id: "p1", text: "Plain point.", anchorSentence: "Original source sentence.",
  page: 3, bboxes: [[1, 2, 3, 4]], confidence: 0.75, themeId: "t1",
};

describe("SummaryCard", () => {
  it("renders text, page, and a confidence bar", () => {
    render(<SummaryCard point={pt} active={false} onActivate={() => {}} />);
    expect(screen.getByText("Plain point.")).toBeInTheDocument();
    expect(screen.getByText(/p\.?\s*3/i)).toBeInTheDocument();
    expect(screen.getByTestId("confidence-bar")).toHaveStyle({ width: "75%" });
  });

  it("calls onActivate when clicked", () => {
    const onActivate = vi.fn();
    render(<SummaryCard point={pt} active={false} onActivate={onActivate} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onActivate).toHaveBeenCalledWith("p1");
  });

  it("shows the anchor sentence when expanded", () => {
    render(<SummaryCard point={pt} active onActivate={() => {}} />);
    expect(screen.getByText("Original source sentence.")).toBeInTheDocument();
  });
});
