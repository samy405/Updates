import { useState, useMemo, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import type { Update, UpdateCategory, UpdatesData } from "../types";
import UpdateCard from "../components/UpdateCard";
import UpdateDetailWithComments from "../components/UpdateDetailWithComments";
import { setPageMeta } from "../utils/pageMeta";
import { supabase } from "../utils/supabaseClient";
import "./Home.css";
import "./UpdatePage.css";

const CATEGORIES: UpdateCategory[] = [
  "Pharmacy",
  "Billing",
  "Labs",
  "Operations",
  "Internal Tools / Systems",
  "Contractor / Staffing",
  "Compliance / Clinical",
  "Miscellaneous",
];

// Normalize category strings for robust comparison
function normalizeCategory(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

const LAST_VISIT_KEY = "updates-hub-last-visit";

export default function Home() {
  const location = useLocation();
  const [selectedCategory, setSelectedCategory] = useState<UpdateCategory | "All">("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [allUpdates, setAllUpdates] = useState<Update[]>([]);
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [panelUpdateId, setPanelUpdateId] = useState<string | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const panelCloseButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setPageMeta({
      title: "Updates Hub",
      description:
        "Single source of truth for Customer Support updates across Fountain. Browse updates by category and date.",
    });
  }, []);

  // Restore category when returning from update detail via "Back to all updates"
  useEffect(() => {
    const category = (location.state as { category?: UpdateCategory | "All" } | null)?.category;
    if (category && (category === "All" || CATEGORIES.includes(category))) {
      setSelectedCategory(category);
    }
  }, [location.key, location.state]);

  useEffect(() => {
    // Load updates data
    fetch("/data/updates.json")
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to fetch updates: ${res.status} ${res.statusText}`);
        }
        return res.json();
      })
      .then((data: UpdatesData) => {
        setAllUpdates(data.updates);
        setLoading(false);
        setError(null);
      })
      .catch((err) => {
        console.error("Failed to load updates:", err);
        setError("Failed to load updates. Please refresh the page or check your connection.");
        setLoading(false);
      });
  }, []);

  // Fetch comment counts per update (for supervisor visibility)
  useEffect(() => {
    const client = supabase;
    if (!client) return;
    const loadCommentCounts = async () => {
      try {
        const { data, error } = await client.from("comments").select("update_id");
        if (error) {
          console.error("Failed to load comment counts:", error);
          return;
        }
        if (!data) return;

        const counts: Record<string, number> = {};
        for (const row of data as Array<{ update_id: string }>) {
          counts[row.update_id] = (counts[row.update_id] ?? 0) + 1;
        }
        setCommentCounts(counts);
      } catch (err: unknown) {
        console.error("Failed to load comment counts:", err);
      }
    };

    loadCommentCounts();
  }, []);

  const filteredUpdates = useMemo(() => {
    if (selectedCategory === "All") {
      return allUpdates;
    }
    const target = normalizeCategory(selectedCategory);
    return allUpdates.filter(
      (update) => normalizeCategory(update.category) === target
    );
  }, [allUpdates, selectedCategory]);

  const searchFilteredUpdates = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return filteredUpdates;
    return filteredUpdates.filter(
      (u) =>
        u.title.toLowerCase().includes(q) || u.body.toLowerCase().includes(q)
    );
  }, [filteredUpdates, searchQuery]);

  // Group updates by date (derived from search-filtered list)
  const updatesByDate = useMemo(() => {
    const grouped: Record<string, Update[]> = {};
    for (const update of searchFilteredUpdates) {
      if (!grouped[update.datePosted]) {
        grouped[update.datePosted] = [];
      }
      grouped[update.datePosted].push(update);
    }
    // Sort dates descending (work on a copy of entries)
    return Object.entries(grouped).sort((a, b) => b[0].localeCompare(a[0]));
  }, [searchFilteredUpdates]);

  // Reset expanded dates when category or search changes
  useEffect(() => {
    setExpandedDates(new Set());
  }, [selectedCategory, searchQuery]);

  // Expand first date by default (after category change resets expandedDates)
  useEffect(() => {
    if (expandedDates.size === 0 && updatesByDate.length > 0) {
      setExpandedDates(new Set([updatesByDate[0][0]]));
    }
  }, [updatesByDate, expandedDates.size]);

  // Handle scroll to top button visibility
  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 400);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // "New since last visit": count and persist last visit time
  const [lastVisitTime] = useState(() => {
    if (typeof window === "undefined") return 0;
    return parseInt(localStorage.getItem(LAST_VISIT_KEY) ?? "0", 10);
  });
  const newSinceLastVisit = useMemo(() => {
    if (lastVisitTime <= 0) return 0;
    return allUpdates.filter(
      (u) => new Date(u.datePosted).getTime() > lastVisitTime
    ).length;
  }, [allUpdates, lastVisitTime]);

  useEffect(() => {
    const saveVisit = () => {
      localStorage.setItem(LAST_VISIT_KEY, String(Date.now()));
    };
    window.addEventListener("beforeunload", saveVisit);
    return () => window.removeEventListener("beforeunload", saveVisit);
  }, []);

  // Smooth scroll to top
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const openDiscussPanel = (updateId: string) => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    setPanelUpdateId(updateId);
  };
  const closeDiscussPanel = () => {
    setPanelUpdateId(null);
    // Restore focus to the button that opened the panel after panel unmounts
    setTimeout(() => {
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
    }, 0);
  };

  const panelUpdate = panelUpdateId ? allUpdates.find((u) => u.id === panelUpdateId) : null;

  // Body scroll lock when panel is open
  useEffect(() => {
    if (!panelUpdateId) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [panelUpdateId]);

  useEffect(() => {
    if (!panelUpdateId) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDiscussPanel();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [panelUpdateId]);

  // Focus the close button when panel opens
  useEffect(() => {
    if (panelUpdateId) {
      panelCloseButtonRef.current?.focus();
    }
  }, [panelUpdateId]);

  const toggleDate = (date: string) => {
    const newExpanded = new Set(expandedDates);
    if (newExpanded.has(date)) {
      newExpanded.delete(date);
    } else {
      newExpanded.add(date);
    }
    setExpandedDates(newExpanded);
  };

  const formatDate = (dateStr: string) => {
    // Parse as local date (YYYY-MM-DD) to avoid UTC midnight shifting to previous day
    const [y, m, d] = dateStr.split("-").map(Number);
    const date = new Date(y, (m ?? 1) - 1, d ?? 1);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };


  return (
    <div className="home">
      <div className="welcome-message">
        <h2>Welcome to the Updates Hub</h2>
        <p>
          This page serves as the single source of truth for Customer Support updates across Fountain. Here you'll find important changes, reminders, and operational updates related to billing, pharmacy, labs, internal processes, and other CS-relevant workflows.
        </p>
        <p>
          Updates are organized by category and date so you can quickly review what's new, what's changed, and what may no longer apply. Please check this page regularly, as it reflects the most up-to-date guidance from leadership and internal teams.
        </p>
        <p>
          If you have questions about a specific update, use the comments section on that update.
        </p>
      </div>
      <div className="search-and-filters">
        <div className="search-wrap">
          <label htmlFor="updates-search" className="search-label">
            Search
          </label>
          <input
            id="updates-search"
            type="search"
            className="search-input"
            placeholder="Search by title or content…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search updates by title or content"
          />
        </div>
        {newSinceLastVisit > 0 && (
          <p className="new-badge" aria-live="polite">
            {newSinceLastVisit} new since your last visit
          </p>
        )}
      </div>
      <div className="category-tabs">
        <button
          className={`category-tab ${selectedCategory === "All" ? "active" : ""}`}
          onClick={() => setSelectedCategory("All")}
        >
          All
        </button>
        {CATEGORIES.map((category) => (
          <button
            key={category}
            className={`category-tab ${selectedCategory === category ? "active" : ""}`}
            onClick={() => setSelectedCategory(category)}
          >
            {category}
          </button>
        ))}
      </div>

      <div className="updates-container">
        {error ? (
          <div className="error-state">
            <div className="error-icon">⚠️</div>
            <h3>Unable to Load Updates</h3>
            <p>{error}</p>
            <button 
              className="btn btn-primary" 
              onClick={() => window.location.reload()}
              style={{ marginTop: "1rem" }}
            >
              Refresh Page
            </button>
          </div>
        ) : loading ? (
          <div className="loading-state">
            <div className="loading-spinner"></div>
            <p>Loading updates...</p>
          </div>
        ) : allUpdates.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📋</div>
            <h3>No Updates Available</h3>
            <p>Updates haven't been loaded yet. Please run <code>npm run ingest</code> to populate updates.</p>
          </div>
        ) : updatesByDate.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🔍</div>
            <h3>No Updates Found</h3>
            <p>
              {searchQuery.trim()
                ? "No updates match your search. Try different keywords or clear the search."
                : `No updates found${selectedCategory !== "All" ? ` in ${selectedCategory}` : ""}.`}
            </p>
            <div className="empty-state-actions" style={{ marginTop: "1rem", display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
              {searchQuery.trim() && (
                <button
                  className="btn btn-secondary"
                  onClick={() => setSearchQuery("")}
                >
                  Clear search
                </button>
              )}
              {selectedCategory !== "All" && (
                <button
                  className="btn btn-secondary"
                  onClick={() => setSelectedCategory("All")}
                >
                  View All Updates
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="updates-header">
              <p className="updates-count">
                {searchFilteredUpdates.length} {searchFilteredUpdates.length === 1 ? "update" : "updates"}
                {searchQuery.trim() && " (filtered by search)"}
                {selectedCategory !== "All" && !searchQuery.trim() && ` in ${selectedCategory}`}
              </p>
            </div>
            {updatesByDate.map(([date, dateUpdates]) => (
            <div key={date} className="date-group">
              <button
                className="date-header"
                onClick={() => toggleDate(date)}
                aria-expanded={expandedDates.has(date)}
              >
                <span className="date-title">{formatDate(date)}</span>
                <span className="date-count">
                  {dateUpdates.length} {dateUpdates.length === 1 ? "update" : "updates"}
                </span>
                <span className="date-toggle" aria-hidden="true">
                  {expandedDates.has(date) ? "−" : "+"}
                </span>
              </button>
              {expandedDates.has(date) && (
                <div className="date-updates">
                  {[...dateUpdates]
                    .sort((a, b) => {
                      // Show active updates first, then superseded
                      if (a.status !== b.status) {
                        return a.status === "active" ? -1 : 1;
                      }
                      return 0;
                    })
                    .map((update) => (
                      <UpdateCard
                        key={update.id}
                        update={update}
                        selectedCategory={selectedCategory}
                        commentCount={commentCounts[update.id] ?? 0}
                        onDiscussClick={openDiscussPanel}
                      />
                    ))}
                </div>
              )}
            </div>
            ))}
          </>
        )}
      </div>
<button
        className={`scroll-to-top ${showScrollTop ? "visible" : ""}`}
        onClick={scrollToTop}
        aria-label="Scroll to top"
        title="Scroll to top"
      >
        ↑
      </button>

      {/* Quick view side panel */}
      <div
        className={`discuss-panel-backdrop ${panelUpdateId ? "discuss-panel-backdrop--open" : ""}`}
        onClick={closeDiscussPanel}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            closeDiscussPanel();
          }
        }}
        role={panelUpdateId ? "button" : "presentation"}
        tabIndex={panelUpdateId ? 0 : -1}
        aria-hidden={!panelUpdateId}
        aria-label={panelUpdateId ? "Close panel (click or press Escape)" : undefined}
      />
      <aside
        className={`discuss-panel ${panelUpdateId ? "discuss-panel--open" : ""}`}
        aria-label="Update detail and comments"
        aria-hidden={!panelUpdateId}
      >
        <div className="discuss-panel-inner">
          <div className="discuss-panel-header">
            <h2 className="discuss-panel-title">Quick view</h2>
            <button
              ref={panelCloseButtonRef}
              type="button"
              className="discuss-panel-close"
              onClick={closeDiscussPanel}
              aria-label="Close panel"
            >
              ×
            </button>
          </div>
          <div className="discuss-panel-body">
            {panelUpdate && (
              <UpdateDetailWithComments
                update={panelUpdate}
                updates={allUpdates}
                compact
              />
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
