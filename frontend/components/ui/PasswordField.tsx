"use client";

import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";

type PasswordFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  autoComplete: string;
};

/** Labelled password input with a show/hide toggle, shared by the profile forms. */
export default function PasswordField({
  label,
  value,
  onChange,
  placeholder,
  autoComplete,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <label className="block text-sm">
      <span className="mb-1 block text-[var(--muted)]">{label}</span>
      <div className="relative">
        <input
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required
          className="w-full rounded-lg border border-[var(--border)] bg-[rgba(11,18,32,0.6)] px-3 py-2 pr-10 text-sm outline-none focus:border-[var(--accent)]"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-[var(--muted)] transition hover:text-white"
        >
          <FontAwesomeIcon icon={visible ? faEyeSlash : faEye} className="h-4 w-4" />
        </button>
      </div>
    </label>
  );
}
