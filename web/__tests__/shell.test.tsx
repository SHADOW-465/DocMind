import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { RecentDocCard } from "@/components/RecentDocCard";
import { AppShell } from "@/components/AppShell";

beforeEach(() => {
  document.documentElement.dataset.theme = "dark";
  localStorage.clear();
});

describe("ThemeToggle", () => {
  it("flips the root data-theme and persists it", () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole("button"));
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("lucent-theme")).toBe("light");
    fireEvent.click(screen.getByRole("button"));
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});

describe("RecentDocCard", () => {
  const doc = { docId: "d1", filename: "paper.pdf", addedAt: Date.now(), pageCount: 12, pointCount: 9 };

  it("shows metadata and opens on click", () => {
    const onOpen = vi.fn();
    render(<RecentDocCard doc={doc} onOpen={onOpen} onDelete={() => {}} />);
    expect(screen.getByText("paper.pdf")).toBeInTheDocument();
    expect(screen.getByText(/12 pp · 9 points/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Open paper.pdf"));
    expect(onOpen).toHaveBeenCalledWith("d1");
  });

  it("removes without opening", () => {
    const onOpen = vi.fn();
    const onDelete = vi.fn();
    render(<RecentDocCard doc={doc} onOpen={onOpen} onDelete={onDelete} />);
    fireEvent.click(screen.getByLabelText("Remove paper.pdf"));
    expect(onDelete).toHaveBeenCalledWith("d1");
    expect(onOpen).not.toHaveBeenCalled();
  });
});

describe("AppShell", () => {
  it("navigates from the rail", () => {
    const onNavigate = vi.fn();
    render(<AppShell view="home" onNavigate={onNavigate}><p>body</p></AppShell>);
    fireEvent.click(screen.getByLabelText("Library"));
    expect(onNavigate).toHaveBeenCalledWith("library");
    expect(screen.getByText("body")).toBeInTheDocument();
  });
});
