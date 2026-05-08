import { useState, useRef, useEffect, useMemo, useCallback } from "react";

export type ComboboxOption = {
  value: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
};

type ComboboxProps = {
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  loading?: boolean;
  emptyMessage?: string;
  className?: string;
};

export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Selecione...",
  searchPlaceholder = "Buscar...",
  disabled = false,
  loading = false,
  emptyMessage = "Nenhum resultado encontrado",
  className = "",
}: ComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedOption = options.find((o) => o.value === value);

  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options;
    const lower = search.toLowerCase();
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(lower) ||
        o.description?.toLowerCase().includes(lower)
    );
  }, [options, search]);

  const handleSelect = useCallback(
    (optValue: string) => {
      onChange(optValue);
      setIsOpen(false);
      setSearch("");
    },
    [onChange]
  );

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!isOpen) return;
      if (e.key === "Escape") {
        setIsOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  return (
    <div ref={containerRef} className={`combobox ${className}`}>
      <button
        type="button"
        className={`combobox-trigger ${isOpen ? "is-open" : ""}`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="combobox-trigger-content">
          {selectedOption?.icon && (
            <span className="combobox-trigger-icon">{selectedOption.icon}</span>
          )}
          <span className="combobox-trigger-label">
            {loading ? "Carregando..." : selectedOption?.label || placeholder}
          </span>
        </span>
        <svg
          className={`combobox-chevron ${isOpen ? "is-open" : ""}`}
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
        >
          <path
            d="M4 6L8 10L12 6"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="combobox-dropdown">
          <div className="combobox-search-wrap">
            <svg className="combobox-search-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M11 11L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              className="combobox-search"
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="combobox-options" role="listbox">
            {filteredOptions.length === 0 ? (
              <div className="combobox-empty">{emptyMessage}</div>
            ) : (
              filteredOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={opt.value === value}
                  className={`combobox-option ${opt.value === value ? "is-selected" : ""} ${
                    opt.disabled ? "is-disabled" : ""
                  }`}
                  onClick={() => !opt.disabled && handleSelect(opt.value)}
                  disabled={opt.disabled}
                >
                  {opt.icon && <span className="combobox-option-icon">{opt.icon}</span>}
                  <span className="combobox-option-content">
                    <span className="combobox-option-label">{opt.label}</span>
                    {opt.description && (
                      <span className="combobox-option-desc">{opt.description}</span>
                    )}
                  </span>
                  {opt.value === value && (
                    <svg className="combobox-check" width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M3 8L6.5 11.5L13 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Country flags helper
const FLAGS: Record<string, string> = {
  BR: "\u{1F1E7}\u{1F1F7}",
  US: "\u{1F1FA}\u{1F1F8}",
  AR: "\u{1F1E6}\u{1F1F7}",
  MX: "\u{1F1F2}\u{1F1FD}",
  CO: "\u{1F1E8}\u{1F1F4}",
  CL: "\u{1F1E8}\u{1F1F1}",
  PE: "\u{1F1F5}\u{1F1EA}",
  UY: "\u{1F1FA}\u{1F1FE}",
  EC: "\u{1F1EA}\u{1F1E8}",
  VE: "\u{1F1FB}\u{1F1EA}",
  PY: "\u{1F1F5}\u{1F1FE}",
  BO: "\u{1F1E7}\u{1F1F4}",
  PT: "\u{1F1F5}\u{1F1F9}",
  ES: "\u{1F1EA}\u{1F1F8}",
  DE: "\u{1F1E9}\u{1F1EA}",
  FR: "\u{1F1EB}\u{1F1F7}",
  IT: "\u{1F1EE}\u{1F1F9}",
  GB: "\u{1F1EC}\u{1F1E7}",
  CA: "\u{1F1E8}\u{1F1E6}",
  AU: "\u{1F1E6}\u{1F1FA}",
  JP: "\u{1F1EF}\u{1F1F5}",
  CN: "\u{1F1E8}\u{1F1F3}",
  IN: "\u{1F1EE}\u{1F1F3}",
  RU: "\u{1F1F7}\u{1F1FA}",
  ZA: "\u{1F1FF}\u{1F1E6}",
  KR: "\u{1F1F0}\u{1F1F7}",
  NL: "\u{1F1F3}\u{1F1F1}",
  BE: "\u{1F1E7}\u{1F1EA}",
  CH: "\u{1F1E8}\u{1F1ED}",
  AT: "\u{1F1E6}\u{1F1F9}",
  SE: "\u{1F1F8}\u{1F1EA}",
  NO: "\u{1F1F3}\u{1F1F4}",
  DK: "\u{1F1E9}\u{1F1F0}",
  FI: "\u{1F1EB}\u{1F1EE}",
  PL: "\u{1F1F5}\u{1F1F1}",
  CZ: "\u{1F1E8}\u{1F1FF}",
  HU: "\u{1F1ED}\u{1F1FA}",
  GR: "\u{1F1EC}\u{1F1F7}",
  TR: "\u{1F1F9}\u{1F1F7}",
  IL: "\u{1F1EE}\u{1F1F1}",
  AE: "\u{1F1E6}\u{1F1EA}",
  SA: "\u{1F1F8}\u{1F1E6}",
  TH: "\u{1F1F9}\u{1F1ED}",
  SG: "\u{1F1F8}\u{1F1EC}",
  MY: "\u{1F1F2}\u{1F1FE}",
  ID: "\u{1F1EE}\u{1F1E9}",
  PH: "\u{1F1F5}\u{1F1ED}",
  VN: "\u{1F1FB}\u{1F1F3}",
  NZ: "\u{1F1F3}\u{1F1FF}",
  IE: "\u{1F1EE}\u{1F1EA}",
  NG: "\u{1F1F3}\u{1F1EC}",
  EG: "\u{1F1EA}\u{1F1EC}",
  KE: "\u{1F1F0}\u{1F1EA}",
  CR: "\u{1F1E8}\u{1F1F7}",
  PA: "\u{1F1F5}\u{1F1E6}",
  DO: "\u{1F1E9}\u{1F1F4}",
  GT: "\u{1F1EC}\u{1F1F9}",
  HN: "\u{1F1ED}\u{1F1F3}",
  SV: "\u{1F1F8}\u{1F1FB}",
  NI: "\u{1F1F3}\u{1F1EE}",
  CU: "\u{1F1E8}\u{1F1FA}",
  PR: "\u{1F1F5}\u{1F1F7}",
};

export function getCountryFlag(code: string): string {
  return FLAGS[code.toUpperCase()] || "";
}

// Category icons
const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  "": (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  "gift-cards": (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="4" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 4V14M1 7H15" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 4C5 4 5 2 8 2C11 2 11 4 11 4" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  "mobile-top-ups": (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="4" y="1" width="8" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8" cy="12" r="1" fill="currentColor" />
    </svg>
  ),
  games: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="4" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="5" cy="8" r="1.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="11" cy="8" r="1.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  utilities: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 1L8 4M8 12L8 15M1 8L4 8M12 8L15 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  entertainment: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6.5 5.5L11 8L6.5 10.5V5.5Z" fill="currentColor" />
    </svg>
  ),
  travel: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 14C8 14 13 10 13 6C13 3.23858 10.7614 1 8 1C5.23858 1 3 3.23858 3 6C3 10 8 14 8 14Z" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8" cy="6" r="2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
};

export function getCategoryIcon(slug: string): React.ReactNode {
  return CATEGORY_ICONS[slug] || CATEGORY_ICONS[""];
}
