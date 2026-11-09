import { type FormEvent, type KeyboardEvent, memo, useCallback, useEffect, useId, useRef, useState } from "react";
import { formatCount } from "../lib/format.ts";
import { geocode as defaultGeocode, type GeocodeOptions, type Place } from "../lib/geocode.ts";
import { ExternalLink } from "./ExternalLink.tsx";

/** Suggestions wait until typing pauses, to stay within Photon's fair use. */
export const SEARCH_DELAY_MS = 300;
export const MIN_QUERY_LENGTH = 3;

interface Props {
  onSelect: (place: Place) => void;
  geocode?: (query: string, options: GeocodeOptions) => Promise<Place[]>;
}

type Status = "idle" | "loading" | "done" | "error";

function PlaceSearchImpl({ onSelect, geocode = defaultGeocode }: Props) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<Place[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const request = useRef<AbortController | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const cancel = useCallback(() => {
    window.clearTimeout(timer.current);
    request.current?.abort();
    request.current = null;
  }, []);

  const search = useCallback(
    (q: string) => {
      cancel();
      const controller = new AbortController();
      request.current = controller;
      setStatus("loading");
      setOpen(true);
      geocode(q, { signal: controller.signal }).then(
        (found) => {
          if (controller.signal.aborted) return;
          setPlaces(found);
          setActive(-1);
          setStatus("done");
        },
        () => {
          if (controller.signal.aborted) return;
          setPlaces([]);
          setStatus("error");
        },
      );
    },
    [cancel, geocode],
  );

  useEffect(() => cancel, [cancel]);

  const onChange = (value: string) => {
    setQuery(value);
    const q = value.trim();
    cancel();
    if (q.length < MIN_QUERY_LENGTH) {
      setPlaces([]);
      setStatus("idle");
      setOpen(false);
      return;
    }
    timer.current = window.setTimeout(() => search(q), SEARCH_DELAY_MS);
  };

  const pick = (place: Place) => {
    cancel();
    setQuery(place.label);
    setOpen(false);
    setActive(-1);
    onSelect(place);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const count = places.length;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!count) return;
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setActive(e.key === "ArrowDown" ? 0 : count - 1);
        return;
      }
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((a) => (a < 0 ? (step > 0 ? 0 : count - 1) : (a + step + count) % count));
    } else if (e.key === "Escape") {
      // Stops a native search input clearing itself on the first Escape.
      e.preventDefault();
      if (open) setOpen(false);
      else onChange("");
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const place = open ? places[active] : undefined;
    if (place) pick(place);
    else if (query.trim()) search(query.trim());
  };

  const statusText = !open
    ? ""
    : status === "loading"
      ? "Searching…"
      : status === "error"
        ? "Place search isn't available right now."
        : status === "done"
          ? places.length
            ? formatCount(places.length, "place", "places")
            : "No places found."
          : "";
  const listId = `${id}-places`;
  const optionId = (i: number) => `${id}-place-${i}`;
  const showList = open && status === "done" && places.length > 0;

  return (
    <form
      className="place-search"
      role="search"
      aria-label="Find a place"
      onSubmit={onSubmit}
    >
      <label htmlFor={`${id}-input`} className="sr-only">
        Find a place
      </label>
      <input
        id={`${id}-input`}
        type="search"
        placeholder="Find a place"
        autoComplete="off"
        spellCheck={false}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={showList && active >= 0 ? optionId(active) : undefined}
        value={query}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={(e) => {
          // Stays open when focus moves to the credit links.
          if (!e.currentTarget.form?.contains(e.relatedTarget)) setOpen(false);
        }}
        onFocus={() => {
          if (places.length) setOpen(true);
        }}
      />
      {/* Outside the dropdown, so it exists before its text changes and gets announced. */}
      <p className="sr-only" role="status">
        {statusText}
      </p>
      <div className={open ? "place-results" : "place-results place-results-closed"}>
        <div id={listId} role="listbox" aria-label="Places" hidden={!showList}>
          {places.map((p, i) => (
            // Keys are handled by the input, as usual for a combobox; focus never moves to the options.
            // oxlint-disable-next-line jsx-a11y/click-events-have-key-events
            <div
              key={optionId(i)}
              id={optionId(i)}
              role="option"
              tabIndex={-1}
              aria-selected={i === active}
              className="place-option"
              // Keeps focus in the input, so the list doesn't close before the click.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(p)}
            >
              <span className="row-name">{p.label}</span>
              {p.detail && <span className="row-path">{p.detail}</span>}
            </div>
          ))}
        </div>
        {statusText && !showList && (
          <p className="place-status" aria-hidden="true">
            {statusText}
          </p>
        )}
        {open && (
          <p className="place-credit">
            <ExternalLink href="https://photon.komoot.io/">Photon</ExternalLink> ·{" "}
            <ExternalLink href="https://www.openstreetmap.org/copyright">© OpenStreetMap</ExternalLink>
          </p>
        )}
      </div>
    </form>
  );
}

export const PlaceSearch = memo(PlaceSearchImpl);
