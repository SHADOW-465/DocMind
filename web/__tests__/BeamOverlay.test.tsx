import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { BeamOverlay } from "@/components/BeamOverlay";

function rect(left: number, top: number): DOMRect {
  return { left, top, right: left + 100, bottom: top + 20, width: 100, height: 20, x: left, y: top, toJSON: () => ({}) } as DOMRect;
}

describe("BeamOverlay", () => {
  it("renders a path when an active card+highlight pair is provided", () => {
    const card = document.createElement("button");
    const hi = document.createElement("div");
    vi.spyOn(card, "getBoundingClientRect").mockReturnValue(rect(600, 100));
    vi.spyOn(hi, "getBoundingClientRect").mockReturnValue(rect(100, 300));

    const { container } = render(
      <BeamOverlay activeId="p1" cardEl={card} highlightEl={hi} />,
    );
    const path = container.querySelector("path");
    expect(path).not.toBeNull();
    expect(path!.getAttribute("d")).toMatch(/^M /);
  });

  it("renders nothing when no active pair", () => {
    const { container } = render(<BeamOverlay activeId={null} cardEl={null} highlightEl={null} />);
    expect(container.querySelector("path")).toBeNull();
  });
});
