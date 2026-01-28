import { useState, useMemo, useEffect } from "react";
import type { Update, UpdateCategory, UpdatesData } from "../types";
import UpdateCard from "../components/UpdateCard";
import "./Home.css";

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

export default function Home() {
  const [selectedCategory, setSelectedCategory] = useState<UpdateCategory | "All">("All");
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [allUpdates, setAllUpdates] = useState<Update[]>([]);
  const [loading, setLoading] = useState(true);

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
        console.log(`Loaded ${data.updates.length} updates from /data/updates.json`);
        setAllUpdates(data.updates);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load updates:", err);
        setLoading(false);
      });
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

  // Group updates by date
  const updatesByDate = useMemo(() => {
    const grouped: Record<string, Update[]> = {};
    for (const update of filteredUpdates) {
      if (!grouped[update.datePosted]) {
        grouped[update.datePosted] = [];
      }
      grouped[update.datePosted].push(update);
    }
    // Sort dates descending
    return Object.entries(grouped).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filteredUpdates]);

  // Expand first date by default
  useEffect(() => {
    if (expandedDates.size === 0 && updatesByDate.length > 0) {
      setExpandedDates(new Set([updatesByDate[0][0]]));
    }
  }, [updatesByDate, expandedDates.size]);

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
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <div className="home">
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
        {loading ? (
          <div className="empty-state">
            <p>Loading updates...</p>
          </div>
        ) : allUpdates.length === 0 ? (
          <div className="empty-state">
            <p>No updates found. Please run <code>npm run ingest</code> to populate updates.</p>
            <p style={{ fontSize: "0.875rem", color: "var(--muted)", marginTop: "0.5rem" }}>
              Check the browser console for loading errors.
            </p>
          </div>
        ) : updatesByDate.length === 0 ? (
          <div className="empty-state">
            <p>No updates found{selectedCategory !== "All" ? ` in ${selectedCategory}` : ""}.</p>
          </div>
        ) : (
          <>
            <div className="updates-header">
              <p className="updates-count">
                {filteredUpdates.length} {filteredUpdates.length === 1 ? "update" : "updates"}
                {selectedCategory !== "All" && ` in ${selectedCategory}`}
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
                  {dateUpdates
                    .sort((a, b) => {
                      // Show active updates first, then superseded
                      if (a.status !== b.status) {
                        return a.status === "active" ? -1 : 1;
                      }
                      return 0;
                    })
                    .map((update) => (
                      <UpdateCard key={update.id} update={update} />
                    ))}
                </div>
              )}
            </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
