import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  theme: undefined as string | undefined,
  setTheme: vi.fn(),
}));
vi.mock("next-themes", () => ({ useTheme: () => state }));
import { ThemeToggle } from "../src/components/theme-toggle";

beforeEach(() => {
  state.theme = undefined;
});
it("renders identical initial HTML regardless of the browser's saved theme", () => {
  const serverHtml = renderToStaticMarkup(createElement(ThemeToggle));
  for (const theme of ["light", "dark", "system"]) {
    state.theme = theme;
    expect(renderToStaticMarkup(createElement(ThemeToggle))).toBe(serverHtml);
  }
  expect(serverHtml).toContain('aria-label="เปลี่ยนธีม"');
  expect(serverHtml).toContain('disabled=""');
  expect(serverHtml).not.toContain("undefined");
});
