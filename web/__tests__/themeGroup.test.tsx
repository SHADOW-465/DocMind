import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThemeGroup } from "@/components/ThemeGroup";
import type { SummaryPoint, Theme } from "@/lib/types";

const theme: Theme = { id: "t1", label: "Energy", pointIds: ["p1"] };
const points: SummaryPoint[] = [{
  id: "p1", text: "A point.", anchorSentence: "Src.", page: 1,
  bboxes: [[0, 0, 1, 1]], confidence: 0.5, themeId: "t1",
}];

describe("ThemeGroup", () => {
  it("renders the theme label, count, and its points", () => {
    render(<ThemeGroup theme={theme} points={points} activeId={null}
      onActivate={() => {}} cardRefs={{ current: new Map() }} />);
    expect(screen.getByText("Energy")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("A point.")).toBeInTheDocument();
  });
});
