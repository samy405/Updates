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

export default function Home() {
  const [selectedCategory, setSelectedCategory] = useState<UpdateCategory | "All">("All");
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [updates, setUpdates] = useState<Update[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load updates data
    fetch("/data/updates.json")
      .then((res) => res.json())
      .then((data: UpdatesData) => {
        setUpdates(data.updates);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load updates:", err);
        setLoading(false);
      });
  }, []);

  const filteredUpdates = useMemo(() => {
    if (selectedCategory === "All") {
      return updates;
    }
    return updates.filter((update) => update.category === selectedCategory);
  }, [updates, selectedCategory]);

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
        ) : updatesByDate.length === 0 ? (
          <div className="empty-state">
            <p>No updates found in this category.</p>
          </div>
        ) : (
          updatesByDate.map(([date, dateUpdates]) => (
            <div key={date} className="date-group">
              <button
                className="date-header"
                onClick={() => toggleDate(date)}
              >
                <span className="date-title">{formatDate(date)}</span>
                <span className="date-count">{dateUpdates.length} update{dateUpdates.length !== 1 ? "s" : ""}</span>
                <span className="date-toggle">{expandedDates.has(date) ? "−" : "+"}</span>
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
          ))
        )}
      </div>
    </div>
  );
}
