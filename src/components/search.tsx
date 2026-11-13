"use client";
import { useRef } from "react";
import { Search } from "lucide-react";
export function SearchInput({
  value = "",
  placeholder = "ค้นหาชื่อ รหัสพนักงาน หรือเลขที่ใบลา",
}: {
  value?: string;
  placeholder?: string;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  return (
    <div className="input-icon search">
      <Search size={17} />
      <input
        aria-label={placeholder}
        name="q"
        defaultValue={value}
        placeholder={placeholder}
        onChange={(e) => {
          const form = e.currentTarget.form;
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => form?.requestSubmit(), 500);
        }}
      />
    </div>
  );
}
