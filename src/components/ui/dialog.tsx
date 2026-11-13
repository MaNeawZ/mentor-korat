"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
export function Modal({
  title,
  description,
  open,
  onOpenChange,
  children,
}: {
  title: string;
  description?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content className="modal">
          <div className="modal-title">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close aria-label="ปิด">
              <X size={20} />
            </Dialog.Close>
          </div>
          <Dialog.Description>
            {description || "ตรวจสอบข้อมูลให้ถูกต้องก่อนยืนยัน"}
          </Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
