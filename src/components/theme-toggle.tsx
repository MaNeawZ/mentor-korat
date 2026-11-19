"use client";
import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function ThemeToggle() {
  const mounted = useSyncExternalStore(
    subscribe,
    clientSnapshot,
    serverSnapshot,
  );
  const { theme, setTheme } = useTheme();
  // Browser storage is unavailable during SSR. Keep the first hydration render
  // identical, then reveal the saved theme once React has attached the button.
  const current = mounted ? theme : undefined;
  return (
    <button
      className="icon-btn"
      disabled={!mounted}
      aria-label={current ? `เปลี่ยนธีม ปัจจุบัน ${current}` : "เปลี่ยนธีม"}
      onClick={() =>
        setTheme(
          current === "light"
            ? "dark"
            : current === "dark"
              ? "system"
              : "light",
        )
      }
    >
      {current === "dark" ? (
        <Moon size={19} />
      ) : current === "light" ? (
        <Sun size={19} />
      ) : (
        <Monitor size={19} />
      )}
    </button>
  );
}
