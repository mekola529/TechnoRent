import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { AddressSuggestion } from "../utils/addressSearch";
import { searchAddressSuggestions } from "../utils/addressSearch";

interface AddressAutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (suggestion: AddressSuggestion) => void;
  placeholder?: string;
  error?: boolean;
  type?: string;
  className?: string;
  inputClassName?: string;
  minQueryLength?: number;
  debounceMs?: number;
  limit?: number;
}

export default function AddressAutocompleteInput({
  value,
  onChange,
  onSelect,
  placeholder = "",
  error = false,
  type = "text",
  className = "",
  inputClassName = "",
  minQueryLength = 3,
  debounceMs = 400,
  limit = 5,
}: AddressAutocompleteInputProps) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const requestIdRef = useRef(0);
  const selectedValueRef = useRef("");
  const listboxId = useId();

  const normalizedQuery = useMemo(() => value.trim(), [value]);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  useEffect(() => {
    if (selectedValueRef.current && normalizedQuery === selectedValueRef.current) {
      setSuggestions([]);
      setSearchError("");
      setLoading(false);
      setOpen(false);
      setActiveIndex(-1);
      return;
    }

    if (normalizedQuery.length < minQueryLength) {
      setSuggestions([]);
      setSearchError("");
      setLoading(false);
      setOpen(false);
      setActiveIndex(-1);
      return;
    }

    const currentRequestId = ++requestIdRef.current;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setLoading(true);
      setSearchError("");

      try {
        const nextSuggestions = await searchAddressSuggestions(normalizedQuery, {
          limit,
          signal: controller.signal,
        });
        if (requestIdRef.current !== currentRequestId) return;

        setSuggestions(nextSuggestions);
        setOpen(true);
        setActiveIndex(nextSuggestions.length > 0 ? 0 : -1);
      } catch (error) {
        if (controller.signal.aborted || requestIdRef.current !== currentRequestId) return;
        setSuggestions([]);
        setOpen(false);
        setActiveIndex(-1);
        setSearchError(error instanceof Error ? error.message : "Не вдалося отримати підказки адрес.");
      } finally {
        if (requestIdRef.current === currentRequestId) {
          setLoading(false);
        }
      }
    }, debounceMs);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [debounceMs, limit, minQueryLength, normalizedQuery]);

  function handleSelect(suggestion: AddressSuggestion) {
    selectedValueRef.current = suggestion.label.trim();
    requestIdRef.current += 1;
    onChange(suggestion.label);
    onSelect?.(suggestion);
    setSuggestions([]);
    setOpen(false);
    setActiveIndex(-1);
    setSearchError("");
  }

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(event) => {
          const nextValue = event.target.value;
          if (nextValue.trim() !== selectedValueRef.current) {
            selectedValueRef.current = "";
          }

          onChange(nextValue);
          setOpen(nextValue.trim().length >= minQueryLength);
          setSearchError("");
        }}
        onFocus={() => {
          if (suggestions.length > 0 && normalizedQuery !== selectedValueRef.current) {
            setOpen(true);
          }
        }}
        onBlur={() => {
          window.setTimeout(() => {
            if (!wrapperRef.current?.contains(document.activeElement)) {
              setOpen(false);
              setActiveIndex(-1);
            }
          }, 0);
        }}
        onKeyDown={(event) => {
          if (!open || suggestions.length === 0) {
            return;
          }

          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveIndex((prev) => (prev + 1) % suggestions.length);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1));
          } else if (event.key === "Enter" && activeIndex >= 0) {
            event.preventDefault();
            handleSelect(suggestions[activeIndex]);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
        aria-autocomplete="list"
        aria-controls={open ? listboxId : undefined}
        aria-expanded={open}
        className={`w-full max-w-full rounded-[10px] border bg-white px-3.5 py-3 text-base font-medium text-dark outline-none placeholder:text-[#8A8A8A] focus:border-primary md:text-[13px] ${error ? "border-red-400" : "border-border"} ${inputClassName}`}
      />

      {(loading || searchError || open) && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 overflow-hidden rounded-xl border border-border bg-white shadow-lg">
          {loading && (
            <div className="px-3 py-2 text-xs font-medium text-dark-text">
              Пошук адреси...
            </div>
          )}

          {!loading && searchError && (
            <div className="px-3 py-2 text-xs font-medium text-red-500">
              {searchError}
            </div>
          )}

          {!loading && !searchError && open && suggestions.length > 0 && (
            <ul id={listboxId} role="listbox" className="max-h-64 overflow-y-auto py-1">
              {suggestions.map((suggestion, index) => (
                <li key={`${suggestion.label}-${index}`} role="option" aria-selected={activeIndex === index}>
                  <button
                    type="button"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      handleSelect(suggestion);
                    }}
                    className={`w-full px-3 py-2 text-left text-xs text-dark transition-colors ${
                      activeIndex === index ? "bg-primary/10" : "hover:bg-gray-50"
                    }`}
                  >
                    {suggestion.label}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {!loading && !searchError && open && suggestions.length === 0 && (
            <div className="px-3 py-2 text-xs font-medium text-dark-text">
              Нічого не знайдено
            </div>
          )}
        </div>
      )}
    </div>
  );
}
